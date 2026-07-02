import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AtualizarDiarioConfigDto } from './diario-config.dto';

/** Config efetiva de layout do PDF do Diário. */
export interface DiarioConfigView {
  colunas: number;
  cabecalhoAtivo: boolean;
  rodapeAtivo: boolean;
  incluirHinos: boolean;
  endereco: string | null;
  horarioAtendimento: string | null;
  telefone: string | null;
}

const PADRAO: DiarioConfigView = {
  colunas: 2,
  cabecalhoAtivo: true,
  rodapeAtivo: true,
  incluirHinos: true,
  endereco: null,
  horarioAtendimento: null,
  telefone: null,
};

function mapear(row: any | null): DiarioConfigView {
  if (!row) return { ...PADRAO };
  return {
    colunas: row.colunas === 1 ? 1 : 2,
    cabecalhoAtivo: row.cabecalhoAtivo,
    rodapeAtivo: row.rodapeAtivo,
    incluirHinos: row.incluirHinos,
    endereco: row.endereco ?? null,
    horarioAtendimento: row.horarioAtendimento ?? null,
    telefone: row.telefone ?? null,
  };
}

@Injectable()
export class DiarioConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private tenantId(): string {
    const id = TenantContext.tenantId();
    if (!id) throw new BadRequestException('Tenant não resolvido.');
    return id;
  }

  /** Config do tenant corrente (via RLS); default se não houver linha. */
  async obter(): Promise<DiarioConfigView> {
    return mapear(await this.prisma.db.diarioConfig.findFirst());
  }

  /** Config de um tenant específico (p/ o worker, que já roda em TenantContext). */
  async paraTenant(tenantId: string): Promise<DiarioConfigView> {
    return mapear(await TenantContext.run({ tenantId }, () => this.prisma.db.diarioConfig.findFirst()));
  }

  async atualizar(dto: AtualizarDiarioConfigDto): Promise<DiarioConfigView> {
    const tenantId = this.tenantId();
    const data: Record<string, unknown> = {};
    if (dto.colunas !== undefined) data.colunas = dto.colunas === 1 ? 1 : 2;
    if (dto.cabecalhoAtivo !== undefined) data.cabecalhoAtivo = dto.cabecalhoAtivo;
    if (dto.rodapeAtivo !== undefined) data.rodapeAtivo = dto.rodapeAtivo;
    if (dto.incluirHinos !== undefined) data.incluirHinos = dto.incluirHinos;
    if (dto.endereco !== undefined) data.endereco = dto.endereco.trim() || null;
    if (dto.horarioAtendimento !== undefined) data.horarioAtendimento = dto.horarioAtendimento.trim() || null;
    if (dto.telefone !== undefined) data.telefone = dto.telefone.trim() || null;
    await this.prisma.db.diarioConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...data },
      update: data,
    });
    return this.obter();
  }

  /** Hino oficial do estado (global) pela UF; null se não houver oficial com letra. */
  async hinoDoEstado(uf: string | null | undefined): Promise<{ titulo: string; autores: string | null; letra: string } | null> {
    if (!uf) return null;
    const row = await this.prisma.db.hinoEstadual.findUnique({ where: { uf: uf.toUpperCase() } });
    if (!row || !row.oficial || !row.letra) return null;
    return { titulo: row.titulo, autores: row.autores ?? null, letra: row.letra };
  }
}
