import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AnthropicService } from './anthropic.service';
import { AntivirusService } from '../storage/antivirus.service';
import { EmbeddingsService } from './embeddings.service';
import { IaConhecimentoService } from './ia-conhecimento.service';
import { AplicConsultaService } from '../aplic/aplic-consulta.service';
import { FERRAMENTAS_FISCAIS, executarFerramentaFiscal } from '../aplic/aplic-bot-tools';
import {
  montarContexto,
  parseTriagem,
  sistemaChat,
  sistemaTriagem,
  tsqueryOr,
  usuarioTriagem,
} from './ia.prompts';

interface Trecho {
  slug: string;
  titulo: string;
  texto: string;
  url?: string;
  fonte?: string;
}

/**
 * Cache em memória dos fatos institucionais do tenant.
 * TTL de 5 minutos — evita 1 query por mensagem sem desatualizar por muito tempo.
 */
const fatosCache = new Map<string, { texto: string; expiraEm: number }>();
const FATOS_TTL_MS = 5 * 60 * 1_000; // 5 min

/** Cache: o tenant tem dados fiscais (APLIC) importados? Evita count por mensagem. */
const fiscalCache = new Map<string, { tem: boolean; expiraEm: number }>();
const FISCAL_TTL_MS = 5 * 60 * 1_000;

/**
 * Camada de IA: triagem (sugestão p/ revisão humana), busca (RAG) e chat.
 * Tudo roda no TenantContext (RLS): a recuperação só enxerga conteúdo oficial
 * do próprio tenant — sem vazamento entre prefeituras. Minimização: ao modelo
 * vai só o necessário (assunto/descrição), nunca dados do solicitante.
 *
 * O chat monta contexto em 3 camadas:
 *   1. Fatos institucionais do tenant (sempre no contexto, TTL 5 min)
 *   2. Base de conhecimento curada (fixados + FTS sobre ia_conhecimento)
 *   3. RAG multi-fonte (CMS, serviços, notícias, secretarias, documentos)
 */
@Injectable()
export class IaService {
  private readonly log = new Logger(IaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly antivirus: AntivirusService,
    private readonly embeddings: EmbeddingsService,
    private readonly conhecimento: IaConhecimentoService,
    private readonly aplicConsulta: AplicConsultaService,
  ) {}

  /** O tenant atual tem dados fiscais APLIC importados? (cacheado 5 min). */
  private async temDadosFiscais(tid: string): Promise<boolean> {
    const hit = fiscalCache.get(tid);
    if (hit && hit.expiraEm > Date.now()) return hit.tem;
    let tem = false;
    try {
      tem = (await this.prisma.db.aplicEmpenho.count()) > 0;
    } catch {
      tem = false;
    }
    fiscalCache.set(tid, { tem, expiraEm: Date.now() + FISCAL_TTL_MS });
    return tem;
  }

  /** Instrução adicional ao sistema quando há ferramentas fiscais disponíveis. */
  private fiscalAddendum(): string {
    return (
      '\n\nDADOS FISCAIS (APLIC/TCE-MT): esta entidade tem dados contábeis reais importados. ' +
      'Para QUALQUER pergunta sobre valores de empenho, liquidação, pagamento, credores/fornecedores, ' +
      'gastos por órgão ou situação de um empenho, USE as ferramentas fiscal_* e responda com os números ' +
      'retornados — NUNCA invente cifras. Apresente valores em reais (R$), cite o exercício/ano, e note que ' +
      'credores pessoa física aparecem com CPF mascarado. Se a ferramenta não retornar dados, diga que não há registro.'
    );
  }

  /** Flags de IA do tenant atual (default false — DPIA: ativação deliberada). */
  private async flags(): Promise<{ triagem: boolean; chat: boolean }> {
    const tid = TenantContext.tenantId();
    if (!tid) return { triagem: false, chat: false };
    const t = await this.prisma
      .platform()
      .tenant.findUnique({
        where: { id: tid },
        select: { iaTriagemHabilitada: true, iaChatHabilitada: true },
      });
    return { triagem: t?.iaTriagemHabilitada ?? false, chat: t?.iaChatHabilitada ?? false };
  }

