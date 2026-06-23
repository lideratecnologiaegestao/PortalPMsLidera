import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { chunkText } from './ia-indexador.service';

// Tamanho do lote de embeddings (reusa a constante do indexador por tenant)
const BATCH_SIZE = 64;
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

/** Resultado da reindexação global */
export interface ResultadoReindexarGlobal {
  ok: boolean;
  motivo?: string;
  total: number;
  totalItens: number;
}

/**
 * Indexador vetorial do acervo GLOBAL da IA (ia_conteudos_global → ia_chunks_global).
 *
 * Diferença do IaIndexadorService (por tenant):
 *   - Não usa TenantContext para RLS de tenant; usa `prisma.platform()` para
 *     passar na policy `app_is_platform()` que guarda a escrita das tabelas globais.
 *   - Para a LEITURA dos conteúdos (SELECT USING true) basta qualquer sessão;
 *     para o UPSERT dos chunks (escrita) precisamos do contexto de plataforma.
 *   - A chave/modelo de embeddings usada é sempre a GLOBAL (env/platform settings),
 *     SEM override por tenant, para garantir consistência: a pergunta do usuário
 *     também será embedada com a mesma config global durante a busca.
 *
 * LGPD: só conteúdo normativo público (legislação federal, manuais oficiais); sem PII.
 */
