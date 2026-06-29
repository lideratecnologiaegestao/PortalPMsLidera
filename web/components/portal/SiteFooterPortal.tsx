/**
 * Rodapé rico do portal público (Server Component).
 *
 * Tokens: bg-accent, text-primary-fg, bg-primary, border-border,
 *   text-fg, bg-bg, text-fg/60.
 *
 * Renderiza colunas de links a partir da árvore de menus do rodapé:
 * cada item raiz vira título de coluna; seus `children` viram links.
 * Mantém as partes institucionais estáticas (identidade, contato, copyright).
 */

import type { MenuItem } from '../../lib/portal-types';
import { ThemeTokens, PortalInfo } from '../../lib/theme';
import { getBranding } from '../../lib/branding';

interface Props {
  tokens: ThemeTokens;
  portal: PortalInfo;
  updatedAt?: string;
  /** Árvore de menus do rodapé vindos da API. */
  items: MenuItem[];
}

/** Links estáticos de fallback quando a API não retorna menus de rodapé. */
const FALLBACK_COLUMNS: { titulo: string; links: { label: string; href: string; externo?: boolean }[] }[] = [
  {
    titulo: 'Portal',
    links: [
      { label: 'Início', href: '/' },
      { label: 'A Prefeitura', href: '/a-prefeitura' },
      { label: 'Secretarias', href: '/secretarias' },
      { label: 'Notícias', href: '/noticias' },
      { label: 'Contato', href: '/contato' },
    ],
  },
  {
    titulo: 'Serviços',
    links: [
      { label: 'Carta de Serviços', href: '/servicos' },
      { label: 'Diário Oficial', href: '/diario' },
      { label: 'Legislação', href: '/legislacao' },
      { label: 'Licitações', href: '/transparencia/licitacoes' },
      { label: 'Mapa do Site', href: '/mapa-do-site' },
    ],
  },
  {
    titulo: 'Transparência',
    links: [
      { label: 'Portal da Transparência', href: '/transparencia' },
      { label: 'Dados Abertos', href: '/transparencia/dados-abertos' },
      { label: 'Documentos e Planejamento', href: '/transparencia/documentos' },
      { label: 'e-SIC (Acesso à Informação)', href: '/esic' },
      { label: 'Estatísticas e-SIC', href: '/esic/estatisticas' },
      { label: 'Ouvidoria', href: '/ouvidoria' },
    ],
  },
];

function LinkExterno({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm opacity-80 hover:opacity-100 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg rounded"
    >
      {label}
    </a>
  );
}

function LinkInterno({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="text-sm opacity-80 hover:opacity-100 hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg rounded"
    >
      {label}
    </a>
  );
}

