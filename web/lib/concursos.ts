import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface ConcursoItem {
  id: string;
  slug: string;
  numero: string | null;
  ano: number | null;
  objeto: string;
  situacao: string | null;
  orgao: string | null;
  banca: string | null;
  tipo: { nome: string } | null;
  _count: { documentos: number };
}
export interface ConcursoDetalhe {
  id: string;
  numero: string | null;
  ano: number | null;
  objeto: string;
  situacao: string | null;
  orgao: string | null;
  banca: string | null;
  tipo: { nome: string } | null;
  documentos: { id: string; fase: string; titulo: string; dataDocumento: string | null; arquivoUrl: string | null; downloads: number }[];
}

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}/api/concursos/${path}${sep}__h=${encodeURIComponent(host)}`, {
    headers: { 'x-forwarded-host': host },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar concursos.');
  return res.json() as Promise<T>;
}

export function getConcursos(params: { tipo?: string; situacao?: string; ano?: string; q?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return api<ConcursoItem[]>(`?${qs}`);
}
export function getTiposEmUso() {
  return api<{ slug: string; nome: string }[]>('tipos');
}
export function getConcurso(slug: string) {
  return api<ConcursoDetalhe>(encodeURIComponent(slug));
}
