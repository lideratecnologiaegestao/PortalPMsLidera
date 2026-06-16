import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EmbeddingsService } from './embeddings.service';
import { TenantIaConfigService } from './tenant-ia-config.service';

/** Resultado por fonte */
interface FonteContagem {
  [fonte: string]: number;
}

export interface ResultadoReindexar {
  ok: boolean;
  motivo?: string;
  total: number;
  porFonte: FonteContagem;
}

/** Status do corpus vetorial do tenant */
export interface StatusIndex {
  configurado: boolean;
  provider: string;
  modelo: string;
  total: number;
  porFonte: { fonte: string; chunks: number; ultimoCriado: Date | null }[];
}

/** Chunk mínimo para indexação */
interface ItemFonte {
  fonte: string;
  refId: string;
  titulo: string;
  url: string;
  textoCompleto: string;
}

// Tamanho do batch de embeddings enviado à API
const BATCH_SIZE = 64;
// Tamanho do chunk de texto (chars)
const CHUNK_SIZE = 800;
// Overlap entre chunks
const CHUNK_OVERLAP = 100;

/**
 * Serviço de indexação vetorial (Camada 4 do RAG).
 * Constrói e mantém o corpus ia_chunks do tenant:
 *   - Carrega itens publicados/ativos de todas as fontes via $queryRaw (RLS ativo).
 *   - Faz chunking do texto completo.
 *   - Gera embeddings em lotes via EmbeddingsService.
 *   - Faz UPSERT atômico (DELETE+INSERT) em ia_chunks.
 *
 * LGPD: apenas conteúdo institucional/público; sem PII de cidadão.
 * Degrada 100% quando embeddings não estão configurados.
 */
@Injectable()
export class IaIndexadorService {
  private readonly log = new Logger(IaIndexadorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly tenantIaConfig: TenantIaConfigService,
  ) {}

  // ================================================================ STATUS

  /**
   * Retorna o estado atual do corpus vetorial do tenant (RLS isola).
   */
  async status(tenantId: string): Promise<StatusIndex> {
    const run = async (): Promise<StatusIndex> => {
      const rows = await this.prisma.db.$queryRaw<
        { fonte: string; chunks: bigint; ultima: Date | null }[]
      >`
        SELECT fonte,
               COUNT(*) AS chunks,
               MAX(criado_em) AS ultima
        FROM ia_chunks
        GROUP BY fonte
        ORDER BY fonte`;

      const total = rows.reduce((acc, r) => acc + Number(r.chunks), 0);

      const info = await this.embeddings.infoParaTenant(tenantId);
      return {
        configurado: info.configurado,
        provider: info.provider,
        modelo: info.modelo,
        total,
        porFonte: rows.map((r) => ({
          fonte: r.fonte,
          chunks: Number(r.chunks),
          ultimoCriado: r.ultima,
        })),
      };
    };

    if (TenantContext.tenantId() === tenantId) return run();
    return TenantContext.run({ tenantId }, run);
  }

  // ================================================================ REINDEXAR

  /**
   * Reconstrói o corpus ia_chunks do tenant a partir de todas as fontes.
   * Deve ser chamado dentro de um TenantContext (worker faz isso antes).
   */
  async reindexar(tenantId: string): Promise<ResultadoReindexar> {
    if (!(await this.embeddings.configuradoParaTenant(tenantId))) {
      return { ok: false, motivo: 'EMBEDDINGS_NAO_CONFIGURADO', total: 0, porFonte: {} };
    }

    // Teto de chunks efetivo: override da entidade (Gerenciador) ou default global.
    const maxChunks = await this.tenantIaConfig.maxChunks(tenantId);

    const run = async (): Promise<ResultadoReindexar> => {
      const porFonte: FonteContagem = {};
      let totalGlobal = 0;
      let limitingAtingido = false;

      const fontes: Array<() => Promise<ItemFonte[]>> = [
        () => this.carregarCms(),
        () => this.carregarServicos(),
        () => this.carregarNoticias(),
        () => this.carregarSecretarias(),
        () => this.carregarDocumentos(),
        () => this.carregarConhecimento(),
      ];

      for (const carregarFonte of fontes) {
        if (limitingAtingido) break;

        let itens: ItemFonte[] = [];
        try {
          itens = await carregarFonte();
        } catch (e) {
          this.log.warn(`Falha ao carregar fonte para tenant ${tenantId}: ${String(e)}`);
          continue;
        }

        for (const item of itens) {
          if (limitingAtingido) break;

          try {
            const chunks = chunkText(item.textoCompleto, CHUNK_SIZE, CHUNK_OVERLAP);
            if (chunks.length === 0) continue;

            // Verifica limite global
            if (totalGlobal + chunks.length > maxChunks) {
              const permitidos = maxChunks - totalGlobal;
              this.log.warn(
                `Limite de ${maxChunks} chunks atingido no tenant ${tenantId}. ` +
                  `Indexando apenas ${permitidos} chunks restantes.`,
              );
              chunks.splice(permitidos);
              limitingAtingido = true;
            }

            // Gera embeddings em lotes
            const vetores = await this.gerarEmbeddingsEmLotes(chunks);
            if (!vetores) continue; // falha ao gerar — pula este item

            // UPSERT: delete + insert (ia_chunks não tem ON CONFLICT UPDATE para vetor)
            await this.upsertChunks(tenantId, item, chunks, vetores);

            const n = chunks.length;
            porFonte[item.fonte] = (porFonte[item.fonte] ?? 0) + n;
            totalGlobal += n;
          } catch (e) {
            this.log.warn(
              `Falha ao indexar ${item.fonte}/${item.refId}: ${String(e)}`,
            );
          }
        }
      }

      this.log.log(
        `Reindexação tenant ${tenantId}: ${totalGlobal} chunks em ${Object.keys(porFonte).length} fontes.`,
      );

      return {
        ok: true,
        total: totalGlobal,
        porFonte,
        ...(limitingAtingido ? { motivo: `LIMITE_${maxChunks}_ATINGIDO` } : {}),
      };
    };

    if (TenantContext.tenantId() === tenantId) return run();
    return TenantContext.run({ tenantId }, run);
  }

