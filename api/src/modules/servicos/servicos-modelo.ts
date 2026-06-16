/**
 * Modelo padrão da Carta de Serviços — conjunto curado de serviços municipais
 * comuns (mesclado a partir dos portais de Cuiabá e Várzea Grande, sem
 * duplicatas). Usado no provisionamento de novos tenants (`semeiarServicos`).
 * O gestor edita/desativa cada um depois. `destaque: true` => aparece na home.
 */
export interface ServicoModelo {
  titulo: string;
  categoria: string;
  descricao: string;
  orgaoResponsavel: string;
  publicoAlvo?: string;
  prazoAtendimento?: string;
  custo?: string;
  urlExterna?: string;
  destaque?: boolean;
}

export const SERVICOS_MODELO: ServicoModelo[] = [
  // ── Tributário / Fazenda ───────────────────────────────────────────────
  { titulo: 'Segunda via de IPTU', categoria: 'Tributário', descricao: 'Emissão da segunda via do carnê e das guias do Imposto Predial e Territorial Urbano.', orgaoResponsavel: 'Secretaria de Fazenda', publicoAlvo: 'Cidadão / Proprietário de imóvel', prazoAtendimento: 'Imediato', custo: 'Gratuito', destaque: true },
  { titulo: 'Consulta e parcelamento de débitos', categoria: 'Tributário', descricao: 'Consulta de débitos municipais (IPTU, ISS, taxas) e adesão a parcelamento.', orgaoResponsavel: 'Secretaria de Fazenda', publicoAlvo: 'Cidadão / Empresa', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Nota Fiscal de Serviços Eletrônica (NFS-e)', categoria: 'Tributário', descricao: 'Emissão de notas fiscais eletrônicas de serviços e recolhimento do ISS.', orgaoResponsavel: 'Secretaria de Fazenda', publicoAlvo: 'Empresa / Prestador de serviços', prazoAtendimento: 'Imediato', custo: 'Gratuito', destaque: true },
  { titulo: 'Certidão Negativa de Débitos Municipais', categoria: 'Tributário', descricao: 'Emissão de certidão de regularidade fiscal junto ao município.', orgaoResponsavel: 'Secretaria de Fazenda', publicoAlvo: 'Cidadão / Empresa', prazoAtendimento: 'Até 5 dias úteis', custo: 'Gratuito', destaque: true },
  { titulo: 'Portal do Contribuinte', categoria: 'Tributário', descricao: 'Acesso unificado aos serviços tributários: consultas, guias, certidões e cadastro.', orgaoResponsavel: 'Secretaria de Fazenda', publicoAlvo: 'Cidadão / Empresa', prazoAtendimento: 'Imediato', custo: 'Gratuito' },

  // ── Empresa e Empreendedor ────────────────────────────────────────────
  { titulo: 'Alvará de Funcionamento', categoria: 'Empresa e Empreendedor', descricao: 'Solicitação e renovação do alvará de localização e funcionamento de estabelecimentos.', orgaoResponsavel: 'Secretaria de Desenvolvimento Econômico', publicoAlvo: 'Empresa / Empreendedor', prazoAtendimento: 'Até 15 dias úteis', custo: 'Conforme tabela', destaque: true },
  { titulo: 'Abertura de Empresa (Sala do Empreendedor)', categoria: 'Empresa e Empreendedor', descricao: 'Apoio à abertura, alteração e baixa de empresas, integrado à Redesim.', orgaoResponsavel: 'Secretaria de Desenvolvimento Econômico', publicoAlvo: 'Empreendedor', prazoAtendimento: 'Variável', custo: 'Gratuito' },
  { titulo: 'Microempreendedor Individual (MEI)', categoria: 'Empresa e Empreendedor', descricao: 'Orientação para formalização e regularização do MEI.', orgaoResponsavel: 'Secretaria de Desenvolvimento Econômico', publicoAlvo: 'Microempreendedor', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Intermediação de Emprego (SINE)', categoria: 'Empresa e Empreendedor', descricao: 'Cadastro de trabalhadores e vagas, encaminhamento ao mercado de trabalho e seguro-desemprego.', orgaoResponsavel: 'Secretaria de Assistência Social / Trabalho', publicoAlvo: 'Trabalhador / Empresa', prazoAtendimento: 'Imediato', custo: 'Gratuito' },

  // ── Obras e Urbanismo ─────────────────────────────────────────────────
  { titulo: 'Aprovação de Projetos e Alvará de Construção', categoria: 'Obras e Urbanismo', descricao: 'Análise e aprovação de projetos e emissão de alvará para construção, reforma ou demolição.', orgaoResponsavel: 'Secretaria de Desenvolvimento Urbano', publicoAlvo: 'Cidadão / Profissional', prazoAtendimento: 'Até 30 dias úteis', custo: 'Conforme tabela' },
  { titulo: 'Habite-se (Certidão de Conclusão de Obra)', categoria: 'Obras e Urbanismo', descricao: 'Vistoria e emissão do Habite-se atestando a conclusão da obra conforme o projeto aprovado.', orgaoResponsavel: 'Secretaria de Desenvolvimento Urbano', publicoAlvo: 'Cidadão / Proprietário', prazoAtendimento: 'Até 20 dias úteis', custo: 'Conforme tabela' },
  { titulo: 'Certidão de Uso e Ocupação do Solo', categoria: 'Obras e Urbanismo', descricao: 'Consulta sobre o uso permitido para o imóvel conforme o zoneamento urbano.', orgaoResponsavel: 'Secretaria de Desenvolvimento Urbano', publicoAlvo: 'Cidadão / Empresa', prazoAtendimento: 'Até 10 dias úteis', custo: 'Gratuito' },

  // ── Saúde ─────────────────────────────────────────────────────────────
  { titulo: 'Agendamento de Consultas e Exames', categoria: 'Saúde', descricao: 'Marcação de consultas, exames e procedimentos na rede municipal de saúde.', orgaoResponsavel: 'Secretaria de Saúde', publicoAlvo: 'Cidadão', prazoAtendimento: 'Conforme disponibilidade', custo: 'Gratuito', destaque: true },
  { titulo: 'Cartão Nacional de Saúde (Cartão SUS)', categoria: 'Saúde', descricao: 'Emissão e atualização do Cartão SUS nas unidades de saúde.', orgaoResponsavel: 'Secretaria de Saúde', publicoAlvo: 'Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Vacinação', categoria: 'Saúde', descricao: 'Calendário de vacinação e campanhas nas unidades básicas de saúde.', orgaoResponsavel: 'Secretaria de Saúde', publicoAlvo: 'Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito' },

  // ── Educação ──────────────────────────────────────────────────────────
  { titulo: 'Matrícula na Rede Municipal', categoria: 'Educação', descricao: 'Matrícula e rematrícula em creches e escolas municipais.', orgaoResponsavel: 'Secretaria de Educação', publicoAlvo: 'Famílias / Responsáveis', prazoAtendimento: 'Período de matrícula', custo: 'Gratuito', destaque: true },
  { titulo: 'Consulta de Vagas em Escolas e Creches', categoria: 'Educação', descricao: 'Consulta de vagas disponíveis e situação da demanda escolar.', orgaoResponsavel: 'Secretaria de Educação', publicoAlvo: 'Famílias / Responsáveis', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Transporte Escolar', categoria: 'Educação', descricao: 'Solicitação e informações sobre o transporte escolar municipal.', orgaoResponsavel: 'Secretaria de Educação', publicoAlvo: 'Estudantes / Responsáveis', prazoAtendimento: 'Variável', custo: 'Gratuito' },

  // ── Assistência Social ────────────────────────────────────────────────
  { titulo: 'Cadastro Único (CadÚnico)', categoria: 'Assistência Social', descricao: 'Inscrição e atualização no Cadastro Único para acesso a programas sociais (Bolsa Família e outros).', orgaoResponsavel: 'Secretaria de Assistência Social', publicoAlvo: 'Famílias de baixa renda', prazoAtendimento: 'Conforme agendamento', custo: 'Gratuito' },
  { titulo: 'Atendimento no CRAS', categoria: 'Assistência Social', descricao: 'Acolhimento, orientação e encaminhamento a serviços e benefícios socioassistenciais.', orgaoResponsavel: 'Secretaria de Assistência Social', publicoAlvo: 'Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Carteira da Pessoa Idosa', categoria: 'Assistência Social', descricao: 'Emissão da carteira que garante direitos à pessoa idosa, como gratuidade no transporte.', orgaoResponsavel: 'Secretaria de Assistência Social', publicoAlvo: 'Pessoa idosa', prazoAtendimento: 'Até 10 dias úteis', custo: 'Gratuito' },
  { titulo: 'Credencial de Estacionamento (Idoso e PCD)', categoria: 'Assistência Social', descricao: 'Emissão da credencial de estacionamento para idosos e pessoas com deficiência.', orgaoResponsavel: 'Secretaria de Mobilidade', publicoAlvo: 'Idoso / PCD', prazoAtendimento: 'Até 15 dias úteis', custo: 'Gratuito' },

  // ── Transporte e Trânsito ─────────────────────────────────────────────
  { titulo: 'Consulta de Multas e Infrações', categoria: 'Transporte e Trânsito', descricao: 'Consulta de multas e infrações de trânsito de competência municipal.', orgaoResponsavel: 'Secretaria de Mobilidade', publicoAlvo: 'Condutor / Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito' },
  { titulo: 'Recurso de Multa de Trânsito', categoria: 'Transporte e Trânsito', descricao: 'Apresentação de defesa prévia e recurso contra multas aplicadas pelo município.', orgaoResponsavel: 'Secretaria de Mobilidade', publicoAlvo: 'Condutor', prazoAtendimento: 'Conforme prazo legal', custo: 'Gratuito' },
  { titulo: 'Interdição de Vias (Eventos e Obras)', categoria: 'Transporte e Trânsito', descricao: 'Solicitação de autorização para interdição temporária de vias públicas.', orgaoResponsavel: 'Secretaria de Mobilidade', publicoAlvo: 'Cidadão / Empresa', prazoAtendimento: 'Até 10 dias úteis', custo: 'Gratuito' },

  // ── Meio Ambiente e Serviços Urbanos ──────────────────────────────────
  { titulo: 'Licenciamento Ambiental', categoria: 'Meio Ambiente', descricao: 'Licença ambiental para atividades e empreendimentos de impacto local.', orgaoResponsavel: 'Secretaria de Meio Ambiente', publicoAlvo: 'Empresa / Empreendedor', prazoAtendimento: 'Variável', custo: 'Conforme tabela' },
  { titulo: 'Poda e Corte de Árvore', categoria: 'Meio Ambiente', descricao: 'Solicitação de poda, corte ou remoção de árvores em área pública.', orgaoResponsavel: 'Secretaria de Meio Ambiente', publicoAlvo: 'Cidadão', prazoAtendimento: 'Até 30 dias', custo: 'Gratuito' },
  { titulo: 'Iluminação Pública (Reparo)', categoria: 'Meio Ambiente', descricao: 'Solicitação de reparo de pontos de iluminação pública apagados ou danificados.', orgaoResponsavel: 'Secretaria de Serviços Públicos', publicoAlvo: 'Cidadão', prazoAtendimento: 'Até 15 dias', custo: 'Gratuito' },
  { titulo: 'Coleta de Lixo e Limpeza Urbana', categoria: 'Meio Ambiente', descricao: 'Informações e solicitações sobre coleta de lixo, capina e limpeza de vias.', orgaoResponsavel: 'Secretaria de Serviços Públicos', publicoAlvo: 'Cidadão', prazoAtendimento: 'Conforme cronograma', custo: 'Gratuito' },

  // ── Cidadania e Transparência (links internos) ────────────────────────
  { titulo: 'Ouvidoria Municipal', categoria: 'Cidadania e Transparência', descricao: 'Registre reclamações, denúncias, sugestões e elogios e acompanhe pelo protocolo.', orgaoResponsavel: 'Ouvidoria', publicoAlvo: 'Cidadão', prazoAtendimento: '30 dias (Lei 13.460/2017)', custo: 'Gratuito', urlExterna: '/ouvidoria', destaque: true },
  { titulo: 'e-SIC — Acesso à Informação', categoria: 'Cidadania e Transparência', descricao: 'Solicite informações públicas ao município com base na Lei de Acesso à Informação.', orgaoResponsavel: 'Controladoria / e-SIC', publicoAlvo: 'Cidadão', prazoAtendimento: '20 dias (Lei 12.527/2011)', custo: 'Gratuito', urlExterna: '/esic', destaque: true },
  { titulo: 'Portal da Transparência', categoria: 'Cidadania e Transparência', descricao: 'Receitas, despesas, licitações, contratos, folha de pagamento e dados abertos.', orgaoResponsavel: 'Controladoria', publicoAlvo: 'Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito', urlExterna: '/transparencia' },
  { titulo: 'Diário Oficial Eletrônico', categoria: 'Cidadania e Transparência', descricao: 'Consulta e busca dos atos oficiais publicados pelo município.', orgaoResponsavel: 'Secretaria de Governo', publicoAlvo: 'Cidadão', prazoAtendimento: 'Imediato', custo: 'Gratuito', urlExterna: '/diario' },
];
