/**
 * Catálogo dos conjuntos do Portal da Transparência (PNTP/Atricon).
 * Fonte única usada pelo hub, pela página genérica de dataset e pela página de
 * dados abertos — garante que todo conjunto exposto ao cidadão tenha rota,
 * colunas, filtros e link de download coerentes.
 */
export type TipoColuna = 'texto' | 'num' | 'moeda' | 'data';

export interface ColunaDef {
  key: string;
  label: string;
  tipo?: TipoColuna; // default 'texto'
}

export interface FiltroDef {
  key: 'ano' | 'situacao' | 'tipo' | 'vinculo';
  label: string;
}

export interface ConjuntoDef {
  /** chave de dados na API (key do /dataset/:key, ou 'despesas'/'receitas'/'folha'). */
  key: string;
  /** segmento da rota pública: /transparencia/<slug>. */
  slug: string;
  /** como exportar: 'transp' = /api/transparencia/<key>.csv · 'dataset' = /api/transparencia/dataset/<key>.csv */
  via: 'transp' | 'dataset';
  nome: string;
  desc: string;
  /** agrupamento temático no hub. */
  tema: string;
  /** se a página genérica [dataset] renderiza este conjunto (despesas/receitas/folha/documentos têm página própria). */
  generico: boolean;
  colunas: ColunaDef[];
  filtros: FiltroDef[];
}

const ANO: FiltroDef = { key: 'ano', label: 'Ano' };

export const CONJUNTOS: ConjuntoDef[] = [
  // ---- Orçamento e finanças (páginas dedicadas) ----
  {
    key: 'receitas', slug: 'receitas', via: 'transp', generico: false,
    nome: 'Receitas', desc: 'Valores previstos e arrecadados.', tema: 'Orçamento e Finanças',
    colunas: [], filtros: [ANO],
  },
  {
    key: 'despesas', slug: 'despesas', via: 'transp', generico: false,
    nome: 'Despesas', desc: 'Empenhos, liquidações e pagamentos.', tema: 'Orçamento e Finanças',
    colunas: [], filtros: [ANO],
  },
  {
    key: 'folha', slug: 'folha', via: 'transp', generico: false,
    nome: 'Folha de Pagamento', desc: 'Remuneração dos servidores (LGPD aplicada).', tema: 'Pessoal',
    colunas: [], filtros: [ANO],
  },

  // ---- Datasets genéricos ----
  {
    key: 'diarias', slug: 'diarias', via: 'dataset', generico: true,
    nome: 'Diárias', desc: 'Beneficiário, cargo, destino e valor das diárias.', tema: 'Pessoal',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'documento', label: 'Documento' },
      { key: 'beneficiario', label: 'Beneficiário' },
      { key: 'cargo', label: 'Cargo' },
      { key: 'destino', label: 'Destino' },
      { key: 'valorTotal', label: 'Valor', tipo: 'moeda' },
      { key: 'dataInicio', label: 'Início', tipo: 'data' },
    ],
    filtros: [ANO],
  },
  {
    key: 'terceirizados', slug: 'terceirizados', via: 'dataset', generico: true,
    nome: 'Terceirizados', desc: 'Empregados terceirizados a serviço do município.', tema: 'Pessoal',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'nome', label: 'Nome' },
      { key: 'empresa', label: 'Empresa' },
      { key: 'cargo', label: 'Cargo' },
      { key: 'vinculo', label: 'Vínculo' },
      { key: 'remuneracao', label: 'Remuneração', tipo: 'moeda' },
    ],
    filtros: [ANO, { key: 'vinculo', label: 'Vínculo' }],
  },
  {
    key: 'licitacoes', slug: 'licitacoes', via: 'dataset', generico: true,
    nome: 'Licitações', desc: 'Processos licitatórios e seus resultados.', tema: 'Compras e Contratos',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'numero', label: 'Número' },
      { key: 'modalidade', label: 'Modalidade' },
      { key: 'objeto', label: 'Objeto' },
      { key: 'valorEstimado', label: 'Valor estimado', tipo: 'moeda' },
      { key: 'situacao', label: 'Situação' },
      { key: 'dataAbertura', label: 'Abertura', tipo: 'data' },
    ],
    filtros: [ANO, { key: 'situacao', label: 'Situação' }],
  },
  {
    key: 'contratos', slug: 'contratos', via: 'dataset', generico: true,
    nome: 'Contratos', desc: 'Contratos administrativos vigentes e encerrados.', tema: 'Compras e Contratos',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'numero', label: 'Número' },
      { key: 'fornecedorNome', label: 'Fornecedor' },
      { key: 'fornecedorDoc', label: 'Documento' },
      { key: 'objeto', label: 'Objeto' },
      { key: 'valor', label: 'Valor', tipo: 'moeda' },
    ],
    filtros: [ANO],
  },
  {
    key: 'convenios', slug: 'convenios', via: 'dataset', generico: true,
    nome: 'Convênios', desc: 'Transferências recebidas e concedidas.', tema: 'Compras e Contratos',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'numero', label: 'Número' },
      { key: 'tipo', label: 'Tipo' },
      { key: 'participe', label: 'Partícipe' },
      { key: 'objeto', label: 'Objeto' },
      { key: 'valor', label: 'Valor', tipo: 'moeda' },
    ],
    filtros: [ANO, { key: 'tipo', label: 'Tipo' }],
  },
  {
    key: 'obras', slug: 'obras', via: 'dataset', generico: true,
    nome: 'Obras', desc: 'Obras públicas com objeto, situação e valores.', tema: 'Obras',
    colunas: [
      { key: 'identificador', label: 'Identificador' },
      { key: 'objeto', label: 'Objeto' },
      { key: 'situacao', label: 'Situação' },
      { key: 'contratada', label: 'Contratada' },
      { key: 'valorContratado', label: 'Contratado', tipo: 'moeda' },
      { key: 'valorExecutado', label: 'Executado', tipo: 'moeda' },
      { key: 'bairro', label: 'Bairro' },
    ],
    filtros: [{ key: 'situacao', label: 'Situação' }],
  },
  {
    key: 'divida-ativa', slug: 'divida-ativa', via: 'dataset', generico: true,
    nome: 'Dívida Ativa', desc: 'Inscritos em dívida ativa (documento mascarado).', tema: 'Orçamento e Finanças',
    colunas: [
      { key: 'exercicio', label: 'Ano', tipo: 'num' },
      { key: 'inscricao', label: 'Inscrição' },
      { key: 'inscritoNome', label: 'Inscrito' },
      { key: 'inscritoDoc', label: 'Documento' },
      { key: 'natureza', label: 'Natureza' },
      { key: 'valor', label: 'Valor', tipo: 'moeda' },
    ],
    filtros: [ANO],
  },
];

export const conjuntoPorSlug = (slug: string) =>
  CONJUNTOS.find((c) => c.slug === slug);

/** Conjuntos genéricos (renderizados pela rota [dataset]). */
export const conjuntoGenericoPorSlug = (slug: string) =>
  CONJUNTOS.find((c) => c.slug === slug && c.generico);

/** Temas na ordem de exibição do hub. */
export const TEMAS = [
  'Orçamento e Finanças',
  'Compras e Contratos',
  'Obras',
  'Pessoal',
] as const;
