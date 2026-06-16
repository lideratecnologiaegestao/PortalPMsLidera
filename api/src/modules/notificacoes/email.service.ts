import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { decifrar } from '../../common/crypto/secret-box.util';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';

/** Lançado quando o município não tem SMTP configurado/ativo. */
export class EmailNaoConfigurado extends Error {
  constructor() {
    super('EMAIL_NAO_CONFIGURADO');
  }
}

interface ConfigSmtp {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

/**
 * Envio de e-mail (SMTP) POR TENANT. Cada prefeitura tem domínio e caixa
 * próprios — a configuração vem de `tenant_email_config` (RLS), não de env
 * global. Resolve a config do tenant atual (TenantContext), cacheia o
 * transporter por assinatura da config e envia. Se não houver config ativa,
 * lança EmailNaoConfigurado (o chamador registra como "ignorado").
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly cache = new Map<string, { sig: string; tx: nodemailer.Transporter; from: string }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly platform: PlatformSettingsService,
  ) {}

  /**
   * Config SMTP efetiva: a do TENANT (RLS); se ausente/inativa, cai para o SMTP
   * GLOBAL da plataforma (fallback). Null se nenhum dos dois estiver configurado.
   */
  private async config(): Promise<ConfigSmtp | null> {
    const row = await this.prisma.db.tenantEmailConfig.findFirst();
    if (row && row.ativo && row.smtpHost) {
      return {
        host: row.smtpHost,
        port: row.smtpPort ?? 587,
        secure: row.smtpSecure,
        user: row.smtpUser ?? undefined,
        pass: row.smtpPass ? decifrar(row.smtpPass) : undefined,
        from: row.smtpFrom || row.smtpUser || 'nao-responda@localhost',
      };
    }
    // Fallback: SMTP global da plataforma (Lidera)
    const g = await this.platform.smtpGlobal();
    if (g.ativo && g.host) {
      return {
        host: g.host,
        port: g.port ?? 587,
        secure: g.secure,
        user: g.user,
        pass: g.pass,
        from: g.from || g.user || 'nao-responda@localhost',
      };
    }
    return null;
  }

  /** Há SMTP configurado e ativo para o tenant atual? */
  async configurado(): Promise<boolean> {
    return (await this.config()) !== null;
  }

  async enviar(
    para: string | string[],
    assunto: string,
    texto: string,
    opts?: {
      cc?: string[];
      bcc?: string[];
      anexos?: { filename: string; content: Buffer; contentType?: string }[];
    },
  ): Promise<{ id?: string }> {
    const cfg = await this.config();
    if (!cfg) throw new EmailNaoConfigurado();

    const tenantId = TenantContext.tenantId() ?? 'sem-tenant';
    const sig = `${cfg.host}:${cfg.port}:${cfg.secure}:${cfg.user}`;
    let entry = this.cache.get(tenantId);
    if (!entry || entry.sig !== sig) {
      const tx = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
      });
      entry = { sig, tx, from: cfg.from };
      this.cache.set(tenantId, entry);
    }

    const info = await entry.tx.sendMail({
      from: cfg.from,
      to: para,
      cc: opts?.cc?.length ? opts.cc : undefined,
      bcc: opts?.bcc?.length ? opts.bcc : undefined,
      subject: assunto,
      text: texto,
      attachments: opts?.anexos?.length
        ? opts.anexos.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType }))
        : undefined,
    });
    return { id: info.messageId };
  }

  /** Limpa o transporter cacheado de um tenant (após alterar a config). */
  invalidar(tenantId: string): void {
    this.cache.delete(tenantId);
  }
}
