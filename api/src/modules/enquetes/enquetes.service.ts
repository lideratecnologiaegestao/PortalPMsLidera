import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

export interface EnqueteDto {
  pergunta: string;
  opcoes?: string[];
}

const SALT = process.env.ENQUETE_SALT ?? process.env.DIARIO_SIGNING_KEY ?? 'enquete-salt';

@Injectable()
export class EnquetesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hash anônimo do votante (IP+UA+enquete+segredo). Não guarda dado pessoal. */
  private hashVotante(ip: string, ua: string, enqueteId: string): string {
    return createHash('sha256').update(`${ip}|${ua}|${enqueteId}|${SALT}`).digest('hex');
  }

  // ---------------------------------------------------------------- público
  /** Enquete ativa (ou null) com resultado parcial e se este visitante votou. */
  async getAtiva(ip: string, ua: string) {
    const enq = await this.prisma.db.enquete.findFirst({ where: { ativa: true } });
    if (!enq) return null;
    return this.resultado(enq.id, this.hashVotante(ip, ua, enq.id));
  }

  /** Enquete por id (para o shortcode no slider). */
  async getPublica(id: string, ip: string, ua: string) {
    const enq = await this.prisma.db.enquete.findUnique({ where: { id } });
    if (!enq) throw new NotFoundException('Enquete não encontrada.');
    return this.resultado(id, this.hashVotante(ip, ua, id));
  }

  async votar(id: string, opcaoId: string, ip: string, ua: string) {
    const tenantId = TenantContext.tenantId()!;
    const hash = this.hashVotante(ip, ua, id);
    await this.prisma.tx(async (t) => {
      const enq = await t.enquete.findUnique({ where: { id } });
      if (!enq) throw new NotFoundException('Enquete não encontrada.');
      if (enq.encerrada) throw new BadRequestException('Esta enquete está encerrada.');
      const opcao = await t.enqueteOpcao.findFirst({ where: { id: opcaoId, enqueteId: id } });
      if (!opcao) throw new BadRequestException('Opção inválida.');
      try {
        await t.enqueteVoto.create({ data: { tenantId, enqueteId: id, opcaoId, votanteHash: hash } });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
          throw new ConflictException('Você já votou nesta enquete.');
        }
        throw e;
      }
      await t.enqueteOpcao.update({ where: { id: opcaoId }, data: { votos: { increment: 1 } } });
    });
    return this.resultado(id, hash);
  }

  /** Monta o resultado (total, %, jaVotou) de uma enquete. */
  private async resultado(id: string, hash: string) {
    const enq = await this.prisma.db.enquete.findUnique({
      where: { id },
      include: { opcoes: { orderBy: { ordem: 'asc' } } },
    });
    if (!enq) throw new NotFoundException('Enquete não encontrada.');
    const total = enq.opcoes.reduce((s, o) => s + o.votos, 0);
    const jaVotou = (await this.prisma.db.enqueteVoto.count({ where: { enqueteId: id, votanteHash: hash } })) > 0;
    return {
      id: enq.id,
      pergunta: enq.pergunta,
      ativa: enq.ativa,
      encerrada: enq.encerrada,
      total,
      jaVotou,
      opcoes: enq.opcoes.map((o) => ({
        id: o.id,
        texto: o.texto,
        votos: o.votos,
        pct: total ? Math.round((o.votos / total) * 100) : 0,
      })),
    };
  }

  // ---------------------------------------------------------------- admin
  listar() {
    return this.prisma.db.enquete.findMany({
      orderBy: { criadoEm: 'desc' },
      include: { opcoes: { orderBy: { ordem: 'asc' } }, _count: { select: { votos: true } } },
    });
  }

  async buscar(id: string) {
    const e = await this.prisma.db.enquete.findUnique({
      where: { id }, include: { opcoes: { orderBy: { ordem: 'asc' } } },
    });
    if (!e) throw new NotFoundException('Enquete não encontrada.');
    return e;
  }

  async criar(dto: EnqueteDto) {
    const tenantId = TenantContext.tenantId()!;
    const opcoes = (dto.opcoes ?? []).map((t) => t.trim()).filter(Boolean);
    if (!dto.pergunta?.trim()) throw new BadRequestException('Informe a pergunta.');
    if (opcoes.length < 2) throw new BadRequestException('Informe ao menos 2 opções.');
    return this.prisma.db.enquete.create({
      data: {
        tenantId,
        pergunta: dto.pergunta.trim(),
        opcoes: { create: opcoes.map((texto, i) => ({ tenantId, texto, ordem: i })) },
      },
      include: { opcoes: true },
    });
  }

  /** Atualiza a pergunta e, se enviado, RECRIA as opções (zera votos). */
  async atualizar(id: string, dto: EnqueteDto) {
    const tenantId = TenantContext.tenantId()!;
    await this.buscar(id);
    const data: Record<string, unknown> = {};
    if (dto.pergunta !== undefined) data.pergunta = dto.pergunta.trim();
    if (dto.opcoes) {
      const opcoes = dto.opcoes.map((t) => t.trim()).filter(Boolean);
      if (opcoes.length < 2) throw new BadRequestException('Informe ao menos 2 opções.');
      await this.prisma.db.enqueteOpcao.deleteMany({ where: { enqueteId: id } });
      data.opcoes = { create: opcoes.map((texto, i) => ({ tenantId, texto, ordem: i })) };
    }
    return this.prisma.db.enquete.update({ where: { id }, data, include: { opcoes: true } });
  }

  /** Ativa esta enquete (e desativa as demais — só uma ativa por vez). */
  async ativar(id: string) {
    await this.buscar(id);
    await this.prisma.db.enquete.updateMany({ data: { ativa: false }, where: { ativa: true } });
    return this.prisma.db.enquete.update({ where: { id }, data: { ativa: true, encerrada: false } });
  }

  async encerrar(id: string) {
    await this.buscar(id);
    return this.prisma.db.enquete.update({ where: { id }, data: { ativa: false, encerrada: true } });
  }

  async excluir(id: string) {
    await this.buscar(id);
    await this.prisma.db.enquete.delete({ where: { id } });
    return { excluido: true };
  }
}
