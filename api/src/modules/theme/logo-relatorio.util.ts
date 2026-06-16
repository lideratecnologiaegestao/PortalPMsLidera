/**
 * Helper compartilhado para carregar o logo a ser usado em cabeçalhos de PDF.
 *
 * Estratégia de resolução:
 *  1. Usa `tokens.logoRelatorio?.url` se definido; caso contrário, cai em `tokens.logo?.url`.
 *  2. URLs relativas do tipo `/midia/...` são resolvidas para o host interno da API
 *     (http://localhost:PORT — nunca exposto ao cliente) evitando saída externa.
 *  3. Placeholders conhecidos (cdn.exemplo.br, favicon.ico sem extensão de imagem) retornam null.
 *  4. SVG é rasterizado para PNG via `sharp` (pdfkit não renderiza SVG nativamente).
 *  5. Qualquer erro de rede / timeout / formato não-imagem retorna null — o PDF é gerado sem logo.
 */

const importDinamico = new Function('m', 'return import(m)') as <T = any>(m: string) => Promise<T>;

const TIMEOUT_MS = 5_000;

const PLACEHOLDERS = [
  'cdn.exemplo.br',
  '/favicon.ico',
];

function ehPlaceholder(url: string): boolean {
  return PLACEHOLDERS.some((p) => url.includes(p));
}

function ehSvg(url: string, contentType?: string): boolean {
  if (contentType && (contentType.includes('svg') || contentType.includes('xml'))) return true;
  return /\.svg(\?|$)/i.test(url);
}

function resolverUrl(urlOuCaminho: string): string {
  if (/^https?:\/\//i.test(urlOuCaminho)) return urlOuCaminho;
  // Caminho relativo (/midia/...) → resolve para o host interno da API
  const porta = process.env.PORT ?? '3001';
  return `http://localhost:${porta}${urlOuCaminho}`;
}

/**
 * Carrega o buffer do logo para uso em relatórios PDF.
 *
 * @param tokens — ThemeTokens do tenant (ou subconjunto com logo/logoRelatorio)
 * @returns Buffer PNG/JPEG pronto para `doc.image()`, ou null se indisponível.
 */
export async function carregarLogoRelatorio(tokens: {
  logo?: { url: string; alt: string };
  logoRelatorio?: { url: string; alt: string };
}): Promise<Buffer | null> {
  const urlBruta = tokens.logoRelatorio?.url ?? tokens.logo?.url;
  if (!urlBruta) return null;
  if (ehPlaceholder(urlBruta)) return null;

  const url = resolverUrl(urlBruta);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const resp = await fetch(url, { signal: controller.signal }).finally(() =>
      clearTimeout(timer),
    );

    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') ?? '';
    const arrayBuffer = await resp.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);

    if (ehSvg(urlBruta, contentType)) {
      // pdfkit não renderiza SVG — rasteriza para PNG via sharp
      const sharp = (await importDinamico('sharp')).default;
      buffer = await sharp(buffer).png().toBuffer();
    }

    return buffer;
  } catch {
    // erro de rede, timeout, formato inválido — segue sem logo
    return null;
  }
}
