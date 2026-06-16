import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { QUEUE_NOTIFICACOES, JOB_NOTIF_EMAIL_RAW } from '../queue/queue.constants';
import { NotificacoesService } from './notificacoes.service';
import { NotifPayload } from './notificacoes.types';
import { EmailService } from './email.service';
import { StorageService } from '../storage/storage.service';

/** Payload do e-mail genérico (ex.: notificação de envio de formulário). */
interface EmailRawPayload {
  tenantId: string;
  assunto: string;
  destinatarios: string[];
  cc?: string[];
  bcc?: string[];
  corpo: string;
  anexos?: { nome: string; storageKey: string }[];
}

/**
 * Worker da fila `notificacoes`. Roda fora do ciclo HTTP → abre o TenantContext
 * manualmente para o RLS funcionar. Retry/backoff configurados no enfileiramento.
 */
@Processor(QUEUE_NOTIFICACOES, { concurrency: 5 })
export class NotificacoesWorker extends WorkerHost {
  private readonly log = new Logger(NotificacoesWorker.name);

  constructor(
    private readonly svc: NotificacoesService,
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job<NotifPayload>): Promise<void> {
    const data = job.data;
    if (!data?.tenantId) return;
    // E-mail genérico (formulários etc.): destinatários/corpo/cc/bcc/anexos arbitrários.
    if (job.name === JOB_NOTIF_EMAIL_RAW) {
      await TenantContext.run({ tenantId: data.tenantId }, () =>
        this.enviarEmailRaw(data as unknown as EmailRawPayload),
      );
      return;
    }
    await TenantContext.run({ tenantId: data.tenantId }, () => this.svc.processar(data));
  }

  /** Envia um e-mail genérico, anexando os arquivos do storage (best-effort). */
  private async enviarEmailRaw(p: EmailRawPayload): Promise<void> {
    const destinatarios = (p.destinatarios ?? []).filter(Boolean);
    if (!destinatarios.length) return;
    const anexos: { filename: string; content: Buffer; contentType?: string }[] = [];
    for (const a of p.anexos ?? []) {
      try {
        const { buffer, mime } = await this.storage.get(a.storageKey);
        anexos.push({ filename: a.nome, content: buffer, contentType: mime });
      } catch (e) {
        this.log.warn(`anexo não pôde ser carregado (${a.storageKey}): ${(e as Error).message}`);
      }
    }
    await this.email.enviar(destinatarios, p.assunto, p.corpo, {
      cc: p.cc,
      bcc: p.bcc,
      anexos,
    });
  }

  /** Dead-letter: falhas que esgotaram as tentativas vão para a auditoria. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<NotifPayload>, error: Error): Promise<void> {
    const tenantId = job.data?.tenantId;
    if (!tenantId) return;
    await TenantContext.run({ tenantId }, () =>
      this.prisma.db.auditLog.create({
        data: {
          tenantId,
          acao: 'NOTIFICACAO_FALHOU',
          entidade: 'queue',
          entidadeId: job.id ?? null,
          dados: { erro: error.message, evento: job.data?.evento, protocolo: job.data?.protocolo },
        } as any,
      }),
    );
  }
}
