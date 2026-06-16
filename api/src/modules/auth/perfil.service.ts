import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { hashSenha, verificarSenha } from './password';
import { AtualizarPerfilDto } from './perfil.dto';

/** Shape retornado pelo GET e pelo PATCH bem-sucedido. */
export interface PerfilResponse {
  id: string;
  nome: string;
  email: string;
  role: string;
  mfaHabilitado: boolean;
  govbrNivel: number | null;
}

/**
 * Operações de perfil do próprio usuário autenticado.
 * Todo acesso usa `this.prisma.db.*` — RLS isola automaticamente pelo tenant.
 * O userId vem sempre do token JWT (sub), nunca do body.
 */
@Injectable()
export class PerfilService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retorna os dados de perfil do usuário identificado por `userId`.
   * RLS garante que o `userId` só resolve dentro do tenant correto.
   */
  async obter(userId: string): Promise<PerfilResponse> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        mfaHabilitado: true,
        govbrNivel: true,
      },
    });

    if (!user) {
      // Nunca deveria chegar aqui com um token válido, mas é fail-safe.
      throw new NotFoundException('Usuário não encontrado.');
    }

    return {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role as string,
      mfaHabilitado: user.mfaHabilitado,
      govbrNivel: user.govbrNivel ?? null,
    };
  }

  /**
   * Atualiza nome, e-mail e/ou senha do próprio usuário.
   * Registra `PERFIL_ATUALIZADO` no audit_log com os campos alterados
   * (sem dados sensíveis em claro).
   */
  async atualizar(
    userId: string,
    dto: AtualizarPerfilDto,
  ): Promise<PerfilResponse> {
    const tenantId = TenantContext.tenantId();

    // Carrega o usuário para verificar senha atual (se solicitado) e
    // confirmar que existe no tenant atual (RLS já filtra).
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        email: true,
        role: true,
        mfaHabilitado: true,
        govbrNivel: true,
        senhaHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    // ---------------------------------------------------------------- validações
    if (dto.novaSenha !== undefined && dto.novaSenha !== null) {
      if (!dto.senhaAtual) {
        throw new BadRequestException(
          'senhaAtual é obrigatória para alterar a senha.',
        );
      }
      if (!verificarSenha(dto.senhaAtual, user.senhaHash)) {
        throw new UnauthorizedException('Senha atual incorreta.');
      }
    }

    // ---------------------------------------------------------------- montagem do update
    const data: Record<string, unknown> = {};
    const camposAlterados: string[] = [];

    if (dto.nome !== undefined && dto.nome !== user.nome) {
      data.nome = dto.nome;
      camposAlterados.push('nome');
    }

    if (dto.email !== undefined && dto.email !== user.email) {
      data.email = dto.email;
      camposAlterados.push('email');
    }

    if (dto.novaSenha !== undefined && dto.novaSenha !== null) {
      data.senhaHash = hashSenha(dto.novaSenha);
      camposAlterados.push('senha');
    }

    // Nada mudou — retorna o perfil atual sem gravar nem auditar.
    if (camposAlterados.length === 0) {
      return this.obter(userId);
    }

    // ---------------------------------------------------------------- persistência
    let updated: PerfilResponse;
    try {
      const result = await this.prisma.db.user.update({
        where: { id: userId },
        data: data as any,
        select: {
          id: true,
          nome: true,
          email: true,
          role: true,
          mfaHabilitado: true,
          govbrNivel: true,
        },
      });
      updated = {
        id: result.id,
        nome: result.nome,
        email: result.email,
        role: result.role as string,
        mfaHabilitado: result.mfaHabilitado,
        govbrNivel: result.govbrNivel ?? null,
      };
    } catch (err: any) {
      // Violação de unicidade (tenant_id, email) — código P2002 do Prisma.
      if (err?.code === 'P2002') {
        throw new ConflictException(
          'Este e-mail já está em uso por outro usuário nesta prefeitura.',
        );
      }
      throw err;
    }

    // ---------------------------------------------------------------- auditoria
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: tenantId ?? null,
        atorId: userId,
        acao: 'PERFIL_ATUALIZADO',
        entidade: 'user',
        entidadeId: userId,
        // Apenas os nomes dos campos alterados — nenhum valor sensível em claro.
        dados: { campos: camposAlterados },
      },
    });

    return updated;
  }
}
