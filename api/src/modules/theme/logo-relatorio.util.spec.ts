/**
 * Testes unitários para carregarLogoRelatorio.
 * Verifica: placeholder retorna null, URL absoluta busca via fetch,
 * path relativo resolve para host interno, SVG é rasterizado para PNG,
 * erro de rede retorna null.
 */

import { carregarLogoRelatorio } from './logo-relatorio.util';

// ---- helpers de mock ----

function mockFetchOk(contentType: string, body: Buffer) {
  const ab = body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  return jest.fn().mockResolvedValue({
    ok: true,
    headers: { get: (h: string) => (h === 'content-type' ? contentType : null) },
    arrayBuffer: () => Promise.resolve(ab),
  });
}

function mockFetchFail() {
  return jest.fn().mockRejectedValue(new Error('network error'));
}

function mockFetchNotOk() {
  return jest.fn().mockResolvedValue({
    ok: false,
    headers: { get: () => null },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  });
}

// sharp mock retorna buffer PNG fixo
const PNG_BUFFER = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // cabeçalho PNG mínimo
jest.mock(
  'sharp',
  () =>
    () => ({
      png: () => ({ toBuffer: () => Promise.resolve(PNG_BUFFER) }),
    }),
  { virtual: true },
);

describe('carregarLogoRelatorio', () => {
  const origFetch = global.fetch;

  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  it('retorna null quando logo não está definido', async () => {
    const result = await carregarLogoRelatorio({});
    expect(result).toBeNull();
  });

  it('retorna null para placeholder cdn.exemplo.br', async () => {
    const result = await carregarLogoRelatorio({
      logo: { url: 'https://cdn.exemplo.br/logo.svg', alt: 'Logo' },
    });
    expect(result).toBeNull();
  });

  it('retorna null para placeholder /favicon.ico', async () => {
    const result = await carregarLogoRelatorio({
      logo: { url: '/favicon.ico', alt: 'Favicon' },
    });
    expect(result).toBeNull();
  });

  it('prefere logoRelatorio sobre logo quando ambos definidos', async () => {
    const pngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    global.fetch = mockFetchOk('image/png', pngBody);

    await carregarLogoRelatorio({
      logo: { url: 'https://cdn.exemplo.br/logo.svg', alt: 'Logo' },
      logoRelatorio: { url: 'https://example.com/rel.png', alt: 'Relatório' },
    });

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://example.com/rel.png');
  });

  it('retorna buffer PNG para URL absoluta com imagem PNG', async () => {
    const pngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    global.fetch = mockFetchOk('image/png', pngBody);

    const result = await carregarLogoRelatorio({
      logo: { url: 'https://example.com/logo.png', alt: 'Logo' },
    });

    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Buffer);
    // deve ser o buffer original (não-SVG, não rasteriza)
    expect(result!.length).toBe(pngBody.length);
  });

  it('rasteriza SVG (pelo content-type) para PNG via sharp', async () => {
    const svgBody = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    global.fetch = mockFetchOk('image/svg+xml', svgBody);

    const result = await carregarLogoRelatorio({
      logo: { url: 'https://example.com/logo.svg', alt: 'Logo SVG' },
    });

    expect(result).toEqual(PNG_BUFFER);
  });

  it('rasteriza SVG detectado pela extensão .svg', async () => {
    const svgBody = Buffer.from('<svg></svg>');
    // content-type retorna text/html mas a URL tem .svg
    global.fetch = mockFetchOk('text/html', svgBody);

    const result = await carregarLogoRelatorio({
      logo: { url: 'https://example.com/brasao.svg', alt: 'Brasão' },
    });

    expect(result).toEqual(PNG_BUFFER);
  });

  it('retorna null quando fetch retorna status não-ok', async () => {
    global.fetch = mockFetchNotOk();

    const result = await carregarLogoRelatorio({
      logo: { url: 'https://example.com/logo.png', alt: 'Logo' },
    });

    expect(result).toBeNull();
  });

  it('retorna null em erro de rede (fetch lança exceção)', async () => {
    global.fetch = mockFetchFail();

    const result = await carregarLogoRelatorio({
      logo: { url: 'https://example.com/logo.png', alt: 'Logo' },
    });

    expect(result).toBeNull();
  });

  it('resolve caminho relativo /midia/ para localhost interno', async () => {
    const pngBody = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    global.fetch = mockFetchOk('image/png', pngBody);
    process.env.PORT = '3001';

    await carregarLogoRelatorio({
      logo: { url: '/midia/imagem/logos/abc123.png', alt: 'Logo local' },
    });

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      'http://localhost:3001/midia/imagem/logos/abc123.png',
    );
  });
});
