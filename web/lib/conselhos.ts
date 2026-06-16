import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface ConselhoItem {
  id: string;
  slug: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  tipo: { nome: string } | null;
  _count: { membros: number; documentos: number };
}
export interface ConselhoDetalhe {
  id: string;
  nome: string;
  sigla: string | null;
  descricao: string | null;
  leiCriacao: string | null;
  mandatoInicio: string | null;
  mandatoFim: string | null;
  email: string | null;
  tipo: { nome: string } | null;
  membros: { id: string; nome: string; papel: string; segmento: string | null; inicio: string | null; fim: string | null }[];
  documentos: { id: string; categoria: string; titulo: string; dataDocumento: string | null; arquivoUrl: string | null; downloads: number }[];
}

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}/api/conselhos/${path}${sep}__h=${encodeURIComponent(host)}`, {
    headers: { 'x-forwarded-host': host },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar conselhos.');
  return res.json() as Promise<T>;
}

export function getConselhos(params: { tipo?: string; q?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return api<ConselhoItem[]>(`?${qs}`);
}
export function getTiposEmUso() {
  return api<{ slug: string; nome: string }[]>('tipos');
}
export function getConselho(slug: string) {
  return api<ConselhoDetalhe>(encodeURIComponent(slug));
}
