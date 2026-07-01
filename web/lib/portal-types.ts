/**
 * Tipos públicos do portal — sem imports de server-only (next/headers etc).
 * Importável tanto em Server Components quanto em Client Components.
 */

// ─── Menu dinâmico ────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  label: string;
  tipo: 'interno' | 'externo' | 'grupo';
  href: string | null;
  icone: string | null;
  ordem: number;
  children: MenuItem[];
}

/** Item retornado pela rota admin (inclui campos extras de gestão). */
export interface MenuItemAdmin extends MenuItem {
  parentId: string | null;
  local: 'cabecalho' | 'rodape';
  ativo: boolean;
  refTipo: string | null;
}

/** Grupo de rotas disponíveis para criar itens internos. */
export interface RotaGrupo {
  grupo: string;
  rotas: { label: string; href: string }[];
}

export interface Banner {
  id: string;
  titulo: string;
  subtitulo?: string;
  imagemUrl: string;
  linkUrl?: string;
  ctaLabel?: string;
  ordem: number;
  ativo: boolean;
}

export interface Noticia {
  id: string;
  slug: string;
  titulo: string;
  resumo: string;
  imagemUrl?: string;
  categoria: string;
  autor?: string;
  publicadoEm: string;
  visualizacoes?: number;
}

export interface NoticiaDetalhe extends Noticia {
  conteudo: string;
}

export interface NoticiasResult {
  items: Noticia[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Secretaria {
  id: string;
  nome: string;
  slug?: string;
  sigla?: string;
  responsavel?: string;
  fotoUrl?: string;
  descricao?: string;
  email?: string;
  telefone?: string;
  ordem: number;
}

export interface HomeAtalho {
  id: string;
  label: string;
  descricao?: string | null;
  href: string;
  icone: string;
  ordem: number;
  ativo: boolean;
}

export interface HomeConfig {
  arColunas: number;
  arCardsLinha: number;
  arLadoCards: string;
  cardIconeForma: string;
  cardCorDestaque?: string | null;
  sliderTipo: string;
  sliderImagem?: string | null;
  sliderLink?: string | null;
  sliderHtml?: string | null;
  sliderVideo?: string | null;
  sliderYoutube?: string | null;
  sliderEnqueteId?: string | null;
  googleAnalyticsId?: string | null;
  ogImageUrl?: string | null;
  modoManutencao?: boolean;
  manutencaoMensagem?: string | null;
}

export interface HomeData {
  config: HomeConfig;
  atalhos: HomeAtalho[];
}

export interface GaleriaItem {
  id: string;
  tipo: 'foto' | 'video' | 'audio';
  fonte: 'upload' | 'youtube';
  titulo?: string | null;
  url?: string | null;
  youtubeId?: string | null;
  ordem: number;
  secretariaId?: string | null;
  secretaria?: { nome: string; slug?: string } | null;
}

export interface Servico {
  id: string;
  titulo: string;
  slug: string;
  descricao?: string | null;
  categoria?: string | null;
  orgaoResponsavel?: string | null;
  publicoAlvo?: string | null;
  prazoAtendimento?: string | null;
  custo?: string | null;
  urlExterna?: string | null;
  destaque?: boolean;
  avaliacaoSoma?: number;
  avaliacaoQtd?: number;
  ordem?: number;
}

export interface ServicoAvaliado {
  id: string;
  titulo: string;
  slug: string;
  categoria?: string | null;
  media: number;
  total: number;
}

export interface ServicoDetalhe extends Servico {
  requisitos?: string | null;
  etapas?: string[] | { titulo?: string; descricao?: string }[];
  canaisAtendimento?: string | null;
}

// ─── Buscador Unificado (ADR-0004) ───────────────────────────────────────────

export type BuscaTipo =
  | 'noticia'
  | 'documento'
  | 'diario'
  | 'servico'
  | 'secretaria'
  | 'cms'
  | 'transparencia'
  | 'licitacao'
  | 'contrato'
  | 'convenio'
  | 'conselho'
  | 'concurso';

export interface BuscaResultado {
  tipo: BuscaTipo;
  refId: string;
  titulo: string;
  /** HTML com apenas <b>…</b> para realce (ts_headline do Postgres). */
  snippet: string;
  url: string;
  score: number;
  publicadoEm?: string | null;
}

export interface BuscaResult {
  total: number;
  page: number;
  pageSize: number;
  resultados: BuscaResultado[];
}

// ── Escola Cidadã — tipos públicos (portado da câmara) ──
export interface CursoResumo {
  id: string;
  titulo: string;
  slug?: string | null;
  resumo?: string | null;
  capaUrl?: string | null;
  cargaHoraria?: number | null;
  inicioEm?: string | null;
  fimEm?: string | null;
  certificacao: boolean;
}

export interface CursoAulaResumo {
  id: string;
  titulo: string;
  duracaoMin?: number | null;
  ordem: number;
}

export interface CursoModuloResumo {
  id: string;
  titulo: string;
  descricao?: string | null;
  ordem: number;
  aulas: CursoAulaResumo[];
}

export interface CursoDetalhe extends CursoResumo {
  descricao?: string | null;
  modulos: CursoModuloResumo[];
}

export interface CertificadoPublico {
  codigo: string;
  nomeAluno: string;
  tituloCurso: string;
  cargaHoraria?: number | null;
  emitidoEm: string;
}

export type ValidacaoCertificado =
  | { valido: true; certificado: CertificadoPublico }
  | { valido: false };
// ── L5 PSS (Processo Seletivo Simplificado) ─────────────────────────────────
