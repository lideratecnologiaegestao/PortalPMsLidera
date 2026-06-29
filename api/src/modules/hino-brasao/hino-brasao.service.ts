import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { MenusService } from '../menus/menus.service';
import { BuscaSyncService } from '../busca/busca-sync.service';
import { SalvarHinoBrasaoDto } from './hino-brasao.dto';

/** Normaliza a lista de brasões: só itens com URL, no formato {url, titulo}. */
function normalizarBrasoes(brasoes?: { url: string; titulo?: string }[]) {
  if (!Array.isArray(brasoes)) return [];
  return brasoes
    .filter((b) => b && typeof b.url === 'string' && b.url.trim())
    .map((b) => ({ url: b.url.trim(), titulo: (b.titulo ?? '').toString().trim() || null }));
}

@Injectable()
export class HinoBrasaoService {
  private readonly logger = new Logger(HinoBrasaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly menus: MenusService,
    private readonly busca: BuscaSyncService,
  ) {}

  /** Conteúdo público (null se nada cadastrado). */
  async obterPublico() {
    const h = await this.prisma.db.hinoBrasao.findFirst();
    if (!h) return null;
    const temAlgo = h.hinoTexto?.trim() || h.hinoMidiaUrl?.trim() || h.brasaoHistoria?.trim() || (Array.isArray(h.brasoes) && (h.brasoes as unknown[]).length > 0);
    if (!temAlgo) return null;
    return {
      hinoTexto: h.hinoTexto, hinoMidiaTipo: h.hinoMidiaTipo, hinoMidiaUrl: h.hinoMidiaUrl,
      brasaoHistoria: h.brasaoHistoria, brasoes: h.brasoes,
    };
  }

  /** Registro para o admin (sempre um objeto). */
  async obterAdmin() {
    const h = await this.prisma.db.hinoBrasao.findFirst();
    return h ?? { hinoTexto: '', hinoMidiaTipo: null, hinoMidiaUrl: null, brasaoHistoria: '', brasoes: [] };
  }

  async salvar(dto: SalvarHinoBrasaoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const data = {
      hinoTexto: dto.hinoTexto?.trim() || null,
      hinoMidiaTipo: dto.hinoMidiaTipo && ['audio', 'video', 'youtube'].includes(dto.hinoMidiaTipo) ? dto.hinoMidiaTipo : null,
      hinoMidiaUrl: dto.hinoMidiaUrl?.trim() || null,
      brasaoHistoria: dto.brasaoHistoria?.trim() || null,
      brasoes: normalizarBrasoes(dto.brasoes),
    };
    const h = await this.prisma.db.hinoBrasao.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });

    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: atorId ?? null, acao: 'HINO_BRASAO_SALVO', entidade: 'hino_brasao', entidadeId: tenantId, dados: { brasoes: data.brasoes.length } },
    }).catch(() => undefined);

    try { await this.menus.sincronizarHinoBrasao(); }
    catch (err) { this.logger.warn(`Falha ao sincronizar menu de hino/brasão: ${(err as Error).message}`); }

    this.busca.enqueue('hino_brasao', tenantId).catch(() => undefined);
    return h;
  }
}