  // ================================================================ UPSERT

  /**
   * Apaga os chunks antigos da combinação (tenant, fonte, refId) e insere os novos.
   * O vetor é um literal numérico controlado internamente — sem risco de injeção.
   * Os demais campos são parametrizados normalmente.
   */
  private async upsertChunks(
    tenantId: string,
    item: ItemFonte,
    chunks: string[],
    vetores: number[][],
  ): Promise<void> {
    // 1. Remove chunks anteriores dessa fonte+ref (substitui integralmente)
    await this.prisma.db.$executeRaw`
      DELETE FROM ia_chunks
      WHERE tenant_id = ${tenantId}::uuid
        AND fonte = ${item.fonte}
        AND ref_id = ${item.refId}`;

    // 2. Insere os novos chunks com seus embeddings
    for (let i = 0; i < chunks.length; i++) {
      const trecho = chunks[i];
      const vec = vetores[i];
      if (!vec || vec.length === 0) continue;

      // O literal do vetor é gerado internamente a partir de números — seguro.
      const vlit = `[${vec.join(',')}]`;
      const modelo = this.embeddings.modelo;

      // $executeRawUnsafe usado SOMENTE para o literal vetorial (números puros).
      // Todos os outros valores são parametrizados via template literal do Prisma.
      await this.prisma.db.$executeRawUnsafe(
        `INSERT INTO ia_chunks
           (tenant_id, fonte, ref_id, chunk_idx, titulo, url, trecho, modelo, embedding)
         VALUES
           ($1::uuid, $2, $3, $4, $5, $6, $7, $8, '${vlit}'::vector)
         ON CONFLICT (tenant_id, fonte, ref_id, chunk_idx) DO UPDATE
           SET titulo = EXCLUDED.titulo,
               url    = EXCLUDED.url,
               trecho = EXCLUDED.trecho,
               modelo = EXCLUDED.modelo,
               embedding = EXCLUDED.embedding,
               criado_em = now()`,
        tenantId,
        item.fonte,
        item.refId,
        i,
        item.titulo.slice(0, 500),
        item.url.slice(0, 1000),
        trecho.slice(0, 2000),
        modelo,
      );
    }
  }

  // ================================================================ EMBEDDINGS EM LOTES

