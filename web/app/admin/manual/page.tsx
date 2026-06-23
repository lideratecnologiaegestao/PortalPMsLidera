'use client';

/**
 * Admin — Manual do Sistema
 *
 * Busca /manual-do-sistema.md (asset estático em web/public/) e renderiza com:
 *  - Sumário (TOC) lateral navegável com âncoras por seção (##/###)
 *  - Busca client-side que destaca e rola até a seção correspondente
 *  - Acessibilidade WCAG 2.1 AA: headings hierárquicos, aria-current, foco visível
 *  - Responsivo: TOC colapsa em mobile (toggle)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface TocEntry {
  level: 2 | 3;
  text: string;
  slug: string;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/** Converte título de seção em slug de âncora (compatível com o que injetamos). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove diacríticos
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Extrai entradas ## e ### do markdown bruto para montar o TOC. */
function extrairToc(markdown: string): TocEntry[] {
  const toc: TocEntry[] = [];
  const linhas = markdown.split('\n');
  for (const linha of linhas) {
    const m2 = linha.match(/^## (.+)/);
    const m3 = linha.match(/^### (.+)/);
    if (m2) {
      const text = m2[1].trim();
      toc.push({ level: 2, text, slug: slugify(text) });
    } else if (m3) {
      const text = m3[1].trim();
      toc.push({ level: 3, text, slug: slugify(text) });
    }
  }
  return toc;
}

// ─── Componente Interno: TOC ─────────────────────────────────────────────────

function Toc({
  entries,
  ativoSlug,
  filtro,
  onNavigate,
}: {
  entries: TocEntry[];
  ativoSlug: string;
  filtro: string;
  onNavigate: (slug: string) => void;
}) {
  const visiveis = filtro
    ? entries.filter((e) =>
        e.text.toLowerCase().includes(filtro.toLowerCase()),
      )
    : entries;

  if (visiveis.length === 0)
    return (
      <p className="text-xs text-fg/50 px-2">
        Nenhuma seção encontrada.
      </p>
    );

  return (
    <nav aria-label="Sumário do manual">
      <ol className="list-none space-y-0.5">
        {visiveis.map((e) => {
          const ativo = e.slug === ativoSlug;
          return (
            <li key={e.slug}>
              <a
                href={`#${e.slug}`}
                aria-current={ativo ? 'location' : undefined}
                onClick={(ev) => {
                  ev.preventDefault();
                  onNavigate(e.slug);
                }}
                className={[
                  'block rounded px-2 py-1 text-sm leading-snug transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-1',
                  e.level === 3 ? 'ml-3 text-xs' : 'font-semibold',
                  ativo
                    ? 'bg-primary/10 text-primary'
                    : 'text-fg/70 hover:bg-muted/50 hover:text-fg',
                ].join(' ')}
              >
                {e.text}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ─── Componente Principal ─────────────────────────────────────────────────────

export default function ManualPage() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [ativoSlug, setAtivoSlug] = useState('');
  const [tocAberto, setTocAberto] = useState(false);
  const conteudoRef = useRef<HTMLDivElement>(null);
  const buscaRef = useRef<HTMLInputElement>(null);

  // Carrega o arquivo estático
  useEffect(() => {
    fetch('/manual-do-sistema.md')
      .then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar o manual (${r.status}).`);
        return r.text();
      })
      .then(setMarkdown)
      .catch((e) => setErro(e.message));
  }, []);

  const toc = useMemo(
    () => (markdown ? extrairToc(markdown) : []),
    [markdown],
  );

  // Filtra seções pelo texto de busca e vai para a primeira correspondência
  useEffect(() => {
    if (!busca || !conteudoRef.current) return;
    const slug = slugify(busca.trim());
    // Tenta correspondência exata primeiro, depois parcial
    const match =
      toc.find((e) => e.slug === slug) ??
      toc.find((e) =>
        e.text.toLowerCase().includes(busca.toLowerCase()),
      );
    if (match) navegarPara(match.slug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  /** Rola suavemente até a seção e atualiza aria-current no TOC. */
  const navegarPara = useCallback((slug: string) => {
    setAtivoSlug(slug);
    const el = document.getElementById(slug);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Foca o heading para leitores de tela
    el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
    setTocAberto(false); // fecha menu mobile após navegar
  }, []);

  // Intersection Observer para atualizar seção ativa ao rolar
  useEffect(() => {
    if (!markdown || !conteudoRef.current) return;
    const headings = conteudoRef.current.querySelectorAll<HTMLElement>(
      'h2[id], h3[id]',
    );
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setAtivoSlug(entry.target.id);
          }
        }
      },
      { rootMargin: '-10% 0px -70% 0px', threshold: 0 },
    );
    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [markdown]);

  // ─── Renderização ───────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col">
      {/* Cabeçalho da página */}
      <header className="mb-4">
        <h1 className="font-heading text-2xl font-bold">Manual do Sistema</h1>
        <p className="mt-1 text-sm text-fg/70">
          Aprenda a usar todas as áreas do portal. Dúvidas rápidas? Pergunte ao{' '}
          <strong>Assistente do Portal</strong> no chat interno (botão no canto
          inferior direito da tela).
        </p>
      </header>

      {erro && (
        <p role="alert" className="rounded border border-danger p-3 text-sm text-danger mb-4">
          {erro}
        </p>
      )}

      {!markdown && !erro && (
        <p aria-live="polite" className="text-sm text-fg/60">
          Carregando manual…
        </p>
      )}

      {markdown && (
        <div className="flex flex-1 gap-6 lg:gap-8">
          {/* ── TOC lateral (desktop sempre visível; mobile: toggle) ── */}
          <aside
            aria-label="Sumário"
            className="lg:sticky lg:top-4 lg:self-start lg:h-[calc(100vh-6rem)] lg:overflow-y-auto lg:w-64 lg:shrink-0"
          >
            {/* Botão toggle — só no mobile */}
            <button
              type="button"
              aria-expanded={tocAberto}
              aria-controls="toc-lista"
              onClick={() => setTocAberto((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded border border-border px-3 py-2 text-sm font-semibold lg:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span>Sumário</span>
              <span aria-hidden="true">{tocAberto ? '▲' : '▼'}</span>
            </button>

            <div
              id="toc-lista"
              className={tocAberto ? 'block lg:block' : 'hidden lg:block'}
            >
              {/* Campo de busca */}
              <div className="mb-3">
                <label htmlFor="busca-manual" className="sr-only">
                  Buscar no manual
                </label>
                <input
                  id="busca-manual"
                  ref={buscaRef}
                  type="search"
                  placeholder="Buscar no manual…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full rounded border border-border bg-bg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  aria-label="Buscar seção no manual"
                />
              </div>

              <Toc
                entries={toc}
                ativoSlug={ativoSlug}
                filtro={busca}
                onNavigate={navegarPara}
              />
            </div>
          </aside>

          {/* ── Conteúdo principal ── */}
          <main
            ref={conteudoRef}
            id="conteudo-manual"
            aria-label="Conteúdo do manual"
            className="min-w-0 flex-1"
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                // Injeta id=slug nos headings para que âncoras e TOC funcionem
                h2: ({ children, ...props }) => {
                  const text = String(children);
                  const id = slugify(text);
                  return (
                    <h2
                      id={id}
                      className="font-heading mt-8 mb-3 scroll-mt-4 border-b border-border pb-1 text-xl font-bold first:mt-0"
                      {...props}
                    >
                      {children}
                    </h2>
                  );
                },
                h3: ({ children, ...props }) => {
                  const text = String(children);
                  const id = slugify(text);
                  return (
                    <h3
                      id={id}
                      className="font-heading mt-5 mb-2 scroll-mt-4 text-base font-semibold"
                      {...props}
                    >
                      {children}
                    </h3>
                  );
                },
                // Headings menores (h1 é o título da página)
                h1: ({ children, ...props }) => (
                  <h1 className="sr-only" {...props}>
                    {children}
                  </h1>
                ),
                p: ({ children, ...props }) => (
                  <p className="mb-3 text-sm leading-relaxed" {...props}>
                    {children}
                  </p>
                ),
                ul: ({ children, ...props }) => (
                  <ul
                    className="mb-3 list-disc pl-5 text-sm space-y-1"
                    {...props}
                  >
                    {children}
                  </ul>
                ),
                ol: ({ children, ...props }) => (
                  <ol
                    className="mb-3 list-decimal pl-5 text-sm space-y-1"
                    {...props}
                  >
                    {children}
                  </ol>
                ),
                li: ({ children, ...props }) => (
                  <li className="leading-relaxed" {...props}>
                    {children}
                  </li>
                ),
                strong: ({ children, ...props }) => (
                  <strong className="font-semibold" {...props}>
                    {children}
                  </strong>
                ),
                blockquote: ({ children, ...props }) => (
                  <blockquote
                    className="my-3 border-l-4 border-primary/40 pl-4 text-sm italic text-fg/70"
                    {...props}
                  >
                    {children}
                  </blockquote>
                ),
                code: ({ children, ...props }) => (
                  <code
                    className="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono"
                    {...props}
                  >
                    {children}
                  </code>
                ),
                pre: ({ children, ...props }) => (
                  <pre
                    className="my-3 overflow-x-auto rounded bg-muted p-3 text-sm"
                    {...props}
                  >
                    {children}
                  </pre>
                ),
                table: ({ children, ...props }) => (
                  <div className="my-4 overflow-x-auto">
                    <table
                      className="w-full border-collapse text-sm"
                      {...props}
                    >
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children, ...props }) => (
                  <th
                    className="border border-border bg-muted px-3 py-1.5 text-left text-xs font-semibold"
                    {...props}
                  >
                    {children}
                  </th>
                ),
                td: ({ children, ...props }) => (
                  <td
                    className="border border-border/60 px-3 py-1.5 align-top text-xs"
                    {...props}
                  >
                    {children}
                  </td>
                ),
                hr: () => (
                  <hr className="my-6 border-border" aria-hidden="true" />
                ),
                a: ({ children, ...props }) => (
                  <a
                    className="text-primary underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    {...props}
                  >
                    {children}
                  </a>
                ),
              }}
            >
              {markdown}
            </ReactMarkdown>
          </main>
        </div>
      )}
    </div>
  );
}
