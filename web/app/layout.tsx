import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import './globals.css';
import { getThemeData, getThemeTokens, tokensToCss } from '../lib/theme';
import { isPlatformHost } from '../lib/platform-host';
import { getMenus, getHome } from '../lib/portal-api';

// Portal público — novos componentes
import UtilityBar from '../components/portal/UtilityBar';
import SiteHeader from '../components/portal/SiteHeader';
import MainNav from '../components/portal/MainNav';
import SiteFooterPortal from '../components/portal/SiteFooterPortal';
import CookieConsent from '../components/portal/CookieConsent';
import PopupModal from '../components/portal/PopupModal';
import VLibras from '../components/VLibras';
import AtendimentoWidget from '../components/portal/AtendimentoWidget';

// (SiteFooter legado mantido para eventual uso em admin customizado)

/**
 * CSS variables neutras (azul gov.br) para o host de plataforma.
 * Não carrega tema de tenant: o host de plataforma não é um tenant.
 */
const PLATFORM_CSS = `
:root {
  --color-primary: #1351b4;
  --color-primary-fg: #ffffff;
  --color-secondary: #2670e8;
  --color-secondary-fg: #ffffff;
  --color-accent: #0c326f;
  --color-bg: #ffffff;
  --color-fg: #1b1b1b;
  --color-muted: #f0f0f0;
  --color-border: #cccccc;
  --color-success: #168821;
  --color-warning: #ffcd07;
  --color-danger: #e52207;
  --font-sans: 'Rawline', 'Raleway', system-ui, sans-serif;
  --font-heading: 'Rawline', 'Raleway', system-ui, sans-serif;
  --radius-base: 4px;
}
`.trim();

/**
 * Root layout. Injeta o tema (CSS variables) e, para rotas que NAO sao /admin
 * nem /plataforma, renderiza o shell do portal público redesenhado.
 *
 * Para /admin → documento HTML base (AdminLayout adiciona o próprio shell).
 * Para /plataforma (host de plataforma) → documento HTML neutro sem tema de tenant.
 * Para portal público → shell completo: UtilityBar + SiteHeader + MainNav + SiteFooterPortal + CookieConsent + VLibras.
 */
