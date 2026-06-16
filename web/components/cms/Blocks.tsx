import { Bloco } from '../../lib/cms';
import SliderBloco from './SliderBloco';

/**
 * Renderizador de blocos do CMS. Mapeia `tipo` → componente. O conteúdo vem
 * como JSON (props). Blocos de texto/estrutura escapam por padrão via React.
 * O bloco `html` usa dangerouslySetInnerHTML — o conteúdo vem da API, que
 * é responsável pela sanitização antes de gravar (mesmo approach de /noticias).
 */
export function BlockRenderer({ blocos }: { blocos: Bloco[] }) {
  return (
    <>
      {blocos.map((b) => (
        <Block key={b.id} bloco={b} />
      ))}
    </>
  );
}

function Block({ bloco }: { bloco: Bloco }) {
  const c = bloco.conteudo ?? {};
  switch (bloco.tipo) {
    case 'hero':
      return <Hero c={c} />;
    case 'texto':
      return <Texto c={c} />;
    case 'servicos':
      return <Servicos c={c} />;
    case 'galeria':
      return <Galeria c={c} />;
    case 'html':
      return <Html c={c} />;
    case 'botao':
      return <Botao c={c} />;
    case 'cards':
      return <Cards c={c} />;
    case 'tabela':
      return <Tabela c={c} />;
    case 'imagem':
      return <Imagem c={c} />;
    case 'divisor':
      return <Divisor />;
    case 'slider':
      return <Slider c={c} />;
    default:
      return null; // tipo desconhecido: ignora com segurança
  }
}

// ---------------------------------------------------------------------------
// Blocos existentes
// ---------------------------------------------------------------------------

function Hero({ c }: { c: Record<string, unknown> }) {
  return (
    <section className="rounded bg-primary p-8 text-primary-fg">
      <h2 className="font-heading text-3xl font-bold">{String(c.titulo ?? '')}</h2>
      {c.subtitulo ? <p className="mt-2 text-lg">{String(c.subtitulo)}</p> : null}
      {isLink(c.cta) ? (
        <a
          href={String(c.cta.href)}
          className="mt-4 inline-block rounded bg-primary-fg px-4 py-2 font-semibold text-primary"
        >
          {String(c.cta.label ?? 'Saiba mais')}
        </a>
      ) : null}
    </section>
  );
}

function Texto({ c }: { c: Record<string, unknown> }) {
  const corpo = String(c.corpo ?? '');
  return (
    <section className="prose max-w-none">
      {c.titulo ? (
        <h2 className="font-heading text-2xl font-bold">{String(c.titulo)}</h2>
      ) : null}
      {corpo
        .split('\n')
        .filter(Boolean)
        .map((par, i) => (
          <p key={i}>{par}</p>
        ))}
    </section>
  );
}

