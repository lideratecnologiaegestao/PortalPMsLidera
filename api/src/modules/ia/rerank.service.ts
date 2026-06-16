import { Injectable, Logger } from '@nestjs/common';

/**
 * Cliente de RERANK da Voyage AI.
 *
 * Responsabilidade única: receber uma query e uma lista de documentos e
 * devolver os índices reordenados com scores de relevância, chamando
 * POST https://api.voyageai.com/v1/rerank (timeout 5s).
 *
 * Degrada silenciosamente: sem chave, timeout ou erro de rede → retorna null.
 * O caller é SEMPRE responsável pelo fallback (RRF / FTS puro).
 *
 * NÃO loga a VOYAGE_API_KEY — só loga status HTTP ou mensagem de erro genérica.
 */
@Injectable()
export class RerankService {
  private readonly log = new Logger(RerankService.name);

  /**
   * Reordena `documentos` de acordo com a `query` usando o modelo de rerank
   * da Voyage AI.
   *
   * @param query      Pergunta/consulta do usuário.
   * @param documentos Textos dos candidatos (ordem original = índice 0..N-1).
   * @param topK       Quantos resultados devolver (default = todos).
   * @returns Array `{ index, score }` ordenado por relevância DESC; ou `null`
   *          em caso de erro/ausência de chave (caller faz fallback).
   */
  async rerank(
    query: string,
    documentos: string[],
    topK?: number,
  ): Promise<{ index: number; score: number }[] | null> {
    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) return null;
    if (documentos.length === 0) return null;

    const model =
      process.env.VOYAGE_RERANK_MODEL ?? 'rerank-2.5';

    try {
      const res = await fetch('https://api.voyageai.com/v1/rerank', {
        method: 'POST',
        headers: {
          // Chave enviada no header HTTP — nunca logada.
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          query,
          documents: documentos,
          top_k: topK,
          return_documents: false,
        }),
        // 5 s de timeout — busca nunca pode ficar dependurada.
        signal: AbortSignal.timeout(5_000),
      });

      if (!res.ok) {
        this.log.warn(`Voyage rerank retornou HTTP ${res.status} — usando fallback RRF.`);
        return null;
      }

      const body = (await res.json()) as {
        data: { index: number; relevance_score: number }[];
      };

      return (body.data ?? []).map((d) => ({
        index: d.index,
        score: d.relevance_score,
      }));
    } catch (err) {
      // AbortError (timeout) ou falha de rede — não é crítico; busca FTS/RRF prevalece.
      const msg = err instanceof Error ? err.message : String(err);
      this.log.warn(`Voyage rerank falhou (${msg}) — usando fallback RRF.`);
      return null;
    }
  }
}
