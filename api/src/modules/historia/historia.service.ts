import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { SalvarHistoriaDto } from './historia.dto';

@Injectable()
export class HistoriaService {
  private readonly logger = new Logger(HistoriaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
  ) {}

  /** Conteúdo público (ou null se nunca cadastrado / vazio). */
  async obterPublico() {
    const h = await this.prisma.db.historiaMunicipio.findFirst();
    if (!h || !h.conteudo?.trim()) return null;
    return { titulo: h.titulo, conteudo: h.conteudo, formato: h.formato, imagemUrl: h.imagemUrl, atualizadoEm: h.atualizadoEm };
  }

  /** Registro para o admin (sempre retorna um objeto, mesmo vazio). */
  async obterAdmin() {
    const h = await this.prisma.db.historiaMunicipio.findFirst();
    return h ?? { titulo: '', conteudo: '', formato: 'html', imagemUrl: null, atualizadoEm: null };
  }

  async salvar(dto: SalvarHistoriaDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data = {
      titulo: dto.titulo?.trim() || null,
      conteudo: dto.conteudo ?? '',
      formato: dto.formato === 'md' ? 'md' : 'html',
      imagemUrl: dto.imagemUrl?.trim() || null,
    };
    const h = await this.prisma.db.historiaMunicipio.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: atorId ?? null, acao: 'HISTORIA_SALVA', entidade: 'historia_municipio', entidadeId: tenantId, dados: { formato: data.formato } },
    }).catch(() => undefined);

    // Garante o item de menu "A Prefeitura → História do Município".
    try { await this.menus.sincronizarHistoria(); }
    catch (err) { this.logger.warn(`Falha ao sincronizar menu da história: ${(err as Error).message}`); }

    return h;
  }
}