function Servicos({ c }: { c: Record<string, unknown> }) {
  const itens = Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : [];
  return (
    <section className="space-y-3">
      {c.titulo ? (
        <h2 className="font-heading text-2xl font-bold">{String(c.titulo)}</h2>
      ) : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {itens.map((it, i) => (
          <li key={i}>
            <a
              href={String(it.href ?? '#')}
              className="block rounded border border-primary p-4 text-center hover:bg-primary hover:text-primary-fg"
            >
              {String(it.label ?? '')}
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Galeria({ c }: { c: Record<string, unknown> }) {
  const imagens = Array.isArray(c.imagens) ? (c.imagens as Record<string, unknown>[]) : [];
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {imagens.map((img, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={String(img.url ?? '')}
          alt={String(img.alt ?? '')}
          className="h-40 w-full rounded object-cover"
        />
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Novos blocos
// ---------------------------------------------------------------------------

/**
 * Bloco HTML — renderiza HTML armazenado na API (sanitizado pelo backend).
 * Idêntico ao approach de /noticias/[slug]/page.tsx (dangerouslySetInnerHTML).
 * NÃO use para HTML digitado pelo admin sem passar pela API primeiro.
 */
function Html({ c }: { c: Record<string, unknown> }) {
  const html = String(c.html ?? '');
  if (!html) return null;
  return (
    <div
      className="prose-portal max-w-none text-fg"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Bloco Botão (CTA) — link estilizado por tokens de tema.
 * estilo: 'primario' (padrão) | 'secundario'
 */
function Botao({ c }: { c: Record<string, unknown> }) {
  const label = String(c.label ?? 'Saiba mais');
  const href = String(c.href ?? '#');
  const estilo = String(c.estilo ?? 'primario');

  const cls =
    estilo === 'secundario'
      ? 'inline-flex items-center rounded border-2 border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary hover:text-primary-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors'
      : 'inline-flex items-center rounded bg-primary px-5 py-2.5 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors';

  return (
    <div className="flex justify-start">
      <a href={href} className={cls}>
        {label}
      </a>
    </div>
  );
}

/**
 * Bloco Cards — grade de cards com título, texto, ícone opcional e link.
 */
function Cards({ c }: { c: Record<string, unknown> }) {
  const titulo = c.titulo ? String(c.titulo) : null;
  const itens = Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : [];

  return (
    <section className="space-y-4">
      {titulo && <h2 className="font-heading text-2xl font-bold">{titulo}</h2>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map((item, i) => {
          const card = (
            <div className="flex flex-col gap-2 rounded border border-border bg-bg p-4 transition-shadow hover:shadow-md">
              {item.icone ? (
                <span className="text-2xl" aria-hidden="true">
                  {String(item.icone)}
                </span>
              ) : null}
              {item.titulo ? (
                <h3 className="font-heading text-base font-semibold text-fg">
                  {String(item.titulo)}
                </h3>
              ) : null}
              {item.texto ? (
                <p className="text-sm text-fg/70">{String(item.texto)}</p>
              ) : null}
              {item.href ? (
                <a
                  href={String(item.href)}
                  className="mt-auto text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
                >
                  Saiba mais
                  <span className="sr-only"> sobre {String(item.titulo ?? '')}</span>
                </a>
              ) : null}
            </div>
          );
          return <li key={i}>{card}</li>;
        })}
      </ul>
    </section>
  );
}

/**
 * Bloco Tabela — cabeçalhos + linhas.
 */
function Tabela({ c }: { c: Record<string, unknown> }) {
  const titulo = c.titulo ? String(c.titulo) : null;
  const cabecalhos = Array.isArray(c.cabecalhos)
    ? (c.cabecalhos as unknown[]).map(String)
    : [];
  const linhas = Array.isArray(c.linhas)
    ? (c.linhas as unknown[][]).map((linha) =>
        Array.isArray(linha) ? linha.map(String) : [],
      )
    : [];

  if (cabecalhos.length === 0 && linhas.length === 0) return null;

  return (
    <section className="space-y-2">
      {titulo && <h2 className="font-heading text-2xl font-bold">{titulo}</h2>}
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse text-sm">
          {cabecalhos.length > 0 && (
            <thead className="bg-muted">
              <tr>
                {cabecalhos.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="border-b border-border px-3 py-2 text-left font-semibold text-fg"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {linhas.map((linha, ri) => (
              <tr key={ri} className={ri % 2 === 1 ? 'bg-muted/40' : ''}>
                {linha.map((cel, ci) => (
                  <td key={ci} className="border-b border-border/50 px-3 py-2 text-fg/80">
                    {cel}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Bloco Imagem — imagem com legenda opcional.
 */
function Imagem({ c }: { c: Record<string, unknown> }) {
  const url = String(c.url ?? '');
  const alt = String(c.alt ?? '');
  const legenda = c.legenda ? String(c.legenda) : null;

  if (!url) return null;

  return (
    <figure className="space-y-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className="h-auto w-full rounded border border-border object-cover"
        loading="lazy"
      />
      {legenda && (
        <figcaption className="text-center text-xs text-fg/60">{legenda}</figcaption>
      )}
    </figure>
  );
}

/**
 * Bloco Divisor — separador visual (<hr>).
 */
function Divisor() {
  return <hr className="border-border" />;
}

/**
 * Bloco Slider — carrossel de imagens acessível (Client Component).
 * Shape do conteúdo:
 *   { slides: {url, alt, legenda?, href?}[], autoplay?: boolean, intervalo?: number }
 */
function Slider({ c }: { c: Record<string, unknown> }) {
  const rawSlides = Array.isArray(c.slides) ? (c.slides as Record<string, unknown>[]) : [];
  const slides = rawSlides.map((s) => ({
    url: String(s.url ?? ''),
    alt: String(s.alt ?? ''),
    legenda: s.legenda ? String(s.legenda) : undefined,
    href: s.href ? String(s.href) : undefined,
  })).filter((s) => s.url);

  if (slides.length === 0) return null;

  return (
    <SliderBloco
      slides={slides}
      autoplay={Boolean(c.autoplay)}
      intervalo={typeof c.intervalo === 'number' ? c.intervalo : 5}
    />
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isLink(v: unknown): v is { href: string; label?: string } {
  return typeof v === 'object' && v !== null && 'href' in (v as object);
}
