import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface ConvenioItem {
  id: string; slug: string; numero: string | null; ano: number | null; objeto: string;
  concedente: string | null; convenente: string | null; valorRepasse: string | null; situacao: string | null; vigenciaFim: string | null;
  _count: { documentos: number };
}
export interface ConvenioDetalhe {
  id: string; numero: string | null; ano: number | null; objeto: string;
  concedente: string | null; convenente: string | null; valorRepasse: string | null; contrapartida: string | null;
  dataAssinatura: string | null; vigenciaInicio: string | null; vigenciaFim: string | null; situacao: string | null; orgao: string | null;
  documentos: { id: string; categoria: string; titulo: string; dataDocumento: string | null; arquivoUrl: string | null; downloads: number }[];
}

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}/api/convenios/${path}${sep}__h=${encodeURIComponent(host)}`, { headers: { 'x-forwarded-host': host }, cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar convênios.');
  return res.json() as Promise<T>;
}

export function getConvenios(p: { ano?: string; situacao?: string; q?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) qs.set(k, v);
  return api<ConvenioItem[]>(`?${qs}`);
}
export function getConvenio(slug: string) {
  return api<ConvenioDetalhe>(encodeURIComponent(slug));
}
