/** Quem deve ser notificado por um evento de tramitação. */
export type DestinoNotif =
  | 'ouvidores'   // todos os ouvidores do tenant (fallback: admin_prefeitura)
  | 'responsavel' // o responsável atribuído à manifestação
  | 'cidadao'     // o autor (usuário logado ou e-mail informado)
  | { userId: string };

export type EventoNotif =
  | 'nova_manifestacao'
  | 'atribuicao'
  | 'cidadao_respondeu'
  | 'resposta_publicada'
  | 'sla_proximo'
  | 'sla_vencido';

export interface NotifPayload {
  tenantId: string;
  manifestacaoId: string;
  protocolo: string;
  evento: EventoNotif;
  destino: DestinoNotif;
}

/** Destinatário resolvido (canais + preferências). */
export interface Alvo {
  userId?: string;
  email?: string;
  whatsapp?: string; // só preenchido se verificado e opt-in
  notifEmail: boolean;
}
