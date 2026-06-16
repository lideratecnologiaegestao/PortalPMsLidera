import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { GovbrIdentity } from './govbr-oidc.service';
import { signSession } from './session-token';
import { computarCpfHash } from './cpf-hash';
import { verificarSenha } from './password';
import { SessionsService } from '../sessions/sessions.service';

export interface LoginCtx {
  ip?: string;
  userAgent?: string;
}

/**
 * Regras de identidade do portal: faz o upsert do cidadão no tenant atual a
 * partir da identidade gov.br e emite o token de sessão do backend.
 *
 * Tudo roda dentro do TenantContext (RLS): o usuário é gravado com o
 * tenant_id da prefeitura cujo domínio recebeu o callback. O mesmo cidadão
 * (mesmo `sub`) pode ter conta em várias prefeituras — unicidade por
 * (tenant_id, govbr_sub), garantida na migration 006.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
  ) {}

  /** Upsert do cidadão + emissão da sessão. Retorna o JWT de sessão. */
  async loginCidadao(identity: GovbrIdentity, ctx: LoginCtx = {}): Promise<string> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      // login de cidadão só faz sentido no domínio de uma prefeitura
      throw new BadRequestException(
        'Login gov.br precisa ocorrer no domínio de uma prefeitura.',
      );
    }

    const user = await this.prisma.db.user.upsert({
      where: { tenantId_govbrSub: { tenantId, govbrSub: identity.sub } },
      create: {
        tenantId,
        govbrSub: identity.sub,
        nome: identity.nome,
        email: identity.email,
        // LGPD: guarda só o HASH do CPF (dedupe), nunca o CPF em claro.
        cpfHash: computarCpfHash(identity.cpf) ?? undefined,
        govbrNivel: identity.nivel ?? undefined,
        role: 'cidadao',
        ultimoLoginEm: new Date(),
      },
      update: {
        // NÃO sobrescreve role (um servidor pode logar via gov.br também)
        nome: identity.nome,
        email: identity.email,
        govbrNivel: identity.nivel ?? undefined,
        ultimoLoginEm: new Date(),
      },
    });

    // auditoria de acesso a sistema (sem dado sensível em claro)
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: user.id,
        acao: 'LOGIN_GOVBR',
        entidade: 'user',
        entidadeId: user.id,
        dados: { nivel: identity.nivel ?? null },
      },
    });

    const { token, jti, expiraEm } = await signSession({
      sub: user.id,
      tenantId,
      role: user.role,
      nivel: user.govbrNivel ?? null,
    });

    // Registra sessao stateful (best-effort — nao derruba o login)
    this.sessions
      .registrar(jti, { userId: user.id, tenantId, ip: ctx.ip, userAgent: ctx.userAgent, expiraEm })
      .catch(() => undefined);

    return token;
  }

  /**
   * Login local (e-mail + senha) para servidores/admin — alternativa ao gov.br.
   * Roda no tenant atual (RLS); e-mail é único por tenant. Emite a sessão; se o
   * usuário tem MFA habilitado, sinaliza que falta o 2º fator (/auth/mfa/verify).
   */
  async loginLocal(
    email: string,
    senha: string,
    ctx: LoginCtx = {},
  ): Promise<{ token: string; mfaRequired: boolean; senhaExpirada: boolean }> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      throw new BadRequestException('Login deve ocorrer no domínio de uma prefeitura.');
    }
    const user = await this.prisma.db.user.findFirst({
      where: { email, ativo: true },
      select: { id: true, role: true, senhaHash: true, govbrNivel: true, mfaHabilitado: true, senhaAlteradaEm: true },
    });
    if (!user || !verificarSenha(senha, user.senhaHash)) {
      // Rastreamento de tentativas (segurança/auditoria); não revela se o e-mail existe.
      await this.prisma.db.auditLog
        .create({ data: { tenantId, acao: 'LOGIN_FALHOU', entidade: 'user', dados: { email } } })
        .catch(() => undefined);
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const agora = new Date();
    const dataUpd: Record<string, unknown> = { ultimoLoginEm: agora };
    // Backfill da data de troca de senha (inicia o relógio da política para contas antigas).
    let senhaAlteradaEm = user.senhaAlteradaEm;
    if (!senhaAlteradaEm) { senhaAlteradaEm = agora; dataUpd.senhaAlteradaEm = agora; }
    await this.prisma.db.user.update({ where: { id: user.id }, data: dataUpd });

    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: user.id, acao: 'LOGIN_LOCAL', entidade: 'user', entidadeId: user.id, dados: {} },
    });

    // Política de expiração de senha (SENHA_EXPIRA_DIAS; 0 = desativada).
    const dias = Number(process.env.SENHA_EXPIRA_DIAS ?? 0);
    const senhaExpirada =
      dias > 0 && agora.getTime() - senhaAlteradaEm.getTime() > dias * 86_400_000;

    const { token, jti, expiraEm } = await signSession({
      sub: user.id,
      tenantId,
      role: user.role,
      nivel: user.govbrNivel ?? null,
      mfa: false, // 2º fator (se habilitado) é elevado em /auth/mfa/verify
    });

    // Registra sessao stateful (best-effort)
    this.sessions
      .registrar(jti, { userId: user.id, tenantId, ip: ctx.ip, userAgent: ctx.userAgent, expiraEm })
      .catch(() => undefined);

    return { token, mfaRequired: user.mfaHabilitado, senhaExpirada };
  }
}
