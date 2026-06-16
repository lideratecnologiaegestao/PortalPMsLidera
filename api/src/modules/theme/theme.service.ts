import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { validateThemeColors, WcagReport } from './contrast.util';
import { listarTemplates, buscarTemplate } from './theme-templates';

const TTL_THEME = 600; // segundos (ADR-0001)

const hex = z.string().regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'cor hex inválida');

// Aceita URL absoluta (https://…) OU caminho relativo à raiz (ex.: a URL
// mascarada da Biblioteca de Mídia: /midia/imagem/brasoes/<hash>.png). O
// caminho relativo é o correto no multi-tenant (same-origin, sem cravar o
// domínio da prefeitura). `^\/[^/]` impede `//host` (carregaria origem externa).
const urlOuCaminho = z
  .string()
  .refine((s) => /^https?:\/\/.+/.test(s) || /^\/[^/].*/.test(s), {
    message: 'URL inválida — use https://… ou um caminho começando com "/"',
  });

// Contrato dos design tokens (espelha o JSONB em tenant_themes.tokens).
export const themeTokensSchema = z.object({
  colors: z.object({
    primary: hex,
    primaryFg: hex,
    secondary: hex,
    secondaryFg: hex,
    accent: hex,
    bg: hex,
    fg: hex,
    muted: hex,
    border: hex,
    success: hex,
    warning: hex,
    danger: hex,
  }),
  fonts: z.object({ sans: z.string(), heading: z.string() }),
  radius: z.object({ base: z.string() }),
  logo: z.object({ url: urlOuCaminho, alt: z.string() }),
  logoRodape: z.object({ url: urlOuCaminho, alt: z.string() }).optional(),
  logoRelatorio: z.object({ url: urlOuCaminho, alt: z.string() }).optional(),
  logoTamanho: z.enum(['pequeno', 'medio', 'grande', 'enorme']).default('medio'),
  logoRodapeTamanho: z.enum(['pequeno', 'medio', 'grande', 'enorme']).default('medio'),
  rodapeMostrarTexto: z.boolean().default(true),
  rodapeTextoPosicao: z.enum(['abaixo', 'lateral']).default('abaixo'),
  rodapeTitulo: z.string().max(120).optional(),
  rodapeDescricao: z.string().max(300).optional(),
  favicon: urlOuCaminho,
  iconSet: z.string().default('lucide'),
});

export type ThemeTokens = z.infer<typeof themeTokensSchema>;

export const DEFAULT_TOKENS: ThemeTokens = {
  colors: {
    primary: '#1351B4', // azul institucional (base gov.br)
    primaryFg: '#FFFFFF',
    secondary: '#FFCD07',
    secondaryFg: '#0B2A4A',
    accent: '#168821',
    bg: '#FFFFFF',
    fg: '#1B1B1B',
    muted: '#F0F0F0',
    border: '#CCCCCC',
    success: '#168821',
    warning: '#FFCD07',
    danger: '#E52207',
  },
  fonts: { sans: 'Rawline, system-ui, sans-serif', heading: 'Rawline, sans-serif' },
  radius: { base: '0.5rem' },
  logo: { url: 'https://cdn.exemplo.br/logo.svg', alt: 'Brasão do município' },
  logoTamanho: 'medio',
  logoRodapeTamanho: 'medio',
  rodapeMostrarTexto: true,
  rodapeTextoPosicao: 'abaixo',
  favicon: 'https://cdn.exemplo.br/favicon.ico',
  iconSet: 'lucide',
};

