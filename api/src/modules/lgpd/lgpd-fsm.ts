/**
 * Máquinas de estado para Solicitações do Titular e Incidentes de Segurança.
 * Transições ilegais retornam { ok: false }; legais retornam { ok: true }.
 */

import { SolicitacaoStatus } from './lgpd.dto';
import { IncidenteStatus } from './lgpd.dto';

// ─── Solicitações do Titular (spec 3.2.4) ─────────────────────────────────

type SolTransicoes = Partial<Record<SolicitacaoStatus, SolicitacaoStatus[]>>;

const SOL_TRANSICOES: SolTransicoes = {
  [SolicitacaoStatus.ABERTA]: [
    SolicitacaoStatus.EM_ANDAMENTO,
    SolicitacaoStatus.ENCAMINHADA,
  ],
  [SolicitacaoStatus.EM_ANDAMENTO]: [
    SolicitacaoStatus.CONCLUIDA,
    SolicitacaoStatus.INDEFERIDA,
    SolicitacaoStatus.ENCAMINHADA,
  ],
  [SolicitacaoStatus.ENCAMINHADA]: [
    SolicitacaoStatus.EM_ANDAMENTO,
    SolicitacaoStatus.CONCLUIDA,
    SolicitacaoStatus.INDEFERIDA,
  ],
  // terminais — sem saída
  [SolicitacaoStatus.CONCLUIDA]: [],
  [SolicitacaoStatus.INDEFERIDA]: [],
};

export function solicitacaoTransicionar(
  statusAtual: string,
  statusNovo: string,
): { ok: true } | { ok: false; erro: string } {
  const destinos = SOL_TRANSICOES[statusAtual as SolicitacaoStatus];
  if (!destinos) {
    return { ok: false, erro: `Status atual "${statusAtual}" não reconhecido.` };
  }
  if (!destinos.includes(statusNovo as SolicitacaoStatus)) {
    return {
      ok: false,
      erro: `Transição inválida: "${statusAtual}" → "${statusNovo}".`,
    };
  }
  return { ok: true };
}

// ─── Incidentes de Segurança (spec 4.2) ───────────────────────────────────

type IncTransicoes = Partial<Record<IncidenteStatus, IncidenteStatus[]>>;

const INC_TRANSICOES: IncTransicoes = {
  [IncidenteStatus.REGISTRADO]: [IncidenteStatus.EM_AVALIACAO],
  [IncidenteStatus.EM_AVALIACAO]: [
    IncidenteStatus.EM_CONTENCAO,
    IncidenteStatus.COMUNICADO,
    IncidenteStatus.ENCERRADO,
  ],
  [IncidenteStatus.EM_CONTENCAO]: [
    IncidenteStatus.COMUNICADO,
    IncidenteStatus.ENCERRADO,
  ],
  [IncidenteStatus.COMUNICADO]: [IncidenteStatus.ENCERRADO],
  [IncidenteStatus.ENCERRADO]: [],
};

export function incidenteTransicionar(
  statusAtual: string,
  statusNovo: string,
): { ok: true } | { ok: false; erro: string } {
  const destinos = INC_TRANSICOES[statusAtual as IncidenteStatus];
  if (!destinos) {
    return { ok: false, erro: `Status atual "${statusAtual}" não reconhecido.` };
  }
  if (!destinos.includes(statusNovo as IncidenteStatus)) {
    return {
      ok: false,
      erro: `Transição inválida: "${statusAtual}" → "${statusNovo}".`,
    };
  }
  return { ok: true };
}

// ─── Cálculo do prazo de comunicação de incidentes (spec 4.3) ─────────────

/** Dados sensíveis que ativam o prazo de 2 dias (spec 4.3). */
const DADOS_SENSIVEIS = new Set([
  'cpf',
  'dado_saude',
  'dado_financeiro',
  'saude',
  'financeiro',
  'senha_hash',
  'govbr_sub',
]);

/**
 * Calcula o prazo de comunicação à ANPD.
 * - severidade alta/critica OU dado sensível → detectadoEm + 2 dias
 * - caso contrário → detectadoEm + 5 dias
 */
export function calcularPrazoComunicacao(
  detectadoEm: Date,
  severidade: string,
  dadosAfetados: string[],
): Date {
  const ehUrgente =
    severidade === 'alta' ||
    severidade === 'critica' ||
    dadosAfetados.some((d) => DADOS_SENSIVEIS.has(d));

  const dias = ehUrgente ? 2 : 5;
  const prazo = new Date(detectadoEm.getTime());
  prazo.setDate(prazo.getDate() + dias);
  return prazo;
}
