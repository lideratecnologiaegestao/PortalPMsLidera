import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

export interface ConfigHomeDto {
  arColunas?: number;
  arCardsLinha?: number;
  arLadoCards?: string;
  cardIconeForma?: string;
  cardCorDestaque?: string | null;
  sliderTipo?: string;
  sliderImagem?: string | null;
  sliderLink?: string | null;
  sliderHtml?: string | null;
  sliderVideo?: string | null;
  sliderYoutube?: string | null;
  sliderEnqueteId?: string | null;
  googleAnalyticsId?: string | null;
  ogImageUrl?: string | null;
  modoManutencao?: boolean;
  manutencaoMensagem?: string | null;
}

export interface AtalhoDto {
  label: string;
  descricao?: string;
  href: string;
  icone?: string;
  ordem?: number;
  ativo?: boolean;
}

const LADOS = ['esquerda', 'direita'];
const FORMAS = ['circulo', 'quadrado'];
const SLIDER_TIPOS = ['imagem', 'html', 'video', 'youtube', 'enquete'];

function configPadrao(tenantId: string) {
  return {
    tenantId,
    arColunas: 1,
    arCardsLinha: 4,
    arLadoCards: 'esquerda',
    cardIconeForma: 'circulo',
    cardCorDestaque: null as string | null,
    sliderTipo: 'imagem',
    sliderImagem: null, sliderLink: null, sliderHtml: null,
    sliderVideo: null, sliderYoutube: null, sliderEnqueteId: null,
    googleAnalyticsId: null, ogImageUrl: null, modoManutencao: false, manutencaoMensagem: null,
  };
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Config + atalhos ativos (consumo público da home). */
  async getPublico() {
    const tenantId = TenantContext.tenantId()!;
    const [config, atalhos] = await Promise.all([
      this.prisma.db.homeConfig.findUnique({ where: { tenantId } }),
      this.prisma.db.homeAtalho.findMany({ where: { ativo: true }, orderBy: { ordem: 'asc' } }),
    ]);
    return { config: config ?? configPadrao(tenantId), atalhos };
  }

  // ---------------------------------------------------------------- admin
  async getConfigAdmin() {
    const tenantId = TenantContext.tenantId()!;
    const config = await this.prisma.db.homeConfig.findUnique({ where: { tenantId } });
    return config ?? configPadrao(tenantId);
  }

  async salvarConfig(dto: ConfigHomeDto) {
    const tenantId = TenantContext.tenantId()!;
    const data = {
      arColunas: dto.arColunas === 2 ? 2 : 1,
      arCardsLinha: Math.min(6, Math.max(4, Number(dto.arCardsLinha ?? 4))),
      arLadoCards: LADOS.includes(dto.arLadoCards ?? '') ? dto.arLadoCards! : 'esquerda',
      cardIconeForma: FORMAS.includes(dto.cardIconeForma ?? '') ? dto.cardIconeForma! : 'circulo',
      cardCorDestaque: dto.cardCorDestaque?.trim() || null,
      sliderTipo: SLIDER_TIPOS.includes(dto.sliderTipo ?? '') ? dto.sliderTipo! : 'imagem',
      sliderImagem: dto.sliderImagem?.trim() || null,
      sliderLink: dto.sliderLink?.trim() || null,
      sliderHtml: dto.sliderHtml ?? null,
      sliderVideo: dto.sliderVideo?.trim() || null,
      sliderYoutube: dto.sliderYoutube?.trim() || null,
      sliderEnqueteId: dto.sliderEnqueteId?.trim() || null,
      googleAnalyticsId: dto.googleAnalyticsId?.trim() || null,
      ogImageUrl: dto.ogImageUrl?.trim() || null,
      modoManutencao: dto.modoManutencao ?? false,
      manutencaoMensagem: dto.manutencaoMensagem?.trim() || null,
    };
    return this.prisma.db.homeConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
  }

  listarAtalhos() {
    return this.prisma.db.homeAtalho.findMany({ orderBy: { ordem: 'asc' } });
  }

  criarAtalho(dto: AtalhoDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.homeAtalho.create({
      data: {
        tenantId,
        label: dto.label.trim(),
        descricao: dto.descricao?.trim() || null,
        href: dto.href.trim(),
        icone: dto.icone?.trim() || 'link',
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });
  }

  async atualizarAtalho(id: string, dto: AtalhoDto) {
    await this.acharAtalho(id);
    const data: Record<string, unknown> = {};
    if (dto.label !== undefined) data.label = dto.label.trim();
    if (dto.descricao !== undefined) data.descricao = dto.descricao?.trim() || null;
    if (dto.href !== undefined) data.href = dto.href.trim();
    if (dto.icone !== undefined) data.icone = dto.icone?.trim() || 'link';
    if (dto.ordem !== undefined) data.ordem = dto.ordem ?? 0;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    return this.prisma.db.homeAtalho.update({ where: { id }, data });
  }

  async excluirAtalho(id: string) {
    await this.acharAtalho(id);
    await this.prisma.db.homeAtalho.delete({ where: { id } });
    return { excluido: true };
  }

  private async acharAtalho(id: string) {
    const a = await this.prisma.db.homeAtalho.findUnique({ where: { id } });
    if (!a) throw new NotFoundException('Atalho não encontrado.');
    return a;
  }
}
