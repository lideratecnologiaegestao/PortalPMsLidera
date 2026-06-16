import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { cifrar } from '../../common/crypto/secret-box.util';
import { EmailService } from './email.service';

interface ConfigDto {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  imapHost?: string;
  imapPort?: number;
  ativo?: boolean;
}

/**
 * Configuração de e-mail (SMTP/IMAP) do tenant atual. A senha é cifrada em
 * repouso e NUNCA é devolvida (só o flag `senhaDefinida`). RBAC: admin da
 * prefeitura.
 */
@Injectable()
export class TenantEmailConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
  ) {}

  async obter() {
    const c = await this.prisma.db.tenantEmailConfig.findFirst();
    return {
      smtpHost: c?.smtpHost ?? '',
      smtpPort: c?.smtpPort ?? 465,
      smtpSecure: c?.smtpSecure ?? true,
      smtpUser: c?.smtpUser ?? '',
      smtpFrom: c?.smtpFrom ?? '',
      imapHost: c?.imapHost ?? '',
      imapPort: c?.imapPort ?? 993,
      ativo: c?.ativo ?? true,
      senhaDefinida: !!c?.smtpPass,
    };
  }

  async salvar(dto: ConfigDto) {
    const tenantId = TenantContext.tenantId()!;
    const atual = await this.prisma.db.tenantEmailConfig.findFirst();

    const data: Record<string, unknown> = {
      smtpHost: dto.smtpHost?.trim() || null,
      smtpPort: dto.smtpPort ? Number(dto.smtpPort) : null,
      smtpSecure: dto.smtpSecure ?? true,
      smtpUser: dto.smtpUser?.trim() || null,
      smtpFrom: dto.smtpFrom?.trim() || null,
      imapHost: dto.imapHost?.trim() || null,
      imapPort: dto.imapPort ? Number(dto.imapPort) : null,
      ativo: dto.ativo ?? true,
    };
    // só atualiza a senha se uma nova for informada (mantém a existente caso vazio)
    if (dto.smtpPass) data.smtpPass = cifrar(dto.smtpPass);

    if (atual) {
      await this.prisma.db.tenantEmailConfig.update({ where: { tenantId: atual.tenantId }, data: data as any });
    } else {
      await this.prisma.db.tenantEmailConfig.create({ data: { tenantId, ...data } as any });
    }
    this.email.invalidar(tenantId); // força reconstruir o transporter
    return this.obter();
  }

  /** Envia um e-mail de teste (ao destino informado ou ao próprio remetente). */
  async testar(destino?: string) {
    const cfg = await this.obter();
    const para = destino?.trim() || cfg.smtpFrom || cfg.smtpUser;
    if (!para) throw new BadRequestException('Informe um destinatário (ou configure o remetente).');
    await this.email.enviar(
      para,
      'Teste de e-mail do Portal',
      'Este é um e-mail de teste do Portal Municipal. Se você recebeu, o SMTP está configurado corretamente.',
    );
    return { ok: true, para };
  }
}
