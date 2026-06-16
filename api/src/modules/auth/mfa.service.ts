import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { gerarSecret, otpauthUrl, verificarTotp } from './totp';

/**
 * MFA por TOTP para servidores (docs/04-seguranca.md exige MFA para papéis
 * sensíveis). O segredo fica em users.mfa_secret (RLS isola por tenant). Fluxo:
 * setup → habilitar (confirma com um código) → verify (eleva a sessão).
 */
@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService) {}

  /** Gera segredo + URL para o app autenticador (ainda não habilita). */
  async setup(userId: string) {
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const secret = gerarSecret();
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { mfaSecret: secret, mfaHabilitado: false },
    });
    return { otpauthUrl: otpauthUrl(u?.email ?? userId, secret), secret };
  }

  /** Confirma o setup com um código válido e habilita o MFA. */
  async habilitar(userId: string, codigo: string) {
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true },
    });
    if (!u?.mfaSecret || !verificarTotp(u.mfaSecret, codigo)) {
      throw new UnauthorizedException('Código MFA inválido.');
    }
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { mfaHabilitado: true },
    });
    return { habilitado: true };
  }

  /** Verifica um código (login com 2º fator). */
  async verificar(userId: string, codigo: string): Promise<boolean> {
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { mfaSecret: true, mfaHabilitado: true },
    });
    if (!u?.mfaHabilitado || !u.mfaSecret) return false;
    return verificarTotp(u.mfaSecret, codigo);
  }

  /** Este usuário tem MFA habilitado? */
  async habilitado(userId: string): Promise<boolean> {
    const u = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { mfaHabilitado: true },
    });
    return u?.mfaHabilitado ?? false;
  }
}