  /** Sugere classificação de uma manifestação (NÃO aplica — humano decide). */
  async triagem(manifestacaoId: string) {
    if (!(await this.flags()).triagem) {
      throw new ForbiddenException('Triagem por IA não habilitada nesta prefeitura.');
    }
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id: manifestacaoId },
      select: { canal: true, assunto: true, descricao: true },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const secretarias = await this.prisma.db.$queryRaw<{ nome: string }[]>`
      SELECT nome FROM secretarias WHERE ativo = true ORDER BY nome`;

    const texto = await this.anthropic.completar({
      system: sistemaTriagem(secretarias.map((s) => s.nome)),
      user: usuarioTriagem(m),
      maxTokens: 400,
      cacheSystem: true,
    });
    const sugestao = parseTriagem(texto);

    await this.auditar('IA_TRIAGEM', 'manifestacao', manifestacaoId, {
      prioridade: sugestao.prioridade,
      tipoSugerido: sugestao.tipoSugerido,
    });

    // revisaoHumana = true deixa explícito que é sugestão (LGPD art. 20)
    return { ...sugestao, manifestacaoId, revisaoHumana: true };
  }

  /** Busca semântica (RAG) sobre o conteúdo oficial do tenant, com citações. */
  async busca(perguntaRaw: string) {
    const pergunta = (perguntaRaw ?? '').slice(0, 500); // anti-abuso de tokens/PII
    const trechos = await this.recuperar(pergunta);
    return {
      pergunta,
      resultados: trechos.map((t) => ({
        titulo: t.titulo,
        slug: t.slug,
        url: t.url,
        fonte: t.fonte,
        trecho: t.texto.slice(0, 300),
      })),
    };
  }

  /**
   * Chatbot multi-turno para o widget de atendimento omnichannel.
   * Recebe histórico de conversação e responde com base no conteúdo oficial.
   * PII já deve estar reddigida pelo chamador (AtendimentoBotService).
   * Respeita a flag iaChatHabilitada; levanta ForbiddenException se off.
   */
  async chatMultiturno(
    historico: { papel: 'user' | 'assistant'; texto: string }[],
    perguntaRaw: string,
    tenantId?: string,
  ): Promise<{ resposta: string; fontes: { titulo: string; slug: string; url?: string }[]; confianca?: number }> {
    const tid = tenantId ?? TenantContext.tenantId();
    if (!tid) throw new Error('Tenant não identificado para chatMultiturno.');

    const run = async () => {
      if (!(await this.flags()).chat) {
        throw new ForbiddenException('Assistente de IA não habilitado nesta prefeitura.');
      }
      const pergunta = (perguntaRaw ?? '').slice(0, 500);

      // Monta contexto em 3 camadas
      const [fatos, contextoCamadas, trechos] = await this.montarContexto3Camadas(pergunta);
      const confiancaBase = this.calcularConfianca(contextoCamadas);

      const ctxHistorico =
        historico.length > 0
          ? '\n\nHISTÓRICO DA CONVERSA:\n' +
            historico
              .slice(-8) // últimas 8 trocas para evitar prompt gigante
              .map((h) => `${h.papel === 'user' ? 'Visitante' : 'Assistente'}: ${h.texto}`)
              .join('\n')
          : '';

      const user = `${fatos}${contextoCamadas}${ctxHistorico}\n\nPERGUNTA ATUAL: ${pergunta}`;
      const resposta = (await this.temDadosFiscais(tid))
        ? await this.anthropic.completarComFerramentas({
            system: sistemaChat() + this.fiscalAddendum(),
            user,
            tools: FERRAMENTAS_FISCAIS,
            executar: (nome, input) => executarFerramentaFiscal(this.aplicConsulta, nome, input),
            maxTokens: 800,
            cacheSystem: true,
          })
        : await this.anthropic.completar({ system: sistemaChat(), user, maxTokens: 700, cacheSystem: true });

      await this.auditar('IA_CHAT_ATENDIMENTO', 'atendimento_conversas', null, {
        fontes: trechos.length,
      });

      return {
        resposta,
        fontes: trechos.map((t) => ({ titulo: t.titulo, slug: t.slug, url: t.url })),
        confianca: confiancaBase,
      };
    };

    if (TenantContext.tenantId() === tid) {
      return run();
    }
    return TenantContext.run({ tenantId: tid }, run);
  }

  /** Chatbot: responde com base no conteúdo oficial recuperado + citações. */
  async chat(perguntaRaw: string) {
    if (!(await this.flags()).chat) {
      throw new ForbiddenException('Assistente de IA não habilitado nesta prefeitura.');
    }
    const pergunta = (perguntaRaw ?? '').slice(0, 500); // anti-abuso de tokens/PII

    // Monta contexto em 3 camadas
    const [fatos, contextoCamadas, trechos] = await this.montarContexto3Camadas(pergunta);
    const confiancaBase = this.calcularConfianca(contextoCamadas);

    const tid = TenantContext.tenantId()!;
    const user = `${fatos}${contextoCamadas}\n\nPERGUNTA: ${pergunta}`;
    const resposta = (await this.temDadosFiscais(tid))
      ? await this.anthropic.completarComFerramentas({
          system: sistemaChat() + this.fiscalAddendum(),
          user,
          tools: FERRAMENTAS_FISCAIS,
          executar: (nome, input) => executarFerramentaFiscal(this.aplicConsulta, nome, input),
          maxTokens: 800,
          cacheSystem: true,
        })
      : await this.anthropic.completar({ system: sistemaChat(), user, maxTokens: 700, cacheSystem: true });

    await this.auditar('IA_CHAT', 'cms', null, { fontes: trechos.length });

    return {
      resposta,
      fontes: trechos.map((t) => ({ titulo: t.titulo, slug: t.slug, url: t.url })),
      confianca: confiancaBase,
    };
  }

  /**
   * OCR de um documento (Anthropic vision). DPIA: NÃO persiste a imagem nem o
   * texto extraído aqui — quem consome decide a retenção (com expurgo). Gated
   * pela flag de triagem do tenant. Minimização: alerte que o texto pode conter
   * dado de terceiros.
   */
  async ocr(buffer: Buffer, mimetype: string) {
    if (!(await this.flags()).triagem) {
      throw new ForbiddenException('OCR por IA não habilitado nesta prefeitura.');
    }
    if (!(await this.antivirus.limpo(buffer))) {
      throw new ForbiddenException('Documento reprovado na varredura antivírus.');
    }
    const texto = await this.anthropic.ocr(buffer.toString('base64'), mimetype);
    await this.auditar('IA_OCR', 'documento', null, { bytes: buffer.length });
    return { texto, aviso: 'Texto extraído por IA — revise antes de usar; pode conter dados de terceiros.' };
  }

  // ================================================================ CAMADA 1

  /**
   * Camada 1: Fatos institucionais do tenant (sempre no contexto).
   * Dados PÚBLICOS e INSTITUCIONAIS: nome, UF, secretarias, DPO.
   * SEM PII de cidadão. Cacheado por tenant com TTL de 5 min.
   * LGPD: apenas informação institucional pública — base legal: interesse legítimo / cumprimento de obrigação.
   */
  private async fatosDoTenant(): Promise<string> {
    const tid = TenantContext.tenantId();
    if (!tid) return '';

    const cached = fatosCache.get(tid);
    if (cached && cached.expiraEm > Date.now()) return cached.texto;

    try {
      // Tenant: via platform() — o tenant em si é dado cross-tenant permitido (é o próprio registro)
      const tenant = await this.prisma.platform().tenant.findUnique({
        where: { id: tid },
        select: { nome: true, uf: true, dpoNome: true, dpoEmail: true },
      });
      if (!tenant) return '';

      // Secretarias: via RLS (prisma.db)
      const secretarias = await this.prisma.db.$queryRaw<{
        nome: string;
        responsavel: string | null;
        horario: string | null;
        telefone: string | null;
        email: string | null;
      }[]>`
        SELECT nome, responsavel, horario, telefone, email
        FROM secretarias
        WHERE ativo = true
        ORDER BY ordem ASC, nome ASC`;

      const linhas: string[] = [
        `Esta é a Prefeitura de ${tenant.nome} (${tenant.uf}).`,
        '',
      ];

      if (tenant.dpoNome || tenant.dpoEmail) {
        linhas.push('ENCARREGADO DE DADOS (DPO/LGPD):');
        if (tenant.dpoNome) linhas.push(`  Nome: ${tenant.dpoNome}`);
        if (tenant.dpoEmail) linhas.push(`  E-mail: ${tenant.dpoEmail}`);
        linhas.push('');
      }

      if (secretarias.length > 0) {
        linhas.push('SECRETARIAS E ÓRGÃOS:');
        for (const s of secretarias) {
          const partes: string[] = [`  • ${s.nome}`];
          if (s.responsavel) partes.push(`Responsável: ${s.responsavel}`);
          if (s.horario) partes.push(`Horário: ${s.horario}`);
          if (s.telefone) partes.push(`Telefone: ${s.telefone}`);
          if (s.email) partes.push(`E-mail: ${s.email}`);
          linhas.push(partes.join(' | '));
        }
      }

      const texto = linhas.join('\n');
      fatosCache.set(tid, { texto, expiraEm: Date.now() + FATOS_TTL_MS });
      return texto;
    } catch (e) {
      this.log.warn(`Falha ao buscar fatos do tenant ${tid}: ${String(e)}`);
      return '';
    }
  }

  // ================================================================ CAMADA 2 + 3

  /**
   * Monta o contexto completo em 3 camadas para o prompt do bot.
   * Retorna [blocoFatos, blocoContexto, trechosRAG].
   */
  private async montarContexto3Camadas(
    pergunta: string,
  ): Promise<[string, string, Trecho[]]> {
    // Paralelo: busca as 3 fontes simultaneamente
    const [fatosTexto, fixadosList, matchList, trechos] = await Promise.all([
      this.fatosDoTenant(),
      this.conhecimento.fixados(),
      this.conhecimento.buscar(pergunta),
      this.recuperar(pergunta),
    ]);

    // ---- bloco de fatos (camada 1) ----
    const blocoFatos = fatosTexto
      ? `INFORMAÇÕES OFICIAIS DA ENTIDADE:\n${fatosTexto}\n\n`
      : '';

    // ---- bloco de conhecimento curado (camada 2) ----
    // Deduplicar fixados + matches por pergunta
    const vistos = new Set<string>();
    const itensConhecimento: { pergunta: string; resposta: string }[] = [];
    for (const item of [...fixadosList, ...matchList]) {
      const chave = item.pergunta;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        itensConhecimento.push(item);
      }
    }

    const blocoConhecimento =
      itensConhecimento.length > 0
        ? 'RESPOSTAS OFICIAIS CADASTRADAS (prioridade máxima — use estas respostas preferencialmente):\n' +
          itensConhecimento
            .map((it, i) => `[K${i + 1}] P: ${it.pergunta}\nR: ${it.resposta}`)
            .join('\n\n') +
          '\n\n'
        : '';

    // ---- bloco de RAG multi-fonte (camada 3) ----
    const blocoRag = trechos.length > 0
      ? `CONTEÚDO DO PORTAL (cite o número entre colchetes):\n${montarContexto(trechos)}\n\n`
      : '';

    const blocoContexto = blocoConhecimento + blocoRag;

    return [blocoFatos, blocoContexto, trechos];
  }

  /**
   * Calcula confiança baseada em presença de camadas:
   * - Conhecimento curado match → 0.95
   * - Apenas RAG → 0.8
   * - Sem nenhum → 0.2
   */
  private calcularConfianca(blocoContexto: string): number {
    if (blocoContexto.includes('RESPOSTAS OFICIAIS CADASTRADAS')) return 0.95;
    if (blocoContexto.includes('CONTEÚDO DO PORTAL')) return 0.8;
    return 0.2;
  }

  // ================================================================ RAG MULTI-FONTE (Camada 3)

  /**
   * RAG multi-fonte sobre o conteúdo publicado do tenant (RLS isola).
   * Busca em parallel em CMS, Serviços, Notícias, Secretarias e Documentos.
   * Retorna as top ~6 por rank combinado (FTS português + fallback substring no CMS).
   */
  private async recuperar(pergunta: string): Promise<Trecho[]> {
    const q = pergunta.trim().slice(0, 200);

    // 0) VETORIAL sobre ia_chunks (Camada 4 — pgvector + EmbeddingsService).
    //    Degrada silenciosamente: sem chave ou corpus vazio → FTS multi-fonte.
    if (this.embeddings.configurado) {
      try {
        const vecs = await this.embeddings.embed([q]);
        if (vecs?.[0]) {
          const vlit = `[${vecs[0].join(',')}]`;
          // RLS isola o tenant automaticamente via TenantContext.
          // O literal vetorial é gerado internamente (números) — sem injeção.
          const rows = await this.prisma.db.$queryRawUnsafe<Trecho[]>(
            `SELECT titulo,
                    url,
                    left(trecho, 600) AS texto,
                    '' AS slug,
                    fonte
             FROM ia_chunks
             ORDER BY embedding <=> '${vlit}'::vector
             LIMIT 6`,
          );
          if (rows.length > 0) return rows;
        }
      } catch {
        /* ia_chunks/pgvector indisponível ou corpus vazio → cai para FTS multi-fonte */
      }
    }

    // 1) FTS multi-fonte em paralelo (degrada por fonte individualmente).
    //    Usa tsquery em OR (recall) — perguntas conversacionais não casam com AND.
    const expr = tsqueryOr(q);
    if (expr) {
      const [cms, servicos, noticias, secretariasRows, documentos] = await Promise.all([
        this.recuperarCms(expr),
        this.recuperarServicos(expr),
        this.recuperarNoticias(expr),
        this.recuperarSecretarias(expr),
        this.recuperarDocumentos(expr),
      ]);
      const todos = [...cms, ...servicos, ...noticias, ...secretariasRows, ...documentos];
      if (todos.length > 0) return todos.slice(0, 6);
    }

    // 2) Fallback substring apenas no CMS (cobre termos sem stem)
    const termo = `%${q.replace(/[%_]/g, ' ').slice(0, 80)}%`;
    const fallback = await this.prisma.db.$queryRaw<Trecho[]>`
      SELECT p.slug, p.titulo, left(b.conteudo::text, 600) AS texto,
             '/'||p.slug AS url, 'cms' AS fonte
      FROM cms_pages p
      JOIN cms_blocks b ON b.page_id = p.id
      WHERE p.publicado = true
        AND (p.titulo ILIKE ${termo} OR b.conteudo::text ILIKE ${termo})
      LIMIT 5`;
    return fallback;
  }

  /** FTS no CMS (páginas + blocos). */
  private async recuperarCms(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT p.slug, p.titulo, left(b.conteudo::text, 600) AS texto,
               '/'||p.slug AS url, 'cms' AS fonte
        FROM cms_pages p
        JOIN cms_blocks b ON b.page_id = p.id
        WHERE p.publicado = true
          AND to_tsvector('portuguese', p.titulo || ' ' || b.conteudo::text)
              @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese', p.titulo || ' ' || b.conteudo::text),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 3`;
    } catch {
      return [];
    }
  }

  /** FTS em Serviços publicados. */
  private async recuperarServicos(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT slug,
               titulo,
               left(
                 coalesce(descricao,'') || ' ' ||
                 coalesce(requisitos,'') || ' ' ||
                 coalesce(canais_atendimento,'') || ' ' ||
                 coalesce(prazo_atendimento,''),
                 600
               ) AS texto,
               '/servicos/'||slug AS url,
               'servicos' AS fonte
        FROM servicos
        WHERE publicado = true
          AND to_tsvector('portuguese',
                titulo || ' ' ||
                coalesce(descricao,'') || ' ' ||
                coalesce(requisitos,'') || ' ' ||
                coalesce(canais_atendimento,'') || ' ' ||
                coalesce(prazo_atendimento,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' ||
            coalesce(descricao,'') || ' ' ||
            coalesce(requisitos,'') || ' ' ||
            coalesce(canais_atendimento,'') || ' ' ||
            coalesce(prazo_atendimento,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Notícias publicadas. */
  private async recuperarNoticias(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT slug,
               titulo,
               left(coalesce(conteudo, resumo, ''), 600) AS texto,
               '/noticias/'||slug AS url,
               'noticias' AS fonte
        FROM noticias
        WHERE publicado = true
          AND to_tsvector('portuguese',
                titulo || ' ' || coalesce(conteudo, '') || ' ' || coalesce(resumo, '')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' || coalesce(conteudo, '') || ' ' || coalesce(resumo, '')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Secretarias ativas (slug como identificador no campo slug). */
  private async recuperarSecretarias(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          coalesce(slug, id::text) AS slug,
          nome AS titulo,
          left(
            coalesce(descricao,'') || ' ' ||
            coalesce(sobre,'') || ' ' ||
            coalesce(competencias,'') || ' ' ||
            case when responsavel is not null then 'Responsável: '||responsavel else '' end || ' ' ||
            case when horario is not null then 'Horário: '||horario else '' end || ' ' ||
            case when telefone is not null then 'Telefone: '||telefone else '' end || ' ' ||
            case when email is not null then 'E-mail: '||email else '' end,
            600
          ) AS texto,
          case when slug is not null then '/secretarias/'||slug else '/secretarias' end AS url,
          'secretarias' AS fonte
        FROM secretarias
        WHERE ativo = true
          AND to_tsvector('portuguese',
                nome || ' ' ||
                coalesce(descricao,'') || ' ' ||
                coalesce(sobre,'') || ' ' ||
                coalesce(competencias,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            nome || ' ' ||
            coalesce(descricao,'') || ' ' ||
            coalesce(sobre,'') || ' ' ||
            coalesce(competencias,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Documentos ativos (usa ementa + conteudo_extraido). */
  private async recuperarDocumentos(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          slug,
          titulo,
          left(coalesce(ementa,'') || ' ' || coalesce(left(conteudo_extraido, 800),''), 600) AS texto,
          coalesce(arquivo_url, '/documentos') AS url,
          'documentos' AS fonte
        FROM documentos
        WHERE ativo = true
          AND to_tsvector('portuguese',
                titulo || ' ' || coalesce(ementa,'') || ' ' || coalesce(conteudo_extraido,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' || coalesce(ementa,'') || ' ' || coalesce(conteudo_extraido,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  // ================================================================ AUDITORIA

  private async auditar(
    acao: string,
    entidade: string,
    entidadeId: string | null,
    dados: Record<string, unknown>,
  ) {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.tenantId() ?? null,
        atorId: TenantContext.get().userId ?? null,
        acao,
        entidade,
        entidadeId,
        dados: dados as object,
      },
    });
  }
}
