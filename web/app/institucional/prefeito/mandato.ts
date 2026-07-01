/**
 * Período do mandato em texto ("2021 – 2024", "2017", "2021 – atual").
 * Módulo puro (sem 'use client') para poder ser chamado tanto no Server
 * Component da página quanto no Client Component do mural.
 */
export function mandatoTexto(p: { mandatoInicio: number | null; mandatoFim: number | null; atual: boolean }): string | null {
  if (p.mandatoInicio == null && p.mandatoFim == null) return null;
  if (p.mandatoInicio != null && p.mandatoFim != null) return `${p.mandatoInicio} – ${p.mandatoFim}`;
  if (p.mandatoInicio != null) return p.atual ? `${p.mandatoInicio} – atual` : `${p.mandatoInicio}`;
  return `${p.mandatoFim}`;
}

/** Rótulo do cargo conforme tipo + gênero. */
export function cargoLabel(p: { tipo: string; genero: string }): string {
  const fem = p.genero === 'feminino';
  if (p.tipo === 'vice') return fem ? 'Vice-Prefeita' : 'Vice-Prefeito';
  if (p.tipo === 'primeira_dama') return fem ? 'Primeira-dama' : 'Primeiro-cavalheiro';
  return fem ? 'Prefeita' : 'Prefeito';
}
