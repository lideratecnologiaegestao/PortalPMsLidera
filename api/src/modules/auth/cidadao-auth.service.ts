import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { EmailNaoConfigurado, EmailService } from '../notificacoes/email.service';
import { WhatsappService } from '../notificacoes/whatsapp.service';
import { hashSenha, verificarSenha } from './password';
import { signSession } from './session-token';
import { SessionsService } from '../sessions/sessions.service';

type Finalidade = 'email' | 'telefone' | 'reset';
const hashCod = (c: string) => createHash('sha256').update(c).digest('hex');
const codigo6 = () => String(randomInt(100000, 1000000));

interface CadastroDto { nome: string; email: string; telefone?: string; senha: string }

export interface LoginCtx {
  ip?: string;
  userAgent?: string;
}

/**
 * Cadastro/login do CIDADÃO sem gov.br (e-mail + senha). Confirma o e-mail (código
 * por e-mail do tenant) e o telefone (código por WhatsApp). O gov.br segue como
 * opção alternativa. Multi-tenant: a conta é do município do domínio atual
 * (unicidade por tenant_id + email).
 */
@Injectable()
export class CidadaoAuthService {
  private readonly log = new Logger(CidadaoAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly whatsapp: WhatsappService,
    private readonly sessions: SessionsService,
  ) {}

  private tenant(): string {
    const t = TenantContext.tenantId();
    if (!t) throw new BadRequestException('O acesso do cidadão ocorre no domínio de uma prefeitura.');
    return t;
  }

  private soDigitos(t?: string): string | undefined {
    const d = (t ?? '').replace(/\D/g, '');
    return d.length >= 10 ? d : undefined;
  }

