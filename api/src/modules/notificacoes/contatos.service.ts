import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EmailService } from './email.service';
import { WhatsappService } from './whatsapp.service';

type Canal = 'whatsapp' | 'email';

interface SalvarDto {
  whatsapp?: string;
  email?: string;
  notifWhatsapp?: boolean;
  notifEmail?: boolean;
}

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Cadastro e verificação dos contatos (WhatsApp + e-mail) do próprio usuário,
 * com preferências de notificação (opt-in por canal). O código de verificação é
 * guardado apenas como hash, com validade de 15 minutos, e enviado pelo próprio
 * canal que está sendo verificado.
 */
@Injectable()
export class ContatosService {
  private readonly log = new Logger(ContatosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async obter(userId: string) {
    const [c, user] = await Promise.all([
      this.prisma.db.userContato.findFirst({ where: { userId } }),
      this.prisma.db.user.findUnique({ where: { id: userId }, select: { email: true } }),
    ]);
    return {
      whatsapp: c?.whatsapp ?? '',
      whatsappVerificado: c?.whatsappVerificado ?? false,
      email: c?.email ?? user?.email ?? '',
      emailVerificado: c?.emailVerificado ?? false,
      notifWhatsapp: c?.notifWhatsapp ?? true,
      notifEmail: c?.notifEmail ?? true,
      canais: { whatsapp: this.whatsapp.habilitado, email: await this.email.configurado() },
    };
  }

  async salvar(userId: string, dto: SalvarDto) {
    const tenantId = TenantContext.tenantId()!;
    const atual = await this.prisma.db.userContato.findFirst({ where: { userId } });

    const data: Record<string, unknown> = {};
    let enviarWa = false;
    let enviarEmail = false;

    if (dto.whatsapp !== undefined) {
      const novo = dto.whatsapp.trim() || null;
      if (novo !== (atual?.whatsapp ?? null)) {
        data.whatsapp = novo;
        data.whatsappVerificado = false;
        data.whatsappCodigo = null;
        data.whatsappCodigoExp = null;
        enviarWa = !!novo;
      }
    }
    if (dto.email !== undefined) {
      const novo = dto.email.trim() || null;
      if (novo !== (atual?.email ?? null)) {
        data.email = novo;
        data.emailVerificado = false;
        data.emailCodigo = null;
        data.emailCodigoExp = null;
        enviarEmail = !!novo;
      }
    }
    if (dto.notifWhatsapp !== undefined) data.notifWhatsapp = dto.notifWhatsapp;
    if (dto.notifEmail !== undefined) data.notifEmail = dto.notifEmail;

    const row = atual
      ? await this.prisma.db.userContato.update({ where: { id: atual.id }, data: data as any })
      : await this.prisma.db.userContato.create({ data: { tenantId, userId, ...data } as any });

    if (enviarWa && row.whatsapp) await this.gerarEnviarCodigo(row.id, 'whatsapp', row.whatsapp);
    if (enviarEmail && row.email) await this.gerarEnviarCodigo(row.id, 'email', row.email);

    return this.obter(userId);
  }

  async verificar(userId: string, canal: Canal, codigo: string) {
    const c = await this.prisma.db.userContato.findFirst({ where: { userId } });
    if (!c) throw new BadRequestException('Nenhum contato cadastrado.');

    const armazenado = canal === 'whatsapp' ? c.whatsappCodigo : c.emailCodigo;
    const exp = canal === 'whatsapp' ? c.whatsappCodigoExp : c.emailCodigoExp;
    if (!armazenado || armazenado !== hash((codigo ?? '').trim())) {
      throw new BadRequestException('Código inválido.');
    }
    if (!exp || exp < new Date()) throw new BadRequestException('Código expirado. Reenvie um novo.');

    await this.prisma.db.userContato.update({
      where: { id: c.id },
      data:
        canal === 'whatsapp'
          ? { whatsappVerificado: true, whatsappCodigo: null, whatsappCodigoExp: null }
          : { emailVerificado: true, emailCodigo: null, emailCodigoExp: null },
    });
    return this.obter(userId);
  }

  async reenviar(userId: string, canal: Canal) {
    const c = await this.prisma.db.userContato.findFirst({ where: { userId } });
    const destino = canal === 'whatsapp' ? c?.whatsapp : c?.email;
    if (!c || !destino) throw new BadRequestException('Contato não cadastrado.');
    await this.gerarEnviarCodigo(c.id, canal, destino);
    return { ok: true };
  }

  // ----------------------------------------------------------- helpers
  private async gerarEnviarCodigo(id: string, canal: Canal, destino: string): Promise<void> {
    const codigo = String(randomInt(100000, 1000000)); // 6 dígitos
    const exp = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.db.userContato.update({
      where: { id },
      data:
        canal === 'whatsapp'
          ? { whatsappCodigo: hash(codigo), whatsappCodigoExp: exp }
          : { emailCodigo: hash(codigo), emailCodigoExp: exp },
    });
    const texto = `Seu código de verificação é ${codigo}. Expira em 15 minutos.`;
    try {
      if (canal === 'whatsapp') await this.whatsapp.enviar(destino, texto);
      else if (await this.email.configurado()) await this.email.enviar(destino, 'Código de verificação', texto);
    } catch (e) {
      // não falha o cadastro — o usuário pode reenviar
      this.log.warn(`Falha ao enviar código (${canal}): ${(e as Error).message}`);
    }
  }
}
