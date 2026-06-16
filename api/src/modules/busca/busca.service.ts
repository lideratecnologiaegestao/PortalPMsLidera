import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from '../ia/embeddings.service';
import { RerankService } from '../ia/rerank.service';
import { RespostaBusca, ResultadoBusca, TipoBusca } from './busca.dto';

// -------------------------------------------------------------------------
// Tipos internos
// -------------------------------------------------------------------------

/** Linha crua retornada pela leg lexical (search_index). */
interface CandidatoLex {
  tipo: TipoBusca;
  ref_id: string;
  titulo: string;
  subtitulo: string | null;
  url: string;
  snippet_src: string | null;
  publicado_em: Date | null;
  rank_lex: number;
}

/** Linha crua retornada pela leg semântica (ia_chunks). */
interface CandidatoSem {
  fonte: string;
  ref_id: string;
  titulo: string;
  url: string | null;
  trecho: string | null;
}

/** Candidato fundido após RRF. */
interface Candidato {
  tipo: TipoBusca;
  ref_id: string;
  titulo: string;
  subtitulo: string | null;
  url: string;
  snippet_src: string | null;
  publicado_em: Date | null;
  /** Rank posicional na leg lexical (1-based); undefined = não apareceu na leg. */
  rank_lex?: number;
  /** Rank posicional na leg semântica (1-based); undefined = não apareceu na leg. */
  rank_sem?: number;
  /** Score RRF calculado. */
  score_rrf: number;
  /** Score final (rerank se disponível, RRF normalizado caso contrário). */
  score: number;
}

/** Total de linhas para a paginação. */
interface RawTotal {
  total: bigint;
}

/** Resultado de ts_headline por candidato da página atual. */
interface HeadlineRow {
  tipo: TipoBusca;
  ref_id: string;
  snippet: string | null;
}

// Mapeamento de fonte (ia_chunks) → tipo (search_index / DTO).
const FONTE_PARA_TIPO: Record<string, TipoBusca | undefined> = {
  documentos: 'documento',
  servicos: 'servico',
  noticias: 'noticia',
  secretarias: 'secretaria',
  cms: 'cms',
};

// Fontes excluídas da leg semântica (conteúdo interno da IA, não-público).
const FONTES_EXCLUIDAS = new Set(['conhecimento']);

// Parâmetro k do Reciprocal Rank Fusion (valor padrão da literatura = 60).
const RRF_K = 60;

// Quantos candidatos recuperar por leg.
const LEG_TOP = 50;

// Quantos candidatos fundir (entrada para o rerank).
const FUSION_TOP = 30;

/**
 * Buscador unificado do portal — busca HÍBRIDA (FTS lexical + semântica vetorial)
 * com RERANK Voyage AI e fallback gracioso para FTS puro.
 *
 * Fluxo:
 *   1. Leg lexical  : top-50 via search_index (FTS `websearch_to_tsquery`).
 *   2. Leg semântica: SE embeddings configurados → embed query → cosine em ia_chunks top-50.
 *                     Apenas fontes mapeadas para conteúdo público (excl. 'conhecimento').
 *                     Candidatos semânticos são CRUZADOS com search_index (LGPD/segurança):
 *                     somente itens que já existem no search_index (público e filtrado) entram.
 *   3. Fusão RRF    : score_rrf = 1/(k+rank_lex) + 1/(k+rank_sem). Top-30 candidatos.
 *   4. Rerank Voyage: monta textos "titulo. snippet_src" e chama RerankService. Em caso de
 *                     falha/timeout/sem-chave → usa ordem RRF (sem quebrar a busca).
 *   5. Filtro + paginação sobre a lista ranqueada final.
 *
 * O `total` reportado é o número de candidatos fundidos (após LGPD cross-join),
 * pré-filtro de tipo mas pós-deduplicação — coerente com a paginação.
 *
 * FALLBACK: se embeddings não estão configurados OU qualquer etapa semântica/rerank
 * falhar → degrada para FTS puro (comportamento idêntico ao original).
 *
 * RLS: todas as queries (ambas as legs) passam por `prisma.tx()` →
 * GUC `app.current_tenant_id` setado pelo PrismaService → isolamento automático.
 */
@Injectable()
export class BuscaService {
  private readonly log = new Logger(BuscaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly rerank: RerankService,
  ) {}

