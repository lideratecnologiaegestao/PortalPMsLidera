import naturezaLei from './seeds/natureza_lei.json';

/**
 * Cadastros de documentos semeados em cada tenant (Fase 1). Cada cadastro vira
 * uma rota pública + item de menu; cada tipo é a taxonomia (filtro). Leis usa a
 * taxonomia oficial do TCE-MT (natureza_lei, 83 naturezas); os demais usam tipos
 * sugeridos, editáveis pelo município.
 */
export interface TipoSeed {
  codigo?: string;
  nome: string;
  slug: string;
  meta?: Record<string, unknown>;
}
export interface CadastroSeed {
  slug: string;
  nome: string;
  descricao?: string;
  icone?: string;
  ordem: number;
  taxonomiaSeed?: string;
  tipos: TipoSeed[];
}

const naturezaLeiTipos: TipoSeed[] = (naturezaLei as { codigo: string; descricao: string; slug: string }[]).map(
  (r) => ({ codigo: r.codigo, nome: r.descricao, slug: r.slug }),
);

export const CADASTROS_PADRAO: CadastroSeed[] = [
  {
    slug: 'leis',
    nome: 'Leis',
    descricao: 'Legislação municipal organizada por natureza.',
    icone: 'gavel',
    ordem: 1,
    taxonomiaSeed: 'natureza_lei',
    tipos: naturezaLeiTipos,
  },
  {
    slug: 'decretos',
    nome: 'Decretos',
    descricao: 'Decretos do Poder Executivo municipal.',
    icone: 'file',
    ordem: 2,
    tipos: [
      { nome: 'Decreto numerado', slug: 'decreto-numerado' },
      { nome: 'Decreto legislativo', slug: 'decreto-legislativo' },
      { nome: 'Decreto de nomeação/exoneração', slug: 'decreto-nomeacao-exoneracao' },
      { nome: 'Decreto regulamentar', slug: 'decreto-regulamentar' },
    ],
  },
  {
    slug: 'portarias-e-resolucoes',
    nome: 'Portarias e Resoluções',
    descricao: 'Portarias, resoluções e atos administrativos normativos.',
    icone: 'file',
    ordem: 3,
    tipos: [
      { nome: 'Portaria', slug: 'portaria' },
      { nome: 'Resolução', slug: 'resolucao' },
      { nome: 'Instrução Normativa', slug: 'instrucao-normativa' },
      { nome: 'Ordem de Serviço', slug: 'ordem-de-servico' },
      { nome: 'Circular', slug: 'circular' },
    ],
  },
  {
    slug: 'alvaras',
    nome: 'Alvarás',
    descricao: 'Alvarás expedidos pelo município.',
    icone: 'file',
    ordem: 4,
    tipos: [
      { nome: 'Construção', slug: 'construcao' },
      { nome: 'Funcionamento', slug: 'funcionamento' },
      { nome: 'Sanitário', slug: 'sanitario' },
      { nome: 'Ambiental', slug: 'ambiental' },
      { nome: 'Localização', slug: 'localizacao' },
    ],
  },
  {
    slug: 'documentos-diversos',
    nome: 'Documentos Diversos',
    descricao: 'Demais documentos de transparência por área.',
    icone: 'file',
    ordem: 5,
    tipos: [
      { nome: 'Audiência Pública', slug: 'audiencia-publica' },
      { nome: 'REMUME — Relação Municipal de Medicamentos', slug: 'remume' },
      { nome: 'Escala de Plantões Médicos', slug: 'escala-de-plantoes-medicos' },
      { nome: 'Lista de Espera em Creches', slug: 'lista-de-espera-em-creches' },
      { nome: 'Plano Municipal', slug: 'plano-municipal' },
      { nome: 'Plano de Saneamento Básico', slug: 'plano-de-saneamento-basico' },
      { nome: 'ITR — Imposto Territorial Rural', slug: 'itr' },
      { nome: 'Requerimento', slug: 'requerimento' },
      { nome: 'Edital de Convocação', slug: 'edital-de-convocacao' },
    ],
  },
];
