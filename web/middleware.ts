import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isPlatformHost } from './lib/platform-host';

/**
 * Middleware global:
 * 1. Injeta `x-pathname` nos headers da REQUEST (Server Components leem a rota atual).
 * 2. Injeta `x-host` (valor do header `host` original) para que layouts detectem
 *    o tenant ou o host de plataforma sem depender do header `host` diretamente.
 * 3. Se for o host de plataforma e o pathname for exatamente "/", reescreve para
 *    /plataforma — mostra o Gerenciador da Plataforma como raiz do domínio.
 * 4. Resolve redirects 301/302 cadastrados no backend (URLs legadas Joomla → novos slugs).
 *    A API tem cache Redis (incl. negative cache), então a chamada é barata.
 *    Em caso de erro/timeout o middleware deixa o fluxo seguir normalmente.
 */

const INTERNAL_API = process.env.API_URL ?? 'http://localhost:3001';

/** Timeout (ms) para a chamada de resolve de redirect no backend. */
const REDIRECT_RESOLVE_TIMEOUT_MS = 800;

/**
 * Extensões que nunca devem acionar a resolução de redirect.
 * O matcher já exclui `_next/static` e `_next/image`, mas recursos como
 * .ico, .png, .webp, .js, .css, .woff etc. chegam aqui se não tiverem
 * prefixo especial — filtramos antes de chamar a API.
 */
const STATIC_EXT_RE =
  /\.(?:ico|png|jpg|jpeg|webp|gif|svg|avif|js|mjs|cjs|css|woff2?|ttf|otf|eot|map|txt|xml|json|pdf|mp4|mp3|ogg|webm|zip|gz)$/i;

/**
 * Prefixos de rota que nunca precisam de redirect lookup.
 * Inclui rotas da plataforma de admin, rotas de API Next, etc.
 */
const SKIP_PREFIXES = [
  '/_next',
  '/api/',
  '/midia/',
  '/plataforma',
  '/admin',
];

function shouldSkipRedirect(pathname: string): boolean {
  if (STATIC_EXT_RE.test(pathname)) return true;
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const pathname = request.nextUrl.pathname;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);
  requestHeaders.set('x-host', host);

  // ── 1. Host de plataforma: redireciona raiz para /plataforma ──────────────
  if (isPlatformHost(host) && pathname === '/') {
    return NextResponse.rewrite(new URL('/plataforma', request.url), {
      request: { headers: requestHeaders },
    });
  }

  // ── 2. Resolve redirects cadastrados (apenas GET, rotas de página) ─────────
  if (
    request.method === 'GET' &&
    !isPlatformHost(host) &&
    !shouldSkipRedirect(pathname)
  ) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        REDIRECT_RESOLVE_TIMEOUT_MS,
      );

      const resolveUrl =
        `${INTERNAL_API}/api/redirects/resolve` +
        `?path=${encodeURIComponent(pathname)}` +
        `&__h=${encodeURIComponent(host)}`;

      const res = await fetch(resolveUrl, {
        method: 'GET',
        // Repassa o Host original para que o TenantMiddleware do NestJS
        // resolva o tenant correto via RLS.
        headers: { Host: host, 'x-forwarded-host': host },
        // O cache do Next.js para fetch SSR não se aplica no middleware
        // (Edge/Node runtime), mas evitamos armazenar na data-cache mesmo assim.
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const data = (await res.json()) as {
          destino?: string;
          statusCode?: number;
        };

        if (data.destino) {
          const status = data.statusCode === 302 ? 302 : 301;
          // Constrói a URL de destino relativa ao origin do request
          // para suportar destinos absolutos (/novo-slug) e relativos.
          const destino = new URL(data.destino, request.url);
          return NextResponse.redirect(destino, { status });
        }
        // 200 sem destino ou 404 → segue fluxo normal (fallback abaixo)
      }
      // res.status === 404 → redirect não cadastrado; segue fluxo normal
    } catch {
      // Timeout, rede indisponível ou qualquer erro → NÃO redireciona,
      // deixa o Next.js resolver normalmente (melhor UX que 500).
    }
  }

  // ── 3. Fluxo normal ────────────────────────────────────────────────────────
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // Aplica a todas as rotas exceto recursos estáticos e internos do Next.js
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