  async buscar(opts: {
    q: string;
    tipo?: TipoBusca;
    page: number;
    pageSize: number;
  }): Promise<RespostaBusca> {
    const { q, tipo, page, pageSize } = opts;

    // -----------------------------------------------------------------------
    // Tenta a busca híbrida; se qualquer coisa falhar na camada semântica,
    // o catch externo cai diretamente no FTS puro.
    // -----------------------------------------------------------------------
    if (this.embeddings.configurado) {
      try {
        return await this.buscarHibrido(q, tipo, page, pageSize);
      } catch (err) {
        this.log.warn(
          `Busca híbrida falhou — degradando para FTS puro: ${String(err)}`,
        );
      }
    }

    // Caminho puro FTS (original — sem semântica/rerank).
    return this.buscarFts(q, tipo, page, pageSize);
  }

  // =========================================================================
  // LEG LEXICAL + SEMÂNTICA + RRF + RERANK
  // =========================================================================

  private async buscarHibrido(
    q: string,
    tipo: TipoBusca | undefined,
    page: number,
    pageSize: number,
  ): Promise<RespostaBusca> {
    // Embed a query 1x (usada para a leg semântica).
    const vecs = await this.embeddings.embed([q]);
    const vec = vecs?.[0] ?? null;

    // Roda ambas as legs dentro de uma única transação → mesmo GUC de tenant.
    const candidatos = await this.prisma.tx(async (t) => {
      // ---- Leg lexical: top-50 do search_index ----
      const lexRows = await t.$queryRaw<CandidatoLex[]>`
        SELECT
          si.tipo,
          si.ref_id,
          si.titulo,
          si.subtitulo,
          si.url,
          si.snippet_src,
          si.publicado_em,
          (ts_rank_cd(si.corpo_tsv, websearch_to_tsquery('portuguese', unaccent(${q})), 32) * si.peso)::float8 AS rank_lex
        FROM search_index si
        WHERE si.corpo_tsv @@ websearch_to_tsquery('portuguese', unaccent(${q}))
        ORDER BY rank_lex DESC, si.publicado_em DESC NULLS LAST
        LIMIT ${LEG_TOP}`;

      // ---- Leg semântica: top-50 de ia_chunks por cosine ----
      // Só executa se há vetor e pgvector disponível.
      let semRows: CandidatoSem[] = [];
      if (vec) {
        try {
          // Literal vetorial gerado internamente (array de numbers) — sem interpolação
          // de string de usuário; seguro contra injeção.
          const vlit = `[${vec.join(',')}]`;
          semRows = await t.$queryRawUnsafe<CandidatoSem[]>(
            `SELECT
               fonte,
               ref_id,
               titulo,
               url,
               left(trecho, 600) AS trecho
             FROM ia_chunks
             WHERE fonte != 'conhecimento'
             ORDER BY embedding <=> '${vlit}'::vector
             LIMIT ${LEG_TOP}`,
          );
        } catch {
          // ia_chunks/pgvector indisponível — continua só com FTS.
        }
      }

      return { lexRows, semRows };
    });

    const { lexRows, semRows } = candidatos;

    // Mapa: chave (tipo:ref_id) → candidato fundido.
    const mapa = new Map<string, Candidato>();

    // Popula com a leg lexical (rank 1-based).
    for (let i = 0; i < lexRows.length; i++) {
      const r = lexRows[i];
      mapa.set(`${r.tipo}:${r.ref_id}`, {
        tipo: r.tipo, ref_id: r.ref_id, titulo: r.titulo, subtitulo: r.subtitulo,
        url: r.url, snippet_src: r.snippet_src, publicado_em: r.publicado_em,
        rank_lex: i + 1, score_rrf: 0, score: 0,
      });
    }

    // Leg semântica: mapeia fonte→tipo, deduplica e atribui rank posicional (1-based).
    const semRankPorChave = new Map<string, number>();
    let semPos = 0;
    for (const sr of semRows) {
      if (FONTES_EXCLUIDAS.has(sr.fonte)) continue;
      const tipoMapeado = FONTE_PARA_TIPO[sr.fonte];
      if (!tipoMapeado) continue;
      semPos++;
      const chave = `${tipoMapeado}:${sr.ref_id}`;
      if (!semRankPorChave.has(chave)) semRankPorChave.set(chave, semPos);
    }

    // Aplica rank_sem aos que já vieram do FTS; coleta os candidatos SEMÂNTICOS-ONLY.
    const faltantes: { tipo: TipoBusca; ref_id: string }[] = [];
    for (const [chave, rank] of semRankPorChave) {
      const existente = mapa.get(chave);
      if (existente) {
        existente.rank_sem = rank;
      } else {
        const idx = chave.indexOf(':');
        faltantes.push({ tipo: chave.slice(0, idx) as TipoBusca, ref_id: chave.slice(idx + 1) });
      }
    }

    // Filtro LGPD/segurança: busca os candidatos semânticos-only NA TABELA `search_index`
    // (já filtrada para conteúdo público na indexação). Só os que EXISTEM lá entram —
    // assim nada restrito/pessoal aparece, mesmo vindo do vetorial. Isto também inclui
    // resultados que o FTS lexical NÃO casou (essência da busca híbrida/semântica).
    if (faltantes.length > 0) {
      const pares = faltantes.map((f) => Prisma.sql`(${f.tipo}::text, ${f.ref_id}::text)`);
      const rows = await this.prisma.tx((t) =>
        t.$queryRaw<CandidatoLex[]>`
          SELECT si.tipo, si.ref_id, si.titulo, si.subtitulo, si.url, si.snippet_src, si.publicado_em, 0::float8 AS rank_lex
          FROM search_index si
          WHERE (si.tipo, si.ref_id) IN (${Prisma.join(pares, ', ')})`,
      );
      for (const r of rows) {
        const chave = `${r.tipo}:${r.ref_id}`;
        mapa.set(chave, {
          tipo: r.tipo, ref_id: r.ref_id, titulo: r.titulo, subtitulo: r.subtitulo,
          url: r.url, snippet_src: r.snippet_src, publicado_em: r.publicado_em,
          rank_sem: semRankPorChave.get(chave), score_rrf: 0, score: 0,
        });
      }
    }

    // ---- Fusão RRF ----
    for (const [, c] of mapa) {
      let score = 0;
      if (c.rank_lex !== undefined) score += 1 / (RRF_K + c.rank_lex);
      if (c.rank_sem !== undefined) score += 1 / (RRF_K + c.rank_sem);
      c.score_rrf = score;
      c.score = score; // provisório; substituído pelo rerank abaixo
    }

    // Ordena por RRF DESC, pega top FUSION_TOP.
    let fusionList = [...mapa.values()]
      .sort((a, b) => b.score_rrf - a.score_rrf)
      .slice(0, FUSION_TOP);

    // ---- RERANK Voyage ----
    if (fusionList.length > 0) {
      try {
        const docs = fusionList.map((c) =>
          `${c.titulo}. ${c.snippet_src ?? ''}`.slice(0, 1500),
        );
        const rerankResult = await this.rerank.rerank(q, docs, fusionList.length);
        if (rerankResult && rerankResult.length > 0) {
          // Reordena a lista de candidatos pela ordem retornada pelo rerank.
          const reordenado: Candidato[] = [];
          for (const r of rerankResult) {
            const c = fusionList[r.index];
            if (c) {
              c.score = r.score;
              reordenado.push(c);
            }
          }
          // Adiciona candidatos que o rerank não retornou (topK < total) ao final.
          const reordenadoSet = new Set(reordenado.map((c) => `${c.tipo}:${c.ref_id}`));
          for (const c of fusionList) {
            if (!reordenadoSet.has(`${c.tipo}:${c.ref_id}`)) {
              reordenado.push(c);
            }
          }
          fusionList = reordenado;
        }
        // Se rerankResult for null (falha/timeout) → mantém ordem RRF (fusionList inalterado).
      } catch (err) {
        // Rerank falhou mas não quebra a busca.
        this.log.warn(`Rerank inesperado — usando ordem RRF: ${String(err)}`);
      }
    }

    // ---- Filtro por tipo (pré-paginação) ----
    const filtrado = tipo
      ? fusionList.filter((c) => c.tipo === tipo)
      : fusionList;

    const total = filtrado.length;
    const offset = (page - 1) * pageSize;
    const pagina = filtrado.slice(offset, offset + pageSize);

    if (pagina.length === 0) {
      return { total, page, pageSize, resultados: [] };
    }

    // ---- ts_headline para os itens da página ----
    const headlines = await this.gerarHeadlines(q, pagina);
    const headlineMap = new Map<string, string | null>(
      headlines.map((h) => [`${h.tipo}:${h.ref_id}`, h.snippet]),
    );

    const resultados: ResultadoBusca[] = pagina.map((c) => ({
      tipo: c.tipo,
      refId: c.ref_id,
      titulo: c.titulo,
      subtitulo: c.subtitulo,
      snippet: headlineMap.get(`${c.tipo}:${c.ref_id}`) ?? null,
      url: c.url,
      score: c.score,
      publicadoEm: c.publicado_em,
    }));

    return { total, page, pageSize, resultados };
  }

