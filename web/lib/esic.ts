/**
 * Fetchers SSR para dados públicos do módulo e-SIC.
 *
 * Isolamento multi-tenant: `?__h=<host>` garante que o cache de fetch do
 * Next.js (indexado por URL, ignora headers) nunca sirva dados de um
 * município a outro. A API ignora o parâmetro — usa `x-forwarded-host`.
 *
 * Fronteira de camadas: o frontend NUNCA acessa banco/storage diretamente.
 * Tudo passa pela API (CLAUDE.md regra 2b).
 *
 * Este módulo usa `next/headers` → server-only.
 */

import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

/** ISR de 5 minutos — estatísticas não mudam a cada segundo. */
const REVALIDATE = 300;

function tenantHost(): string {
  return headers().get('host') ?? '';
}

/**
 * Monta URL incluindo `__h=<host>` para isolamento de cache por tenant.
 */
function tenantUrl(path: string): string {
  const host = tenantHost();
  const sep = path.includes('?') ? '&' : '?';
  return `${API}${path}${sep}__h=${encodeURIComponent(host)}`;
}

function tenantHeaders(): Record<string, string> {
  return { 'x-forwarded-host': tenantHost() };
}

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface EsicPorStatus {
  status: string;
  total: number;
}

export interface EsicMes {
  /** Formato ISO: "2024-01" */
  mes: string;
  total: number;
}

export interface EsicSolicitacao {
  protocolo: string;
  assunto: string;
  tipo: string;
  status: string;
  criadoEm: string;
  respondidoEm: string | null;
}

export interface EsicEstatisticas {
  /** ISO datetime da geração dos dados */
  geradoEm: string;
  total: number;
  abertos: number;
  respondidas: number;
  /** 0–100 */
  taxaResposta: number;
  /** 0–100 */
  taxaNoPrazo: number;
  /** null quando não há dados suficientes */
  tempoMedioDias: number | null;
  porStatus: EsicPorStatus[];
  /** Série dos últimos 12 meses */
  serieMensal: EsicMes[];
  /** Últimas solicitações anonimizadas (sem dado pessoal) */
  ultimasSolicitacoes: EsicSolicitacao[];
}

// ─── Fetcher ─────────────────────────────────────────────────────────────────

/**
 * Busca as estatísticas públicas do e-SIC do tenant atual.
 * Endpoint público — sem autenticação.
 * Retorna `null` em caso de erro (página mostra estado vazio).
 */
export async function getEsicEstatisticas(): Promise<EsicEstatisticas | null> {
  try {
    const res = await fetch(tenantUrl('/api/esic/estatisticas'), {
      headers: tenantHeaders(),
      next: { revalidate: REVALIDATE, tags: ['esic-stats'] },
    });
    if (!res.ok) return null;
    return (await res.json()) as EsicEstatisticas;
  } catch {
    return null;
  }
}
