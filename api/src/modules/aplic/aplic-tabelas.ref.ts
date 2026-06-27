/**
 * Tabelas de domínio (FK) do APLIC necessárias para apresentar a carga de forma
 * legível ao cidadão. Fonte: tabela interna oficial do TCE-MT
 * `MODALIDADE_LICITACAO` (REGRAS/TABELAS INTERNAS) — domínio nacional/estável.
 * Mantemos uma cópia mínima (código → descrição) para NÃO depender de arquivos
 * externos em runtime. Atualizar se o TCE revisar a tabela.
 */

export const MODALIDADE_LICITACAO: Record<string, string> = {
  '00': 'Planejamento de PPP/Concessão Comum',
  '01': 'Convite para compras e serviços',
  '02': 'Convite para obras e serviços de engenharia',
  '03': 'Tomada de preço para compras e serviços',
  '04': 'Tomada de preço para obras e serviços de engenharia',
  '05': 'Concorrência para compras e serviços',
  '06': 'Concorrência para obras e serviços de engenharia',
  '07': 'Leilão eletrônico',
  '08': 'Dispensa de licitação',
  '09': 'Inexigibilidade de licitação',
  '10': 'Concurso',
  '12': 'Pregão presencial (bens e serviços comuns)',
  '13': 'Pregão eletrônico (bens e serviços comuns)',
  '14': 'Concorrência para vendas',
  '15': 'Credenciamento',
  '17': 'Adesão a registro de preços (não participante)',
  '19': 'Dispensa para desincorporação de bens',
  '20': 'Dispensa de licitação para vendas/concessão',
  '21': 'Pregão para vendas',
  '22': 'Participação (carona) em leilão de outros órgãos',
  '23': 'Adesão à ata de registro de preço (carona) — pregão eletrônico',
  '24': 'RDC — Regime Diferenciado de Contratação',
  '25': 'Adesão à ata de registro de preço (carona) — concorrência',
  '26': 'Pregão presencial para obras e serviços de engenharia',
  '27': 'Pregão eletrônico para obras e serviços de engenharia',
  '28': 'Chamamento público (parceria com OSC — Lei 13.019/2014)',
  '29': 'Concurso de projetos para parceria com OSCIP',
  '30': 'Manifestação de interesse',
  '31': 'Concorrência para PPP (concessão patrocinada ou administrativa)',
  '32': 'Dispensa de licitação para obras e serviços de engenharia',
  '33': 'Licitação internacional para serviços e bens (BID/BIRD)',
  '34': 'Licitação internacional para obras (BID/BIRD)',
  '35': 'Licitação nacional para serviços e bens (BID/BIRD)',
  '36': 'Licitação nacional para obras (BID/BIRD)',
  '37': 'Comparação de preços para serviços e bens (BID/BIRD)',
  '38': 'Comparação de preços para obras (BID/BIRD)',
  '39': 'Contratação direta (BID/BIRD)',
  '40': 'Seleção e contratação de consultoria (BID/BIRD)',
  '41': 'Dispensa de chamamento público (parceria com OSC)',
  '42': 'Inexigibilidade de chamamento público (parceria com OSC)',
  '43': 'Dispensa de licitação — enfrentamento da COVID-19',
  '44': 'Inexigibilidade — enfrentamento da COVID-19',
  '45': 'Pregão eletrônico — enfrentamento da COVID-19',
  '46': 'Pregão presencial — enfrentamento da COVID-19',
  '47': 'Chamamento público — enfrentamento da COVID-19',
  '48': 'Adesão à ata de registro de preço (carona) — RDC',
  '49': 'Concorrência para concessão comum',
  '50': 'Diálogo competitivo para concessão comum',
  '51': 'Diálogo competitivo (PPP — Lei 11.079/2004)',
  '52': 'Diálogo competitivo (concessão de serviço público — Lei 8.987/1995)',
  '53': 'Pregão presencial (serviços comuns de engenharia)',
  '54': 'Pregão eletrônico (serviços comuns de engenharia)',
  '55': 'Concorrência presencial (obra)',
  '56': 'Concorrência presencial (serviços de engenharia)',
  '57': 'Concorrência presencial (concessão de serviço público)',
  '58': 'Concorrência presencial (PPP)',
  '59': 'Concorrência eletrônica (bens e serviços especiais)',
  '60': 'Concorrência eletrônica (obra)',
  '61': 'Concorrência eletrônica (serviços de engenharia)',
  '62': 'Concorrência eletrônica (concessão de serviço público)',
  '63': 'Concorrência eletrônica (PPP)',
  '64': 'Concorrência presencial (bens e serviços especiais)',
  '65': 'Leilão presencial',
  '66': 'Licitação pública (Lei 13.303/2016, art. 28)',
  '67': 'Pré-qualificação permanente (Lei 13.303/2016)',
  '68': 'Cadastramento (Lei 13.303/2016)',
  '69': 'Sistema de registro de preços (Lei 13.303/2016)',
  '70': 'Catálogo eletrônico de padronização (Lei 13.303/2016)',
  '71': 'Dispensa de licitação (eletrônica)',
  '72': 'Inexigibilidade (eletrônica)',
};

/** Descrição da modalidade de licitação por código (ou rótulo genérico). */
export function modalidadeLicitacao(codigo?: string | null): string | null {
  if (!codigo) return null;
  const c = String(codigo).trim().padStart(2, '0');
  return MODALIDADE_LICITACAO[c] ?? `Modalidade ${codigo}`;
}
