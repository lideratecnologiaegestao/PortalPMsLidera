import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

async function api<T>(path: string): Promise<T | null> {
  const host = headers().get('host') ?? '';
  const res = await fetch(`${API}/api/diario/${path}`, {
    headers: { 'x-forwarded-host': host },
    cache: 'no-store',
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Falha ao consultar o Diário Oficial.');
  return res.json() as Promise<T>;
}

export interface MateriaResumo {
  id: string;
  tipo: string;
  numeroAto: string | null;
  titulo: string;
  ementa: string | null;
  conteudo: string;
  ordem: number;
  orgaoNome: string | null;
  paginaInicial: number | null;
  secretaria?: { nome: string; slug?: string } | null;
}

export interface Edicao {
  id: string;
  numero: string;
  numeroSeq?: number | null;
  tipoEdicao?: string;
  dataEdicao: string;
  titulo: string;
  conteudo: string;
  publicadoEm: string | null;
  carimboTempo: string | null;
  algoritmo: string | null;
  hash: string | null;
  totalPaginas?: number | null;
  arquivoKey?: string | null;
  materias?: MateriaResumo[];
  integridade: { hashConfere: boolean; assinaturaConfere: boolean };
}

export interface ArquivoItem {
  id: string;
  numero: string;
  dataEdicao: string;
  titulo: string;
  tipoEdicao: string;
  publicadoEm: string | null;
  totalPaginas: number | null;
  _count: { materias: number };
}

export interface BuscaHit {
  id: string;
  tipo: string;
  numeroAto: string | null;
  titulo: string;
  orgao: string | null;
  edicaoId: string;
  edicaoNumero: string;
  dataEdicao: string;
  snippet: string;
}

export interface Pagina<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MateriaDetalhe extends MateriaResumo {
  edicao: { id: string; numero: string; dataEdicao: string; hash: string | null; publicadoEm: string | null };
  retifica?: { id: string; titulo: string; numeroAto: string | null } | null;
}

export interface Verificacao {
  valido: boolean;
  motivo?: string;
  numero?: string;
  publicadoEm?: string;
  carimboTempo?: string;
  hashConfere?: boolean;
  assinaturaConfere?: boolean;
}

export const getEdicao = (numero: string) => api<Edicao>(encodeURIComponent(numero));

export const verificar = (hash: string) =>
  api<Verificacao>(`verificar?hash=${encodeURIComponent(hash)}`);

export const getMateria = (id: string) => api<MateriaDetalhe>(`materia/${encodeURIComponent(id)}`);

export const getAnos = () => api<number[]>('anos').then((r) => r ?? []);

export const getTipos = () => api<{ slug: string; nome: string }[]>('tipos').then((r) => r ?? []);

export function getArquivo(params: {
  ano?: number;
  mes?: number;
  tipoEdicao?: string;
  page?: number;
}): Promise<Pagina<ArquivoItem> | null> {
  const sp = new URLSearchParams();
  if (params.ano) sp.set('ano', String(params.ano));
  if (params.mes) sp.set('mes', String(params.mes));
  if (params.tipoEdicao) sp.set('tipoEdicao', params.tipoEdicao);
  if (params.page) sp.set('page', String(params.page));
  return api<Pagina<ArquivoItem>>(`?${sp.toString()}`);
}

export function buscar(params: {
  q?: string;
  tipo?: string;
  orgao?: string;
  de?: string;
  ate?: string;
  page?: number;
}): Promise<Pagina<BuscaHit> | null> {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.tipo) sp.set('tipo', params.tipo);
  if (params.orgao) sp.set('orgao', params.orgao);
  if (params.de) sp.set('de', params.de);
  if (params.ate) sp.set('ate', params.ate);
  if (params.page) sp.set('page', String(params.page));
  return api<Pagina<BuscaHit>>(`busca?${sp.toString()}`);
}

/** Rótulo legível de um tipo de matéria. */
export function rotuloTipo(slug: string): string {
  const map: Record<string, string> = {
    lei: 'Lei', decreto: 'Decreto', portaria: 'Portaria', resolucao: 'Resolução',
    edital: 'Edital', licitacao: 'Licitação', extrato_contrato: 'Extrato de Contrato/Convênio',
    ato_pessoal: 'Ato de Pessoal', aviso: 'Aviso/Comunicado', outro: 'Outro',
  };
  return map[slug] ?? slug;
}
