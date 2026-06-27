import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
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
/** Mascara chat_id do Telegram expondo apenas os últimos 4 caracteres. */
function mascararChatId(chatId: string): string {
  const digits = chatId.replace(/\D/g, '');
  const suffix = (digits || chatId).slice(-4);
  return `••••${suffix}`;
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

  /**
   * Avisa os ouvidores (WhatsApp + e-mail) quando uma conversa é escalada para
   * atendimento humano (status `aguardando_agente`). Best-effort: nunca lança.
   * LGPD-safe: a mensagem não contém dados pessoais do visitante.
   */
  async avisarOuvidoresAtendimento(
    tenantId: string,
    info: { conversaId: string; canal?: string | null },
  ): Promise<void> {
    try {
      // TODA a operação roda dentro do escopo de tenant: a resolução, o envio
      // (que lê config de e-mail do tenant) E o registro em notificacao_log
      // dependem de app.current_tenant_id (RLS). Fora do TenantContext.run, os
      // INSERT/SELECT em prisma.db falham silenciosamente por RLS.
      await TenantContext.run({ tenantId }, async () => {
        const tenant = await this.prisma.platform().tenant.findUnique({
          where: { id: tenantId },
          select: { dominio: true, subdominio: true, slug: true, nome: true },
        });

        // Resolve ouvidores: role 'ouvidor', fallback 'admin_prefeitura'
        let users = await this.prisma.db.user.findMany({
          where: { role: 'ouvidor' as any },
          select: { id: true },
        });
        if (users.length === 0) {
          users = await this.prisma.db.user.findMany({
            where: { role: 'admin_prefeitura' as any },
            select: { id: true },
          });
        }
        const alvos = await this.resolverAlvosParaAtendimento(users.map((u) => u.id));
        this.log.log(
          `[atendimento] escalada conversa ${info.conversaId}: ${users.length} ouvidor(es), ${alvos.length} com canal (whatsapp/e-mail/telegram)`,
        );
        if (!alvos.length) return;

        const host = tenant?.dominio || `${tenant?.subdominio ?? tenant?.slug}.lidera.app.br`;
        const nome = tenant?.nome ?? 'Prefeitura';
        const canalInfo = info.canal ? ` (canal: ${info.canal})` : '';
        const link = `https://${host}/admin/atendimento?conversa=${info.conversaId}`;
        const texto = `${nome}: há um novo atendimento aguardando na Ouvidoria${canalInfo}. Entre no console para responder: ${link} — ou responda ATENDER para atender por aqui.`;
        const assunto = `${nome}: novo atendimento aguardando resposta`;

        // Resolve canal Telegram do tenant uma vez para todo o loop (best-effort)
        const telegramCanalId = await this.telegramCanalIdDoTenant();

        for (const alvo of alvos) {
          // WhatsApp (canal preferencial)
          if (alvo.whatsapp) {
            try {
              const r = await this.whatsapp.enviar(alvo.whatsapp, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'enviado', r.id);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'falha', undefined, (e as Error).message);
            }
          }

          // E-mail (reforço/fallback; sempre se opt-in)
          if (alvo.email && alvo.notifEmail) {
            try {
              const r = await this.email.enviar(alvo.email, assunto, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'email', mascararEmail(alvo.email), 'enviado', r.id);
            } catch (e) {
              const semConfig =
                e instanceof EmailNaoConfigurado || (e as Error).message === 'EMAIL_NAO_CONFIGURADO';
              await this.registrarAtendimento(
                tenantId,
                info.conversaId,
                'email',
                mascararEmail(alvo.email),
                semConfig ? 'ignorado' : 'falha',
                undefined,
                semConfig ? 'SMTP não configurado para o município' : (e as Error).message,
              );
            }
          }

          // Telegram (best-effort; exige canal Telegram ativo no tenant e opt-in do usuário)
          if (alvo.telegram && telegramCanalId) {
            try {
              const r = await this.whatsapp.enviarPorCanal(telegramCanalId, alvo.telegram, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'enviado', r.id);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'falha', undefined, (e as Error).message);
            }
          }

          if (!alvo.whatsapp && !alvo.email && !alvo.telegram) {
            this.log.warn(`[atendimento] Sem canal disponível para ouvidor (conversa ${info.conversaId}).`);
          }
        }
      });
    } catch (e) {
      // Best-effort: nunca propaga erros para não bloquear a resposta HTTP
      this.log.error(`[avisarOuvidoresAtendimento] Falha ao notificar ouvidores: ${(e as Error).message}`);
    }
  }

  /**
   * Avisa os atendentes de uma secretaria quando uma conversa é TRANSFERIDA para ela.
   * Best-effort (nunca lança). LGPD-safe: sem dados pessoais do cidadão.
   * Roda TODA a operação dentro de TenantContext.run para que o RLS aplique
   * corretamente nos INSERT de notificacao_log.
   */
  async avisarAtendentesSecretaria(
    tenantId: string,
    secretariaId: string,
    info: { conversaId: string; canal?: string | null },
  ): Promise<void> {
    try {
      await TenantContext.run({ tenantId }, async () => {
        const tenant = await this.prisma.platform().tenant.findUnique({
          where: { id: tenantId },
          select: { dominio: true, subdominio: true, slug: true, nome: true },
        });

        // Resolve usuários da secretaria com roles de atendimento
        const rolesAtendimento: string[] = ['servidor', 'ouvidor', 'assistente_ouvidoria'];
        let users = await this.prisma.db.user.findMany({
          where: {
            secretariaId,
            role: { in: rolesAtendimento as any },
          },
          select: { id: true },
        });

        // Fallback: ouvidores do tenant (sem filtro de secretaria)
        if (users.length === 0) {
          users = await this.prisma.db.user.findMany({
            where: { role: 'ouvidor' as any },
            select: { id: true },
          });
        }
        if (users.length === 0) {
          users = await this.prisma.db.user.findMany({
            where: { role: 'admin_prefeitura' as any },
            select: { id: true },
          });
        }

        const alvos = await this.alvosDeUsuarios(users.map((u) => u.id));
        this.log.log(
          `[atendimento_transferido] conversa ${info.conversaId} → secretaria ${secretariaId}: ${users.length} usuário(s), ${alvos.length} com canal`,
        );
        if (!alvos.length) return;

        const host = tenant?.dominio || `${tenant?.subdominio ?? tenant?.slug}.lidera.app.br`;
        const nome = tenant?.nome ?? 'Prefeitura';
        const canalInfo = info.canal ? ` (canal: ${info.canal})` : '';
        const link = `https://${host}/admin/atendimento?conversa=${info.conversaId}`;
        const texto = `${nome}: um atendimento foi TRANSFERIDO para a sua secretaria${canalInfo}. Entre no console para responder: ${link}`;
        const assunto = `${nome}: atendimento transferido para sua secretaria`;
        const EV = 'atendimento_transferido';

        // Resolve canal Telegram do tenant uma vez para todo o loop (best-effort)
        const telegramCanalId = await this.telegramCanalIdDoTenant();

        for (const alvo of alvos) {
          if (alvo.whatsapp) {
            try {
              const r = await this.whatsapp.enviar(alvo.whatsapp, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'enviado', r.id, undefined, EV);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'falha', undefined, (e as Error).message, EV);
            }
          }
          if (alvo.email && alvo.notifEmail) {
            try {
              const r = await this.email.enviar(alvo.email, assunto, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'email', mascararEmail(alvo.email), 'enviado', r.id, undefined, EV);
            } catch (e) {
              const semConfig =
                e instanceof EmailNaoConfigurado || (e as Error).message === 'EMAIL_NAO_CONFIGURADO';
              await this.registrarAtendimento(
                tenantId,
                info.conversaId,
                'email',
                mascararEmail(alvo.email),
                semConfig ? 'ignorado' : 'falha',
                undefined,
                semConfig ? 'SMTP não configurado para o município' : (e as Error).message,
                EV,
              );
            }
          }
          // Telegram (best-effort; exige canal Telegram ativo no tenant e opt-in do usuário)
          if (alvo.telegram && telegramCanalId) {
            try {
              const r = await this.whatsapp.enviarPorCanal(telegramCanalId, alvo.telegram, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'enviado', r.id, undefined, EV);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'falha', undefined, (e as Error).message, EV);
            }
          }
        }
      });
    } catch (e) {
      this.log.error(`[avisarAtendentesSecretaria] Falha: ${(e as Error).message}`);
    }
  }

  /**
   * Avisa um agente específico quando uma conversa é ATRIBUÍDA a ele.
   * Best-effort (nunca lança). LGPD-safe: sem dados pessoais do cidadão.
   * Toda a operação dentro de TenantContext.run (RLS).
   */
  async avisarAgente(
    tenantId: string,
    agenteId: string,
    info: { conversaId: string; canal?: string | null },
  ): Promise<void> {
    try {
      await TenantContext.run({ tenantId }, async () => {
        const tenant = await this.prisma.platform().tenant.findUnique({
          where: { id: tenantId },
          select: { dominio: true, subdominio: true, slug: true, nome: true },
        });

        const alvos = await this.alvosDeUsuarios([agenteId]);
        this.log.log(
          `[atendimento_atribuido] conversa ${info.conversaId} → agente ${agenteId}: ${alvos.length} canal(is) disponível(is)`,
        );
        if (!alvos.length) return;

        const host = tenant?.dominio || `${tenant?.subdominio ?? tenant?.slug}.lidera.app.br`;
        const nome = tenant?.nome ?? 'Prefeitura';
        const canalInfo = info.canal ? ` (canal: ${info.canal})` : '';
        const link = `https://${host}/admin/atendimento?conversa=${info.conversaId}`;
        const texto = `${nome}: um atendimento foi ATRIBUÍDO a você${canalInfo}. Entre no console para responder: ${link}`;
        const assunto = `${nome}: atendimento atribuído a você`;
        const EV = 'atendimento_atribuido';

        // Resolve canal Telegram do tenant uma vez para todo o loop (best-effort)
        const telegramCanalId = await this.telegramCanalIdDoTenant();

        for (const alvo of alvos) {
          if (alvo.whatsapp) {
            try {
              const r = await this.whatsapp.enviar(alvo.whatsapp, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'enviado', r.id, undefined, EV);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'whatsapp', mascararFone(alvo.whatsapp), 'falha', undefined, (e as Error).message, EV);
            }
          }
          if (alvo.email && alvo.notifEmail) {
            try {
              const r = await this.email.enviar(alvo.email, assunto, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'email', mascararEmail(alvo.email), 'enviado', r.id, undefined, EV);
            } catch (e) {
              const semConfig =
                e instanceof EmailNaoConfigurado || (e as Error).message === 'EMAIL_NAO_CONFIGURADO';
              await this.registrarAtendimento(
                tenantId,
                info.conversaId,
                'email',
                mascararEmail(alvo.email),
                semConfig ? 'ignorado' : 'falha',
                undefined,
                semConfig ? 'SMTP não configurado para o município' : (e as Error).message,
                EV,
              );
            }
          }
          // Telegram (best-effort; exige canal Telegram ativo no tenant e opt-in do usuário)
          if (alvo.telegram && telegramCanalId) {
            try {
              const r = await this.whatsapp.enviarPorCanal(telegramCanalId, alvo.telegram, texto);
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'enviado', r.id, undefined, EV);
            } catch (e) {
              await this.registrarAtendimento(tenantId, info.conversaId, 'telegram', mascararChatId(alvo.telegram), 'falha', undefined, (e as Error).message, EV);
            }
          }
        }
      });
    } catch (e) {
      this.log.error(`[avisarAgente] Falha: ${(e as Error).message}`);
    }
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
      // telegram: só se verificado E opt-in E chat_id preenchido
      const telegram =
        c?.telegramVerificado && c?.notifTelegram && c?.telegramChatId
          ? c.telegramChatId
          : undefined;
      if (email || whatsapp || telegram) alvos.push({ userId, email, whatsapp, telegram, notifEmail });
    }
    return alvos;
  }

  /**
   * Resolve alvos para notificações de atendimento (sem dependência de manifestação).
   * Reutiliza a mesma lógica de `alvosDeUsuarios`, porém callable fora do contexto
   * de manifestação.
   */
  private async resolverAlvosParaAtendimento(ids: string[]): Promise<Alvo[]> {
    return this.alvosDeUsuarios(ids);
  }

  /**
   * Resolve o ID do canal Telegram ativo do tenant atual (RLS já aplicado pelo
   * TenantContext.run que envolve os callers). Retorna null se não houver canal
   * Telegram ativo — nesse caso os callers simplesmente pulam o envio Telegram.
   * Deve ser chamado DENTRO de um TenantContext.run ativo.
   */
  private async telegramCanalIdDoTenant(): Promise<string | null> {
    try {
      const canal = await this.prisma.db.tenantWhatsappCanal.findFirst({
        where: { tipo: 'telegram', ativo: true },
        select: { id: true },
      });
      return canal?.id ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Persiste tentativa de entrega de notificação de atendimento no log.
   * `manifestacaoId` é null pois esta notificação não está ligada a uma manifestação.
   */
  private async registrarAtendimento(
    tenantId: string,
    conversaId: string,
    canal: string,
    destinatario: string,
    status: string,
    provedorId?: string,
    erro?: string,
    evento: string = 'atendimento_escalado',
  ): Promise<void> {
    try {
      await this.prisma.db.notificacaoLog.create({
        data: {
          tenantId,
          manifestacaoId: null,
          evento,
          canal,
          destinatario,
          status,
          provedorId: provedorId ?? null,
          erro: erro ?? null,
        },
      });
    } catch (e) {
      // Log de auditoria não deve bloquear o fluxo
      this.log.error(`[registrarAtendimento] Falha ao gravar log (conversa ${conversaId}): ${(e as Error).message}`);
    }
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

    // 3) Telegram (best-effort; exige canal Telegram ativo no tenant e opt-in do usuário)
    if (alvo.telegram) {
      try {
        const telegramCanalId = await this.telegramCanalIdDoTenant();
        if (telegramCanalId) {
          const r = await this.whatsapp.enviarPorCanal(telegramCanalId, alvo.telegram, texto);
          await this.registrar(p, 'telegram', mascararChatId(alvo.telegram), 'enviado', r.id);
        }
      } catch (e) {
        await this.registrar(p, 'telegram', mascararChatId(alvo.telegram), 'falha', undefined, (e as Error).message);
      }
    }

    // 4) Push (App do Cidadão) — entrega quando houver tokens registrados
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

    if (!whatsappOk && !alvo.email && !alvo.telegram) {
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
