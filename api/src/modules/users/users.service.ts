import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { hashSenha } from '../auth/password';
import { CriarUserDto, AtualizarUserDto } from './users.dto';

/** Projeção segura: nunca expõe senhaHash, cpfHash, mfaSecret. */
const SAFE_SELECT = {
  id: true,
  tenantId: true,
  secretariaId: true,
  nome: true,
  email: true,
  role: true,
  ativo: true,
  ultimoLoginEm: true,
  mfaHabilitado: true,
} as const;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(opts: {
    role?: string;
    ativo?: boolean;
    q?: string;
    grupoId?: string;
    page: number;
    pageSize: number;
  }) {
    const where: Record<string, unknown> = {};
    if (opts.role) where.role = opts.role;
    if (opts.ativo !== undefined) where.ativo = opts.ativo;
    if (opts.q) {
      where.OR = [
        { nome: { contains: opts.q, mode: 'insensitive' } },
        { email: { contains: opts.q, mode: 'insensitive' } },
      ];
    }
    // Filtra usuários que pertencem a um grupo específico
    if (opts.grupoId) {
      where.grupos = { some: { grupoId: opts.grupoId } };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        select: SAFE_SELECT,
        orderBy: { nome: 'asc' },
        skip: (opts.page - 1) * opts.pageSize,
        take: opts.pageSize,
      }),
      this.prisma.db.user.count({ where }),
    ]);

    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscar(id: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id },
      select: {
        ...SAFE_SELECT,
        grupos: {
          select: {
            grupo: {
              select: { id: true, nome: true, ativo: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return user;
  }

  async criar(dto: CriarUserDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // e-mail duplicado no tenant
    const existente = await this.prisma.db.user.findFirst({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existente) {
      throw new ConflictException('Já existe um usuário com este e-mail neste tenant.');
    }

    const senhaHash = hashSenha(dto.senhaProvisoria);

    const user = await this.prisma.db.user.create({
      data: {
        tenantId,
        nome: dto.nome,
        email: dto.email,
        role: dto.role as any,
        senhaHash,
        ativo: true,
      },
      select: SAFE_SELECT,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'USER_CRIADO',
        entidade: 'users',
        entidadeId: user.id,
        dados: { nome: user.nome, role: user.role },
      },
    });

    return user;
  }

  async atualizar(id: string, dto: AtualizarUserDto, solicitanteId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(id); // garante pertence ao tenant via RLS

    // Impede auto-bloqueio: o usuário não pode alterar seu próprio role/ativo
    if (solicitanteId && solicitanteId === id) {
      if (dto.role !== undefined || dto.ativo !== undefined) {
        throw new BadRequestException(
          'Você não pode alterar seu próprio role ou status ativo.',
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    if (dto.secretariaId !== undefined) data.secretariaId = dto.secretariaId;

    const atualizado = await this.prisma.db.user.update({
      where: { id },
      data: data as any,
      select: SAFE_SELECT,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: solicitanteId ?? null,
        acao: 'USER_ATUALIZADO',
        entidade: 'users',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizado;
  }

  /** Soft delete: desativa o usuário (não pode desativar a si mesmo). */
  async desativar(id: string, solicitanteId?: string) {
    const tenantId = TenantContext.tenantId()!;

    if (solicitanteId && solicitanteId === id) {
      throw new BadRequestException('Você não pode desativar sua própria conta.');
    }

    await this.buscar(id); // garante pertence ao tenant via RLS

    await this.prisma.db.user.update({
      where: { id },
      data: { ativo: false },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: solicitanteId ?? null,
        acao: 'USER_DESATIVADO',
        entidade: 'users',
        entidadeId: id,
        dados: {},
      },
    });

    return { desativado: true };
  }
}
