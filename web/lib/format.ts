/** Formatação pt-BR para os relatórios de transparência. */
export const brl = (v: string | number | null | undefined) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(v ?? 0),
  );

export const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR') : '—';

export const dataCurta = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