export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const h = headers();
  const pathname = h.get('x-pathname') ?? '';
  const host = h.get('x-host') ?? h.get('host') ?? '';

  const isAdmin = pathname.startsWith('/admin');
  const isPainelTv = pathname.startsWith('/painel-tv');
  const isPlataforma = isPlatformHost(host) || pathname.startsWith('/plataforma');

  // ── Host de plataforma (super_admin): documento neutro, sem tema de tenant ──
  if (isPlataforma) {
    return (
      <html lang="pt-BR">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Gerenciador da Plataforma</title>
          <style dangerouslySetInnerHTML={{ __html: PLATFORM_CSS }} />
        </head>
        <body className="bg-bg text-fg">{children}</body>
      </html>
    );
  }

  // ── Painel admin / painéis de TV (kiosk): tema do tenant, sem shell público ──
  if (isAdmin || isPainelTv) {
    const { tokens } = await getThemeTokens();
    return (
      <html lang="pt-BR">
        <head>
          <style dangerouslySetInnerHTML={{ __html: tokensToCss(tokens) }} />
          <link rel="icon" href={tokens.favicon} />
        </head>
        <body className="bg-bg text-fg">{children}</body>
      </html>
    );
  }

  // ── Portal público do tenant: shell completo redesenhado ──
  const data = await getThemeData();

  // Host sem prefeitura configurada (subdomínio inexistente/desativado): página
  // clara de "não encontrado" — não renderiza o portal genérico. noindex para
  // não ser indexado.
  if (data.notFound) {
    return (
      <html lang="pt-BR">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <meta name="robots" content="noindex" />
          <title>Prefeitura não encontrada</title>
          <style dangerouslySetInnerHTML={{ __html: PLATFORM_CSS }} />
        </head>
        <body className="bg-bg text-fg">
          <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
            <p className="font-heading text-6xl font-bold text-primary">404</p>
            <h1 className="font-heading text-2xl font-bold">Prefeitura não encontrada</h1>
            <p className="text-fg/70">
              O endereço <strong>{host}</strong> não corresponde a nenhuma prefeitura
              configurada nesta plataforma.
            </p>
            <p className="text-sm text-fg/60">
              Verifique o endereço digitado ou contate o administrador da plataforma.
            </p>
          </main>
        </body>
      </html>
    );
  }

  const { tokens, portal } = data;

  // Busca os menus do tenant em paralelo com o tema (já carregado acima).
  // Cache ISR por 120 s; chave de cache única por tenant via __h= na URL
  // (garante isolamento: um tenant não recebe o menu de outro).
  const [menuTopo, menuRodape, home] = await Promise.all([
    getMenus('cabecalho'),
    getMenus('rodape'),
    getHome(),
  ]);

  const cfg = home?.config;
  const gaId = cfg?.googleAnalyticsId?.trim();
  const ogImage = cfg?.ogImageUrl || tokens.logo?.url;

  // ── Modo manutenção: portal público fora do ar, exceto /admin ──
  if (cfg?.modoManutencao) {
    return (
      <html lang="pt-BR">
        <head>
          <style dangerouslySetInnerHTML={{ __html: tokensToCss(tokens) }} />
          <link rel="icon" href={tokens.favicon} />
          <meta name="robots" content="noindex" />
          <title>Em manutenção — {portal.nome}</title>
        </head>
        <body className="bg-bg text-fg">
          <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
            {tokens.logo?.url && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={tokens.logo.url} alt={tokens.logo.alt ?? portal.nome} className="h-20 w-auto" />
            )}
            <h1 className="font-heading text-2xl font-bold text-primary">Portal em manutenção</h1>
            <p className="text-fg/70">
              {cfg.manutencaoMensagem?.trim() ||
                `O portal da ${portal.nome} está temporariamente em manutenção. Voltamos em breve.`}
            </p>
          </main>
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR">
      <head>
        {/* Tema do município injetado no servidor: zero flash de cor errada. */}
        <style dangerouslySetInnerHTML={{ __html: tokensToCss(tokens) }} />
        <link rel="icon" href={tokens.favicon} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {/* Open Graph (compartilhamento em redes) */}
        <meta property="og:site_name" content={`Prefeitura de ${portal.nome}`} />
        <meta property="og:type" content="website" />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {/* Google Analytics (GA4) — só se configurado pelo tenant */}
        {gaId && (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} />
            <script
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${gaId}');`,
              }}
            />
          </>
        )}
      </head>
      <body className="bg-bg text-fg">
        {/* 0. Barra de utilidades (acessibilidade, skip links, redes) */}
        <UtilityBar />

        {/* 1. Cabeçalho sticky */}
        <SiteHeader tokens={tokens} portal={portal} />

        {/* 2. Navegação principal (mega-menu + hambúrguer) — dinâmica por tenant */}
        <MainNav items={menuTopo} />

        {/* 3. Conteúdo principal */}
        <main id="conteudo" tabIndex={-1} className="outline-none">
          {children}
        </main>

        {/* 4. Rodapé institucional rico — colunas dinâmicas por tenant */}
        <SiteFooterPortal tokens={tokens} portal={portal} items={menuRodape} />

        {/* Popups do portal (por página, com datas e frequência) */}
        <PopupModal />

        {/* Cookie consent LGPD */}
        <CookieConsent />

        {/* Tradutor de Libras (acessibilidade e lei). */}
        <VLibras />

        {/* Widget de atendimento 24h (cidadão). Renderiza somente se o tenant
            tiver atendimento ativo — a verificação é feita dentro do componente
            via GET /api/atendimento/config, sem bloquear o SSR. */}
        <AtendimentoWidget />
      </body>
    </html>
  );
}
