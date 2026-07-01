import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { BuscaSyncService } from '../busca/busca-sync.service';
import { SalvarPoliticaDto } from './politicas.dto';

export const TIPOS_POLITICA = ['acessibilidade', 'privacidade', 'cookies', 'termos'] as const;
export type TipoPolitica = (typeof TIPOS_POLITICA)[number];

function validarTipo(tipo: string): TipoPolitica {
  if (!(TIPOS_POLITICA as readonly string[]).includes(tipo)) {
    throw new NotFoundException('Documento legal inexistente.');
  }
  return tipo as TipoPolitica;
}

@Injectable()
export class PoliticasService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly busca: BuscaSyncService,
  ) {}

  /** Conteúdo público (null se vazio/inexistente). */
  async obterPublico(tipoRaw: string) {
    const tipo = validarTipo(tipoRaw);
    const d = await this.prisma.db.documentoLegal.findUnique({ where: { tenantId_tipo: { tenantId: this.tid(), tipo } } });
    if (!d || !d.conteudo?.trim()) return null;
    return { tipo: d.tipo, titulo: d.titulo, conteudo: d.conteudo, formato: d.formato, versao: d.versao, atualizadoEm: d.atualizadoEm };
  }

  /** Registro para o admin (sempre um objeto). */
  async obterAdmin(tipoRaw: string) {
    const tipo = validarTipo(tipoRaw);
    const d = await this.prisma.db.documentoLegal.findUnique({ where: { tenantId_tipo: { tenantId: this.tid(), tipo } } });
    return d ?? { tipo, titulo: '', conteudo: '', formato: 'html', versao: 0, atualizadoEm: null };
  }

  /** Salva uma nova versão (snapshot) e atualiza a vigente. */
  async salvar(tipoRaw: string, dto: SalvarPoliticaDto, atorId?: string) {
    const tipo = validarTipo(tipoRaw);
    const tenantId = this.tid();
    const atual = await this.prisma.db.documentoLegal.findUnique({ where: { tenantId_tipo: { tenantId, tipo } } });
    const versao = (atual?.versao ?? 0) + 1;
    const conteudo = dto.conteudo ?? '';
    const titulo = dto.titulo?.trim() || null;
    const formato = dto.formato === 'md' ? 'md' : 'html';

    // snapshot da versão recém-salva (histórico completo)
    await this.prisma.db.documentoLegalVersao.create({
      data: { tenantId, tipo, versao, titulo, conteudo, formato, criadoPor: atorId ?? null },
    });

    const doc = await this.prisma.db.documentoLegal.upsert({
      where: { tenantId_tipo: { tenantId, tipo } },
      update: { titulo, conteudo, formato, versao },
      create: { tenantId, tipo, titulo, conteudo, formato, versao },
    });

    await this.audit('POLITICA_SALVA', tipo, { versao }, atorId);
    this.busca.enqueue('politica', tipo).catch(() => undefined);
    return doc;
  }

  /** Lista as versões (metadados) mais recentes. */
  async listarVersoes(tipoRaw: string) {
    const tipo = validarTipo(tipoRaw);
    return this.prisma.db.documentoLegalVersao.findMany({
      where: { tipo }, orderBy: { versao: 'desc' }, take: 50,
      select: { id: true, versao: true, titulo: true, formato: true, criadoPor: true, criadoEm: true },
    });
  }

  /** Conteúdo completo de uma versão. */
  async obterVersao(id: string) {
    const v = await this.prisma.db.documentoLegalVersao.findUnique({ where: { id } });
    if (!v) throw new NotFoundException('Versão não encontrada.');
    return v;
  }

  /** Restaura uma versão (cria uma nova versão vigente com o conteúdo dela). */
  async restaurar(tipoRaw: string, versaoId: string, atorId?: string) {
    const tipo = validarTipo(tipoRaw);
    const v = await this.obterVersao(versaoId);
    if (v.tipo !== tipo) throw new BadRequestException('Versão não pertence a este documento.');
    const doc = await this.salvar(tipo, { titulo: v.titulo ?? undefined, conteudo: v.conteudo, formato: v.formato }, atorId);
    await this.audit('POLITICA_RESTAURADA', tipo, { deVersao: v.versao, novaVersao: doc.versao }, atorId);
    return doc;
  }

  // -------------------------------------------------------------- helpers
  private tid() { return TenantContext.tenantId()!; }
  private async audit(acao: string, tipo: string, dados: unknown, atorId?: string) {
    await this.prisma.db.auditLog.create({
      data: { tenantId: this.tid(), atorId: atorId ?? null, acao, entidade: 'documentos_legais', entidadeId: tipo, dados: dados as object },
    }).catch(() => undefined);
  }
}
