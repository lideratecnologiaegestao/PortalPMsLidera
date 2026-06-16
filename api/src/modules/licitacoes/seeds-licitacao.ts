import modalidades from './seeds/modalidade_licitacao.json';
import criterios from './seeds/criterio_julgamento_licitacao.json';

/** Modalidades de licitação (TCE-MT, 70) com flags das Leis 8.666 e 14.133. */
export const MODALIDADES = (modalidades as { codigo: string; descricao: string; slug: string; lei_8666: string; lei_14133: string }[]).map(
  (r, i) => ({
    codigo: r.codigo,
    nome: r.descricao,
    slug: r.slug,
    lei8666: r.lei_8666 === 'S',
    lei14133: r.lei_14133 === 'S',
    ordem: i,
  }),
);

/** Critérios de julgamento (TCE-MT, 12). */
export const CRITERIOS = (criterios as { codigo: string; descricao: string; slug: string }[]).map((r, i) => ({
  codigo: r.codigo,
  nome: r.descricao,
  slug: r.slug,
  ordem: i,
}));

/** Fases sugeridas dos documentos de uma licitação (editável no cadastro). */
export const FASES_SUGERIDAS = [
  'Aviso de Licitação',
  'Edital',
  'Anexos do Edital',
  'Impugnações e Esclarecimentos',
  'Ata de Abertura/Sessão',
  'Resultado de Julgamento',
  'Habilitação',
  'Recursos',
  'Homologação',
  'Ata de Registro de Preço',
  'Contrato',
  'Aditivo',
  'Outros',
];