  private async gerarEmbeddingsEmLotes(chunks: string[]): Promise<number[][] | null> {
    const todos: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const lote = chunks.slice(i, i + BATCH_SIZE);
      const vecs = await this.embeddings.embed(lote);
      if (!vecs) return null; // falha num lote → aborta o item inteiro
      todos.push(...vecs);
    }
    return todos;
  }

  // ================================================================ CARREGADORES DE FONTES

  /** CMS: páginas publicadas com seus blocos. */
  private async carregarCms(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      { id: string; slug: string; titulo: string; conteudo: string }[]
    >`
      SELECT p.id::text,
             p.slug,
             p.titulo,
             string_agg(b.conteudo::text, ' ') AS conteudo
      FROM cms_pages p
      JOIN cms_blocks b ON b.page_id = p.id
      WHERE p.publicado = true
      GROUP BY p.id, p.slug, p.titulo`;

    return rows.map((r) => ({
      fonte: 'cms',
      refId: r.id,
      titulo: r.titulo,
      url: `/${r.slug}`,
      textoCompleto: `${r.titulo}\n\n${r.conteudo ?? ''}`,
    }));
  }

  /** Serviços publicados. */
  private async carregarServicos(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      {
        id: string;
        slug: string;
        titulo: string;
        descricao: string | null;
        requisitos: string | null;
        canais_atendimento: string | null;
        prazo_atendimento: string | null;
      }[]
    >`
      SELECT id::text, slug, titulo,
             descricao, requisitos, canais_atendimento, prazo_atendimento
      FROM servicos
      WHERE publicado = true`;

    return rows.map((r) => ({
      fonte: 'servicos',
      refId: r.id,
      titulo: r.titulo,
      url: `/servicos/${r.slug}`,
      textoCompleto: [
        r.titulo,
        r.descricao ?? '',
        r.requisitos ?? '',
        r.canais_atendimento ?? '',
        r.prazo_atendimento ?? '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    }));
  }

  /** Notícias publicadas. */
  private async carregarNoticias(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      {
        id: string;
        slug: string;
        titulo: string;
        conteudo: string | null;
        resumo: string | null;
      }[]
    >`
      SELECT id::text, slug, titulo, conteudo, resumo
      FROM noticias
      WHERE publicado = true`;

    return rows.map((r) => ({
      fonte: 'noticias',
      refId: r.id,
      titulo: r.titulo,
      url: `/noticias/${r.slug}`,
      textoCompleto: [r.titulo, r.resumo ?? '', r.conteudo ?? '']
        .filter(Boolean)
        .join('\n\n'),
    }));
  }

  /** Secretarias ativas. */
  private async carregarSecretarias(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      {
        id: string;
        slug: string | null;
        nome: string;
        descricao: string | null;
        sobre: string | null;
        competencias: string | null;
        responsavel: string | null;
        horario: string | null;
        telefone: string | null;
        email: string | null;
      }[]
    >`
      SELECT id::text, slug, nome,
             descricao, sobre, competencias,
             responsavel, horario, telefone, email
      FROM secretarias
      WHERE ativo = true`;

    return rows.map((r) => ({
      fonte: 'secretarias',
      refId: r.id,
      titulo: r.nome,
      url: r.slug ? `/secretarias/${r.slug}` : '/secretarias',
      textoCompleto: [
        r.nome,
        r.descricao ?? '',
        r.sobre ?? '',
        r.competencias ?? '',
        r.responsavel ? `Responsável: ${r.responsavel}` : '',
        r.horario ? `Horário: ${r.horario}` : '',
        r.telefone ? `Telefone: ${r.telefone}` : '',
        r.email ? `E-mail: ${r.email}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    }));
  }

  /** Documentos ativos (ementa + conteúdo extraído pelo OCR/FTS worker). */
  private async carregarDocumentos(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      {
        id: string;
        slug: string;
        titulo: string;
        ementa: string | null;
        conteudo_extraido: string | null;
        arquivo_url: string | null;
      }[]
    >`
      SELECT id::text, slug, titulo,
             ementa, conteudo_extraido, arquivo_url
      FROM documentos
      WHERE ativo = true`;

    return rows.map((r) => ({
      fonte: 'documentos',
      refId: r.id,
      titulo: r.titulo,
      url: r.arquivo_url ?? '/documentos',
      textoCompleto: [r.titulo, r.ementa ?? '', r.conteudo_extraido ?? '']
        .filter(Boolean)
        .join('\n\n'),
    }));
  }

  /** Conhecimento curado pelo gestor (ia_conhecimento ativo). */
  private async carregarConhecimento(): Promise<ItemFonte[]> {
    const rows = await this.prisma.db.$queryRaw<
      { id: string; pergunta: string; resposta: string }[]
    >`
      SELECT id::text, pergunta, resposta
      FROM ia_conhecimento
      WHERE ativo = true`;

    return rows.map((r) => ({
      fonte: 'ia_conhecimento',
      refId: r.id,
      titulo: r.pergunta,
      url: '/assistente',
      textoCompleto: `Pergunta: ${r.pergunta}\n\nResposta: ${r.resposta}`,
    }));
  }
}

// ================================================================ UTILITÁRIO

/**
 * Divide um texto em chunks com overlap.
 * Puro e testável (sem dependências externas).
 */
export function chunkText(
  texto: string,
  tamanho = CHUNK_SIZE,
  overlap = CHUNK_OVERLAP,
): string[] {
  const t = (texto ?? '').trim();
  if (!t) return [];
  if (t.length <= tamanho) return [t];

  const chunks: string[] = [];
  let pos = 0;
  while (pos < t.length) {
    const fim = Math.min(pos + tamanho, t.length);
    chunks.push(t.slice(pos, fim));
    pos += tamanho - overlap;
    if (pos >= t.length) break;
  }
  return chunks;
}
