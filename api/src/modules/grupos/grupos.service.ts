import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { isPermissionValida, PERMISSOES } from '../../common/rbac/permissions.catalog';
import { CriarGrupoDto, AtualizarGrupoDto } from './grupos.dto';

@Injectable()
export class GruposService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista grupos do tenant com contagem de membros. RLS isola por tenant. */
  async listar() {
    return this.prisma.db.grupoAcesso.findMany({
      orderBy: { nome: 'asc' },
      include: {
        _count: { select: { membros: true } },
      },
    });
  }

  /** Retorna o catálogo de permissões agrupado por módulo para a UI. */
  catalogo() {
    const agrupado: Record<string, { key: string; label: string }[]> = {};
    for (const p of PERMISSOES) {
      if (!agrupado[p.modulo]) agrupado[p.modulo] = [];
      agrupado[p.modulo].push({ key: p.key, label: p.label });
    }
    return agrupado;
  }

  /** Retorna um grupo com a lista de membros (id, nome, email). */
  async buscar(id: string) {
    const grupo = await this.prisma.db.grupoAcesso.findUnique({
      where: { id },
      include: {
        membros: {
          include: {
            user: {
              select: { id: true, nome: true, email: true },
            },
          },
        },
      },
    });
    if (!grupo) throw new NotFoundException('Grupo não encontrado.');
    return grupo;
  }

  /** Cria um novo grupo de acesso. */
  async criar(dto: CriarGrupoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    this.validarPermissoes(dto.permissoes);

    // Unicidade: [tenantId, nome] é constraint no banco, mas melhor erro explícito
    const existente = await this.prisma.db.grupoAcesso.findFirst({
      where: { nome: dto.nome },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Já existe um grupo com este nome neste tenant.');
    }

    const grupo = await this.prisma.db.grupoAcesso.create({
      data: {
        tenantId,
        nome: dto.nome,
        descricao: dto.descricao ?? null,
        permissoes: dto.permissoes,
        ativo: dto.ativo ?? true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'GRUPO_CRIADO',
        entidade: 'grupos_acesso',
        entidadeId: grupo.id,
        dados: { nome: grupo.nome, permissoes: grupo.permissoes },
      },
    });

    return grupo;
  }

  /** Atualiza nome, descricao, permissoes e/ou ativo do grupo. */
  async atualizar(id: string, dto: AtualizarGrupoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(id); // garante pertence ao tenant via RLS

    if (dto.permissoes !== undefined) {
      this.validarPermissoes(dto.permissoes);
    }

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.descricao !== undefined) data.descricao = dto.descricao;
    if (dto.permissoes !== undefined) data.permissoes = dto.permissoes;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    data.atualizadoEm = new Date();

    const atualizado = await this.prisma.db.grupoAcesso.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'GRUPO_ATUALIZADO',
        entidade: 'grupos_acesso',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizado;
  }

  /** Exclui o grupo (cascade remove usuario_grupos). */
  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const grupo = await this.buscar(id);

    await this.prisma.db.grupoAcesso.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'GRUPO_EXCLUIDO',
        entidade: 'grupos_acesso',
        entidadeId: id,
        dados: { nome: grupo.nome },
      },
    });

    return { excluido: true };
  }

  /** Adiciona membro ao grupo. Idempotente (sem erro se já existir). */
  async adicionarMembro(grupoId: string, userId: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(grupoId); // garante que o grupo pertence ao tenant

    try {
      await this.prisma.db.usuarioGrupo.create({
        data: { tenantId, userId, grupoId },
      });
    } catch (err: any) {
      // P2002 = violação de unique constraint (já é membro)
      if (err?.code !== 'P2002') throw err;
    }

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'GRUPO_MEMBRO_ADD',
        entidade: 'usuario_grupos',
        entidadeId: grupoId,
        dados: { userId },
      },
    });

    return { adicionado: true };
  }

  /** Remove membro do grupo. */
  async removerMembro(grupoId: string, userId: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(grupoId); // garante que o grupo pertence ao tenant

    const existente = await this.prisma.db.usuarioGrupo.findUnique({
      where: { userId_grupoId: { userId, grupoId } },
    });
    if (!existente) {
      throw new NotFoundException('Usuário não é membro deste grupo.');
    }

    await this.prisma.db.usuarioGrupo.delete({
      where: { userId_grupoId: { userId, grupoId } },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'GRUPO_MEMBRO_REMOVE',
        entidade: 'usuario_grupos',
        entidadeId: grupoId,
        dados: { userId },
      },
    });

    return { removido: true };
  }

  /** Valida que todas as chaves pertencem ao catálogo. */
  private validarPermissoes(permissoes: string[]) {
    const invalidas = permissoes.filter((k) => !isPermissionValida(k));
    if (invalidas.length > 0) {
      throw new BadRequestException(
        `Chave(s) de permissão inválida(s): ${invalidas.join(', ')}`,
      );
    }
  }
}
