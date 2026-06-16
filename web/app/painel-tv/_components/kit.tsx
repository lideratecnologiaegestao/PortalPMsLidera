'use client';

import { useEffect, useState } from 'react';

/* ─── Dicionários de rótulos ─────────────────────────────────────────────── */
export const MANIF_STATUS: Record<string, string> = {
  registrada: 'Registrada',
  em_analise: 'Em análise',
  em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Aguardando cidadão',
  prorrogada: 'Prorrogada',
  respondida: 'Respondida',
  indeferida: 'Indeferida',
  parcialmente_atendida: 'Parc. atendida',
  recurso_1a_instancia: 'Recurso 1ª inst.',
  recurso_2a_instancia: 'Recurso 2ª inst.',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};
export const CANAL: Record<string, string> = { ouvidoria: 'Ouvidoria', esic: 'e-SIC' };
export const TIPO: Record<string, string> = {
  acesso_informacao: 'Acesso à informação',
  denuncia: 'Denúncia',
  reclamacao: 'Reclamação',
  sugestao: 'Sugestão',
  elogio: 'Elogio',
  solicitacao: 'Solicitação',
};
export const CHAMADO_CATEGORIA: Record<string, string> = {
  buraco_via: 'Buraco na via',
  terreno_abandonado: 'Terreno abandonado',
  animal_abandonado: 'Animal abandonado',
  iluminacao_publica: 'Iluminação pública',
  coleta_lixo: 'Lixo / entulho',
  arvore_risco: 'Poda de árvore',
  sinalizacao: 'Sinalização',
  outro: 'Outro',
};
export const CHAMADO_STATUS: Record<string, string> = {
  aberto: 'Aberto',
  triagem: 'Em triagem',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
  reaberto: 'Reaberto',
  cancelado: 'Cancelado',
  duplicado: 'Duplicado',
};