  /**
   * Gera snippets ts_headline para os candidatos da página atual.
   * Roda em `prisma.tx()` separado para manter o GUC de tenant ativo.
   */
  private async gerarHeadlines(
    q: string,
    candidatos: Candidato[],
  ): Promise<HeadlineRow[]> {
    if (candidatos.length === 0) return [];

    // Monta um VALUES em SQL para fazer JOIN temporário.
    // Cada candidato traz seu snippet_src para o ts_headline.
    return this.prisma.tx(async (t) => {
      const headlineExpr = Prisma.sql`
        ts_headline(
          'portuguese',
          coalesce(si.snippet_src, si.titulo),
          websearch_to_tsquery('portuguese', unaccent(${q})),
          'MaxWords=40,MinWords=15,MaxFragments=2,StartSel=<mark>,StopSel=</mark>'
        )`;

      // Busca headlines apenas para os (tipo, ref_id) da página usando IN.
      const pares = candidatos.map(
        (c) => Prisma.sql`(${c.tipo}::text, ${c.ref_id}::text)`,
      );
      const inClause = Prisma.join(pares, ', ');

      return t.$queryRaw<HeadlineRow[]>`
        SELECT
          si.tipo,
          si.ref_id,
          ${headlineExpr} AS snippet
        FROM search_index si
        WHERE (si.tipo, si.ref_id) IN (${inClause})`;
    });
  }

