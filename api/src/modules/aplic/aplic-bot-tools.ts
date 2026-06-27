import { AplicConsultaService } from './aplic-consulta.service';

/** Forma de uma ferramenta para a API Anthropic (tool use). */
export interface FerramentaIA {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Ferramentas fiscais que o assistente pode acionar para responder com PRECISÃO
 * sobre a execução da despesa (dados APLIC). Os números vêm SEMPRE daqui
 * (consulta determinística), nunca do texto/embeddings.
 */
export const FERRAMENTAS_FISCAIS: FerramentaIA[] = [
  {
    name: 'fiscal_resumo',
    description:
      'Totais oficiais de execução da despesa da entidade: valor empenhado, liquidado e pago, e contagens. Use para perguntas gerais como "quanto a prefeitura gastou/empenhou/pagou".',
    input_schema: {
      type: 'object',
      properties: { exercicio: { type: 'integer', description: 'Ano (ex.: 2026). Omitir = todos.' } },
    },
  },
  {
    name: 'fiscal_maiores_credores',
    description:
      'Ranking dos maiores credores/fornecedores por valor empenhado ou liquidado. Use para "quem mais recebeu", "maiores fornecedores".',
    input_schema: {
      type: 'object',
      properties: {
        exercicio: { type: 'integer' },
        por: { type: 'string', enum: ['empenhado', 'liquidado'], description: 'Critério do ranking (padrão empenhado).' },
        limite: { type: 'integer', description: 'Quantos (padrão 10, máx 50).' },
      },
    },
  },
  {
    name: 'fiscal_credor',
    description:
      'Valores empenhado/liquidado/pago de um credor específico, buscado por NOME ou CPF/CNPJ. Use para "quanto foi pago/empenhado para <fornecedor>".',
    input_schema: {
      type: 'object',
      properties: {
        nome: { type: 'string', description: 'Nome do credor ou CPF/CNPJ.' },
        exercicio: { type: 'integer' },
      },
      required: ['nome'],
    },
  },
  {
    name: 'fiscal_situacao_empenho',
    description:
      'Situação de um empenho (empenhado, liquidado, pago e saldos), pelo número no formato "NNNNNN/AAAA". Use para "como está o empenho X".',
    input_schema: {
      type: 'object',
      properties: {
        numero: { type: 'string', description: 'Número do empenho, ex.: "000001/2026".' },
        exercicio: { type: 'integer' },
      },
      required: ['numero'],
    },
  },
  {
    name: 'fiscal_saldo_por_fonte',
    description:
      'Saldo disponível por FONTE DE RECURSO (Disponibilidade por Destinação de Recursos, contabilidade). Use para "saldo por fonte", "quanto sobrou em cada fonte/recurso", "disponibilidade por fonte".',
    input_schema: {
      type: 'object',
      properties: { dataAte: { type: 'string', description: 'Saldo até esta data (AAAA-MM-DD). Omitir = até hoje na carga.' } },
    },
  },
  {
    name: 'fiscal_saldo_caixa',
    description:
      'Saldo de CAIXA E EQUIVALENTES DE CAIXA (banco/aplicações), por fonte de recurso. Use para "quanto há em caixa", "saldo bancário", "caixa por fonte".',
    input_schema: {
      type: 'object',
      properties: {
        dataAte: { type: 'string', description: 'Saldo até esta data (AAAA-MM-DD).' },
        fonte: { type: 'string', description: 'Código da fonte/destinação (DRESP), opcional.' },
      },
    },
  },
  {
    name: 'fiscal_arrecadado_periodo',
    description:
      'Quanto foi ARRECADADO (receita realizada) entre duas datas, total e por fonte. Use para "quanto arrecadou de tal data a tal data", "receita arrecadada no período".',
    input_schema: {
      type: 'object',
      properties: {
        dataInicio: { type: 'string', description: 'Data inicial (AAAA-MM-DD).' },
        dataFim: { type: 'string', description: 'Data final (AAAA-MM-DD).' },
        fonte: { type: 'string', description: 'Código da fonte/destinação (DRESP), opcional.' },
      },
      required: ['dataInicio', 'dataFim'],
    },
  },
];

/** Executa uma ferramenta fiscal no contexto de tenant atual (RLS). */
export async function executarFerramentaFiscal(
  consulta: AplicConsultaService,
  nome: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const exercicio = input?.exercicio != null ? Number(input.exercicio) : undefined;
  switch (nome) {
    case 'fiscal_resumo':
      return consulta.resumo(exercicio);
    case 'fiscal_maiores_credores':
      return consulta.maioresCredores({
        exercicio,
        por: input?.por === 'liquidado' ? 'liquidado' : 'empenhado',
        limite: input?.limite != null ? Number(input.limite) : undefined,
      });
    case 'fiscal_credor':
      return consulta.porCredor(String(input?.nome ?? ''), exercicio);
    case 'fiscal_situacao_empenho':
      return consulta.situacaoEmpenho(String(input?.numero ?? ''), exercicio);
    case 'fiscal_saldo_por_fonte':
      return consulta.saldoPorFonte(input?.dataAte ? String(input.dataAte) : undefined);
    case 'fiscal_saldo_caixa':
      return consulta.saldoCaixaEquivalentes(
        input?.dataAte ? String(input.dataAte) : undefined,
        input?.fonte ? String(input.fonte) : undefined,
      );
    case 'fiscal_arrecadado_periodo':
      return consulta.arrecadadoPeriodo(
        String(input?.dataInicio ?? ''), String(input?.dataFim ?? ''),
        input?.fonte ? String(input.fonte) : undefined,
      );
    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
