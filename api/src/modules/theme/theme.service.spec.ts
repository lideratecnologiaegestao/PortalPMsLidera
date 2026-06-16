/**
 * Testes unitários para ThemeService — foco nos novos campos de logo
 * (logoRodape, logoRelatorio, logoTamanho) e no comportamento de preservação
 * em aplicarModelo.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ThemeService, themeTokensSchema, DEFAULT_TOKENS, ThemeTokens } from './theme.service';

// ---- mocks ----

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => 'tenant-abc' },
}));

const TOKENS_VALIDOS: ThemeTokens = {
  colors: {
    primary: '#1351B4',
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
  logo: { url: '/midia/imagem/logos/brasao.png', alt: 'Brasão' },
  logoTamanho: 'medio',
  favicon: '/favicon.ico',
  iconSet: 'lucide',
};

const buildPrisma = (tokenAtual?: unknown) => ({
  db: {
    tenantTheme: {
      findFirst: jest.fn().mockResolvedValue(
        tokenAtual !== undefined ? { tokens: tokenAtual } : null,
      ),
      upsert: jest.fn().mockResolvedValue({}),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
  platform: () => ({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({ nome: 'Município', uf: 'MT' }),
    },
  }),
});

const buildCache = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
});

function buildService(tokenAtual?: unknown) {
  const prisma = buildPrisma(tokenAtual) as any;
  const cache = buildCache() as any;
  return { service: new ThemeService(prisma, cache), prisma, cache };
}

// ---- schema ----

describe('themeTokensSchema — novos campos de logo', () => {
  it('aceita tokens sem logoRodape/logoRelatorio (retrocompatibilidade)', () => {
    const r = themeTokensSchema.safeParse(TOKENS_VALIDOS);
    expect(r.success).toBe(true);
  });

  it('aceita logoRodape e logoRelatorio opcionais', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      logoRodape: { url: '/midia/imagem/logos/rodape.png', alt: 'Rodapé' },
      logoRelatorio: { url: 'https://example.com/rel.png', alt: 'Relatório' },
    });
    expect(r.success).toBe(true);
  });

  it('aceita logoTamanho com enum válido', () => {
    for (const v of ['pequeno', 'medio', 'grande', 'enorme']) {
      const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, logoTamanho: v });
      expect(r.success).toBe(true);
    }
  });

  it('rejeita logoTamanho com valor fora do enum', () => {
    const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, logoTamanho: 'gigante' });
    expect(r.success).toBe(false);
  });

  it('assume default "medio" para logoTamanho quando omitido', () => {
    const { logoTamanho: _, ...semTamanho } = TOKENS_VALIDOS;
    const r = themeTokensSchema.safeParse(semTamanho);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoTamanho).toBe('medio');
  });

  it('rejeita logoRodape com URL inválida', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      logoRodape: { url: 'ftp://inválido', alt: 'x' },
    });
    expect(r.success).toBe(false);
  });

  it('aceita logoRelatorio com caminho relativo /midia/...', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      logoRelatorio: { url: '/midia/imagem/logos/rel.png', alt: 'Logo Relatório' },
    });
    expect(r.success).toBe(true);
  });

  // --- campos de rodapé ---

  it('aceita tokens sem campos de rodapé (retrocompatibilidade)', () => {
    const r = themeTokensSchema.safeParse(TOKENS_VALIDOS);
    expect(r.success).toBe(true);
  });

  it('assume defaults dos campos de rodapé quando omitidos', () => {
    const r = themeTokensSchema.safeParse(TOKENS_VALIDOS);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.logoRodapeTamanho).toBe('medio');
      expect(r.data.rodapeMostrarTexto).toBe(true);
      expect(r.data.rodapeTextoPosicao).toBe('abaixo');
      expect(r.data.rodapeTitulo).toBeUndefined();
      expect(r.data.rodapeDescricao).toBeUndefined();
    }
  });

  it('aceita logoRodapeTamanho com enum válido', () => {
    for (const v of ['pequeno', 'medio', 'grande', 'enorme']) {
      const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, logoRodapeTamanho: v });
      expect(r.success).toBe(true);
    }
  });

  it('rejeita logoRodapeTamanho com valor fora do enum', () => {
    const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, logoRodapeTamanho: 'gigante' });
    expect(r.success).toBe(false);
  });

  it('aceita rodapeMostrarTexto false', () => {
    const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, rodapeMostrarTexto: false });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rodapeMostrarTexto).toBe(false);
  });

  it('aceita rodapeTextoPosicao lateral', () => {
    const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, rodapeTextoPosicao: 'lateral' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.rodapeTextoPosicao).toBe('lateral');
  });

  it('rejeita rodapeTextoPosicao com valor fora do enum', () => {
    const r = themeTokensSchema.safeParse({ ...TOKENS_VALIDOS, rodapeTextoPosicao: 'topo' });
    expect(r.success).toBe(false);
  });

  it('aceita rodapeTitulo com até 120 caracteres', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      rodapeTitulo: 'Prefeitura Municipal de Exemplo',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita rodapeTitulo com mais de 120 caracteres', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      rodapeTitulo: 'A'.repeat(121),
    });
    expect(r.success).toBe(false);
  });

  it('aceita rodapeDescricao com até 300 caracteres', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      rodapeDescricao: 'Descrição da prefeitura para o rodapé do portal.',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita rodapeDescricao com mais de 300 caracteres', () => {
    const r = themeTokensSchema.safeParse({
      ...TOKENS_VALIDOS,
      rodapeDescricao: 'B'.repeat(301),
    });
    expect(r.success).toBe(false);
  });
});

// ---- DEFAULT_TOKENS ----

describe('DEFAULT_TOKENS', () => {
  it('inclui logoTamanho medio', () => {
    expect(DEFAULT_TOKENS.logoTamanho).toBe('medio');
  });

  it('não inclui logoRodape nem logoRelatorio (são opcionais)', () => {
    expect(DEFAULT_TOKENS.logoRodape).toBeUndefined();
    expect(DEFAULT_TOKENS.logoRelatorio).toBeUndefined();
  });

  it('inclui os campos de rodapé com valores padrão', () => {
    expect(DEFAULT_TOKENS.logoRodapeTamanho).toBe('medio');
    expect(DEFAULT_TOKENS.rodapeMostrarTexto).toBe(true);
    expect(DEFAULT_TOKENS.rodapeTextoPosicao).toBe('abaixo');
    expect(DEFAULT_TOKENS.rodapeTitulo).toBeUndefined();
    expect(DEFAULT_TOKENS.rodapeDescricao).toBeUndefined();
  });
});

// ---- aplicarModelo — preservação dos novos campos ----

describe('ThemeService.aplicarModelo — preservação de logoRodape/logoRelatorio/logoTamanho', () => {
  it('preserva logoRodape e logoRelatorio do tenant quando já existem', async () => {
    const tokenExistente: ThemeTokens = {
      ...TOKENS_VALIDOS,
      logoRodape: { url: '/midia/imagem/logos/rod.png', alt: 'Rodapé' },
      logoRelatorio: { url: '/midia/imagem/logos/rel.png', alt: 'Relatório' },
      logoTamanho: 'grande',
    };
    const { service, prisma } = buildService(tokenExistente);

    await service.aplicarModelo('sao-mateus-do-sul');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    expect(upsertCall.create.tokens.logoRodape).toEqual(tokenExistente.logoRodape);
    expect(upsertCall.create.tokens.logoRelatorio).toEqual(tokenExistente.logoRelatorio);
    expect(upsertCall.create.tokens.logoTamanho).toBe('grande');
  });

  it('usa "medio" como fallback de logoTamanho quando tenant não tem tema', async () => {
    // findFirst retorna null → tema novo
    const { service, prisma } = buildService(undefined);

    await service.aplicarModelo('sao-mateus-do-sul');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    expect(upsertCall.create.tokens.logoTamanho).toBe('medio');
  });

  it('usa "medio" quando tokenAtual não tem logoTamanho (tenant legado)', async () => {
    // Token legado sem logoTamanho
    const { logoTamanho: _, ...tokenLegado } = TOKENS_VALIDOS;
    const { service, prisma } = buildService(tokenLegado);

    await service.aplicarModelo('betim');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    expect(upsertCall.create.tokens.logoTamanho).toBe('medio');
  });

  it('lança NotFoundException para template inexistente', async () => {
    const { service } = buildService();
    await expect(service.aplicarModelo('inexistente')).rejects.toThrow(NotFoundException);
  });
});

describe('ThemeService.aplicarModelo — preservação dos campos de rodapé', () => {
  it('preserva todos os campos de rodapé do tenant quando já existem', async () => {
    const tokenExistente: ThemeTokens = {
      ...TOKENS_VALIDOS,
      logoRodapeTamanho: 'grande',
      rodapeMostrarTexto: false,
      rodapeTextoPosicao: 'lateral',
      rodapeTitulo: 'Prefeitura Municipal de Teste',
      rodapeDescricao: 'Descrição do rodapé configurada pelo tenant.',
    };
    const { service, prisma } = buildService(tokenExistente);

    await service.aplicarModelo('sao-mateus-do-sul');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    const tokens = upsertCall.create.tokens;
    expect(tokens.logoRodapeTamanho).toBe('grande');
    expect(tokens.rodapeMostrarTexto).toBe(false);
    expect(tokens.rodapeTextoPosicao).toBe('lateral');
    expect(tokens.rodapeTitulo).toBe('Prefeitura Municipal de Teste');
    expect(tokens.rodapeDescricao).toBe('Descrição do rodapé configurada pelo tenant.');
  });

  it('usa defaults dos campos de rodapé quando tenant não tem tema', async () => {
    const { service, prisma } = buildService(undefined);

    await service.aplicarModelo('sapezal');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    const tokens = upsertCall.create.tokens;
    expect(tokens.logoRodapeTamanho).toBe('medio');
    expect(tokens.rodapeMostrarTexto).toBe(true);
    expect(tokens.rodapeTextoPosicao).toBe('abaixo');
    expect(tokens.rodapeTitulo).toBeUndefined();
    expect(tokens.rodapeDescricao).toBeUndefined();
  });

  it('usa defaults dos campos de rodapé quando tenant legado não os possui', async () => {
    // Simula tenant legado que não tinha campos de rodapé
    const tokenLegado: Omit<ThemeTokens, 'logoRodapeTamanho' | 'rodapeMostrarTexto' | 'rodapeTextoPosicao'> =
      TOKENS_VALIDOS;
    const { service, prisma } = buildService(tokenLegado);

    await service.aplicarModelo('alto-garcas');

    const upsertCall = prisma.db.tenantTheme.upsert.mock.calls[0][0];
    const tokens = upsertCall.create.tokens;
    expect(tokens.logoRodapeTamanho).toBe('medio');
    expect(tokens.rodapeMostrarTexto).toBe(true);
    expect(tokens.rodapeTextoPosicao).toBe('abaixo');
  });
});