@Injectable()
export class ThemeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
  ) {}

  private cacheKey(): string {
    return `theme:${TenantContext.tenantId() ?? 'default'}`;
  }

  /** Tema do tenant atual (do contexto RLS). Cai no default se não houver.
   * Inclui `portal` (nome/uf do município) para o cabeçalho/rodapé da home. */
  async getTokens(): Promise<{
    tokens: ThemeTokens;
    wcag: WcagReport;
    portal: { nome: string; uf: string };
  }> {
    const key = this.cacheKey();
    const cached = await this.cache.get<{
      tokens: ThemeTokens;
      wcag: WcagReport;
      portal: { nome: string; uf: string };
    }>(key);
    if (cached) return cached;

    const ctx = await this.prisma.db.tenantTheme.findFirst();
    const tokens = ctx ? (ctx.tokens as ThemeTokens) : DEFAULT_TOKENS;

    // Identidade do município (tabela-registro tenants) para o portal público.
    const tid = TenantContext.tenantId();
    let portal = { nome: 'Portal do Cidadão', uf: '' };
    if (tid) {
      const t = await this.prisma
        .platform()
        .tenant.findUnique({ where: { id: tid }, select: { nome: true, uf: true } });
      if (t) portal = { nome: t.nome, uf: t.uf };
    }

    const result = { tokens, wcag: validateThemeColors(tokens.colors), portal };
    await this.cache.set(key, result, TTL_THEME);
    return result;
  }

  /**
   * Salva o tema. Rejeita se o contraste não atingir o mínimo WCAG AA —
   * acessibilidade é requisito legal, então a validação é bloqueante.
   */
  async saveTokens(input: unknown) {
    const parsed = themeTokensSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const wcag = validateThemeColors(parsed.data.colors);
    if (!wcag.ok) {
      throw new BadRequestException({
        message: 'Tema reprovado na acessibilidade (contraste WCAG AA).',
        wcag,
      });
    }
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant não resolvido — salve no domínio da prefeitura.');
    }
    await this.prisma.db.tenantTheme.upsert({
      where: { tenantId },
      create: { tenantId, tokens: parsed.data, wcagOk: true, wcagRelatorio: wcag } as any,
      update: { tokens: parsed.data, wcagOk: true, wcagRelatorio: wcag } as any,
    });
    await this.cache.del(this.cacheKey()); // invalida o tema cacheado
    return { ok: true, wcag };
  }

  /**
   * Valida os tokens SEM persistir. Reusa a mesma lógica Zod + WCAG do
   * saveTokens. Retorna { wcagOk, relatorio } para a UI mostrar preview.
   */
  previewTokens(input: unknown): { wcagOk: boolean; relatorio: WcagReport; erros?: unknown } {
    const parsed = themeTokensSchema.safeParse(input);
    if (!parsed.success) {
      return { wcagOk: false, relatorio: { ok: false, checks: [] }, erros: parsed.error.flatten() };
    }
    const relatorio = validateThemeColors(parsed.data.colors);
    return { wcagOk: relatorio.ok, relatorio };
  }

  // --------------------------------------------------------- templates de tema

  /** Lista os presets disponíveis (resumo: id, nome, descricao, cores). */
  listarTemplates() {
    return listarTemplates();
  }

  /**
   * Aplica um preset ao tenant atual.
   * Mescla preservando o logo e favicon ATUAIS do tenant (para não perder
   * identidade visual já configurada). Valida WCAG e persiste.
   * Audita como TEMA_MODELO_APLICADO.
   */
  async aplicarModelo(templateId: string, atorId?: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      throw new BadRequestException('Tenant não resolvido — aplique no domínio da prefeitura.');
    }

    const template = buscarTemplate(templateId);
    if (!template) {
      throw new NotFoundException(`Preset de tema "${templateId}" não encontrado.`);
    }

    // Carrega o tema atual para preservar logo/favicon se já existirem
    const atual = await this.prisma.db.tenantTheme.findFirst();
    const tokenAtual = atual ? (atual.tokens as ThemeTokens) : null;

    const tokens: ThemeTokens = {
      ...template.tokens,
      logo: tokenAtual?.logo ?? template.tokens.logo,
      logoRodape: tokenAtual?.logoRodape ?? template.tokens.logoRodape,
      logoRelatorio: tokenAtual?.logoRelatorio ?? template.tokens.logoRelatorio,
      logoTamanho: tokenAtual?.logoTamanho ?? 'medio',
      logoRodapeTamanho: tokenAtual?.logoRodapeTamanho ?? 'medio',
      rodapeMostrarTexto: tokenAtual?.rodapeMostrarTexto ?? true,
      rodapeTextoPosicao: tokenAtual?.rodapeTextoPosicao ?? 'abaixo',
      rodapeTitulo: tokenAtual?.rodapeTitulo,
      rodapeDescricao: tokenAtual?.rodapeDescricao,
      favicon: tokenAtual?.favicon ?? template.tokens.favicon,
    };

    // Valida WCAG (bloqueante — acessibilidade é requisito legal)
    const wcag = validateThemeColors(tokens.colors);
    if (!wcag.ok) {
      throw new BadRequestException({
        message: 'Preset reprovado na acessibilidade (contraste WCAG AA).',
        wcag,
      });
    }

    await this.prisma.db.tenantTheme.upsert({
      where: { tenantId },
      create: { tenantId, tokens, wcagOk: true, wcagRelatorio: wcag } as any,
      update: { tokens, wcagOk: true, wcagRelatorio: wcag } as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'TEMA_MODELO_APLICADO',
        entidade: 'tenant_themes',
        entidadeId: tenantId,
        dados: { templateId, nome: template.nome },
      },
    });

    await this.cache.del(this.cacheKey());
    return { ok: true, wcag };
  }

  /**
   * Aplica um preset em modo plataforma (cross-tenant), usado pelo provisioning.
   * Não usa TenantContext — recebe o tenantId explicitamente.
   */
  async aplicarModeloParaTenant(tenantId: string, templateId: string): Promise<void> {
    const template = buscarTemplate(templateId);
    if (!template) return;

    const tokens: ThemeTokens = { ...template.tokens };
    const wcag = validateThemeColors(tokens.colors);
    if (!wcag.ok) return; // presets devem sempre passar — se falhar, ignora silenciosamente

    await this.prisma.platform().tenantTheme.upsert({
      where: { tenantId },
      create: { tenantId, tokens, wcagOk: true, wcagRelatorio: wcag } as any,
      update: { tokens, wcagOk: true, wcagRelatorio: wcag } as any,
    });
  }

  /** Gera o CSS de :root com as custom properties (consumido pelo Next.js). */
  toCssVariables(tokens: ThemeTokens): string {
    const c = tokens.colors;
    const vars = [
      `--color-primary:${c.primary}`,
      `--color-primary-fg:${c.primaryFg}`,
      `--color-secondary:${c.secondary}`,
      `--color-secondary-fg:${c.secondaryFg}`,
      `--color-accent:${c.accent}`,
      `--color-bg:${c.bg}`,
      `--color-fg:${c.fg}`,
      `--color-muted:${c.muted}`,
      `--color-border:${c.border}`,
      `--color-success:${c.success}`,
      `--color-warning:${c.warning}`,
      `--color-danger:${c.danger}`,
      `--font-sans:${tokens.fonts.sans}`,
      `--font-heading:${tokens.fonts.heading}`,
      `--radius-base:${tokens.radius.base}`,
    ];
    return `:root{${vars.join(';')}}`;
  }
}
