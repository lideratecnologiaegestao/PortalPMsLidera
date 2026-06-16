// Tipos do módulo de manifestações (ESIC + Ouvidoria).
// Os enums espelham os tipos SQL e o schema Prisma.

export type Canal = 'esic' | 'ouvidoria';

export type Tipo =
  | 'acesso_informacao'
  | 'denuncia'
  | 'reclamacao'
  | 'sugestao'
  | 'elogio'
  | 'solicitacao';

export type Status =
  | 'registrada'
  | 'em_analise'
  | 'em_tratamento'
  | 'aguardando_cidadao'
  | 'prorrogada'
  | 'respondida'
  | 'indeferida'
  | 'parcialmente_atendida'
  | 'recurso_1a_instancia'
  | 'recurso_2a_instancia'
  | 'concluida'
  | 'arquivada';

/** Eventos (transições) disparáveis na FSM. */
export type Evento =
  | 'iniciar_analise'
  | 'encaminhar_area'
  | 'solicitar_complemento'
  | 'retomar'
  | 'prorrogar'
  | 'responder'
  | 'indeferir'
  | 'atender_parcial'
  | 'abrir_recurso_1a'
  | 'abrir_recurso_2a'
  | 'concluir'
  | 'arquivar';

/** Payload do job de SLA enfileirado por manifestação. */
export interface SlaJobData {
  tenantId: string;
  manifestacaoId: string;
  protocolo: string;
  prazoEm: string; // ISO
}
