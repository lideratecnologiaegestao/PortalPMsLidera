/**
 * Service Worker — Portal Público (multi-tenant PWA)
 *
 * Estratégias de cache:
 *
 *   /api/*             → passthrough (nunca interceptado / nunca cacheado)
 *   /admin, /plataforma,
 *   /painel-tv         → passthrough (rotas excluídas do SW)
 *
 *   Navegação (mode === 'navigate')
 *                      → network-first: tenta a rede; se offline, serve /offline
 *
 *   Assets estáticos   → stale-while-revalidate: responde do cache imediatamente
 *   (/_next/static/,     e atualiza em background; se não estiver em cache,
 *    imagens, fontes,     busca na rede e armazena para a próxima vez.
 *    /icons)
 *
 * O shell offline (/offline) é pré-cacheado na instalação para garantir que
 * o cidadão veja uma página amigável mesmo sem conexão.
 */

const CACHE = 'portal-shell-v1';

/** Paths pré-cacheados no install. */
const PRECACHE_URLS = ['/offline'];

/** Prefixos de path que o SW nunca deve interceptar. */
const BYPASS_PREFIXES = ['/api/', '/admin', '/plataforma', '/painel-tv'];

/** Prefixos de path tratados como assets estáticos (stale-while-revalidate). */
const STATIC_PREFIXES = ['/_next/static/', '/icons', '/favicon'];

/** Extensões de arquivo tratadas como assets (stale-while-revalidate). */
const STATIC_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf'];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Só intercepta GET; deixa POST/PUT/DELETE etc. passarem sem cache.
  if (request.method !== 'GET') return;

  // Só intercepta requisições same-origin (não CDN externo nem third-party).
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;

  // Rotas excluídas: API, admin e painéis especiais — nunca interceptar.
  if (BYPASS_PREFIXES.some((prefix) => path.startsWith(prefix))) return;

  // ── Navegação: network-first, fallback para /offline ──────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match('/offline').then(
          (cached) =>
            cached ??
            new Response('Você está offline.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            }),
        ),
      ),
    );
    return;
  }

  // ── Assets estáticos: stale-while-revalidate ───────────────────────────────
  const isStatic =
    STATIC_PREFIXES.some((p) => path.startsWith(p)) ||
    STATIC_EXTENSIONS.some((ext) => path.endsWith(ext));

  if (isStatic) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request).then((cached) => {
          const networkFetch = fetch(request).then((response) => {
            // Só armazena respostas válidas (evita armazenar erros).
            if (response.ok) {
              cache.put(request, response.clone());
            }
            return response;
          });
          // Responde do cache imediatamente se disponível; senão aguarda a rede.
          return cached ?? networkFetch;
        }),
      ),
    );
    return;
  }

  // Demais requisições GET same-origin (ex.: fetch de dados da página):
  // passthrough simples — a rede cuida, sem interceptar.
});
