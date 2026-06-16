/**
 * Tipos e fetchers para o módulo Construtor de Formulários.
 * Fronteira de camadas: tudo passa pela API (regra 2b do CLAUDE.md).
 */

// ─── Tipos de campo ───────────────────────────────────────────────────────────

export type TipoCampo =
  | 'texto'
  | 'textarea'
  | 'email'
  | 'telefone'
  | 'cpf'
  | 'numero'
  | 'data'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'upload'
  | 'secao'
  | 'paragrafo';

export type LarguraCampo = 'full' | 'half';

export interface OpcaoCampo {
  label: string;
  valor: string;
}

export interface ValidacaoCampo {
  minLength?: number;
  maxLength?: number;
  formato?: 'email' | 'telefone' | 'cpf' | 'numero';
  regex?: string;
  mensagem?: string;
}

export interface CampoFormulario {
  id: string;
  tipo: TipoCampo;
  label: string;
  nome: string;
  placeholder?: string;
  ajuda?: string;
  obrigatorio: boolean;
  largura: LarguraCampo;
  opcoes?: OpcaoCampo[];
  validacao?: ValidacaoCampo;
  multiplos?: boolean;    // upload: múltiplos arquivos / checkbox: múltipla seleção
  accept?: string;        // upload: tipos MIME aceitos
  maxTamanhoMb?: number;  // upload: tamanho máximo em MB
}

// ─── Tipos de formulário ─────────────────────────────────────────────────────

export type StatusFormulario = 'rascunho' | 'publicado' | 'encerrado';

export interface FormularioResumo {
  id: string;
  slug: string;
  titulo: string;
  status: StatusFormulario;
  totalEnvios: number;
  atualizadoEm: string;
}

export interface FormularioDetalhe {
  id: string;
  slug: string;
  titulo: string;
  descricao?: string;
  schema: CampoFormulario[];
  status: StatusFormulario;
  mensagemConfirmacao?: string;
  redirecionarUrl?: string;
  loginObrigatorio: boolean;
  multiplosEnvios: boolean;
  captchaHabilitado: boolean;
  notificarEmails: string[];
  notificarCc: string[];
  notificarBcc: string[];
  totalEnvios: number;
}

// ─── Tipos de envio ──────────────────────────────────────────────────────────

export interface EnvioResumo {
  id: string;
  dados: Record<string, unknown>;
  cidadaoNome?: string;
  temAnexos: boolean;
  lido: boolean;
  criadoEm: string;
}

export interface AnexoEnvio {
  campo: string;
  nome: string;
  mime: string;
  tamanho: number;
}

export interface EnvioDetalhe {
  id: string;
  dados: Record<string, unknown>;
  anexos: AnexoEnvio[];
  cidadaoNome?: string;
  ip: string;
  criadoEm: string;
  lido: boolean;
}

export interface PaginaEnvios {
  total: number;
  page: number;
  pageSize: number;
  items: EnvioResumo[];
}

// ─── Tipo público (sem dados sensíveis de admin) ──────────────────────────────

export interface FormularioPublico {
  titulo: string;
  descricao?: string;
  schema: CampoFormulario[];
  mensagemConfirmacao?: string;
  redirecionarUrl?: string;
  captchaHabilitado: boolean;
  loginObrigatorio: boolean;
}

export interface CaptchaDesafio {
  token: string;
  pergunta: string;
}

// ─── Fetcher público (SSR) ────────────────────────────────────────────────────

const API = process.env.API_URL ?? 'http://localhost:3001';

/**
 * Busca a definição de um formulário público pelo slug.
 * Usa cache no-store pois o conteúdo pode mudar sem prévia de revalidação.
 * Isola por tenant via `__h=<host>` + x-forwarded-host.
 */
export async function getFormularioPublico(
  slug: string,
  host: string,
): Promise<FormularioPublico | null> {
  try {
    const res = await fetch(
      `${API}/api/formularios/${encodeURIComponent(slug)}?__h=${encodeURIComponent(host)}`,
      {
        headers: { 'x-forwarded-host': host },
        cache: 'no-store',
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('Falha ao carregar formulário.');
    return res.json();
  } catch {
    return null;
  }
}

// ─── Labels de tipo para exibição ────────────────────────────────────────────

export const TIPO_LABEL: Record<TipoCampo, string> = {
  texto: 'Texto',
  textarea: 'Área de texto',
  email: 'E-mail',
  telefone: 'Telefone',
  cpf: 'CPF',
  numero: 'Número',
  data: 'Data',
  select: 'Seleção',
  checkbox: 'Caixas (checkbox)',
  radio: 'Múltipla escolha (radio)',
  upload: 'Upload de arquivo',
  secao: 'Seção / Título',
  paragrafo: 'Parágrafo de texto',
};

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Converte um label em um nome snake_case único. */
export function labelToNome(label: string): string {
  return label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .substring(0, 60) || 'campo';
}

/** Gera um id curto para novo campo. */
export function gerarIdCampo(): string {
  return Math.random().toString(36).substring(2, 10);
}