  // ---------------------------------------------------------------- cadastro
  async cadastrar(dto: CadastroDto) {
    const tenantId = this.tenant();
    const email = (dto.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('E-mail inválido.');
    if ((dto.senha ?? '').length < 8) throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    if (!dto.nome?.trim()) throw new BadRequestException('Informe seu nome.');
    const telefone = this.soDigitos(dto.telefone);

    const existente = await this.prisma.db.user.findFirst({ where: { email }, select: { id: true, emailVerificado: true, govbrSub: true } });

    let userId: string;
    if (existente) {
      if (existente.emailVerificado || existente.govbrSub) {
        throw new BadRequestException('E-mail já cadastrado. Faça login ou recupere a senha.');
      }
      // re-cadastro de conta ainda não confirmada: atualiza e reenvia
      await this.prisma.db.user.update({
        where: { id: existente.id },
        data: { nome: dto.nome.trim(), telefone, senhaHash: hashSenha(dto.senha), senhaAlteradaEm: new Date() },
      });
      userId = existente.id;
    } else {
      const u = await this.prisma.db.user.create({
        data: {
          tenantId, role: 'cidadao', nome: dto.nome.trim(), email, telefone,
          senhaHash: hashSenha(dto.senha), senhaAlteradaEm: new Date(), emailVerificado: false, telefoneVerificado: false,
        },
      });
      userId = u.id;
    }

    const emailEnviado = await this.enviarCodigo(userId, tenantId, 'email', email).catch(() => false);
    const telefoneEnviado = telefone ? await this.enviarCodigo(userId, tenantId, 'telefone', telefone).catch(() => false) : false;

    return {
      ok: true,
      precisaVerificar: { email: true, telefone: !!telefone },
      emailEnviado, telefoneEnviado,
    };
  }

  // ------------------------------------------------------------- verificação
  async verificar(emailRaw: string, finalidade: Finalidade, codigo: string) {
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = await this.prisma.db.user.findFirst({ where: { email }, select: { id: true } });
    if (!user) throw new BadRequestException('Conta não encontrada.');

    const v = await this.prisma.db.authVerificacao.findFirst({
      where: { userId: user.id, finalidade }, orderBy: { criadoEm: 'desc' },
    });
    if (!v || v.codigoHash !== hashCod((codigo ?? '').trim())) throw new BadRequestException('Código inválido.');
    if (v.expiraEm < new Date()) throw new BadRequestException('Código expirado. Reenvie um novo.');

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: finalidade === 'email' ? { emailVerificado: true } : { telefoneVerificado: true },
    });
    await this.prisma.db.authVerificacao.deleteMany({ where: { userId: user.id, finalidade } });
    return { ok: true };
  }

  async reenviar(emailRaw: string, finalidade: Finalidade) {
    const email = (emailRaw ?? '').trim().toLowerCase();
    const tenantId = this.tenant();
    const user = await this.prisma.db.user.findFirst({ where: { email }, select: { id: true, email: true, telefone: true } });
    if (!user) return { ok: true }; // não revela existência
    const destino = finalidade === 'telefone' ? user.telefone : user.email;
    if (!destino) throw new BadRequestException('Contato não informado.');
    const enviado = await this.enviarCodigo(user.id, tenantId, finalidade, destino).catch(() => false);
    return { ok: true, enviado };
  }

  // ------------------------------------------------------------------- login
  async login(emailRaw: string, senha: string, ctx: LoginCtx = {}) {
    const tenantId = this.tenant();
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = await this.prisma.db.user.findFirst({
      where: { email, ativo: true },
      select: { id: true, role: true, senhaHash: true, emailVerificado: true, govbrSub: true, govbrNivel: true, nome: true },
    });
    if (!user || !verificarSenha(senha, user.senhaHash)) {
      throw new ForbiddenException('E-mail ou senha inválidos.');
    }
    // Verificação de e-mail só é exigida para conta de CIDADÃO auto-cadastrada.
    // Servidores (criados pelo admin) e contas gov.br já são confiáveis.
    const exigeVerificacao = user.role === 'cidadao' && !user.govbrSub;
    if (exigeVerificacao && !user.emailVerificado) {
      await this.enviarCodigo(user.id, tenantId, 'email', email).catch(() => undefined);
      throw new ForbiddenException('Confirme seu e-mail para entrar. Reenviamos o código.');
    }
    await this.prisma.db.user.update({ where: { id: user.id }, data: { ultimoLoginEm: new Date() } });
    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: user.id, acao: 'LOGIN_CIDADAO', entidade: 'user', entidadeId: user.id, dados: {} },
    });

    const { token, jti, expiraEm } = await signSession({ sub: user.id, tenantId, role: user.role, nivel: user.govbrNivel ?? null });

    // Registra sessao stateful (best-effort)
    this.sessions
      .registrar(jti, { userId: user.id, tenantId, ip: ctx.ip, userAgent: ctx.userAgent, expiraEm })
      .catch(() => undefined);

    return { token, user: { id: user.id, nome: user.nome } };
  }

  // --------------------------------------------------------- recuperar senha
  async recuperar(emailRaw: string) {
    const tenantId = this.tenant();
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = await this.prisma.db.user.findFirst({ where: { email }, select: { id: true } });
    if (user) await this.enviarCodigo(user.id, tenantId, 'reset', email).catch(() => undefined);
    return { ok: true }; // resposta uniforme (anti-enumeração)
  }

  async redefinir(emailRaw: string, codigo: string, novaSenha: string) {
    if ((novaSenha ?? '').length < 8) throw new BadRequestException('A senha deve ter ao menos 8 caracteres.');
    const email = (emailRaw ?? '').trim().toLowerCase();
    const user = await this.prisma.db.user.findFirst({ where: { email }, select: { id: true } });
    if (!user) throw new BadRequestException('Não foi possível redefinir.');
    const v = await this.prisma.db.authVerificacao.findFirst({ where: { userId: user.id, finalidade: 'reset' }, orderBy: { criadoEm: 'desc' } });
    if (!v || v.codigoHash !== hashCod((codigo ?? '').trim())) throw new BadRequestException('Código inválido.');
    if (v.expiraEm < new Date()) throw new BadRequestException('Código expirado.');
    await this.prisma.db.user.update({ where: { id: user.id }, data: { senhaHash: hashSenha(novaSenha), senhaAlteradaEm: new Date(), emailVerificado: true } });
    await this.prisma.db.authVerificacao.deleteMany({ where: { userId: user.id, finalidade: 'reset' } });
    return { ok: true };
  }

  // ----------------------------------------------------------------- helpers
  private async enviarCodigo(userId: string, tenantId: string, finalidade: Finalidade, destino: string): Promise<boolean> {
    const codigo = codigo6();
    await this.prisma.db.authVerificacao.create({
      data: { tenantId, userId, finalidade, codigoHash: hashCod(codigo), expiraEm: new Date(Date.now() + 30 * 60 * 1000) },
    });
    const textoEmail = `Seu código de verificação é ${codigo}. Expira em 30 minutos.`;
    try {
      if (finalidade === 'telefone') {
        await this.whatsapp.enviar(destino, `Código de confirmação do seu cadastro: ${codigo} (expira em 30 min).`);
      } else {
        const assunto = finalidade === 'reset' ? 'Redefinição de senha' : 'Confirme seu e-mail';
        await this.email.enviar(destino, assunto, textoEmail);
      }
      return true;
    } catch (e) {
      if (e instanceof EmailNaoConfigurado) this.log.warn('SMTP do tenant não configurado — código de e-mail não enviado.');
      else this.log.warn(`Falha ao enviar código (${finalidade}): ${(e as Error).message}`);
      return false;
    }
  }
}
