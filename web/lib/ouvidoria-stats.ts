import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface EstatisticasOuvidoria {
  total: number;
  ouvidoria: number;
  esic: number;
  abertos: number;
  respondidas: number;
  concluidas: number;
  taxaNoPrazo: number | null;
  tempoMedioDias: number | null;
  porStatus: { status: string; total: number }[];
  serieMensal: { mes: string; registradas: number; concluidas: number }[];
}

/**
 * Estatísticas públicas de Ouvidoria/e-SIC (sem dado pessoal), isoladas por
 * tenant pelo Host. `?__h=<host>` mantém o cache de fetch por município
 * (mesmo padrão da transparência). ISR de 5 min.
 */
export async function getEstatisticasOuvidoria(): Promise<EstatisticasOuvidoria | null> {
  const host = headers().get('host') ?? '';
  try {
    const res = await fetch(
      `${API}/api/manifestacoes/estatisticas?__h=${encodeURIComponent(host)}`,
      {
        headers: { 'x-forwarded-host': host },
        next: { revalidate: 300, tags: ['ouvidoria-stats'] },
      },
    );
    if (!res.ok) return null;
    return (await res.json()) as EstatisticasOuvidoria;
  } catch {
    return null;
  }
}
