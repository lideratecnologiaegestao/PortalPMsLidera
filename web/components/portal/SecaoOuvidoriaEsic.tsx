import { getEstatisticasOuvidoria } from '../../lib/ouvidoria-stats';

function mesCurto(ym: string): string {
  const [, m] = ym.split('-');
  return ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m)] ?? ym;
}

/** Gráfico de barras (registradas x concluídas) por mês — SVG, sem dependência. */
function GraficoMensal({ serie }: { serie: { mes: string; registradas: number; concluidas: number }[] }) {
  const max = Math.max(1, ...serie.flatMap((s) => [s.registradas, s.concluidas]));
  const W = 320, H = 140, pad = 22;
  const bw = (W - pad * 2) / serie.length;
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
      aria-label="Manifestações registradas e concluídas nos últimos meses">
      {/* eixo */}
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="currentColor" className="text-border" />
      {serie.map((s, i) => {
        const x = pad + i * bw;
        const b = bw * 0.32;
        return (
          <g key={s.mes}>
            <rect x={x + bw * 0.18} y={y(s.registradas)} width={b} height={H - pad - y(s.registradas)}
              className="fill-primary" rx={1} />
            <rect x={x + bw * 0.5} y={y(s.concluidas)} width={b} height={H - pad - y(s.concluidas)}
              className="fill-success" rx={1} />
            <text x={x + bw / 2} y={H - pad + 12} textAnchor="middle" className="fill-current text-[9px] text-fg/60">
              {mesCurto(s.mes)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Barra de proporção por canal. */
function BarraCanal({ ouvidoria, esic }: { ouvidoria: number; esic: number }) {
  const tot = Math.max(1, ouvidoria + esic);
  const po = Math.round((ouvidoria / tot) * 100);
  return (
    <div className="space-y-2">
      <div className="flex h-4 overflow-hidden rounded-full bg-muted" role="img"
        aria-label={`Ouvidoria ${ouvidoria}, e-SIC ${esic}`}>
        <div className="bg-primary" style={{ width: `${po}%` }} />
        <div className="bg-accent" style={{ width: `${100 - po}%` }} />
      </div>
      <div className="flex justify-between text-xs text-fg/70">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-primary align-middle" />Ouvidoria: {ouvidoria}</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-accent align-middle" />e-SIC: {esic}</span>
      </div>
    </div>
  );
}

function Kpi({ valor, label }: { valor: string; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-3 text-center">
      <p className="font-heading text-2xl font-bold text-primary">{valor}</p>
      <p className="text-xs text-fg/70">{label}</p>
    </div>
  );
}

/**
 * Seção da home: Ouvidoria + e-SIC com indicadores e gráficos do atendimento —
 * para apresentar o trabalho ao cidadão (Lei 13.460 / LAI). Dados agregados,
 * sem informação pessoal.
 */
export default async function SecaoOuvidoriaEsic() {
  const e = await getEstatisticasOuvidoria();

  return (
    <section aria-labelledby="ouv-titulo" className="py-10">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="ouv-titulo" className="font-heading text-xl font-bold">Ouvidoria e e-SIC</h2>
            <p className="text-sm text-fg/70">
              Sua voz na Prefeitura. Acompanhe o desempenho do nosso atendimento ao cidadão.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/ouvidoria" className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg">
              Abrir manifestação
            </a>
            <a href="/esic" className="rounded border border-primary px-4 py-2 text-sm font-semibold text-primary">
              Pedir informação (e-SIC)
            </a>
            <a href="/acompanhar" className="rounded border border-border px-4 py-2 text-sm">
              Acompanhar protocolo
            </a>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.2fr,1fr]">
          {/* KPIs + volume mensal */}
          <div className="rounded-lg border border-border p-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Kpi valor={String(e?.total ?? 0)} label="Manifestações" />
              <Kpi valor={e?.taxaNoPrazo != null ? `${e.taxaNoPrazo}%` : '—'} label="Respondidas no prazo" />
              <Kpi valor={e?.tempoMedioDias != null ? `${e.tempoMedioDias}d` : '—'} label="Tempo médio" />
              <Kpi valor={String(e?.abertos ?? 0)} label="Em andamento" />
            </div>
            <div className="mt-4">
              <p className="mb-1 text-sm font-medium">Volume mensal</p>
              {e?.serieMensal?.length ? (
                <>
                  <GraficoMensal serie={e.serieMensal} />
                  <div className="flex gap-4 text-xs text-fg/70">
                    <span><span className="mr-1 inline-block h-2 w-2 bg-primary align-middle" />Registradas</span>
                    <span><span className="mr-1 inline-block h-2 w-2 bg-success align-middle" />Respondidas</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-fg/60">Sem dados ainda — seja o primeiro a se manifestar.</p>
              )}
            </div>
          </div>

          {/* Por canal + texto */}
          <div className="rounded-lg border border-border p-4">
            <p className="mb-2 text-sm font-medium">Por canal</p>
            <BarraCanal ouvidoria={e?.ouvidoria ?? 0} esic={e?.esic ?? 0} />
            <hr className="my-4 border-border" />
            <ul className="space-y-2 text-sm text-fg/80">
              <li>📋 <strong>Ouvidoria</strong> (Lei 13.460/2017): reclamações, denúncias, sugestões, elogios — pode ser anônima.</li>
              <li>🔎 <strong>e-SIC</strong> (LAI 12.527/2011): peça qualquer informação pública (exige login).</li>
              <li>💬 Acompanhe a <strong>tramitação em chat</strong> e converse com a ouvidoria pelo protocolo.</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
