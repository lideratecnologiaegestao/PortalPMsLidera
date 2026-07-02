import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AtualizarHinoEstadualDto } from './hinos-estaduais.dto';

/**
 * Editor da base GLOBAL de hinos estaduais (símbolos oficiais). A tabela não é
 * tenant-scoped: alterações valem para TODAS as entidades da plataforma.
 */
@Injectable()
export class HinosEstaduaisService {
  constructor(private readonly prisma: PrismaService) {}

  /** Lista os 27 (uf, título, autores, oficial e se tem letra). */
  listar() {
    return this.prisma.db.hinoEstadual.findMany({ orderBy: { uf: 'asc' } });
  }

  async atualizar(uf: string, dto: AtualizarHinoEstadualDto) {
    const u = (uf || '').toUpperCase();
    const atual = await this.prisma.db.hinoEstadual.findUnique({ where: { uf: u } });
    if (!atual) throw new NotFoundException('UF não encontrada.');
    const data: Record<string, unknown> = {};
    if (dto.titulo !== undefined) data.titulo = dto.titulo.trim() || atual.titulo;
    if (dto.autores !== undefined) data.autores = dto.autores.trim() || null;
    if (dto.letra !== undefined) data.letra = dto.letra.trim() || null;
    if (dto.fonte !== undefined) data.fonte = dto.fonte.trim() || null;
    if (dto.oficial !== undefined) data.oficial = dto.oficial;
    return this.prisma.db.hinoEstadual.update({ where: { uf: u }, data });
  }
}
