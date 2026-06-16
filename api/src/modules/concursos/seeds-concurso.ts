import certames from './seeds/tipo_concurso.json';
import docTipos from './seeds/concurso_tipo_documento.json';

/** Tipos de certame (TCE-MT, 6). */
export const CONCURSO_TIPOS = (certames as { codigo: string; descricao: string; slug: string }[]).map((r, i) => ({
  codigo: r.codigo,
  nome: r.descricao,
  slug: r.slug,
  ordem: i,
}));

/** Tipos de documento do certame (TCE-MT, 40) agrupados por `situacao` (fase). */
export const CONCURSO_DOC_TIPOS = (docTipos as { codigo: string; descricao: string; situacao?: string; publicacao_obrigatoria?: unknown; slug?: string }[]).map(
  (r, i) => ({
    codigo: r.codigo,
    nome: r.descricao,
    slug: r.slug ?? null,
    situacao: r.situacao ?? null,
    obrigatorio: r.publicacao_obrigatoria === 'S' || r.publicacao_obrigatoria === true || r.publicacao_obrigatoria === '1' || r.publicacao_obrigatoria === 1,
    ordem: i,
  }),
);