/* ─── Hook de dados (auto-refresh) ───────────────────────────────────────── */
export function usePainel<T>(painel: 'ouvidoria' | 'prefeito', intervaloMs = 30000) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState('');
  const [atualizado, setAtualizado] = useState<Date | null>(null);

  useEffect(() => {
    const k = new URLSearchParams(window.location.search).get('k') ?? '';
    let vivo = true;
    const buscar = async () => {
      try {
        const res = await fetch(`/api/painel/${painel}?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(res.status === 401 ? 'Link do painel inválido ou expirado.' : `Erro ${res.status}`);
        const j = (await res.json()) as T;
        if (vivo) { setDados(j); setErro(''); setAtualizado(new Date()); }
      } catch (e) {
        if (vivo) setErro(e instanceof Error ? e.message : 'Falha ao atualizar.');
      }
    };
    buscar();
    const id = setInterval(buscar, intervaloMs);
    return () => { vivo = false; clearInterval(id); };
  }, [painel, intervaloMs]);

  return { dados, erro, atualizado };
}

/* ─── Relógio ao vivo ────────────────────────────────────────────────────── */
export function Relogio() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (!agora) return null;
  return (
    <div className="text-right leading-none">
      <div className="text-5xl font-bold tabular-nums">{agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
      <div className="mt-1 text-lg text-white/60 capitalize">
        {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
      </div>
    </div>
  );
}

/* ─── KPI grande ─────────────────────────────────────────────────────────── */
export function Kpi({
  rotulo,
  valor,
  sufixo,
  tom = 'neutro',
  legenda,
}: {
  rotulo: string;
  valor: React.ReactNode;
  sufixo?: string;
  tom?: 'neutro' | 'ok' | 'alerta' | 'perigo' | 'marca';
  legenda?: string;
}) {
  const tons: Record<string, string> = {
    neutro: 'text-white',
    ok: 'text-emerald-400',
    alerta: 'text-amber-400',
    perigo: 'text-red-400',
    marca: '',
  };
  return (
    <div className="flex flex-col justify-center rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
      <div className="text-lg font-medium uppercase tracking-wide text-white/55">{rotulo}</div>
      <div
        className={`mt-1 flex items-baseline gap-2 font-bold tabular-nums ${tons[tom]}`}
        style={tom === 'marca' ? { color: 'var(--color-primary)' } : undefined}
      >
        <span className="text-6xl 2xl:text-7xl">{valor}</span>
        {sufixo && <span className="text-3xl text-white/50">{sufixo}</span>}
      </div>
      {legenda && <div className="mt-1 text-base text-white/45">{legenda}</div>}
    </div>
  );
}

/* ─── Painel/cartão container ────────────────────────────────────────────── */
export function Bloco({ titulo, children, className = '' }: { titulo: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col rounded-2xl bg-white/5 p-6 ring-1 ring-white/10 ${className}`}>
      <h2 className="mb-4 text-xl font-semibold text-white/80">{titulo}</h2>
      <div className="flex-1">{children}</div>
    </section>
  );
}

/* ─── Lista de barras horizontais ───────────────────────────────────────── */
export function Barras({
  dados,
  rotulos,
  cor,
}: {
  dados: { k: string; n: number }[];
  rotulos?: Record<string, string>;
  cor?: string;
}) {
  const max = Math.max(1, ...dados.map((d) => d.n));
  if (dados.length === 0) return <Vazio>Sem dados ainda</Vazio>;
  return (
    <div className="space-y-3">
      {dados.map((d) => (
        <div key={d.k} className="flex items-center gap-3">
          <div className="w-44 shrink-0 truncate text-lg text-white/70">{rotulos?.[d.k] ?? d.k}</div>
          <div className="h-7 flex-1 overflow-hidden rounded bg-white/10">
            <div
              className="h-full rounded"
              style={{ width: `${(d.n / max) * 100}%`, backgroundColor: cor ?? 'var(--color-primary)', minWidth: d.n > 0 ? 8 : 0 }}
            />
          </div>
          <div className="w-12 shrink-0 text-right text-2xl font-bold tabular-nums">{d.n}</div>
        </div>
      ))}
    </div>
  );
}

/* ─── Estrelas de satisfação ────────────────────────────────────────────── */
export function Satisfacao({ media, total, dist }: { media: number | null; total: number; dist: { nota: number; n: number }[] }) {
  if (!total) return <Vazio>Aguardando avaliações dos cidadãos</Vazio>;
  const m = media ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-4">
        <div className="text-7xl font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
          {m.toFixed(1)}
        </div>
        <div className="pb-2">
          <div className="text-3xl tracking-widest text-amber-400">
            {'★'.repeat(Math.round(m))}
            <span className="text-white/20">{'★'.repeat(5 - Math.round(m))}</span>
          </div>
          <div className="text-base text-white/50">{total} avaliação{total === 1 ? '' : 'ões'}</div>
        </div>
      </div>
      <Barras dados={dist.map((d) => ({ k: String(d.nota), n: d.n }))} rotulos={{ '1': '1 ★', '2': '2 ★', '3': '3 ★', '4': '4 ★', '5': '5 ★' }} cor="#fbbf24" />
    </div>
  );
}

/* ─── Tendência (barras agrupadas por mês) ──────────────────────────────── */
export function Tendencia({ dados }: { dados: { mes: string; entradas: number; resolvidas: number }[] }) {
  const max = Math.max(1, ...dados.flatMap((d) => [d.entradas, d.resolvidas]));
  const mesLabel = (m: string) => {
    const [, mm] = m.split('-');
    return ['', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(mm)];
  };
  return (
    <div>
      <div className="flex h-48 items-end gap-6">
        {dados.map((d) => (
          <div key={d.mes} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: '100%' }}>
              <div className="w-1/3 rounded-t" style={{ height: `${(d.entradas / max) * 100}%`, backgroundColor: 'var(--color-primary)', minHeight: d.entradas ? 4 : 0 }} title={`${d.entradas} entradas`} />
              <div className="w-1/3 rounded-t bg-emerald-400" style={{ height: `${(d.resolvidas / max) * 100}%`, minHeight: d.resolvidas ? 4 : 0 }} title={`${d.resolvidas} resolvidas`} />
            </div>
            <div className="text-base capitalize text-white/55">{mesLabel(d.mes)}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-6 text-base text-white/60">
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded" style={{ backgroundColor: 'var(--color-primary)' }} /> Entradas</span>
        <span className="flex items-center gap-2"><i className="inline-block h-3 w-3 rounded bg-emerald-400" /> Resolvidas</span>
      </div>
    </div>
  );
}

export function Vazio({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-[80px] items-center justify-center text-lg text-white/40">{children}</div>;
}

/* ─── Rodízio automático de telas ───────────────────────────────────────── */
export function useRodizio(total: number, intervaloMs = 18000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (total <= 1) return;
    const id = setInterval(() => setI((v) => (v + 1) % total), intervaloMs);
    return () => clearInterval(id);
  }, [total, intervaloMs]);
  return Math.min(i, Math.max(0, total - 1));
}

/** Indicador de qual tela está ativa (bolinhas) + título da tela atual. */
export function Rodizio({ titulos, indice }: { titulos: string[]; indice: number }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-lg font-semibold text-white/70">{titulos[indice]}</span>
      <div className="flex gap-2">
        {titulos.map((t, n) => (
          <span
            key={t}
            className="h-2.5 rounded-full transition-all"
            style={{ width: n === indice ? 28 : 10, backgroundColor: n === indice ? 'var(--color-primary)' : 'rgba(255,255,255,.25)' }}
          />
        ))}
      </div>
    </div>
  );
}

