import { Canal, Evento, Status } from './manifestacao.types';

/**
 * Máquina de estados unificada para ESIC (LAI) e Ouvidoria (Lei 13.460).
 *
 * A tabela mapeia: estado atual -> evento -> próximo estado.
 * `guard` opcional restringe a transição a um canal (recursos só existem no ESIC).
 *
 * Regra de ouro: estados são alterados SOMENTE via `aplicar()`. Toda transição
 * gera uma linha imutável em manifestacao_eventos (feito no service).
 */

interface Transition {
  para: Status;
  guard?: (canal: Canal) => boolean;
  /** efeitos colaterais sinalizados ao service (não executados aqui). */
  efeito?: 'pausa_sla' | 'retoma_sla' | 'estende_sla' | 'encerra_sla';
}

const soEsic = (c: Canal) => c === 'esic';

export const TRANSICOES: Partial<Record<Status, Partial<Record<Evento, Transition>>>> = {
  registrada: {
    iniciar_analise: { para: 'em_analise' },
    arquivar: { para: 'arquivada', efeito: 'encerra_sla' },
  },
  em_analise: {
    encaminhar_area: { para: 'em_tratamento' },
    solicitar_complemento: { para: 'aguardando_cidadao', efeito: 'pausa_sla' },
    responder: { para: 'respondida', efeito: 'encerra_sla' },
    indeferir: { para: 'indeferida', guard: soEsic, efeito: 'encerra_sla' },
  },
  em_tratamento: {
    solicitar_complemento: { para: 'aguardando_cidadao', efeito: 'pausa_sla' },
    prorrogar: { para: 'prorrogada', efeito: 'estende_sla' },
    responder: { para: 'respondida', efeito: 'encerra_sla' },
    indeferir: { para: 'indeferida', guard: soEsic, efeito: 'encerra_sla' },
    atender_parcial: { para: 'parcialmente_atendida', guard: soEsic, efeito: 'encerra_sla' },
  },
  aguardando_cidadao: {
    // ao retomar, o SLA volta a contar a partir do tempo restante (service calcula)
    retomar: { para: 'em_tratamento', efeito: 'retoma_sla' },
    arquivar: { para: 'arquivada', efeito: 'encerra_sla' },
  },
  prorrogada: {
    responder: { para: 'respondida', efeito: 'encerra_sla' },
    indeferir: { para: 'indeferida', guard: soEsic, efeito: 'encerra_sla' },
    atender_parcial: { para: 'parcialmente_atendida', guard: soEsic, efeito: 'encerra_sla' },
  },
  // Recursos: exclusivos do ESIC (LAI prevê instâncias recursais).
  respondida: {
    abrir_recurso_1a: { para: 'recurso_1a_instancia', guard: soEsic, efeito: 'estende_sla' },
    concluir: { para: 'concluida' },
  },
  indeferida: {
    abrir_recurso_1a: { para: 'recurso_1a_instancia', guard: soEsic, efeito: 'estende_sla' },
    concluir: { para: 'concluida' },
  },
  parcialmente_atendida: {
    abrir_recurso_1a: { para: 'recurso_1a_instancia', guard: soEsic, efeito: 'estende_sla' },
    concluir: { para: 'concluida' },
  },
  recurso_1a_instancia: {
    responder: { para: 'respondida', efeito: 'encerra_sla' },
    abrir_recurso_2a: { para: 'recurso_2a_instancia', guard: soEsic, efeito: 'estende_sla' },
  },
  recurso_2a_instancia: {
    responder: { para: 'respondida', efeito: 'encerra_sla' },
  },
};

export interface ResultadoTransicao {
  ok: boolean;
  para?: Status;
  efeito?: Transition['efeito'];
  erro?: string;
}

/** Calcula a transição (puro, sem efeitos colaterais). */
export function transicionar(de: Status, evento: Evento, canal: Canal): ResultadoTransicao {
  const t = TRANSICOES[de]?.[evento];
  if (!t) {
    return { ok: false, erro: `Transição inválida: ${de} --(${evento})--> ?` };
  }
  if (t.guard && !t.guard(canal)) {
    return { ok: false, erro: `Evento "${evento}" não permitido para o canal "${canal}".` };
  }
  return { ok: true, para: t.para, efeito: t.efeito };
}

/** Lista eventos válidos a partir de um estado (útil para a UI). */
export function eventosValidos(de: Status, canal: Canal): Evento[] {
  const mapa = TRANSICOES[de] ?? {};
  return (Object.keys(mapa) as Evento[]).filter((ev) => {
    const g = mapa[ev]?.guard;
    return !g || g(canal);
  });
}
