'use client';

import { useEffect, useState } from 'react';
import { apiBase } from '../../../lib/auth-shared';

interface Dim {
  dimensao: string;
  peso: number;
  atendidos: number;
  total: number;
  percentual: number;
}
interface Crit {
  id: string;
  dimensao: string;
  desc: string;
  exig: string;
  pct: number;
  atendido: boolean;
}
interface Conformidade {
  indice: number;
  selo: string;
  essenciaisOk: boolean;
  bloqueantes: { id: string; desc: string }[];
  porDimensao: Dim[];
  criterios: Crit[];
}

const SELO_COR: Record<string, string> = {
  Diamante: 'bg-primary',
  Ouro: 'bg-warning',
  Prata: 'bg-muted',
  Elevado: 'bg-success',
};

const SELO_TEXT: Record<string, string> = {
  Diamante: 'text-primary-fg',
  Ouro: 'text-fg',
  Prata: 'text-fg',
  Elevado: 'text-primary-fg',
};

export default function ConformidadePntpPage() {
  const [conf, setConf] = useState<Conformidade | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/pntp/conformidade`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao carregar dados de conformidade.');
        return res.json();
      })
      .then((data) => setConf(data))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) {
    return (
      <div aria-live="polite" aria-busy="true" className="text-fg/60">
        Carregando dados de conformidade…
      </div>
    );
  }

  if (erro) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="rounded border border-danger bg-danger/10 p-4 text-danger"
      >
        {erro}
      </div>
    );
  }

  if (!conf) return null;

  const seloCorBg = SELO_COR[conf.selo] ?? 'bg-muted';
  const seloCorText = SELO_TEXT[conf.selo] ?? 'text-fg';

  return (
    <section aria-labelledby="conformidade-titulo" className="space-y-6">
      {/* Cabecalho com índice e selo */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            id="conformidade-titulo"
            className="font-heading text-2xl font-bold text-fg"
          >
            Conformidade PNTP
          </h1>
          <p className="mt-1 text-sm text-fg/60">
            Programa Nacional de Transparencia Publica — situacao atual do tenant.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded px-3 py-1 text-sm font-bold ${seloCorBg} ${seloCorText}`}
          >
            {conf.selo}
          </span>
          <span className="font-heading text-4xl font-bold text-fg">
            {conf.indice}
            <span className="text-xl font-normal">%</span>
          </span>
        </div>
      </div>

      {/* Bloqueantes / OK */}
      {conf.bloqueantes.length > 0 ? (
        <div
          role="alert"
          className="rounded border border-danger bg-danger/10 p-4"
        >
          <strong className="block text-sm font-semibold text-danger">
            Criterios essenciais pendentes — bloqueiam a obtencao do selo:
          </strong>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-danger">
            {conf.bloqueantes.map((b) => (
              <li key={b.id}>
                <span className="font-mono font-semibold">{b.id}</span> &mdash;{' '}
                {b.desc}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded border border-success bg-success/10 p-3 text-sm text-success">
          Todos os criterios essenciais estao atendidos.
        </p>
      )}

      {/* Por dimensao */}
      <div>
        <h2 className="font-heading text-lg font-semibold text-fg">
          Por dimensao
        </h2>
        <ul className="mt-3 space-y-3" role="list">
          {conf.porDimensao.map((d) => (
            <li key={d.dimensao} className="flex flex-wrap items-center gap-3">
              <span className="w-64 shrink-0 text-sm text-fg">
                {d.dimensao}{' '}
                <span className="text-fg/50">(peso {d.peso})</span>
              </span>
              <div
                className="h-3 flex-1 overflow-hidden rounded bg-muted"
                role="progressbar"
                aria-valuenow={d.percentual}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${d.dimensao}: ${d.percentual}%`}
              >
                <div
                  className="h-full rounded bg-primary transition-all"
                  style={{ width: `${d.percentual}%` }}
                />
              </div>
              <span className="w-28 text-right text-sm tabular-nums text-fg">
                {d.percentual}%{' '}
                <span className="text-fg/50">
                  ({d.atendidos}/{d.total})
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Tabela de criterios */}
      <details>
        <summary className="cursor-pointer select-none rounded px-1 py-0.5 font-semibold text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Ver todos os criterios ({conf.criterios.length})
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left text-fg/70">
                <th scope="col" className="py-2 pr-3 font-semibold">
                  ID
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Criterio
                </th>
                <th scope="col" className="py-2 pr-3 font-semibold">
                  Exigibilidade
                </th>
                <th scope="col" className="py-2 font-semibold">
                  %
                </th>
              </tr>
            </thead>
            <tbody>
              {conf.criterios.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-1.5 pr-3 font-mono text-xs">{c.id}</td>
                  <td className="py-1.5 pr-3">{c.desc}</td>
                  <td className="py-1.5 pr-3">{c.exig}</td>
                  <td
                    className={`py-1.5 tabular-nums font-semibold ${
                      c.atendido ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {c.pct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
