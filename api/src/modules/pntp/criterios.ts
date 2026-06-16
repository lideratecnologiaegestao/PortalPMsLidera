/**
 * Registro dos critérios PNTP/Atricon mapeados a verificações AUTOMÁTICAS no
 * portal (ver docs/13-pntp-criterios.md). Cada critério liga-se a uma fonte de
 * dados; o PntpService avalia os 5 itens de verificação e calcula o índice.
 *
 * exig: E=essencial(2) · O=obrigatório(1,5) · R=recomendado(1)
 * fonte: dataset (tabela transp_*) | documento (categoria) | cms (slug) | manual
 */
export type Exig = 'E' | 'O' | 'R';
export type Fonte = 'dataset' | 'documento' | 'cms' | 'manual';

export interface Criterio {
  id: string;
  dimensao: string;
  pesoDim: number;
  exig: Exig;
  desc: string;
  fonte: Fonte;
  dataset?: string;   // chave em transp_* (DatasetsService) ou 'despesas'/'receitas'/'folha'
  categoria?: string; // para fonte 'documento' (transp_documentos.categoria)
  cmsSlug?: string;   // para fonte 'cms'
}

export const PESO_EXIG: Record<Exig, number> = { E: 2, O: 1.5, R: 1 };

export const CRITERIOS: Criterio[] = [
  // Informações Prioritárias (2)
  { id: '1.2', dimensao: 'Informações Prioritárias', pesoDim: 2, exig: 'E', desc: 'Portal da transparência próprio', fonte: 'manual' },
  { id: '1.4', dimensao: 'Informações Prioritárias', pesoDim: 2, exig: 'O', desc: 'Ferramenta de pesquisa no portal', fonte: 'manual' },
  // Institucional (2)
  { id: '2.1', dimensao: 'Informações Institucionais', pesoDim: 2, exig: 'O', desc: 'Estrutura organizacional', fonte: 'cms', cmsSlug: 'institucional/estrutura' },
  { id: '2.4', dimensao: 'Informações Institucionais', pesoDim: 2, exig: 'O', desc: 'Endereços, telefones e e-mails', fonte: 'cms', cmsSlug: 'institucional/contatos' },
  { id: '2.7', dimensao: 'Informações Institucionais', pesoDim: 2, exig: 'R', desc: 'Perguntas frequentes (FAQ)', fonte: 'cms', cmsSlug: 'institucional/faq' },
  // Receita (4)
  { id: '3.1', dimensao: 'Receita', pesoDim: 4, exig: 'E', desc: 'Receitas com previsão e realização', fonte: 'dataset', dataset: 'receitas' },
  { id: '3.3', dimensao: 'Receita', pesoDim: 4, exig: 'O', desc: 'Lista de inscritos em dívida ativa', fonte: 'dataset', dataset: 'divida-ativa' },
  // Despesa (4)
  { id: '4.1', dimensao: 'Despesa', pesoDim: 4, exig: 'E', desc: 'Despesas empenhadas, liquidadas e pagas', fonte: 'dataset', dataset: 'despesas' },
  { id: '4.3', dimensao: 'Despesa', pesoDim: 4, exig: 'E', desc: 'Empenhos com beneficiário do pagamento', fonte: 'dataset', dataset: 'despesas' },
  // Convênios (1)
  { id: '5.1', dimensao: 'Convênios e Transferências', pesoDim: 1, exig: 'O', desc: 'Transferências recebidas/realizadas', fonte: 'dataset', dataset: 'convenios' },
  // Recursos Humanos (3)
  { id: '6.1', dimensao: 'Recursos Humanos', pesoDim: 3, exig: 'O', desc: 'Relação nominal de servidores', fonte: 'dataset', dataset: 'folha' },
  { id: '6.2', dimensao: 'Recursos Humanos', pesoDim: 3, exig: 'O', desc: 'Remuneração nominal de cada servidor', fonte: 'dataset', dataset: 'folha' },
  { id: '6.5', dimensao: 'Recursos Humanos', pesoDim: 3, exig: 'O', desc: 'Lista de terceirizados', fonte: 'dataset', dataset: 'terceirizados' },
  { id: '6.6', dimensao: 'Recursos Humanos', pesoDim: 3, exig: 'O', desc: 'Editais de concursos/seleções', fonte: 'documento', categoria: 'concurso' },
  // Diárias (1)
  { id: '7.1', dimensao: 'Diárias', pesoDim: 1, exig: 'O', desc: 'Beneficiário, cargo e valor de diárias', fonte: 'dataset', dataset: 'diarias' },
  // Licitações (3)
  { id: '8.1', dimensao: 'Licitações', pesoDim: 3, exig: 'O', desc: 'Relação das licitações', fonte: 'dataset', dataset: 'licitacoes' },
  { id: '8.2', dimensao: 'Licitações', pesoDim: 3, exig: 'O', desc: 'Íntegra dos editais', fonte: 'documento', categoria: 'edital_licitacao' },
  { id: '8.6', dimensao: 'Licitações', pesoDim: 3, exig: 'O', desc: 'Plano de contratações anual', fonte: 'documento', categoria: 'plano_contratacoes' },
  // Contratos (3)
  { id: '9.1', dimensao: 'Contratos', pesoDim: 3, exig: 'O', desc: 'Relação dos contratos', fonte: 'dataset', dataset: 'contratos' },
  { id: '9.2', dimensao: 'Contratos', pesoDim: 3, exig: 'O', desc: 'Inteiro teor dos contratos', fonte: 'documento', categoria: 'contrato' },
  // Obras (2)
  { id: '10.1', dimensao: 'Obras', pesoDim: 2, exig: 'O', desc: 'Obras com objeto, situação e responsável', fonte: 'dataset', dataset: 'obras' },
  // Planejamento e Prestação de Contas (4) — ESSENCIAIS
  { id: '11.1', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'Prestação de Contas (Balanço Geral)', fonte: 'documento', categoria: 'balanco_geral' },
  { id: '11.5', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'Relatório de Gestão Fiscal (RGF)', fonte: 'documento', categoria: 'rgf' },
  { id: '11.6', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'Relatório Resumido da Execução Orçamentária (RREO)', fonte: 'documento', categoria: 'rreo' },
  { id: '11.8', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'Lei do PPA e anexos', fonte: 'documento', categoria: 'ppa' },
  { id: '11.9', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'LDO e anexos', fonte: 'documento', categoria: 'ldo' },
  { id: '11.10', dimensao: 'Planejamento e Prestação de Contas', pesoDim: 4, exig: 'E', desc: 'LOA e anexos', fonte: 'documento', categoria: 'loa' },
  // SIC / e-SIC (2)
  { id: '12.3', dimensao: 'SIC / e-SIC', pesoDim: 2, exig: 'O', desc: 'Envio de pedidos por e-SIC', fonte: 'manual' },
  { id: '12.5', dimensao: 'SIC / e-SIC', pesoDim: 2, exig: 'O', desc: 'Regulamentação local da LAI', fonte: 'documento', categoria: 'regulamento_lai' },
  { id: '12.7', dimensao: 'SIC / e-SIC', pesoDim: 2, exig: 'O', desc: 'Relatório estatístico anual de pedidos', fonte: 'documento', categoria: 'relatorio_estatistico_sic' },
  // Acessibilidade (1)
  { id: '13.3', dimensao: 'Acessibilidade', pesoDim: 1, exig: 'O', desc: 'Alto contraste', fonte: 'manual' },
  { id: '13.4', dimensao: 'Acessibilidade', pesoDim: 1, exig: 'O', desc: 'Redimensionamento de fonte', fonte: 'manual' },
  { id: '13.5', dimensao: 'Acessibilidade', pesoDim: 1, exig: 'O', desc: 'Mapa do site', fonte: 'cms', cmsSlug: 'mapa-do-site' },
  // Ouvidoria (1)
  { id: '14.2', dimensao: 'Ouvidoria', pesoDim: 1, exig: 'O', desc: 'Canal eletrônico da Ouvidoria', fonte: 'manual' },
  { id: '14.3', dimensao: 'Ouvidoria', pesoDim: 1, exig: 'O', desc: 'Carta de Serviços ao Usuário', fonte: 'documento', categoria: 'carta_servicos' },
  // LGPD e Governo Digital (1)
  { id: '15.1', dimensao: 'LGPD e Governo Digital', pesoDim: 1, exig: 'O', desc: 'Encarregado pelo tratamento de dados (DPO)', fonte: 'cms', cmsSlug: 'privacidade/encarregado' },
  { id: '15.2', dimensao: 'LGPD e Governo Digital', pesoDim: 1, exig: 'O', desc: 'Política de Privacidade', fonte: 'cms', cmsSlug: 'privacidade/politica' },
  { id: '15.4', dimensao: 'LGPD e Governo Digital', pesoDim: 1, exig: 'R', desc: 'Dados abertos (acesso automatizado)', fonte: 'manual' },
];
