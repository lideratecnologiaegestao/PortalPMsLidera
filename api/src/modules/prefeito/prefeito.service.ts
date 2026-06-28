import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { CriarPrefeitoDto, AtualizarPrefeitoDto } from './prefeito.dto';

/** Rótulo do menu/página conforme o gênero do titular atual. */
function labelTitular(genero?: string | null): string {
  if (genero === 'feminino') return 'A Prefeita';
  if (genero === 'masculino') return 'O Prefeito';
  return 'O Prefeito(a)';
}

@Injectable()
export class PrefeitoService {
  private readonly logger = new Logger(PrefeitoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
  ) {}

  // ---------------------------------------------------------------- público
  /** Titular atual + vice atual + galeria de ex-prefeitos. */
  async listarPublico() {
    const [prefeito, vice, anteriores] = await Promise.all([
      this.prisma.db.prefeito.findFirst({
        where: { tipo: 'prefeito', atual: true, ativo: true },
        orderBy: { mandatoInicio: 'desc' },
      }),
      this.prisma.db.prefeito.findFirst({
        where: { tipo: 'vice', atual: true, ativo: true },
        orderBy: { mandatoInicio: 'desc' },
      }),
      this.prisma.db.prefeito.findMany({
        where: { tipo: 'prefeito', atual: false, ativo: true },
        orderBy: [{ mandatoInicio: 'desc' }, { ordem: 'asc' }],
      }),
    ]);
    return { prefeito, vice, anteriores };
  }

  // ----------------------------------------------------------------- admin
  listarAdmin() {
    return this.prisma.db.prefeito.findMany({
      orderBy: [{ atual: 'desc' }, { tipo: 'asc' }, { mandatoInicio: 'desc' }],
    });
  }

  async buscar(id: string) {
    const p = await this.prisma.db.prefeito.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Registro não encontrado.');
    return p;
  }

  async criar(dto: CriarPrefeitoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    if (!dto.nome?.trim()) throw new BadRequestException('Informe o nome.');
    const tipo = dto.tipo === 'vice' ? 'vice' : 'prefeito';
    if (dto.atual) await this.desmarcarAtuais(tipo);
    const p = await this.prisma.db.prefeito.create({
      data: this.montar(tenantId, tipo, dto),
    });
    await this.auditar('PREFEITO_CRIADO', p.id, { nome: p.nome, tipo: p.tipo }, atorId);
    await this.sincronizarMenu();
    return p;
  }

  async atualizar(id: string, dto: AtualizarPrefeitoDto, atorId?: string) {
    const atual = await this.buscar(id);
    const tipo = dto.tipo ? (dto.tipo === 'vice' ? 'vice' : 'prefeito') : atual.tipo;
    if (dto.atual) await this.desmarcarAtuais(tipo, id);

    const data: Record<string, unknown> = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.tipo !== undefined) data.tipo = tipo;
    if (dto.genero !== undefined) data.genero = dto.genero === 'feminino' ? 'feminino' : 'masculino';
    if (dto.partido !== undefined) data.partido = dto.partido?.trim() || null;
    if (dto.fotoUrl !== undefined) data.fotoUrl = dto.fotoUrl?.trim() || null;
    if (dto.mandatoInicio !== undefined) data.mandatoInicio = dto.mandatoInicio ?? null;
    if (dto.mandatoFim !== undefined) data.mandatoFim = dto.mandatoFim ?? null;
    if (dto.atual !== undefined) data.atual = dto.atual;
    if (dto.resumo !== undefined) data.resumo = dto.resumo?.trim() || null;
    if (dto.historia !== undefined) data.historia = dto.historia?.trim() || null;
    if (dto.email !== undefined) data.email = dto.email?.trim() || null;
    if (dto.telefone !== undefined) data.telefone = dto.telefone?.trim() || null;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const p = await this.prisma.db.prefeito.update({ where: { id }, data });
    await this.auditar('PREFEITO_ATUALIZADO', id, { campos: Object.keys(data) }, atorId);
    await this.sincronizarMenu();
    return p;
  }

  async excluir(id: string, atorId?: string) {
    const p = await this.buscar(id);
    await this.prisma.db.prefeito.delete({ where: { id } });
    await this.auditar('PREFEITO_EXCLUIDO', id, { nome: p.nome, tipo: p.tipo }, atorId);
    await this.sincronizarMenu();
    return { excluido: true };
  }

  // --------------------------------------------------------------- helpers
  private montar(tenantId: string, tipo: string, dto: CriarPrefeitoDto) {
    return {
      tenantId, tipo, nome: dto.nome.trim(),
      genero: dto.genero === 'feminino' ? 'feminino' : 'masculino',
      partido: dto.partido?.trim() || null, fotoUrl: dto.fotoUrl?.trim() || null,
      mandatoInicio: dto.mandatoInicio ?? null, mandatoFim: dto.mandatoFim ?? null,
      atual: dto.atual ?? false, resumo: dto.resumo?.trim() || null,
      historia: dto.historia?.trim() || null, email: dto.email?.trim() || null,
      telefone: dto.telefone?.trim() || null, ordem: dto.ordem ?? 0, ativo: dto.ativo ?? true,
    };
  }

  /** Garante um único titular "atual" por tipo. */
  private async desmarcarAtuais(tipo: string, exceto?: string) {
    await this.prisma.db.prefeito.updateMany({
      where: { tipo, atual: true, ...(exceto ? { NOT: { id: exceto } } : {}) },
      data: { atual: false },
    });
  }

  /** Mantém o item de menu "A Prefeitura → O Prefeito(a)" com o rótulo do gênero. */
  private async sincronizarMenu() {
    const titular = await this.prisma.db.prefeito.findFirst({
      where: { tipo: 'prefeito', atual: true, ativo: true }, select: { genero: true },
    });
    try {
      await this.menus.sincronizarPrefeito(labelTitular(titular?.genero));
    } catch (err) {
      this.logger.warn(`Falha ao sincronizar menu do prefeito: ${(err as Error).message}`);
    }
  }

  private async auditar(acao: string, entidadeId: string, dados: unknown, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: atorId ?? null, acao, entidade: 'prefeitos', entidadeId, dados: dados as object },
    }).catch(() => undefined);
  }
}