export default async function SiteFooterPortal({ tokens, portal, updatedAt, items }: Props) {
  const now = updatedAt ?? new Date().toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  });

  // "Desenvolvido por" (global da plataforma — Lidera)
  const branding = await getBranding();

  // Decide quais colunas renderizar: API ou fallback
  const usarApiMenus = items.length > 0;

  // Logo do rodapé: usa logoRodape se disponível, senão cai no logo principal
  const logoRodape = tokens.logoRodape ?? tokens.logo;

  // Mapeamento de tamanho do logo do rodapé
  const logoRodapeTamanhoClasse: Record<string, string> = {
    pequeno: 'h-10',
    medio: 'h-14',
    grande: 'h-28',
    enorme: 'h-44',
  };
  const logoRodapeClasse = logoRodapeTamanhoClasse[tokens.logoRodapeTamanho ?? 'medio'] ?? 'h-14';

  // Decisões de texto e posição
  const mostrarTexto = tokens.rodapeMostrarTexto !== false;
  const posicaoLateral = tokens.rodapeTextoPosicao === 'lateral';
  const tituloRodape = tokens.rodapeTitulo || portal.nome;
  const descricaoRodape = tokens.rodapeDescricao || portal.descricao;

  return (
    <footer id="rodape" className="mt-0 bg-accent text-primary-fg" role="contentinfo">
      {/* Faixa principal */}
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Coluna 1: Identidade (sempre estática) */}
          <div className="flex flex-col gap-4">
            <div className={posicaoLateral && mostrarTexto ? 'flex flex-row items-center gap-3' : 'flex flex-col items-center gap-2 text-center'}>
              {/* Logo ou placeholder */}
              {logoRodape.url && logoRodape.url !== '/brasao-placeholder.svg' ? (
                <img
                  src={logoRodape.url}
                  alt={logoRodape.alt}
                  className={`${logoRodapeClasse} w-auto brightness-0 invert flex-shrink-0`}
                />
              ) : (
                <div
                  className={`flex ${logoRodapeClasse} w-auto aspect-square items-center justify-center rounded-full bg-primary-fg/20 font-bold text-xl flex-shrink-0`}
                  aria-hidden="true"
                >
                  {portal.nome.charAt(0)}
                </div>
              )}
              {/* Bloco de texto condicional */}
              {mostrarTexto && (
                <div>
                  <div className="font-heading font-bold text-base leading-tight">{tituloRodape}</div>
                  {descricaoRodape && (
                    <div className="text-xs opacity-70 mt-0.5">{descricaoRodape}</div>
                  )}
                </div>
              )}
            </div>

            {/* Contato e horário */}
            <address className="not-italic text-sm opacity-80 space-y-1">
              {portal.endereco && (
                <p>
                  <span className="font-semibold">Endereço:</span> {portal.endereco}
                </p>
              )}
              {portal.telefone && (
                <p>
                  <span className="font-semibold">Telefone:</span>{' '}
                  <a href={`tel:${portal.telefone}`} className="hover:underline">{portal.telefone}</a>
                </p>
              )}
              {portal.email && (
                <p>
                  <span className="font-semibold">E-mail:</span>{' '}
                  <a href={`mailto:${portal.email}`} className="hover:underline">{portal.email}</a>
                </p>
              )}
              {portal.horario && (
                <p>
                  <span className="font-semibold">Atendimento:</span> {portal.horario}
                </p>
              )}
            </address>
          </div>

          {/* Colunas dinâmicas vindas da API */}
          {usarApiMenus
            ? items.map((coluna) => (
                <nav key={coluna.id} aria-label={`Mapa do site — ${coluna.label}`} className="text-center">
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide opacity-60">
                    {coluna.label}
                  </h2>
                  {coluna.children.length === 0 ? null : (
                    <ul className="space-y-2">
                      {coluna.children.map((filho) => (
                        <li key={filho.id}>
                          {filho.tipo === 'externo' ? (
                            <LinkExterno href={filho.href ?? '#'} label={filho.label} />
                          ) : (
                            <LinkInterno href={filho.href ?? '#'} label={filho.label} />
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </nav>
              ))
            : FALLBACK_COLUMNS.map((coluna) => (
                <nav key={coluna.titulo} aria-label={`Mapa do site — ${coluna.titulo}`} className="text-center">
                  <h2 className="mb-3 text-sm font-bold uppercase tracking-wide opacity-60">
                    {coluna.titulo}
                  </h2>
                  <ul className="space-y-2">
                    {coluna.links.map((l) => (
                      <li key={l.href}>
                        {l.externo ? (
                          <LinkExterno href={l.href} label={l.label} />
                        ) : (
                          <LinkInterno href={l.href} label={l.label} />
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
              ))}
        </div>
      </div>

      {/* Crédito "Desenvolvido por" — ACIMA da linha do copyright, canto direito */}
      {branding?.ativo && (branding.nome || branding.logoUrl) && (
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 pb-4 opacity-90">
          <span className="text-xs">Desenvolvido por</span>
          {(() => {
            const conteudo = branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.nome ?? 'Logomarca'} className="h-12 w-auto max-w-[220px] object-contain sm:h-14" />
            ) : (
              <span className="font-semibold">{branding.nome}</span>
            );
            return branding.siteUrl ? (
              <a href={branding.siteUrl} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center rounded hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg">
                {conteudo}
              </a>
            ) : conteudo;
          })()}
        </div>
      )}

      {/* Faixa inferior */}
      <div className="border-t border-primary-fg/20">
        <div className="mx-auto max-w-7xl px-4 py-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs opacity-70">
            <p>
              &copy; {new Date().getFullYear()} {portal.nome}. Todos os direitos reservados.
            </p>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span aria-label={`Portal atualizado em ${now}`}>
                Atualizado em {now}
              </span>
              <span aria-label="Conformidade de acessibilidade">WCAG 2.1 AA · e-MAG</span>
              <a
                href="/acessibilidade"
                className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded"
              >
                Política de Acessibilidade
              </a>
              <a
                href="/privacidade"
                className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded"
              >
                Privacidade (LGPD)
              </a>
              <a
                href="/cookies"
                className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded"
              >
                Aviso de Cookies
              </a>
              <a
                href="/transparencia/dados-abertos"
                className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded"
              >
                Dados Abertos
              </a>
              <a
                href="/transparencia/documentos"
                className="hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary-fg rounded"
              >
                Documentos
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
