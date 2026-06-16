import tipos from './seeds/tipo_conselho_municipal.json';

/** Tipos de conselho municipal (TCE-MT, 41) com flag de obrigatoriedade. */
export const CONSELHO_TIPOS = (tipos as { codigo: string; descricao: string; slug: string; obrigatorio?: unknown }[]).map(
  (r, i) => ({
    codigo: r.codigo,
    nome: r.descricao,
    slug: r.slug,
    obrigatorio: r.obrigatorio === 'S' || r.obrigatorio === true || r.obrigatorio === '1' || r.obrigatorio === 1,
    ordem: i,
  }),
);

/** Papéis de membro (TCE-MT, tipo_membro_conselho). */
export const PAPEIS = ['Presidente', 'Membro Representante', 'Membro Designado'];

/** Categorias sugeridas dos documentos de um conselho (editável). */
export const CATEGORIAS_DOC = [
  'Ata de Reunião',
  'Lei de Criação',
  'Regimento Interno',
  'Edital de Convocação',
  'Resolução',
  'Composição/Nomeação',
  'Plano/Relatório',
  'Outros',
];
