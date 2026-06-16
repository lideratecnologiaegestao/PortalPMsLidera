import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface ContratoItem {
  id: string; slug: string; numero: string | null; ano: number | null; objeto: string;
  contratado: string | null; valor: string | null; situacao: string | null; vigenciaFim: string | null;
  _count: { aditivos: number };
}
export interface ContratoDetalhe {
  id: string; numero: string | null; ano: number | null; objeto: string;
  contratado: string | null; contratadoDoc: string | null; valor: string | null;
  dataAssinatura: string | null; vigenciaInicio: string | null; vigenciaFim: string | null;
  situacao: string | null; orgao: string | null; fundamento: string | null;
  arquivoUrl: string | null; downloads: number;
  aditivos: { id: string; numero: string | null; tipo: string | null; objeto: string | null; valor: string | null; data: string | null; vigenciaFim: string | null; arquivoUrl: string | null; downloads: number }[];
}

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}/api/contratos/${path}${sep}__h=${encodeURIComponent(host)}`, { headers: { 'x-forwarded-host': host }, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar contratos.');
  return res.json() as Promise<T>;
}

export function getContratos(p: { ano?: string; situacao?: string; q?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  return api<ContratoItem[]>(`?${qs}`);
}
export function getContrato(slug: string) {
  return api<ContratoDetalhe>(encodeURIComponent(slug));
}
