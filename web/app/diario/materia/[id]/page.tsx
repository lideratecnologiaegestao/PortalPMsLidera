import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMateria, rotuloTipo } from '../../../../lib/diario';
import { dataCurta } from '../../../../lib/format';

export const metadata = { title: 'Matéria do Diário Oficial' };

export default async function MateriaPage({ params }: { params: { id: string } }) {
  const m = await getMateria(params.id);
  if (!m) notFound();
  const orgao = m.secretaria?.nome || m.orgaoNome || 'Atos Diversos';

  return (
    <article className="mx-auto max-w-3xl px-4 py-8 space-y-5">
      <nav className="text-sm text-fg/60">
        <Link href="/diario" className="text-primary hover:underline">Diário Oficial</Link>
        <span> / </span>
        <Link href={`/diario/${encodeURIComponent(m.edicao.numero)}`} className="text-primary hover:underline">
          Edição nº {m.edicao.numero}
        </Link>
      </nav>

      <header className="border-b border-border pb-4">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-primary/10 px-2 py-0.5 font-semibold text-primary">{rotuloTipo(m.tipo)}</span>
          <span className="text-fg/60">{orgao}</span>
          <span className="text-fg/50">· Edição nº {m.edicao.numero} · {dataCurta(m.edicao.dataEdicao)}</span>
        </div>
        <h1 className="font-heading text-2xl font-bold text-fg">
          {m.numeroAto ? `${m.numeroAto} — ` : ''}{m.titulo}
        </h1>
        {m.ementa && <p className="mt-2 italic text-fg/70">{m.ementa}</p>}
      </header>

      {m.retifica && (
        <p className="rounded border border-warning bg-warning/10 p-3 text-sm">
          Esta matéria retifica: <strong>{m.retifica.numeroAto ? `${m.retifica.numeroAto} — ` : ''}{m.retifica.titulo}</strong>
        </p>
      )}

      {m.conteudo
        ? <div className="prose-portal max-w-none" dangerouslySetInnerHTML={{ __html: m.conteudo }} />
        : <p className="text-fg/60">Sem conteúdo textual.</p>}

      <footer className="border-t border-border pt-4 text-xs text-fg/60">
        <p>Publicado no Diário Oficial Eletrônico — Edição nº {m.edicao.numero}.</p>
        {m.edicao.hash && (
          <p className="mt-1">
            <Link href={`/diario/verificar?hash=${m.edicao.hash}`} className="text-primary hover:underline">
              Verificar autenticidade da edição →
            </Link>
          </p>
        )}
      </footer>
    </article>
  );
}
