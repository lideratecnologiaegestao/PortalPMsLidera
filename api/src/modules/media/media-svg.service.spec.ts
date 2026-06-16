/**
 * Unit tests para os métodos svgConteudo() e recolorir() do MediaService.
 *
 * Isolamento RLS: o prisma.db é escopado por tenant via RLS automático. Os
 * mocks abaixo simulam o comportamento correto: um asset de tenant B retorna
 * null para tenant A (como a policy RLS garantiria em banco real).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MediaService } from './media.service';

// ── constantes de teste ──────────────────────────────────────────────────────

const TENANT_A = 'tenant-a-uuid';
const TENANT_B = 'tenant-b-uuid';
const ASSET_ID = 'asset-svg-uuid';
const CATEGORIA_ID = 'categoria-imagem-uuid';

const SVG_SIMPLES =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#ff0000" stroke="#0000ff"/></svg>';

const SVG_COM_SCRIPT =
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect fill="#ff0000"/></svg>';

const mockAssetSvg = {
  id: ASSET_ID,
  tenantId: TENANT_A,
  tipo: 'imagem',
  mime: 'image/svg+xml',
  nomeOriginal: 'icone.svg',
  hash: 'hashfake123',
  ext: 'svg',
  visibilidade: 'publico',
  categoriaId: CATEGORIA_ID,
  tamanhoBytes: SVG_SIMPLES.length,
  largura: null,
  altura: null,
  altText: 'ícone vermelho',
  checksum: 'fake-checksum',
  storageKey: `${TENANT_A}/imagem/logos/hashfake123.svg`,
  uploadedBy: 'user-a',
  criadoEm: new Date(),
};

const mockCategoria = {
  id: CATEGORIA_ID,
  tenantId: TENANT_A,
  tipo: 'imagem',
  nome: 'Logos',
  slug: 'logos',
};

// ── build de mocks ───────────────────────────────────────────────────────────

const buildPrisma = (asset: any = mockAssetSvg) => ({
  db: {
    mediaAsset: {
      findUnique: jest.fn().mockResolvedValue(asset),
      findFirst: jest.fn().mockResolvedValue(null), // sem dedup por padrão
      create: jest.fn().mockImplementation(({ data }: any) => ({
        ...data,
        id: 'novo-asset-uuid',
        criadoEm: new Date(),
      })),
    },
    mediaCategory: {
      findUnique: jest.fn().mockResolvedValue(mockCategoria),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
});

const buildStorage = (conteudo: Buffer = Buffer.from(SVG_SIMPLES)) => ({
  getBuffer: jest.fn().mockResolvedValue(conteudo),
  put: jest.fn().mockResolvedValue(undefined),
  getStream: jest.fn(),
  delete: jest.fn(),
});

// ── mock do TenantContext ────────────────────────────────────────────────────

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    get: () => ({ tenantId: TENANT_A }),
    tenantId: () => TENANT_A,
  },
}));

// ── helpers ──────────────────────────────────────────────────────────────────

function buildService(prisma: any, storage: any) {
  return new MediaService(prisma as any, storage as any);
}

// ── testes ───────────────────────────────────────────────────────────────────

describe('MediaService.svgConteudo', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let storage: ReturnType<typeof buildStorage>;
  let service: MediaService;

  beforeEach(() => {
    prisma = buildPrisma();
    storage = buildStorage();
    service = buildService(prisma, storage);
  });

  it('retorna conteudo sanitizado e coresUnicas para um SVG válido', async () => {
    const result = await service.svgConteudo(ASSET_ID);
    expect(result).toHaveProperty('conteudo');
    expect(result).toHaveProperty('coresUnicas');
    expect(result.coresUnicas).toContain('#FF0000');
    expect(result.coresUnicas).toContain('#0000FF');
  });

  it('sanitiza scripts antes de retornar o conteúdo', async () => {
    storage = buildStorage(Buffer.from(SVG_COM_SCRIPT));
    service = buildService(prisma, storage);
    const result = await service.svgConteudo(ASSET_ID);
    expect(result.conteudo).not.toContain('<script');
    expect(result.conteudo).not.toContain('alert(1)');
  });

  it('lança NotFoundException se asset não existe (RLS — asset de outro tenant retorna null)', async () => {
    prisma.db.mediaAsset.findUnique = jest.fn().mockResolvedValue(null);
    service = buildService(prisma, storage);
    await expect(service.svgConteudo(ASSET_ID)).rejects.toThrow(NotFoundException);
  });

  it('lança BadRequestException se o asset não é image/svg+xml', async () => {
    const pngAsset = { ...mockAssetSvg, mime: 'image/png' };
    prisma = buildPrisma(pngAsset);
    service = buildService(prisma, storage);
    await expect(service.svgConteudo(ASSET_ID)).rejects.toThrow(BadRequestException);
  });

  it('chama storage.getBuffer com o storageKey correto', async () => {
    await service.svgConteudo(ASSET_ID);
    expect(storage.getBuffer).toHaveBeenCalledWith(mockAssetSvg.storageKey);
  });

  it('lança BadRequestException se conteúdo não é SVG válido', async () => {
    storage = buildStorage(Buffer.from('não é svg'));
    service = buildService(prisma, storage);
    await expect(service.svgConteudo(ASSET_ID)).rejects.toThrow(BadRequestException);
  });

  // ── isolamento RLS ──────────────────────────────────────────────────────────
  it('[RLS] tenant B não vê asset de tenant A (findUnique retorna null)', async () => {
    // Simula o comportamento da RLS policy: tenant B consultando asset de tenant A
    // → a policy filtra o registro → findUnique retorna null
    prisma.db.mediaAsset.findUnique = jest.fn().mockResolvedValue(null);
    service = buildService(prisma, storage);
    await expect(service.svgConteudo(ASSET_ID)).rejects.toThrow(NotFoundException);
    // Garante que não houve tentativa de acessar o storage
    expect(storage.getBuffer).not.toHaveBeenCalled();
  });
});

describe('MediaService.recolorir', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let storage: ReturnType<typeof buildStorage>;
  let service: MediaService;

  const dtoValido = {
    substituicoes: { '#ff0000': '#00ff00' },
    categoriaId: CATEGORIA_ID,
    visibilidade: 'publico' as const,
    altText: 'ícone verde',
  };

  // SVG com <style> CDATA e path sem fill (caso CorelDRAW)
  const SVG_COREL =
    '<svg xmlns="http://www.w3.org/2000/svg">' +
    '<style><![CDATA[ .fil0 {fill:white} ]]></style>' +
    '<g><path class="fil0"/><path/></g>' +
    '</svg>';

  beforeEach(() => {
    prisma = buildPrisma();
    storage = buildStorage();
    service = buildService(prisma, storage);
  });

  it('cria novo asset recolorido e o retorna como DTO', async () => {
    const result = await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('mime', 'image/svg+xml');
  });

  it('não altera o asset original — cria um novo', async () => {
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    // mediaAsset.create deve ser chamado (novo asset)
    expect(prisma.db.mediaAsset.create).toHaveBeenCalled();
    // update NÃO deve ser chamado
    expect((prisma.db.mediaAsset as any).update).toBeUndefined();
  });

  it('salva o novo SVG no storage com mime image/svg+xml', async () => {
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    expect(storage.put).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      'image/svg+xml',
    );
  });

  it('nome do novo asset termina com -recolorido.svg', async () => {
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    const chamada = (prisma.db.mediaAsset.create as jest.Mock).mock.calls[0][0];
    expect(chamada.data.nomeOriginal).toMatch(/-recolorido\.svg$/);
  });

  it('o SVG persistido contém a cor substituída', async () => {
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    const bufferSalvo: Buffer = (storage.put as jest.Mock).mock.calls[0][1];
    const textoSalvo = bufferSalvo.toString('utf8');
    expect(textoSalvo).toContain('#00FF00');
    expect(textoSalvo).not.toContain('#ff0000');
    expect(textoSalvo).not.toContain('#FF0000');
  });

  it('audita a ação media.svg_recolorir', async () => {
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'media.svg_recolorir' }),
      }),
    );
  });

  it('lança BadRequestException se substituicoes está vazio E corBase não informado', async () => {
    await expect(
      service.recolorir(ASSET_ID, { ...dtoValido, substituicoes: {} }, 'user-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException se substituicoes excede 50 entradas', async () => {
    const subs: Record<string, string> = {};
    for (let i = 0; i <= 50; i++) {
      const hex = i.toString(16).padStart(6, '0');
      subs[`#${hex}`] = '#000000';
    }
    await expect(
      service.recolorir(ASSET_ID, { ...dtoValido, substituicoes: subs }, 'user-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException se cor de origem é inválida (nem hex nem alpha)', async () => {
    // "vermelho123" contém dígitos → não é hex nem nome de cor → inválida
    await expect(
      service.recolorir(ASSET_ID, { ...dtoValido, substituicoes: { 'vermelho123': '#00ff00' } }, 'user-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException se cor de destino é inválida', async () => {
    await expect(
      service.recolorir(ASSET_ID, { ...dtoValido, substituicoes: { '#ff0000': 'azul' } }, 'user-a'),
    ).rejects.toThrow(BadRequestException);
  });

  it('lança BadRequestException se imagem pública não tem altText', async () => {
    await expect(
      service.recolorir(
        ASSET_ID,
        { ...dtoValido, visibilidade: 'publico', altText: undefined },
        'user-a',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('aceita visibilidade restrito sem altText', async () => {
    const result = await service.recolorir(
      ASSET_ID,
      { ...dtoValido, visibilidade: 'restrito', altText: undefined },
      'user-a',
    );
    expect(result).toHaveProperty('id');
  });

  it('lança BadRequestException se asset não é SVG', async () => {
    prisma = buildPrisma({ ...mockAssetSvg, mime: 'image/png' });
    service = buildService(prisma, storage);
    await expect(service.recolorir(ASSET_ID, dtoValido, 'user-a')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('retorna asset existente se checksum idêntico (dedup)', async () => {
    const assetExistente = { ...mockAssetSvg, id: 'existente-uuid' };
    prisma.db.mediaAsset.findFirst = jest.fn().mockResolvedValue(assetExistente);
    service = buildService(prisma, storage);
    const result = await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    // Deve retornar o existente sem criar novo
    expect(prisma.db.mediaAsset.create).not.toHaveBeenCalled();
    expect(result).toHaveProperty('id');
  });

  it('sanitiza o SVG ANTES de aplicar substituições', async () => {
    storage = buildStorage(Buffer.from(SVG_COM_SCRIPT));
    service = buildService(prisma, storage);
    await service.recolorir(ASSET_ID, dtoValido, 'user-a');
    const bufferSalvo: Buffer = (storage.put as jest.Mock).mock.calls[0][1];
    const textoSalvo = bufferSalvo.toString('utf8');
    expect(textoSalvo).not.toContain('<script');
    expect(textoSalvo).not.toContain('alert(1)');
  });

  // ── corBase ─────────────────────────────────────────────────────────────────

  it('aceita substituicoes vazio se corBase for informado', async () => {
    const result = await service.recolorir(
      ASSET_ID,
      { ...dtoValido, substituicoes: {}, corBase: '#003366' },
      'user-a',
    );
    expect(result).toHaveProperty('id');
  });

  it('aplica corBase como fill no elemento <svg> raiz', async () => {
    await service.recolorir(
      ASSET_ID,
      { ...dtoValido, substituicoes: {}, corBase: '#003366' },
      'user-a',
    );
    const bufferSalvo: Buffer = (storage.put as jest.Mock).mock.calls[0][1];
    const textoSalvo = bufferSalvo.toString('utf8');
    expect(textoSalvo).toMatch(/^<svg[^>]*fill="#003366"/i);
  });

  it('lança BadRequestException se corBase é hex inválido', async () => {
    await expect(
      service.recolorir(
        ASSET_ID,
        { ...dtoValido, substituicoes: {}, corBase: 'azul' },
        'user-a',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('registra corBase na auditoria', async () => {
    await service.recolorir(
      ASSET_ID,
      { ...dtoValido, corBase: '#003366' },
      'user-a',
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'media.svg_recolorir',
          dados: expect.objectContaining({ corBase: '#003366' }),
        }),
      }),
    );
  });

  it('aceita substituicoes com cor nomeada (white) como chave', async () => {
    storage = buildStorage(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg">' +
          '<style><![CDATA[ .fil0 {fill:white} ]]></style>' +
          '<path class="fil0"/>' +
          '</svg>',
      ),
    );
    service = buildService(prisma, storage);
    const result = await service.recolorir(
      ASSET_ID,
      { ...dtoValido, substituicoes: { 'white': '#003366' } },
      'user-a',
    );
    expect(result).toHaveProperty('id');
    const bufferSalvo: Buffer = (storage.put as jest.Mock).mock.calls[0][1];
    const textoSalvo = bufferSalvo.toString('utf8');
    expect(textoSalvo).toContain('#003366');
    expect(textoSalvo).not.toContain('fill:white');
  });

  it('caso real CorelDRAW: <style> com white + corBase para preto implícito', async () => {
    storage = buildStorage(Buffer.from(SVG_COREL));
    service = buildService(prisma, storage);
    await service.recolorir(
      ASSET_ID,
      {
        ...dtoValido,
        substituicoes: { 'white': '#003366' },
        corBase: '#003366',
      },
      'user-a',
    );
    const bufferSalvo: Buffer = (storage.put as jest.Mock).mock.calls[0][1];
    const textoSalvo = bufferSalvo.toString('utf8');
    // Cor nomeada substituída no <style>
    expect(textoSalvo).toContain('#003366');
    expect(textoSalvo).not.toContain('fill:white');
    // fill na raiz para herança dos paths sem fill explícito
    expect(textoSalvo).toMatch(/^<svg[^>]*fill="#003366"/i);
  });

  // ── isolamento RLS ──────────────────────────────────────────────────────────
  it('[RLS] tenant B não consegue recolorir asset de tenant A (findUnique retorna null)', async () => {
    // Simula a RLS policy: tenant B tenta acessar asset de tenant A → null
    prisma.db.mediaAsset.findUnique = jest.fn().mockResolvedValue(null);
    service = buildService(prisma, storage);
    await expect(service.recolorir(ASSET_ID, dtoValido, 'user-b')).rejects.toThrow(
      NotFoundException,
    );
    // Garante que nenhum dado foi gravado
    expect(storage.put).not.toHaveBeenCalled();
    expect(prisma.db.mediaAsset.create).not.toHaveBeenCalled();
    expect(prisma.db.auditLog.create).not.toHaveBeenCalled();
  });
});
