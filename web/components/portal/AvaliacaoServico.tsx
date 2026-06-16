'use client';

import { useEffect, useState } from 'react';

interface Aval { media: number; total: number; jaAvaliou: boolean; minhaNota: number | null }

/** Avaliação por estrelas de um serviço (1–5), voto anônimo (1 por visitante). */
export default function AvaliacaoServico({ slug }: { slug: string }) {
  const [data, setData] = useState<Aval | null>(null);
  const [hover, setHover] = useState(0);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    fetch(`/api/servicos/${encodeURIComponent(slug)}/avaliacao`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d))
      .catch(() => undefined);
  }, [slug]);

  async function votar(nota: number) {
    if (!data || data.jaAvaliou) return;
    setEnviando(true); setErro('');
    try {
      const r = await fetch(`/api/servicos/${encodeURIComponent(slug)}/avaliar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nota }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.message ?? 'Não foi possível avaliar.');
      setData(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao avaliar.');
    } finally { setEnviando(false); }
  }

  if (!data) return null;
  const exibida = hover || data.minhaNota || 0;

  return (
    <section className="mt-8 rounded-xl border border-border bg-bg p-5">
      <h2 className="font-heading text-lg font-bold text-fg">Avalie este serviço</h2>
      <p className="text-sm text-fg/60">
        {data.total > 0 ? <>Média <strong>{data.media.toFixed(1)}</strong> · {data.total} avaliação(ões)</> : 'Seja o primeiro a avaliar.'}
      </p>
      <div className="mt-2 flex items-center gap-1" role="group" aria-label="Avaliação por estrelas">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i} type="button" disabled={data.jaAvaliou || enviando}
            onMouseEnter={() => !data.jaAvaliou && setHover(i)} onMouseLeave={() => setHover(0)}
            onClick={() => votar(i)} aria-label={`${i} estrela${i > 1 ? 's' : ''}`}
            className="rounded p-0.5 transition-transform hover:scale-110 disabled:cursor-default disabled:hover:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <svg width="30" height="30" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"
              className={exibida >= i ? 'text-warning' : 'text-fg/25'}>
              <path d="M10 1.6l2.47 5 5.53.8-4 3.9.94 5.5L10 14.9l-4.94 2.6.94-5.5-4-3.9 5.53-.8L10 1.6z" />
            </svg>
          </button>
        ))}
      </div>
      {data.jaAvaliou && <p className="mt-1 text-sm font-semibold text-success">✓ Obrigado! Você avaliou com {data.minhaNota} estrela(s).</p>}
      {!data.jaAvaliou && <p className="mt-1 text-xs text-fg/50">Avaliação anônima — 1 voto por pessoa.</p>}
      {erro && <p className="mt-1 text-sm text-danger">{erro}</p>}
    </section>
  );
}
