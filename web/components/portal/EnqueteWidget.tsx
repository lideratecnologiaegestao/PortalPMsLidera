'use client';

import { useEffect, useState, useCallback } from 'react';

interface Opcao { id: string; texto: string; votos: number; pct: number }
interface Resultado {
  id: string; pergunta: string; ativa: boolean; encerrada: boolean;
  total: number; jaVotou: boolean; opcoes: Opcao[];
}

/**
 * Enquete pública (poll). Mostra as opções para votar; após votar (ou se já
 * votou/encerrada) mostra o resultado em %. Voto anônimo (sem dado pessoal).
 * `enqueteId="ativa"` carrega a enquete ativa do tenant.
 */
export default function EnqueteWidget({ enqueteId }: { enqueteId: string }) {
  const [r, setR] = useState<Resultado | null>(null);
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'vazio'>('carregando');
  const [votando, setVotando] = useState(false);
  const [erro, setErro] = useState('');

  const url = enqueteId === 'ativa' ? '/api/enquetes/ativa' : `/api/enquetes/${enqueteId}`;

  const carregar = useCallback(() => {
    fetch(url)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d && d.id) { setR(d); setEstado('pronto'); } else setEstado('vazio'); })
      .catch(() => setEstado('vazio'));
  }, [url]);

  useEffect(() => { carregar(); }, [carregar]);

  async function votar(opcaoId: string) {
    if (!r) return;
    setVotando(true); setErro('');
    try {
      const res = await fetch(`/api/enquetes/${r.id}/votar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opcaoId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.message ?? 'Não foi possível votar.');
      setR(d);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao votar.');
      carregar();
    } finally {
      setVotando(false);
    }
  }

  if (estado === 'vazio') return null;
  if (estado === 'carregando' || !r) {
    return <div className="rounded-xl border border-border bg-bg p-5 text-sm text-fg/60">Carregando enquete…</div>;
  }

  const mostrarResultado = r.jaVotou || r.encerrada;

  return (
    <div className="flex h-full flex-col rounded-xl border border-border bg-bg p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
        <span aria-hidden="true">📊</span> Enquete
      </div>
      <h3 className="mb-4 font-heading text-lg font-bold text-primary">{r.pergunta}</h3>

      <div className="space-y-2.5">
        {r.opcoes.map((o) => (
          mostrarResultado ? (
            <div key={o.id}>
              <div className="mb-0.5 flex justify-between text-sm">
                <span className="text-fg">{o.texto}</span>
                <span className="font-semibold text-fg/70">{o.pct}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${o.pct}%` }} />
              </div>
            </div>
          ) : (
            <button
              key={o.id}
              type="button"
              disabled={votando}
              onClick={() => votar(o.id)}
              className="w-full rounded-lg border border-border px-4 py-2.5 text-left text-sm font-medium text-fg transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {o.texto}
            </button>
          )
        ))}
      </div>

      {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}
      <p className="mt-auto pt-4 text-xs text-fg/50">
        {r.total} voto(s){mostrarResultado ? (r.encerrada ? ' · encerrada' : ' · você já votou') : ' · voto anônimo'}
      </p>
    </div>
  );
}
