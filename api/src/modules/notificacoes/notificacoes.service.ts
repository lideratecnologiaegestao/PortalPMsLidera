import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { JOB_NOTIF_ENVIAR, QUEUE_NOTIFICACOES } from '../queue/queue.constants';
import { EmailNaoConfigurado, EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';
import { PushService } from './push.service';
import { Alvo, DestinoNotif, EventoNotif, NotifPayload } from './notificacoes.types';

const ACAO: Record<EventoNotif, string> = {
  nova_manifestacao: 'Nova manifestação registrada',
  atribuicao: 'Uma manifestação foi encaminhada a você',
  cidadao_respondeu: 'O cidadão enviou uma nova mensagem',
  resposta_publicada: 'Sua manifestação recebeu uma resposta',
  sla_proximo: 'Prazo legal se aproximando',
  sla_vencido: 'Prazo legal vencido',
};

function mascararEmail(e: string): string {
  const [u, d] = e.split('@');
  if (!d) return '***';
  return `${u.slice(0, 1)}***@${d}`;
}
function mascararFone(f: string): string {
  const d = f.replace(/\D/g, '');
  return `••••${d.slice(-4)}`;
}

/**
 * Notificações multicanal (WhatsApp + e-mail) ao "quem deve agir" a cada
 * tramitação. Conteúdo LGPD-safe: só protocolo + ação + link de login — nunca o
 * teor nem dados pessoais. Envio assíncrono pela fila (retry/backoff); registra
 * cada tentativa em notificacao_log; faz fallback para e-mail se o WhatsApp
 * falhar; respeita opt-in e a verificação dos contatos.
 */
@Injectable()
export class NotificacoesService {
  private readonly log = new Logger(NotificacoesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly push: PushService,
    @InjectQueue(QUEUE_NOTIFICACOES) private readonly fila: Queue,
  ) {}

  /** Enfileira (chamado pelos services de manifestação/tramitação). */
  async enfileirar(p: NotifPayload): Promise<void> {
    await this.fila.add(JOB_NOTIF_ENVIAR, p, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  }

  /** Processa um job (executado pelo worker dentro do TenantContext). */
  async processar(p: NotifPayload): Promise<void> {
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id: p.manifestacaoId },
      select: { cidadaoId: true, solicitanteEmail: true, responsavelId: true, anonima: true },
    });
    if (!m) return;

    const tenant = await this.prisma
      .platform()
      .tenant.findUnique({
        where: { id: p.tenantId },
        select: { dominio: true, subdominio: true, slug: true, nome: true },
      });
    const host = tenant?.dominio || `${tenant?.subdominio ?? tenant?.slug}.lidera.app.br`;
    const nome = tenant?.nome ?? 'Prefeitura';

    const ehCidadao = p.destino === 'cidadao';
    const link = ehCidadao
      ? `https://${host}/acompanhar?protocolo=${p.protocolo}`
      : `https://${host}/admin/ouvidor`;
    const texto = `${nome}: ${ACAO[p.evento]} (protocolo ${p.protocolo}). Acesse e responda: ${link}`;

    const alvos = await this.resolverAlvos(p.destino, m);
    for (const alvo of alvos) {
      if (alvo.userId) await this.registrarInApp(alvo.userId, p);
      await this.entregar(p, alvo, texto);
    }
  }

  /** Inbox in-app (central de avisos do app/portal) — LGPD-safe: só protocolo. */
  private async registrarInApp(userId: string, p: NotifPayload): Promise<void> {
    await this.prisma.db.notificacaoUsuario.create({
      data: {
        tenantId: p.tenantId,
        userId,
        evento: p.evento,
        titulo: ACAO[p.evento],
        corpo: `Protocolo ${p.protocolo}`,
        protocolo: p.protocolo,
        manifestacaoId: p.manifestacaoId,
      },
    });
  }

  // --------------------------------------------------------- resolução
  private async resolverAlvos(
    destino: DestinoNotif,
    m: { cidadaoId: string | null; solicitanteEmail: string | null; responsavelId: string | null },
  ): Promise<Alvo[]> {
    if (destino === 'cidadao') {
      if (m.cidadaoId) return this.alvosDeUsuarios([m.cidadaoId]);
      if (m.solicitanteEmail)
        return [{ email: m.solicitanteEmail, notifEmail: true }];
      return [];
    }
    if (destino === 'responsavel') {
      return m.responsavelId ? this.alvosDeUsuarios([m.responsavelId]) : [];
    }
    if (destino === 'ouvidores') {
      let users = await this.prisma.db.user.findMany({ where: { role: 'ouvidor' as any }, select: { id: true } });
      if (users.length === 0) {
        users = await this.prisma.db.user.findMany({ where: { role: 'admin_prefeitura' as any }, select: { id: true } });
      }
      return this.alvosDeUsuarios(users.map((u) => u.id));
    }
    return this.alvosDeUsuarios([destino.userId]);
  }

  private async alvosDeUsuarios(ids: string[]): Promise<Alvo[]> {
    const alvos: Alvo[] = [];
    for (const userId of ids) {
      const [user, c] = await Promise.all([
        this.prisma.db.user.findUnique({ where: { id: userId }, select: { email: true } }),
        this.prisma.db.userContato.findFirst({ where: { userId } }),
      ]);
      // e-mail: usa o contato verificado; senão cai no e-mail de login (interno)
      const emailVerificado = c?.emailVerificado && c.email ? c.email : undefined;
      const email = emailVerificado ?? user?.email ?? undefined;
      const notifEmail = c?.notifEmail ?? true;
      // whatsapp: só se verificado E opt-in
      const whatsapp = c?.whatsappVerificado && c.notifWhatsapp && c.whatsapp ? c.whatsapp : undefined;
      if (email || whatsapp) alvos.push({ userId, email, whatsapp, notifEmail });
    }
    return alvos;
  }

  // ----------------------------------------------------------- entrega
  private async entregar(p: NotifPayload, alvo: Alvo, texto: string): Promise<void> {
    const assunto = `Atualização do protocolo ${p.protocolo}`;
    let whatsappOk = false;

    // 1) WhatsApp (canal preferencial, se disponível)
    if (alvo.whatsapp) {
      try {
        const r = await this.whatsapp.enviar(alvo.whatsapp, texto);
        whatsappOk = true;
        await this.registrar(p, 'whatsapp', mascararFone(alvo.whatsapp), 'enviado', r.id);
      } catch (e) {
        await this.registrar(p, 'whatsapp', mascararFone(alvo.whatsapp), 'falha', undefined, (e as Error).message);
      }
    }

    // 2) E-mail (sempre, exceto opt-out; e como fallback se o WhatsApp falhou)
    if (alvo.email && alvo.notifEmail) {
      try {
        const r = await this.email.enviar(alvo.email, assunto, texto);
        await this.registrar(p, 'email', mascararEmail(alvo.email), 'enviado', r.id);
      } catch (e) {
        const semConfig =
          e instanceof EmailNaoConfigurado || (e as Error).message === 'EMAIL_NAO_CONFIGURADO';
        await this.registrar(
          p,
          'email',
          mascararEmail(alvo.email),
          semConfig ? 'ignorado' : 'falha',
          undefined,
          semConfig ? 'SMTP não configurado para o município' : (e as Error).message,
        );
      }
    }

    // 3) Push (App do Cidadão) — entrega quando houver tokens registrados
    if (alvo.userId) {
      try {
        const tokens = await this.push.tokensDoUsuario(alvo.userId);
        if (tokens.length) {
          const n = await this.push.enviar(tokens, ACAO[p.evento], `Protocolo ${p.protocolo}`, {
            protocolo: p.protocolo,
            manifestacaoId: p.manifestacaoId,
          });
          if (n > 0) await this.registrar(p, 'push', alvo.userId, 'enviado');
        }
      } catch (e) {
        await this.registrar(p, 'push', alvo.userId, 'falha', undefined, (e as Error).message);
      }
    }

    if (!whatsappOk && !alvo.email) {
      this.log.warn(`Sem canal disponível para destinatário (protocolo ${p.protocolo}).`);
    }
  }

  private async registrar(
    p: NotifPayload,
    canal: string,
    destinatario: string,
    status: string,
    provedorId?: string,
    erro?: string,
  ): Promise<void> {
    await this.prisma.db.notificacaoLog.create({
      data: {
        tenantId: p.tenantId,
        manifestacaoId: p.manifestacaoId,
        evento: p.evento,
        canal,
        destinatario,
        status,
        provedorId: provedorId ?? null,
        erro: erro ?? null,
      },
    });
  }
}
