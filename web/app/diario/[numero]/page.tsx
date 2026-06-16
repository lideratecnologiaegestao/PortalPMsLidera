import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getEdicao, rotuloTipo, type MateriaResumo } from '../../../lib/diario';
import { dataHora, dataCurta } from '../../../lib/format';

export const metadata = { title: 'Edição do Diário Oficial' };

function orgaoDe(m: MateriaResumo): string {
  return m.secretaria?.nome || m.orgaoNome || 'Atos Diversos';
}

export default async function EdicaoPage({ params }: { params: { numero: string } }) {
  const numero = decodeURIComponent(params.numero);
  const ed = await getEdicao(numero);
  if (!ed) notFound();

  const materias = ed.materias ?? [];
  // Agrupa por órgão preservando a ordem de exibição.
  const grupos = new Map<string, MateriaResumo[]>();
  for (const m of materias) {
    const k = orgaoDe(m);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(m);
  }
  const { hashConfere, assinaturaConfere } = ed.integridade;
  const estado = !hashConfere
    ? { cls: 'bg-danger/15 text-danger', txt: '✗ Falha de integridade — o conteúdo pode ter sido alterado' }
    : assinaturaConfere
      ? { cls: 'bg-success/15 text-success', txt: '✓ Íntegra e assinada digitalmente' }
      : { cls: 'bg-warning/20 text-fg', txt: '✓ Conteúdo íntegro · assinatura digital pendente de certificado' };

  return (
    <article className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <nav className="text-sm text-fg/60">
        <Link href="/diario" className="text-primary hover:underline">Diário Oficial</Link>
        <span> / Edição nº {ed.numero}</span>
      </nav>

      <header className="rounded-lg border border-border bg-muted/30 p-6">
        <h1 className="font-heading text-2xl font-bold text-fg">{ed.titulo}</h1>
        <p className="mt-1 text-sm text-fg/70">
          Edição nº {ed.numero} · {dataCurta(ed.dataEdicao)} · publicada em {dataHora(ed.publicadoEm)}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className={`inline-flex items-center gap-1 rounded px-2 py-1 font-semibold ${estado.cls}`}>
            {estado.txt}
          </span>
          <Link href={`/diario/verificar?hash=${ed.hash ?? ''}`} className="text-primary hover:underline">
            Verificar autenticidade
          </Link>
          {ed.arquivoKey && (
            <a
              href={`/api/diario/${encodeURIComponent(ed.numero)}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 font-semibold text-primary-fg hover:opacity-90"
            >
              ↓ Baixar PDF{ed.totalPaginas ? ` (${ed.totalPaginas} pág.)` : ''}
            </a>
          )}
        </div>
      </header>

      {/* Visualizador do PDF oficial */}
      {ed.arquivoKey && (
        <details className="rounded border border-border" open>
          <summary className="cursor-pointer p-3 text-sm font-semibold">Visualizar PDF oficial</summary>
          <iframe
            src={`/api/diario/${encodeURIComponent(ed.numero)}/pdf`}
            title={`PDF da edição nº ${ed.numero}`}
            className="h-[80vh] w-full border-t border-border"
          />
        </details>
      )}

      {/* Sumário */}
      {materias.length > 0 && (
        <section className="rounded border border-border p-4">
          <h2 className="mb-2 font-heading text-lg font-bold">Sumário</h2>
          <ol className="space-y-3">
            {[...grupos.entries()].map(([orgao, lista]) => (
              <li key={orgao}>
                <p className="text-sm font-semibold text-fg/80">{orgao}</p>
                <ul className="ml-3 mt-1 space-y-1">
                  {lista.map((m) => (
                    <li key={m.id} className="text-sm">
                      <a href={`#m-${m.id}`} className="text-primary hover:underline">
                        {rotuloTipo(m.tipo)}{m.numeroAto ? ` ${m.numeroAto}` : ''} — {m.titulo}
                      </a>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* Conteúdo legado (edição sem matérias) */}
      {materias.length === 0 && ed.conteudo && (
        <section className="prose-portal max-w-none rounded border border-border p-5"
          dangerouslySetInnerHTML={{ __html: ed.conteudo }} />
      )}

      {/* Matérias */}
      {materias.map((m) => (
        <section key={m.id} id={`m-${m.id}`} className="scroll-mt-24 rounded border border-border p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">{rotuloTipo(m.tipo)}</span>
            <span className="text-fg/60">{orgaoDe(m)}</span>
          </div>
          <h3 className="font-heading text-lg font-bold text-fg">
            {m.numeroAto ? `${m.numeroAto} — ` : ''}{m.titulo}
          </h3>
          {m.ementa && <p className="mt-1 text-sm italic text-fg/70">{m.ementa}</p>}
          {m.conteudo && (
            <div className="prose-portal mt-3 max-w-none" dangerouslySetInnerHTML={{ __html: m.conteudo }} />
          )}
          <p className="mt-3 text-xs">
            <Link href={`/diario/materia/${m.id}`} className="text-primary hover:underline">Link permanente desta matéria →</Link>
          </p>
        </section>
      ))}

      {/* Verificação técnica */}
      <details className="rounded border border-border bg-muted/20 p-4 text-sm">
        <summary className="cursor-pointer font-semibold">Dados de autenticidade</summary>
        <dl className="mt-2 space-y-1">
          <div className="flex flex-wrap gap-2"><dt className="font-semibold">Hash SHA-256:</dt><dd className="break-all font-mono text-xs">{ed.hash}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold">Carimbo de tempo:</dt><dd>{dataHora(ed.carimboTempo)}</dd></div>
          <div className="flex gap-2"><dt className="font-semibold">Algoritmo:</dt><dd>{ed.algoritmo}</dd></div>
        </dl>
      </details>
    </article>
  );
}