@Injectable()
export class IaIndexadorGlobalService {
  private readonly log = new Logger(IaIndexadorGlobalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  // ================================================================ REINDEXAR GLOBAL

  /**
   * Reconstrói integralmente o corpus ia_chunks_global.
   *  - Carrega todos os ia_conteudos_global ATIVOS.
   *  - Faz chunking + embeddings em lotes.
   *  - Upsert atômico (delete + insert) em ia_chunks_global.
   *  - Remove chunks de itens inativos/excluídos (via ON DELETE CASCADE da FK).
   *
   * Deve ser chamado em contexto de plataforma (não usa TenantContext de tenant).
   */
  async reindexarGlobal(): Promise<ResultadoReindexarGlobal> {
    if (!this.embeddings.configurado) {
      return {
        ok: false,
        motivo: 'EMBEDDINGS_NAO_CONFIGURADO',
        total: 0,
        totalItens: 0,
      };
    }

    try {
      // SELECT de leitura — policy USING true, sem necessidade de plataforma
      const itens = await this.prisma.platform().$queryRaw<
        {
          id: string;
          titulo: string;
          dominio: string;
          categoria: string | null;
          lei_referencia: string | null;
          fonte_url: string | null;
          conteudo: string;
        }[]
      >`
        SELECT id::text, titulo, dominio, categoria, lei_referencia, fonte_url, conteudo
        FROM ia_conteudos_global
        WHERE ativo = true`;

      let totalChunks = 0;

      for (const item of itens) {
        try {
          const textoCompleto = this.montarTexto(item);
          const chunks = chunkText(textoCompleto, CHUNK_SIZE, CHUNK_OVERLAP);
          if (chunks.length === 0) continue;

          const vetores = await this.gerarEmbeddingsEmLotes(chunks);
          if (!vetores) {
            this.log.warn(`Falha ao gerar embeddings para global/${item.id}; pulando.`);
            continue;
          }

          await this.upsertChunksGlobal(item, chunks, vetores);
          totalChunks += chunks.length;
        } catch (e) {
          this.log.warn(`Falha ao indexar conteudo_global/${item.id}: ${String(e)}`);
        }
      }

      this.log.log(
        `Reindexação global concluída: ${totalChunks} chunks de ${itens.length} itens.`,
      );

      return { ok: true, total: totalChunks, totalItens: itens.length };
    } catch (e) {
      this.log.error(`Reindexação global falhou: ${String(e)}`);
      return { ok: false, motivo: String(e), total: 0, totalItens: 0 };
    }
  }

  // ================================================================ INDEXAR INCREMENTAL

  /**
   * Indexa UM item específico de ia_conteudos_global (após criar/atualizar).
   * Se o item estiver inativo, remove os chunks existentes.
   * Roda em contexto de plataforma para passar na RLS de escrita.
   */
  async indexarGlobal(id: string): Promise<void> {
    if (!this.embeddings.configurado) return;

    try {
      const rows = await this.prisma.platform().$queryRaw<
        {
          id: string;
          titulo: string;
          dominio: string;
          categoria: string | null;
          lei_referencia: string | null;
          fonte_url: string | null;
          conteudo: string;
          ativo: boolean;
        }[]
      >`
        SELECT id::text, titulo, dominio, categoria, lei_referencia, fonte_url, conteudo, ativo
        FROM ia_conteudos_global
        WHERE id = ${id}::uuid`;

      if (rows.length === 0) {
        // Item não existe mais — garante limpeza (CASCADE já lida com delete, mas por garantia)
        await this.removerChunksGlobal(id);
        return;
      }

      const item = rows[0];

      if (!item.ativo) {
        // Item desativado — remove chunks se existirem
        await this.removerChunksGlobal(id);
        return;
      }

      const textoCompleto = this.montarTexto(item);
      const chunks = chunkText(textoCompleto, CHUNK_SIZE, CHUNK_OVERLAP);
      if (chunks.length === 0) return;

      const vetores = await this.gerarEmbeddingsEmLotes(chunks);
      if (!vetores) return;

      await this.upsertChunksGlobal(item, chunks, vetores);
      this.log.log(`Indexação incremental global/${id}: ${chunks.length} chunks.`);
    } catch (e) {
      this.log.warn(`Falha ao indexar incremental global/${id}: ${String(e)}`);
    }
  }

  // ================================================================ UPSERT

  /**
   * Apaga os chunks anteriores do item e insere os novos.
   * Usa `prisma.platform().$executeRawUnsafe` para passar na policy de escrita
   * `app_is_platform()` — o platformClient já seta esse GUC.
   * O literal vetorial é gerado internamente (números puros — sem risco de injeção).
   */
  private async upsertChunksGlobal(
    item: {
      id: string;
      titulo: string;
      fonte_url: string | null;
    },
    chunks: string[],
    vetores: number[][],
  ): Promise<void> {
    // 1. Remove chunks anteriores (DELETE seguro pois ref_id vem de query interna)
    await this.prisma.platform().$executeRaw`
      DELETE FROM ia_chunks_global
      WHERE fonte = 'conteudo_global'
        AND ref_id = ${item.id}::uuid`;

    // 2. Insere os novos chunks com embeddings
    for (let i = 0; i < chunks.length; i++) {
      const trecho = chunks[i];
      const vec = vetores[i];
      if (!vec || vec.length === 0) continue;

      // O literal vetorial é formado por números internos — sem dados do usuário.
      const vlit = `[${vec.join(',')}]`;

      await this.prisma.platform().$executeRawUnsafe(
        `INSERT INTO ia_chunks_global
           (fonte, ref_id, chunk_idx, titulo, url, texto, embedding)
         VALUES
           ($1, $2::uuid, $3, $4, $5, $6, '${vlit}'::vector)
         ON CONFLICT (fonte, ref_id, chunk_idx) DO UPDATE
           SET titulo    = EXCLUDED.titulo,
               url       = EXCLUDED.url,
               texto     = EXCLUDED.texto,
               embedding = EXCLUDED.embedding,
               criado_em = now()`,
        'conteudo_global',
        item.id,
        i,
        (item.titulo ?? '').slice(0, 500),
        (item.fonte_url ?? '').slice(0, 1000),
        trecho.slice(0, 2000),
      );
    }
  }

  // ================================================================ REMOVER CHUNKS

  /** Remove chunks de um item global (item excluído ou desativado). */
  async removerChunksGlobal(id: string): Promise<void> {
    try {
      await this.prisma.platform().$executeRaw`
        DELETE FROM ia_chunks_global
        WHERE fonte = 'conteudo_global'
          AND ref_id = ${id}::uuid`;
    } catch (e) {
      this.log.warn(`Falha ao remover chunks_global de ${id}: ${String(e)}`);
    }
  }

  // ================================================================ EMBEDDINGS EM LOTES

  /** Gera embeddings em lotes, usando a config GLOBAL (sem TenantContext de tenant). */
  private async gerarEmbeddingsEmLotes(chunks: string[]): Promise<number[][] | null> {
    const todos: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const lote = chunks.slice(i, i + BATCH_SIZE);
      // embed() resolve chave via TenantContext — sem tenant, cai no global do .env/platform.
      const vecs = await this.embeddings.embed(lote);
      if (!vecs) return null;
      todos.push(...vecs);
    }
    return todos;
  }

  // ================================================================ HELPERS

  /** Monta o texto completo do item para chunking (combina campos relevantes). */
  private montarTexto(item: {
    titulo: string;
    dominio: string;
    categoria: string | null;
    lei_referencia: string | null;
    conteudo: string;
  }): string {
    return [
      item.titulo,
      item.lei_referencia ? `Referência: ${item.lei_referencia}` : '',
      item.categoria ? `Categoria: ${item.categoria}` : '',
      `Domínio: ${item.dominio}`,
      item.conteudo,
    ]
      .filter(Boolean)
      .join('\n\n');
  }
}