  // =========================================================================
  // FTS PURO (fallback — comportamento original)
  // =========================================================================

  /**
   * Busca FTS original sem semântica nem rerank.
   * Mantém comportamento 100% idêntico ao código anterior — é o caminho
   * de fallback quando embeddings não estão configurados ou quando a leg
   * semântica/rerank lança erro inesperado.
   */
  private async buscarFts(
    q: string,
    tipo: TipoBusca | undefined,
    page: number,
    pageSize: number,
  ): Promise<RespostaBusca> {
    const offset = (page - 1) * pageSize;

    return this.prisma.tx(async (t) => {
      const conds: Prisma.Sql[] = [
        Prisma.sql`si.corpo_tsv @@ websearch_to_tsquery('portuguese', unaccent(${q}))`,
      ];
      if (tipo) {
        conds.push(Prisma.sql`si.tipo = ${tipo}`);
      }
      const where = Prisma.join(conds, ' AND ');

      const rankExpr = Prisma.sql`
        ts_rank_cd(si.corpo_tsv, websearch_to_tsquery('portuguese', unaccent(${q})), 32) * si.peso`;

      const headlineExpr = Prisma.sql`
        ts_headline(
          'portuguese',
          coalesce(si.snippet_src, si.titulo),
          websearch_to_tsquery('portuguese', unaccent(${q})),
          'MaxWords=40,MinWords=15,MaxFragments=2,StartSel=<mark>,StopSel=</mark>'
        )`;

      interface RawResultado {
        tipo: TipoBusca;
        ref_id: string;
        titulo: string;
        subtitulo: string | null;
        snippet: string | null;
        url: string;
        score: number;
        publicado_em: Date | null;
      }

      const [rows, totalRows] = await Promise.all([
        t.$queryRaw<RawResultado[]>`
          SELECT
            si.tipo,
            si.ref_id,
            si.titulo,
            si.subtitulo,
            ${headlineExpr} AS snippet,
            si.url,
            ${rankExpr} AS score,
            si.publicado_em
          FROM search_index si
          WHERE ${where}
          ORDER BY score DESC, si.publicado_em DESC NULLS LAST
          LIMIT ${pageSize} OFFSET ${offset}`,
        t.$queryRaw<RawTotal[]>`
          SELECT COUNT(*)::bigint AS total
          FROM search_index si
          WHERE ${where}`,
      ]);

      const total = Number(totalRows[0]?.total ?? 0);

      const resultados: ResultadoBusca[] = rows.map((r) => ({
        tipo: r.tipo,
        refId: r.ref_id,
        titulo: r.titulo,
        subtitulo: r.subtitulo,
        snippet: r.snippet,
        url: r.url,
        score: Number(r.score),
        publicadoEm: r.publicado_em,
      }));

      return { total, page, pageSize, resultados };
    });
  }
}
