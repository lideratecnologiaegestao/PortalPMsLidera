import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EmailService } from '../notificacoes/email.service';
import { WhatsappService } from '../notificacoes/whatsapp.service';
import { rotuloTipo } from './diario.util';

interface NovoAlerta {
  termo: string;
  canal: string; // email | whatsapp
  destino: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Monitoramento por termo (LGPD: consentimento + double opt-in + descadastro).
 * O cidadão cadastra um termo e um contato; recebe um link de confirmação; só
 * após confirmar (status 'ativo') passa a receber alertas. Pode cancelar a
 * qualquer momento pelo token presente em toda mensagem.
 */
@Injectable()
export class DiarioAlertasService {
  private readonly log = new Logger(DiarioAlertasService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
  ) {}

  // ---------------------------------------------------------------- cadastro
  async criar(dto: NovoAlerta, host: string) {
    const termo = (dto.termo ?? '').trim();
    const canal = dto.canal === 'whatsapp' ? 'whatsapp' : 'email';
    const destino = this.normalizarDestino(canal, dto.destino ?? '');

    if (termo.length < 3) throw new BadRequestException('Informe um termo com ao menos 3 letras.');
    if (canal === 'email' && !EMAIL_RE.test(destino)) {
      throw new BadRequestException('Informe um e-mail válido.');
    }
    if (canal === 'whatsapp' && destino.replace(/\D/g, '').length < 10) {
      throw new BadRequestException('Informe um número de WhatsApp válido (com DDD).');
    }

    const tenantId = TenantContext.tenantId()!;

    // Já existe (ativo/pendente) para o mesmo termo+contato? Reenvia confirmação.
    const existente = await this.prisma.db.diarioAlerta.findFirst({
      where: { canal, destino, termo: { equals: termo, mode: 'insensitive' }, status: { not: 'cancelado' } },
    });
    if (existente) {
      if (existente.status === 'ativo') {
        return { status: 'ativo', canal, mensagem: 'Você já tem um alerta ativo para este termo.' };
      }
      await this.enviarConfirmacao(existente.token, termo, canal, destino, host).catch((e) =>
        this.log.warn(`Falha ao reenviar confirmação: ${(e as Error).message}`),
      );
      return { status: 'pendente', canal, mensagem: 'Reenviamos o link de confirmação.' };
    }

    const token = randomBytes(24).toString('hex');
    await this.prisma.db.diarioAlerta.create({
      data: { tenantId, termo, canal, destino, token, status: 'pendente' },
    });

    try {
      await this.enviarConfirmacao(token, termo, canal, destino, host);
    } catch (e) {
      this.log.warn(`Canal ${canal} indisponível: ${(e as Error).message}`);
      throw new BadRequestException(
        canal === 'email'
          ? 'Não foi possível enviar o e-mail de confirmação. Tente novamente mais tarde.'
          : 'Não foi possível enviar a confirmação por WhatsApp no momento.',
      );
    }

    await this.prisma.db.auditLog.create({
      data: {
        tenantId, acao: 'DIARIO_ALERTA_CADASTRADO', entidade: 'diario_alertas',
        dados: { canal, termo }, // sem o contato em claro (minimização)
      },
    }).catch(() => undefined);

    return { status: 'pendente', canal, mensagem: 'Enviamos um link de confirmação. Confirme para ativar o alerta.' };
  }

  async confirmar(token: string) {
    const a = await this.prisma.db.diarioAlerta.findUnique({ where: { token } });
    if (!a || a.status === 'cancelado') throw new NotFoundException('Alerta não encontrado.');
    if (a.status === 'ativo') return { ok: true, termo: a.termo, jaAtivo: true };
    await this.prisma.db.diarioAlerta.update({
      where: { id: a.id }, data: { status: 'ativo', confirmadoEm: new Date() },
    });
    return { ok: true, termo: a.termo };
  }

