import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

export interface LicitacaoItem {
  id: string;
  slug: string;
  numero: string | null;
  ano: number | null;
  objeto: string;
  situacao: string | null;
  orgao: string | null;
  dataAbertura: string | null;
  modalidade: { nome: string; lei8666: boolean; lei14133: boolean } | null;
  criterio: { nome: string } | null;
  _count: { documentos: number };
}
export interface LicitacaoDetalhe {
  id: string;
  numero: string | null;
  ano: number | null;
  objeto: string;
  situacao: string | null;
  orgao: string | null;
  dataAbertura: string | null;
  valorEstimado: string | null;
  modalidade: { nome: string; lei8666: boolean; lei14133: boolean } | null;
  criterio: { nome: string } | null;
  documentos: { id: string; fase: string; titulo: string; arquivoUrl: string | null; downloads: number }[];
}

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(`${API}/api/licitacoes/${path}${sep}__h=${encodeURIComponent(host)}`, {
    headers: { 'x-forwarded-host': host },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao carregar licitações.');
  return res.json() as Promise<T>;
}

export function getLicitacoes(params: { modalidade?: string; ano?: string; situacao?: string; q?: string; page?: string }) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return api<{ total: number; page: number; pageSize: number; items: LicitacaoItem[] }>(`?${qs}`);
}
export function getModalidadesEmUso() {
  return api<{ slug: string; nome: string }[]>('modalidades');
}
export function getLicitacao(slug: string) {
  return api<LicitacaoDetalhe>(encodeURIComponent(slug));
}
