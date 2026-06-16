/** Rótulo legível de um tipo de matéria do Diário (espelha DIARIO_TIPOS). */
const LABELS: Record<string, string> = {
  lei: 'Lei',
  decreto: 'Decreto',
  portaria: 'Portaria',
  resolucao: 'Resolução',
  edital: 'Edital',
  licitacao: 'Licitação',
  extrato_contrato: 'Extrato de Contrato/Convênio',
  ato_pessoal: 'Ato de Pessoal',
  aviso: 'Aviso/Comunicado',
  outro: 'Outro',
};

export function rotuloTipo(slug: string): string {
  return LABELS[slug] ?? slug;
}
