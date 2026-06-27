import { headers } from 'next/headers';

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Busca dados de transparência da API (modelo canônico, isolado por RLS pelo
 * Host). Cacheado por ISR com a tag `transparencia` — a sincronização do ETL
 * pode invalidar com revalidateTag('transparencia').
 */
async function api<T>(path: string, revalidate = 300): Promise<T> {
  const host = headers().get('host') ?? '';
  // `__h=<host>` isola o cache de fetch por tenant (Next indexa por URL e ignora
  // headers — sem isso o dado de um município vazaria para outro).
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(
    `${API}/api/transparencia/${path}${sep}__h=${encodeURIComponent(host)}`,
    {
      headers: { 'x-forwarded-host': host },
      next: { revalidate, tags: ['transparencia'] },
    },
  );
  if (!res.ok) throw new Error('Falha ao carregar dados de transparência.');
  return res.json() as Promise<T>;
}

export interface Pagina<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  ultimaAtualizacao: string | null;
}

export interface Despesa {
  exercicio: number;
  empenho: string;
  orgao?: string;
  credorNome?: string;
  fase?: string;
  valorEmpenhado: string;
  valorLiquidado: string;
  valorPago: string;
  dataEmpenho?: string;
}

export interface Receita {
  exercicio: number;
  codigo: string;
  descricao?: string;
  categoria?: string;
  valorPrevisto: string;
  valorArrecadado: string;
  dataLancamento?: string;
}

export interface Folha {
  exercicio: number;
  mes: number;
  matriculaMascarada: string;
  nomeServidor?: string | null;
  cargo?: string | null;
  vinculo?: string | null;
  orgao?: string | null;
  remuneracaoBruta: string;
  descontos: string;
  remuneracaoLiquida: string;
}

export const listarDespesas = (qs: string) =>
  api<Pagina<Despesa>>(`despesas?${qs}`);

export const listarReceitas = (qs: string) =>
  api<Pagina<Receita>>(`receitas?${qs}`);

export const listarFolha = (qs: string) => api<Pagina<Folha>>(`folha?${qs}`);

// ---------------------------------------------------------------------------
// Execução da despesa via APLIC/TCE-MT (carga contábil real). Servido por
// /api/transparencia/despesas/* — credor pessoa física com CPF mascarado.

export interface AplicResumo {
  exercicio: number | null;
  empenhado: number; liquidado: number; pago: number;
  empenhos: number; liquidacoes: number; pagamentos: number; credores: number;
}
export interface AplicEmpenho {
  exercicio: number; orgao: string | null; empenho: string; data: string | null;
  credor: string; credorNome: string | null; descricao: string | null;
  empenhado: number; liquidado: number; pago: number;
}
export interface AplicEmpenhosPagina {
  page: number; pageSize: number; total: number; exercicio: number | null; itens: AplicEmpenho[];
}
export interface AplicCredorItem { credor: string; nome: string | null; qtd: number; total: number }
export interface AplicCredores { exercicio: number | null; criterio: string; credores: AplicCredorItem[] }

export const getAplicResumo = (ex?: number) =>
  api<AplicResumo>(`despesas/resumo${ex ? `?exercicio=${ex}` : ''}`);

// /api/transparencia/recursos/* — contabilidade por fonte de recurso (Fase 5).
export interface FonteSaldo { fonte: string | null; nome: string | null; saldo: number }
export interface SaldoPorFonte { ate: string | null; total: number; fontes: FonteSaldo[] }
export interface FonteArrecadado { fonte: string | null; nome: string | null; arrecadado: number }
export interface ArrecadadoPeriodo {
  periodo: { de: string; ate: string };
  arrecadadoTotal: number;
  porFonte: FonteArrecadado[];
}
export const getSaldoPorFonte = (ate?: string) =>
  api<SaldoPorFonte | null>(`recursos/saldo-fonte${ate ? `?ate=${ate}` : ''}`);
export const getCaixaEquivalentes = (ate?: string) =>
  api<SaldoPorFonte | null>(`recursos/caixa${ate ? `?ate=${ate}` : ''}`);
export const getArrecadadoPeriodo = (de: string, ate: string, fonte?: string) =>
  api<ArrecadadoPeriodo | null>(`recursos/arrecadado?de=${de}&ate=${ate}${fonte ? `&fonte=${fonte}` : ''}`);

export const getAplicCredores = (ex?: number) =>
  api<AplicCredores>(`despesas/credores${ex ? `?exercicio=${ex}` : ''}`);

export const getAplicEmpenhos = (p: { exercicio?: number; q?: string; page?: number }) => {
  const qs = new URLSearchParams();
  if (p.exercicio) qs.set('exercicio', String(p.exercicio));
  if (p.q) qs.set('q', p.q);
  if (p.page) qs.set('page', String(p.page));
  return api<AplicEmpenhosPagina>(`despesas/empenhos${qs.toString() ? `?${qs}` : ''}`);
};

// ---------------------------------------------------------------------------
// Datasets genéricos do PNTP (diárias, obras, dívida ativa, terceirizados,
// convênios, licitações, contratos, documentos). Servidos por
// /api/transparencia/dataset/:key — as colunas variam por conjunto.

export type LinhaDataset = Record<string, string | number | null>;

export const listarDataset = (key: string, qs = '') =>
  api<Pagina<LinhaDataset>>(`dataset/${key}${qs ? `?${qs}` : ''}`);

export interface Documento {
  id: string;
  categoria: string;
  exercicio: number;
  titulo: string;
  urlExterna: string | null;
  publicadoEm: string | null;
}

export const listarDocumentos = (qs = 'pageSize=200') =>
  api<Pagina<Documento>>(`dataset/documentos?${qs}`);

// ---------------------------------------------------------------------------
// Dicionário de dados + licença (catálogo de dados abertos)

export interface CampoDicionario {
  [campo: string]: string;
}
export interface ConjuntoDicionario {
  descricao: string;
  chaveNatural: string[];
  campos: CampoDicionario;
}
export interface Dicionario {
  licenca: { nome: string; url: string };
  formatos: string[];
  conjuntos: Record<string, ConjuntoDicionario>;
}

export const getDicionario = () => api<Dicionario>('dicionario', 3600);
