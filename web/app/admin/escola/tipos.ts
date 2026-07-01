// Tipos compartilhados entre as abas/painéis do admin da Escola Cidadã.
//
// Refletem o que os endpoints de api/src/modules/escola retornam:
//   GET /api/professor/escola/cursos            → Pagina<CursoAdmin>
//   GET /api/professor/escola/cursos/:id         → CursoDetalheAdmin (com módulos+aulas+provas)
//   GET /api/admin/escola/templates              → TemplateAdmin[]
//   GET /api/admin/escola/tipos-certificado      → TipoCertificadoAdmin[]

/** Curso como retornado pela listagem de gestão (linha completa da tabela `cursos`). */
export interface CursoAdmin {
  id: string;
  titulo: string;
  slug?: string | null;
  resumo?: string | null;
  descricao?: string | null;
  conteudoProgramatico?: string | null;
  capaUrl?: string | null;
  capaStorageKey?: string | null;
  cargaHoraria?: number | null;
  inicioEm?: string | null;
  fimEm?: string | null;
  certificacao: boolean;
  /** Decimal serializado como string pelo Prisma (ex.: "70"). */
  notaMinima?: string | number | null;
  templateId?: string | null;
  status: string; // rascunho | publicado | encerrado
  publicado: boolean;
  ordem: number;
  criadoEm?: string;
  atualizadoEm?: string;
}

/** Aula dentro de um módulo (conteúdo EditorJS opcional em `conteudo`). */
export interface AulaAdmin {
  id: string;
  moduloId: string;
  cursoId: string;
  titulo: string;
  conteudo?: Record<string, unknown> | null;
  videoUrl?: string | null;
  storageKey?: string | null;
  duracaoMin?: number | null;
  ordem: number;
}

/** Módulo do curso, já com suas aulas (ordenadas). */
export interface ModuloAdmin {
  id: string;
  cursoId: string;
  titulo: string;
  descricao?: string | null;
  ordem: number;
  aulas: AulaAdmin[];
}

/** Opção de uma questão objetiva (gabarito em `correta`). */
export interface OpcaoAdmin {
  id: string;
  questaoId: string;
  texto: string;
  correta: boolean;
  ordem: number;
}

/** Questão de prova (objetiva ou dissertativa). */
export interface QuestaoAdmin {
  id: string;
  provaId: string;
  enunciado: string;
  tipo: string; // objetiva | dissertativa
  peso?: string | number | null;
  ordem: number;
  opcoes?: OpcaoAdmin[];
}

/** Prova do curso (vinculada ou não a um módulo). */
export interface ProvaAdmin {
  id: string;
  cursoId: string;
  moduloId?: string | null;
  titulo: string;
  descricao?: string | null;
  notaMinima?: string | number | null;
  tempoLimiteMin?: number | null;
  maxTentativas: number;
  embaralhar: boolean;
  ativa: boolean;
  ordem: number;
  questoes?: QuestaoAdmin[];
}

/** Curso com módulos (e aulas) e provas — retorno de GET cursos/:id. */
export interface CursoDetalheAdmin extends CursoAdmin {
  modulos: ModuloAdmin[];
  provas: ProvaAdmin[];
}

// ─── Certificados (admin) ────────────────────────────────────────────────────

export interface TipoCertificadoAdmin {
  id: string;
  nome: string;
  descricao?: string | null;
  ativo: boolean;
  ordem: number;
}

export interface TemplateTextoAdmin {
  id: string;
  conteudo: string;
  posX?: number | null;
  posY?: number | null;
  largura?: number | null;
  fonte?: string | null;
  tamanho?: number | null;
  cor?: string | null;
  alinhamento?: string | null;
  negrito?: boolean | null;
  ordem: number;
}

export interface TemplateElementoAdmin {
  id: string;
  tipo?: string | null; // qr | linha | retangulo | assinatura
  posX?: number | null;
  posY?: number | null;
  largura?: number | null;
  altura?: number | null;
  config?: Record<string, unknown> | null;
  ordem: number;
}

export interface TemplateFotoAdmin {
  id: string;
  url?: string | null;
  storageKey?: string | null;
  posX?: number | null;
  posY?: number | null;
  largura?: number | null;
  altura?: number | null;
  ordem: number;
}

/** Página do template (multipágina): fundo próprio + itens. */
export interface TemplatePaginaAdmin {
  id?: string;
  ordem?: number;
  fundoUrl?: string | null;
  fundoStorageKey?: string | null;
  textos?: TemplateTextoAdmin[];
  elementos?: TemplateElementoAdmin[];
  fotos?: TemplateFotoAdmin[];
}

export interface TemplateAdmin {
  id: string;
  typeId?: string | null;
  nome: string;
  fundoUrl?: string | null;
  fundoStorageKey?: string | null;
  largura: number;
  altura: number;
  orientacao: string; // paisagem | retrato
  padrao: boolean;
  ativo: boolean;
  // Multipágina: cada página tem fundo + itens. (Legado: textos/elementos/fotos flat.)
  paginas?: TemplatePaginaAdmin[];
  textos?: TemplateTextoAdmin[];
  elementos?: TemplateElementoAdmin[];
  fotos?: TemplateFotoAdmin[];
}

// ─── Helpers de formatação compartilhados ────────────────────────────────────

/** Converte ISO/Date para o valor de um <input type="date"> (YYYY-MM-DD). */
export function toDateInput(iso?: string | null): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** Formata uma data ISO para exibição curta pt-BR; '—' quando ausente. */
export function fmtData(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

export const STATUS_CURSO = [
  { v: 'rascunho', l: 'Rascunho' },
  { v: 'publicado', l: 'Publicado' },
  { v: 'encerrado', l: 'Encerrado' },
];

export function rotuloStatusCurso(s?: string | null): string {
  return STATUS_CURSO.find((x) => x.v === s)?.l ?? s ?? '—';
}
