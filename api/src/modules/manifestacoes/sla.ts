import { addDays, isWeekend } from 'date-fns';
import { Canal, Tipo } from './manifestacao.types';

/**
 * Prazos legais das manifestações.
 *   - ESIC / acesso à informação (LAI 12.527/2011, art. 11): 20 dias,
 *     prorrogável por +10 mediante justificativa.
 *   - Ouvidoria (Lei 13.460/2017 c/c Decreto 9.492/2018): 30 dias,
 *     prorrogável por +30.
 *   - Recurso ESIC (LAI art. 15-16): autoridade decide em 5 dias.
 *
 * `uteis` controla contagem em dias úteis vs. corridos. Em produção, isso vem
 * da configuração do tenant (algumas prefeituras adotam prazos mais curtos),
 * por isso os valores abaixo são apenas o piso legal padrão.
 */
export interface PrazoConfig {
  dias: number;
  prorrogacaoDias: number;
  uteis: boolean;
}

const PRAZO_ESIC: PrazoConfig = { dias: 20, prorrogacaoDias: 10, uteis: false };
const PRAZO_OUVIDORIA: PrazoConfig = { dias: 30, prorrogacaoDias: 30, uteis: false };
export const PRAZO_RECURSO_ESIC: PrazoConfig = { dias: 5, prorrogacaoDias: 0, uteis: false };

export function prazoPadrao(canal: Canal, _tipo: Tipo): PrazoConfig {
  return canal === 'esic' ? { ...PRAZO_ESIC } : { ...PRAZO_OUVIDORIA };
}

/** Adiciona N dias corridos ou úteis a uma data, pulando feriados informados. */
export function adicionarDias(
  inicio: Date,
  dias: number,
  uteis: boolean,
  feriados: Set<string> = new Set(),
): Date {
  if (!uteis) return addDays(inicio, dias);

  let data = inicio;
  let restantes = dias;
  while (restantes > 0) {
    data = addDays(data, 1);
    const ehFeriado = feriados.has(data.toISOString().slice(0, 10));
    if (!isWeekend(data) && !ehFeriado) restantes--;
  }
  return data;
}

/** Prazo final a partir do registro. */
export function calcularPrazo(
  inicio: Date,
  config: PrazoConfig,
  feriados?: Set<string>,
): Date {
  return adicionarDias(inicio, config.dias, config.uteis, feriados);
}

/**
 * Momento do alerta antecipado (~80% do prazo decorrido) para acionar o
 * responsável antes do vencimento. Nunca anterior a "agora".
 */
export function instanteAlerta(inicio: Date, prazo: Date): Date {
  const total = prazo.getTime() - inicio.getTime();
  const alerta = new Date(inicio.getTime() + total * 0.8);
  return alerta < new Date() ? new Date() : alerta;
}

/** Recalcula o prazo ao retomar de uma pausa (aguardando_cidadao). */
export function prazoAposPausa(prazoOriginal: Date, pausadoEm: Date, retomadoEm: Date): Date {
  const pausaMs = retomadoEm.getTime() - pausadoEm.getTime();
  return new Date(prazoOriginal.getTime() + pausaMs);
}