/** Faixa de alerta pulsante (manifestações vencidas / fora do prazo legal). */
export function AlertaVencidas({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <div className="tv-pulse mb-5 flex items-center justify-center gap-4 rounded-2xl bg-red-600/90 px-6 py-4 text-center ring-2 ring-red-400">
      <span className="text-4xl">⚠</span>
      <span className="text-3xl font-bold">
        {n} {n === 1 ? 'manifestação VENCIDA' : 'manifestações VENCIDAS'} — fora do prazo legal. Ação imediata.
      </span>
    </div>
  );
}

/** Barra com 1+ alertas pulsantes empilhados (perigo=vermelho, aviso=âmbar). */
export function AlertaBarra({ alertas }: { alertas: { texto: string; tom?: 'perigo' | 'aviso' }[] }) {
  const lista = alertas.filter((a) => a && a.texto);
  if (lista.length === 0) return null;
  return (
    <div className="mb-5 flex flex-col gap-3">
      {lista.map((a, i) => {
        const cor = a.tom === 'aviso' ? 'bg-amber-500/90 ring-amber-300 text-black/85' : 'bg-red-600/90 ring-red-400 text-white';
        return (
          <div key={i} className={`tv-pulse flex items-center justify-center gap-4 rounded-2xl px-6 py-3 text-center ring-2 ${cor}`}>
            <span className="text-3xl">⚠</span>
            <span className="text-2xl font-bold">{a.texto}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Moldura full-screen do painel ─────────────────────────────────────── */
export function Moldura({
  titulo,
  subtitulo,
  erro,
  atualizado,
  alerta,
  indicador,
  children,
}: {
  titulo: string;
  subtitulo: string;
  erro?: string;
  atualizado: Date | null;
  alerta?: React.ReactNode;
  indicador?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="fixed inset-0 overflow-hidden bg-[#0a0f1c] text-white" style={{ fontFeatureSettings: '"tnum"' }}>
      <style dangerouslySetInnerHTML={{ __html: '@keyframes tvpulse{0%,100%{opacity:1}50%{opacity:.4}}.tv-pulse{animation:tvpulse 1.1s ease-in-out infinite}' }} />
      <div className="flex h-full flex-col p-8">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold" style={{ color: 'var(--color-primary)' }}>{titulo}</h1>
            <p className="mt-1 text-xl text-white/60">{subtitulo}</p>
          </div>
          <Relogio />
        </header>

        {erro ? (
          <div className="flex flex-1 items-center justify-center text-2xl text-red-300">{erro}</div>
        ) : (
          <>
            {alerta}
            <div className="flex-1 overflow-hidden">{children}</div>
          </>
        )}

        <footer className="mt-6 flex items-center justify-between text-base text-white/40">
          {indicador ?? <span>Atualização automática a cada 30s</span>}
          <span>{atualizado ? `Atualizado às ${atualizado.toLocaleTimeString('pt-BR')}` : 'Carregando…'}</span>
        </footer>
      </div>
    </main>
  );
}