  async cancelar(token: string) {
    const a = await this.prisma.db.diarioAlerta.findUnique({ where: { token } });
    if (!a) throw new NotFoundException('Alerta não encontrado.');
    if (a.status !== 'cancelado') {
      await this.prisma.db.diarioAlerta.update({
        where: { id: a.id }, data: { status: 'cancelado', canceladoEm: new Date() },
      });
    }
    return { ok: true, termo: a.termo };
  }

  // ---------------------------------------------------------------- envio
  /** Processa os alertas ativos contra uma edição recém-publicada. */
  async processarEdicao(edicaoId: string, host: string) {
    const ed = await this.prisma.db.diarioEdicao.findUnique({
      where: { id: edicaoId },
      select: { id: true, numero: true, status: true },
    });
    if (!ed || ed.status !== 'publicado') return;

    const alertas = await this.prisma.db.diarioAlerta.findMany({ where: { status: 'ativo' } });
    if (!alertas.length) return;

    for (const a of alertas) {
      try {
        const matches = await this.prisma.tx((t) =>
          t.$queryRaw<{ tipo: string; numeroAto: string | null; titulo: string }[]>`
            SELECT tipo, numero_ato AS "numeroAto", titulo
            FROM diario_materias
            WHERE edicao_id = ${edicaoId}::uuid
              AND busca @@ websearch_to_tsquery('portuguese', ${a.termo})
            LIMIT 10`,
        );
        if (!matches.length) continue;
        await this.enviarAlerta(a, ed.numero, matches, host);
        await this.prisma.db.diarioAlerta.update({
          where: { id: a.id }, data: { ultimoEnvioEm: new Date() },
        });
      } catch (e) {
        this.log.warn(`Falha ao alertar (${a.canal}): ${(e as Error).message}`);
      }
    }
  }

  // ---------------------------------------------------------------- helpers
  private normalizarDestino(canal: string, destino: string): string {
    return canal === 'email' ? destino.trim().toLowerCase() : destino.trim();
  }

  private async enviarConfirmacao(token: string, termo: string, canal: string, destino: string, host: string) {
    const base = `https://${host}`;
    const confirmar = `${base}/diario/alertas/confirmar?token=${token}`;
    const cancelar = `${base}/diario/alertas/cancelar?token=${token}`;
    const texto =
      `Você solicitou alertas do Diário Oficial para o termo "${termo}".\n\n` +
      `Para CONFIRMAR e começar a receber, acesse:\n${confirmar}\n\n` +
      `Se não foi você, ignore esta mensagem ou cancele em:\n${cancelar}\n\n` +
      `Seus dados serão usados apenas para enviar estes alertas e você pode cancelar a qualquer momento (LGPD).`;
    if (canal === 'email') {
      await this.email.enviar(destino, 'Confirme seu alerta do Diário Oficial', texto);
    } else {
      await this.whatsapp.enviar(destino, texto);
    }
  }

  private async enviarAlerta(
    a: { canal: string; destino: string; termo: string; token: string },
    numeroEdicao: string,
    matches: { tipo: string; numeroAto: string | null; titulo: string }[],
    host: string,
  ) {
    const base = `https://${host}`;
    const linkEdicao = `${base}/diario/${encodeURIComponent(numeroEdicao)}`;
    const cancelar = `${base}/diario/alertas/cancelar?token=${a.token}`;
    const lista = matches
      .map((m) => `• ${rotuloTipo(m.tipo)}${m.numeroAto ? ` ${m.numeroAto}` : ''} — ${m.titulo}`)
      .join('\n');
    const texto =
      `Seu termo monitorado "${a.termo}" apareceu na Edição nº ${numeroEdicao} do Diário Oficial:\n\n` +
      `${lista}\n\nVeja a edição: ${linkEdicao}\n\n` +
      `Para parar de receber estes alertas, cancele em:\n${cancelar}`;
    if (a.canal === 'email') {
      await this.email.enviar(a.destino, `Diário Oficial — "${a.termo}" foi publicado`, texto);
    } else {
      await this.whatsapp.enviar(a.destino, texto);
    }
  }
}
