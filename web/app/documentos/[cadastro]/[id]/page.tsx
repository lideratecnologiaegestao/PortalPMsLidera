import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import PageContainer from '../../../../components/portal/PageContainer';
import { getDocumento } from '../../../../lib/documentos';

export const dynamic = 'force-dynamic';

// ─── SEO ─────────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: { cadastro: string; id: string };
}): Promise<Metadata> {
  const result = await getDocumento(params.cadastro, params.id).catch(() => null);
  if (!result) return { title: 'Documento não encontrado' };
  const { doc, cadastroNome } = result;
  const numero = doc.numero ? ` nº ${doc.numero}` : '';
  return {
    title: `${doc.titulo}${numero} — ${cadastroNome}`,
    description: doc.ementa ?? undefined,
  };
}

// ─── Helpers de formatação ────────────────────────────────────────────────────

function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  } catch {
    return null;
  }
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default async function DocumentoDetalhePage({
  params,
}: {
  params: { cadastro: string; id: string };
}) {
  const result = await getDocumento(params.cadastro, params.id);
  if (!result) notFound();

  const { doc, cadastroNome, cadastroSlug } = result;
  const dataFormatada = formatarData(doc.dataDocumento);

  return (
    <PageContainer largura="medio">
      {/* Breadcrumb */}
      <nav
        aria-label="Navegação estrutural"
        className="mb-4 flex flex-wrap items-center gap-1 text-sm text-fg/60"
      >
        <a href="/" className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Início
        </a>
        <span aria-hidden="true" className="select-none">/</span>
        <a
          href={`/documentos/${cadastroSlug}`}
          className="hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {cadastroNome}
        </a>
        <span aria-hidden="true" className="select-none">/</span>
        <span className="text-fg/80" aria-current="page">
          {doc.numero ? `Nº ${doc.numero}` : 'Detalhe'}
        </span>
      </nav>

      <article aria-labelledby="doc-titulo">
        {/* Cabeçalho do documento */}
        <header>
          {/* Badges: tipo e situação */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {doc.tipo && (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {doc.tipo.nome}
              </span>
            )}
            {!doc.tipo && (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                {cadastroNome}
              </span>
            )}
            {doc.situacao && (
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-fg/70">
                {doc.situacao}
              </span>
            )}
          </div>

          {/* Número e ano */}
          {doc.numero && (
            <p className="mb-1 text-sm font-semibold text-fg/70">
              {cadastroNome} n&ordm;&nbsp;
              <span className="text-fg">
                {doc.numero}
                {doc.ano ? `/${doc.ano}` : ''}
              </span>
            </p>
          )}

          {/* Título */}
          <h1
            id="doc-titulo"
            className="font-heading text-2xl font-bold leading-snug text-fg sm:text-3xl"
          >
            {doc.titulo}
          </h1>

          {/* Metadados em linha */}
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-fg/60">
            {dataFormatada && doc.dataDocumento && (
              <div className="flex gap-1">
                <dt className="font-medium text-fg/70">Data:</dt>
                <dd>
                  <time dateTime={doc.dataDocumento.slice(0, 10)}>
                    {dataFormatada}
                  </time>
                </dd>
              </div>
            )}
            {doc.ano && !doc.dataDocumento && (
              <div className="flex gap-1">
                <dt className="font-medium text-fg/70">Ano:</dt>
                <dd>{doc.ano}</dd>
              </div>
            )}
            {doc.orgao && (
              <div className="flex gap-1">
                <dt className="font-medium text-fg/70">Órgão:</dt>
                <dd>{doc.orgao}</dd>
              </div>
            )}
            <div className="flex gap-1">
              <dt className="sr-only">Downloads</dt>
              <dd aria-label={`${doc.downloads} downloads`}>
                {doc.downloads} download{doc.downloads === 1 ? '' : 's'}
              </dd>
            </div>
          </dl>
        </header>

        {/* Ementa / descrição */}
        {doc.ementa && (
          <section aria-labelledby="doc-ementa-titulo" className="mt-6">
            <h2
              id="doc-ementa-titulo"
              className="text-sm font-semibold uppercase tracking-wide text-fg/50"
            >
              Ementa
            </h2>
            <p className="mt-2 leading-relaxed text-fg/80">{doc.ementa}</p>
          </section>
        )}

        {/* Botão de download/abertura */}
        <div className="mt-8">
          {doc.arquivoUrl ? (
            <a
              href={`/api/documentos/baixar/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-fg shadow-sm hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label={`Baixar ou abrir o documento ${doc.titulo}`}
            >
              {/* Ícone de download — inline SVG, sem dependência externa */}
              <svg
                aria-hidden="true"
                focusable="false"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Baixar / Abrir documento
            </a>
          ) : (
            <p
              role="status"
              className="inline-block rounded-lg border border-border bg-muted px-6 py-3 text-sm text-fg/60"
            >
              Arquivo não disponível para este documento.
            </p>
          )}
        </div>

        {/* ── Seção: Texto extraído do documento ───────────────────────────── */}
        {doc.conteudoExtraido && doc.conteudoExtraido.trim().length > 0 && (
          <section
            aria-labelledby="doc-texto-titulo"
            className="mt-10"
          >
            {/* Cabeçalho da seção */}
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2
                id="doc-texto-titulo"
                className="text-lg font-semibold text-fg"
              >
                Conteúdo do documento (texto)
              </h2>

              {/* Badge discreto de método OCR — só quando não é extração nativa */}
              {doc.ocrMetodo && doc.ocrMetodo !== 'nativo' && (
                <span
                  aria-label={`Texto reconhecido por OCR (${doc.ocrMetodo === 'claude' ? 'IA' : 'Tesseract'})`}
                  title={`Reconhecimento óptico de caracteres via ${doc.ocrMetodo === 'claude' ? 'IA (Claude)' : 'Tesseract'}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-fg/60"
                >
                  {/* Ícone de lupa/texto */}
                  <svg
                    aria-hidden="true"
                    focusable="false"
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  Reconhecido por OCR
                </span>
              )}
            </div>

            {/* Aviso sobre a natureza do texto extraído */}
            <div
              role="note"
              aria-label="Aviso sobre o texto extraído"
              className="mb-4 flex gap-3 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-fg/80"
            >
              {/* Ícone de aviso */}
              <svg
                aria-hidden="true"
                focusable="false"
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0 text-warning"
                style={{ color: 'var(--color-warning)' }}
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p>
                <strong className="font-semibold">Texto extraído automaticamente do arquivo — pode conter imprecisões.</strong>{' '}
                O documento original (PDF) é a fonte oficial.
              </p>
            </div>

            {/* Conteúdo de texto — texto puro escapado pelo React, sem dangerouslySetInnerHTML */}
            <div
              className="rounded-lg border border-border bg-muted/40 p-5"
            >
              <div
                className="max-h-[32rem] overflow-y-auto"
                tabIndex={0}
                aria-label="Texto extraído do documento"
              >
                {/*
                  Quebra o texto em parágrafos separando por linha dupla (\n\n).
                  Dentro de cada parágrafo, quebras simples (\n) viram <br />.
                  Nenhum HTML é injetado — apenas nós de texto e elementos React.
                */}
                <div className="space-y-3 text-sm leading-relaxed text-fg/80" style={{ maxWidth: '72ch' }}>
                  {doc.conteudoExtraido
                    .split(/\n{2,}/)
                    .map((paragrafo, idx) => (
                      <p key={idx}>
                        {paragrafo.split('\n').map((linha, lIdx, arr) => (
                          lIdx < arr.length - 1
                            ? [linha, <br key={`br-${lIdx}`} />]
                            : linha
                        ))}
                      </p>
                    ))}
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Link de retorno */}
        <div className="mt-8 border-t border-border pt-6">
          <a
            href={`/documentos/${cadastroSlug}`}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Voltar para {cadastroNome}
          </a>
        </div>
      </article>
    </PageContainer>
  );
}
