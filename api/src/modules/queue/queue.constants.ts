// Nomes de filas e jobs SEMPRE via constantes (sua convenção).
// Filas DEDICADAS por característica de latência/criticidade (ver ADR-0001):
// separar jobs urgentes (SLA/notificações) dos lentos (IA/transparência/expurgo)
// evita contenção e permite escalar workers de forma independente. Cada fila
// tem no máximo UM worker — não há múltiplos processadores na mesma fila.

// Prazos legais (SLA) de ESIC/Ouvidoria — urgente.
export const QUEUE_SLA = 'manifestacao-sla';
export const JOB_SLA_ALERTA = 'sla.alerta-prazo'; // dispara em ~80% do prazo
export const JOB_SLA_VENCIDO = 'sla.prazo-vencido'; // dispara no vencimento
export const JOB_SLA_SCAN = 'sla.scan-em-risco'; // varredura periódica (métrica/alerta)

// Notificações ao cidadão (multicanal) — urgente/leve.
export const QUEUE_NOTIFICACOES = 'notificacoes';
export const JOB_NOTIF_ENVIAR = 'notif.enviar'; // resolve destinatário e dispara nos canais opt-in
export const JOB_NOTIF_EMAIL = 'notif.email';
export const JOB_NOTIF_EMAIL_RAW = 'notif.email-raw'; // e-mail genérico (assunto/corpo/cc/bcc/anexos) — ex.: formulários
export const JOB_NOTIF_WHATSAPP = 'notif.whatsapp';
export const JOB_NOTIF_PUSH = 'notif.push';

// ETL da Transparência (dados abertos) — pesado, tolerante a espera.
export const QUEUE_TRANSPARENCIA = 'transparencia';
export const JOB_TRANSPARENCIA_SYNC = 'transparencia.sync';

// IA (triagem, OCR, RAG) — lento, tolerante a espera.
export const QUEUE_IA = 'ia';
export const JOB_IA_TRIAGEM = 'ia.triagem-manifestacao';
export const JOB_EXTRAI_TEXTO_DOCUMENTO = 'ia.extrai-texto-documento'; // FTS do conteúdo do arquivo
export const JOB_IA_REINDEX = 'ia.reindexar-corpus'; // (re)constrói ia_chunks (vetorial, Camada 4)

// Expurgo/anonimização por retenção (LGPD/DPIA) — manutenção, baixa prioridade.
export const QUEUE_EXPURGO = 'expurgo';
export const JOB_CHAMADOS_EXPURGO = 'expurgo.chamados';

// Integrações diversas (Diário Oficial, n8n/gov.br) — média prioridade.
export const QUEUE_INTEGRACOES = 'integracoes';
export const JOB_DIARIO_PUBLICAR = 'integracao.diario-publicar';
export const JOB_DIARIO_PDF = 'integracao.diario-pdf'; // gera o PDF da edição publicada
export const JOB_DIARIO_ALERTAS = 'integracao.diario-alertas'; // monitoramento por termo (fase 2b)

// Atendimento omnichannel (widget + WhatsApp + bot IA).
export const QUEUE_ATENDIMENTO = 'atendimento';
export const JOB_ATEND_PROCESSAR_MENSAGEM = 'atend.processar_mensagem';
export const JOB_ATEND_INATIVIDADE = 'atend.inatividade_check';

// Backups automáticos da plataforma (banco + storage) — manutenção, agendado.
export const QUEUE_BACKUP = 'backup';
export const JOB_BACKUP_TICK = 'backup.tick'; // tique de hora em hora; decide se está na hora de rodar
export const JOB_BACKUP_RUN = 'backup.run';   // executa o backup (agendado ou manual)

// Buscador unificado (ADR-0004) — indexação full-text cross-módulo.
export const QUEUE_BUSCA = 'busca';
export const JOB_BUSCA_SYNC_ITEM = 'busca.sync-item';           // indexa/remove um item específico
export const JOB_BUSCA_REINDEX_TENANT = 'busca.reindex-tenant'; // reindexa todas as fontes públicas do tenant
export const JOB_BUSCA_CLEANUP_ORPHANS = 'busca.cleanup-orphans'; // remove itens órfãos ou despublicados
