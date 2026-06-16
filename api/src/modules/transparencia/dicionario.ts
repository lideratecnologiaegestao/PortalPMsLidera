/**
 * Dicionário de dados + licença, exigidos pela política de dados abertos
 * (LC 131 / Lei de Acesso). Descreve cada campo dos conjuntos publicados.
 */
export const LICENCA = {
  nome: 'Creative Commons Attribution 4.0 (CC BY 4.0)',
  url: 'https://creativecommons.org/licenses/by/4.0/deed.pt_BR',
};

export const DICIONARIO = {
  licenca: LICENCA,
  formatos: ['JSON', 'CSV'],
  conjuntos: {
    despesas: {
      descricao: 'Despesas orçamentárias por empenho (LC 131).',
      chaveNatural: ['exercicio', 'empenho'],
      campos: {
        exercicio: 'Ano de exercício (inteiro).',
        empenho: 'Número do empenho.',
        orgao: 'Órgão/secretaria.',
        unidade: 'Unidade orçamentária.',
        funcao: 'Função de governo.',
        elemento: 'Elemento de despesa.',
        modalidade: 'Modalidade de aplicação/licitação.',
        credor_nome: 'Nome/razão social do credor.',
        credor_doc: 'CNPJ/CPF do credor.',
        fase: 'Fase: empenho | liquidacao | pagamento.',
        valor_empenhado: 'Valor empenhado (R$, 2 casas).',
        valor_liquidado: 'Valor liquidado (R$).',
        valor_pago: 'Valor pago (R$).',
        data_empenho: 'Data do empenho (AAAA-MM-DD).',
      },
    },
    receitas: {
      descricao: 'Receitas previstas e arrecadadas (LC 131).',
      chaveNatural: ['exercicio', 'codigo', 'data_lancamento'],
      campos: {
        exercicio: 'Ano de exercício.',
        codigo: 'Código da receita.',
        descricao: 'Descrição da receita.',
        categoria: 'Categoria: corrente | capital.',
        fonte: 'Fonte de recurso.',
        valor_previsto: 'Valor previsto (R$).',
        valor_arrecadado: 'Valor arrecadado (R$).',
        data_lancamento: 'Data do lançamento (AAAA-MM-DD).',
      },
    },
    folha: {
      descricao:
        'Folha de pagamento de servidores (STF ARE 652.777 + LC 131). ' +
        'Minimização LGPD: CPF não é publicado e a matrícula é mascarada.',
      chaveNatural: ['exercicio', 'mes', 'matricula'],
      campos: {
        exercicio: 'Ano de exercício.',
        mes: 'Mês de competência (1..12).',
        matriculaMascarada: 'Matrícula mascarada (apenas 4 últimos dígitos).',
        nomeServidor: 'Nome do servidor (suprimido se houver medida protetiva).',
        cargo: 'Cargo/função.',
        vinculo: 'Vínculo: efetivo | comissionado | etc.',
        orgao: 'Órgão de lotação.',
        remuneracaoBruta: 'Remuneração bruta (R$).',
        descontos: 'Descontos (R$).',
        remuneracaoLiquida: 'Remuneração líquida (R$).',
      },
    },
    diarias: {
      descricao: 'Diárias concedidas a agentes públicos (beneficiário, cargo e valor).',
      chaveNatural: ['exercicio', 'documento'],
      campos: {
        exercicio: 'Ano de exercício.',
        documento: 'Número do documento/empenho da diária.',
        beneficiario: 'Nome do beneficiário.',
        cargo: 'Cargo/função.',
        destino: 'Destino da viagem.',
        valorTotal: 'Valor total da diária (R$).',
        dataInicio: 'Data de início (AAAA-MM-DD).',
      },
    },
    obras: {
      descricao: 'Obras públicas com objeto, situação, responsável e valores.',
      chaveNatural: ['identificador'],
      campos: {
        exercicio: 'Ano de exercício.',
        identificador: 'Identificador da obra.',
        objeto: 'Objeto/descrição da obra.',
        situacao: 'Situação: planejada | em_andamento | concluida | paralisada.',
        contratada: 'Empresa contratada.',
        valorContratado: 'Valor contratado (R$).',
        valorExecutado: 'Valor executado (R$).',
        bairro: 'Bairro/localização.',
      },
    },
    'divida-ativa': {
      descricao: 'Inscritos em dívida ativa (documento mascarado — minimização LGPD).',
      chaveNatural: ['exercicio', 'inscricao'],
      campos: {
        exercicio: 'Ano de exercício.',
        inscricao: 'Número da inscrição em dívida ativa.',
        inscritoNome: 'Nome/razão social do inscrito.',
        inscritoDoc: 'CNPJ/CPF do inscrito (mascarado).',
        natureza: 'Natureza do débito (IPTU, ISS, etc.).',
        valor: 'Valor inscrito (R$).',
      },
    },
    terceirizados: {
      descricao: 'Empregados terceirizados a serviço do município.',
      chaveNatural: ['exercicio', 'registro'],
      campos: {
        exercicio: 'Ano de exercício.',
        registro: 'Registro/identificador.',
        nome: 'Nome do terceirizado.',
        empresa: 'Empresa prestadora.',
        cargo: 'Cargo/função.',
        vinculo: 'Vínculo: terceirizado | estagiario | etc.',
        remuneracao: 'Remuneração (R$).',
      },
    },
    convenios: {
      descricao: 'Convênios e transferências recebidas/realizadas.',
      chaveNatural: ['exercicio', 'numero'],
      campos: {
        exercicio: 'Ano de exercício.',
        numero: 'Número do convênio.',
        tipo: 'Tipo: recebido | concedido.',
        participe: 'Partícipe (concedente/convenente).',
        objeto: 'Objeto do convênio.',
        valor: 'Valor (R$).',
      },
    },
    licitacoes: {
      descricao: 'Processos licitatórios (Lei 14.133/2021 / Lei 8.666/1993).',
      chaveNatural: ['exercicio', 'numero'],
      campos: {
        exercicio: 'Ano de exercício.',
        numero: 'Número da licitação.',
        modalidade: 'Modalidade (Pregão, Concorrência, etc.).',
        objeto: 'Objeto da licitação.',
        valorEstimado: 'Valor estimado (R$).',
        situacao: 'Situação: aberta | homologada | revogada | deserta.',
        dataAbertura: 'Data de abertura (AAAA-MM-DD).',
      },
    },
    contratos: {
      descricao: 'Contratos administrativos (fornecedor mascarado — LGPD).',
      chaveNatural: ['exercicio', 'numero'],
      campos: {
        exercicio: 'Ano de exercício.',
        numero: 'Número do contrato.',
        fornecedorNome: 'Nome/razão social do fornecedor.',
        fornecedorDoc: 'CNPJ/CPF do fornecedor (mascarado).',
        objeto: 'Objeto do contrato.',
        valor: 'Valor do contrato (R$).',
      },
    },
    documentos: {
      descricao:
        'Documentos de planejamento e prestação de contas (PPA, LDO, LOA, RGF, ' +
        'RREO, balanço, editais, contratos, carta de serviços, etc.).',
      chaveNatural: ['categoria', 'exercicio', 'titulo'],
      campos: {
        categoria: 'Categoria do documento (ppa, ldo, loa, rgf, rreo, etc.).',
        exercicio: 'Ano de referência.',
        titulo: 'Título do documento.',
        urlExterna: 'URL pública para download.',
        publicadoEm: 'Data de publicação.',
      },
    },
  },
};
