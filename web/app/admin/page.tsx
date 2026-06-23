'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../../lib/auth-shared';

/* ------------------------------------------------------------------ */
/* Tipos do agregado (contrato GET /api/admin/dashboard)               */
/* ------------------------------------------------------------------ */

interface KV {
  k: string;
  n: number;
}
interface Dashboard {
  atualizadoEm: string;
  kpis: {
    noticiasPublicadas: number;
    noticiasMes: number;
    comentariosPendentes: number;
    manifestacoesAbertas: number;
    manifestacoesVencidas: number;
    chamadosAbertos: number;
    atendimentosAbertos: number;
    formulariosRespostasMes: number;
    documentos: number;
    usuariosAtivos: number;
    sessoesOnline: number;
    lgpdSolicitacoesPendentes: number;
    lgpdIncidentesAbertos: number;
    pntpIndice: number;
    pntpSelo: string;
  };
  tendencia: { mes: string; entradas: number; resolvidas: number }[];
  manifestacoesPorStatus: KV[];
  chamadosPorCategoria: KV[];
  manifestacoesPorSecretaria: KV[];
  satisfacao: { media: number | null; total: number; distribuicao: { nota: number; n: number }[] };
  filaPrazos: { protocolo: string; tipo: string; status: string; prazoEm: string; diasRestantes: number }[];
  ultimasNoticias: { id: string; titulo: string; publicadoEm: string | null; status: string }[];
  comentariosRecentes: {
    id: string;
    noticiaTitulo: string;
    autor: string;
    texto: string;
    criadoEm: string;
    aprovado: boolean;
  }[];
  alertas: { nivel: 'critico' | 'alerta' | 'info'; texto: string; href: string }[];
}

/* ------------------------------------------------------------------ */
/* Ícones (inline, currentColor)                                       */
/* ------------------------------------------------------------------ */

const I = {
  news: 'M4 4h16v4H4zM4 10h10v10H4zM16 10h4v10h-4z',
  comment: 'M21.99 4A2 2 0 0 0 20 2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14l4 4z',
  mail: 'M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4-8 5-8-5V6l8 5 8-5z',
  alert: 'M1 21h22L12 2zm12-3h-2v-2h2zm0-4h-2v-4h2z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z',
  form: 'M3 5h18v2H3zm0 6h12v2H3zm0 6h18v2H3z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z',
  users: 'M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 2c-2.3 0-7 1.2-7 3.5V19h14v-2.5C7 14.2 10.3 13 8 13zm8 0c-.3 0-.6 0-1 .1 1.2.8 2 2 2 3.4V19h6v-2.5c0-2.3-4.7-3.5-7-3.5z',
  monitor: 'M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5l-1 1v2h8v-2l-1-1h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z',
  lock: 'M18 8h-1V6A5 5 0 0 0 7 6v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zm-6 9a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm3-9H9V6a3 3 0 0 1 6 0z',
  warn: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-2h2zm0-4h-2V7h2z',
  shield: 'M12 1 3 5v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V5z',
};

function Ic({ d, className }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className ?? 'h-5 w-5'}>
      <path d={d} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
function rotuloMes(ym: string): string {
  const [, m] = ym.split('-');
  return MESES_ABREV[Number(m) - 1] ?? ym;
}
function dataCurta(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
function dataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------------------------ */
/* KPI card                                                            */
/* ------------------------------------------------------------------ */

function Kpi({
  label,
  value,
  icon,
  href,
  accent,
  sub,
}: {
  label: string;
  value: number | string;
  icon: string;
  href: string;
  accent?: 'primary' | 'danger' | 'warning' | 'success';
  sub?: string;
}) {
  const cor =
    accent === 'danger'
      ? 'text-danger'
      : accent === 'warning'
        ? 'text-warning'
        : accent === 'success'
          ? 'text-success'
          : 'text-primary';
  const bg =
    accent === 'danger'
      ? 'bg-danger/10'
      : accent === 'warning'
        ? 'bg-warning/10'
        : accent === 'success'
          ? 'bg-success/10'
          : 'bg-primary/10';
  return (
    <a
      href={href}
      className="group flex items-center gap-3 rounded-lg border border-border bg-bg p-4 transition-colors hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg} ${cor}`}>
        <Ic d={icon} />
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-2xl font-bold leading-tight text-fg tabular-nums">{value}</span>
        <span className="block truncate text-xs text-fg/60">{label}</span>
        {sub && <span className={`block truncate text-xs font-medium ${cor}`}>{sub}</span>}
      </span>
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Card genérico                                                       */
/* ------------------------------------------------------------------ */

function Card({
  titulo,
  children,
  acao,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-lg border border-border bg-bg p-4 ${className ?? ''}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-fg/70">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Barras horizontais                                                  */
/* ------------------------------------------------------------------ */

function Barras({ dados, vazio }: { dados: KV[]; vazio: string }) {
  if (!dados.length) return <p className="text-sm text-fg/50">{vazio}</p>;
  const max = Math.max(...dados.map((d) => d.n), 1);
  return (
    <ul className="space-y-2" role="list">
      {dados.map((d) => (
        <li key={d.k} className="flex items-center gap-2 text-sm">
          <span className="w-32 shrink-0 truncate capitalize text-fg" title={d.k}>
            {d.k.replace(/_/g, ' ')}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-primary" style={{ width: `${(d.n / max) * 100}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right tabular-nums text-fg/70">{d.n}</span>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Gráfico de tendência (barras agrupadas, SVG)                        */
/* ------------------------------------------------------------------ */

function Tendencia({ dados }: { dados: Dashboard['tendencia'] }) {
  if (!dados.length) return <p className="text-sm text-fg/50">Sem dados de tendência.</p>;
  const max = Math.max(...dados.flatMap((d) => [d.entradas, d.resolvidas]), 1);
  const W = 100 / dados.length;
  const H = 120;
  return (
    <div>
      <svg viewBox={`0 0 100 ${H + 16}`} className="w-full" role="img" aria-label="Tendência de demandas nos últimos 6 meses">
        {dados.map((d, i) => {
          const x = i * W;
          const hE = (d.entradas / max) * H;
          const hR = (d.resolvidas / max) * H;
          const bw = W * 0.28;
          return (
            <g key={d.mes}>
              <rect x={x + W * 0.18} y={H - hE} width={bw} height={hE} className="fill-primary" rx="0.6" />
              <rect x={x + W * 0.52} y={H - hR} width={bw} height={hR} className="fill-success" rx="0.6" />
              <text x={x + W / 2} y={H + 12} textAnchor="middle" className="fill-current text-fg/60" style={{ fontSize: 5 }}>
                {rotuloMes(d.mes)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex justify-center gap-4 text-xs text-fg/70">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Entradas
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-success" /> Resolvidas
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Satisfação                                                          */
/* ------------------------------------------------------------------ */

function Satisfacao({ s }: { s: Dashboard['satisfacao'] }) {
  const max = Math.max(...s.distribuicao.map((d) => d.n), 1);
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="font-heading text-3xl font-bold text-fg">{s.media != null ? s.media.toFixed(1) : '—'}</span>
        <span className="text-sm text-fg/60">de 5 · {s.total} avaliações</span>
      </div>
      <ul className="space-y-1.5" role="list">
        {[...s.distribuicao].reverse().map((d) => (
          <li key={d.nota} className="flex items-center gap-2 text-sm">
            <span className="w-8 shrink-0 text-fg/70">{d.nota}★</span>
            <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
              <div className="h-full rounded bg-warning" style={{ width: `${(d.n / max) * 100}%` }} />
            </div>
            <span className="w-8 shrink-0 text-right tabular-nums text-fg/60">{d.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Atalhos rápidos                                                     */
/* ------------------------------------------------------------------ */

const ATALHOS: { label: string; href: string; icon: string }[] = [
  { label: 'Nova notícia', href: '/admin/noticias', icon: I.news },
  { label: 'Banners', href: '/admin/banners', icon: I.news },
  { label: 'Documentos', href: '/admin/documentos', icon: I.file },
  { label: 'Atendimento', href: '/admin/atendimento', icon: I.chat },
  { label: 'Formulários', href: '/admin/formularios', icon: I.form },
  { label: 'Usuários', href: '/admin/usuarios', icon: I.users },
  { label: 'App do Cidadão', href: '/admin/app-cidadao', icon: I.monitor },
  { label: 'Conformidade PNTP', href: '/admin/conformidade', icon: I.shield },
];

/* ------------------------------------------------------------------ */
/* Nota pessoal                                                        */
/* ------------------------------------------------------------------ */

function NotaPessoal() {
  const [conteudo, setConteudo] = useState('');
  const [salvo, setSalvo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [carregado, setCarregado] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`${apiBase}/api/admin/dashboard/nota`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { conteudo: '' }))
      .then((d) => setConteudo(d.conteudo ?? ''))
      .catch(() => {})
      .finally(() => setCarregado(true));
  }, []);

  const salvar = useCallback(async (texto: string) => {
    setSalvando(true);
    try {
      const r = await fetch(`${apiBase}/api/admin/dashboard/nota`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conteudo: texto }),
      });
      if (r.ok) setSalvo(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    } finally {
      setSalvando(false);
    }
  }, []);

  function onChange(v: string) {
    setConteudo(v);
    setSalvo(null);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => salvar(v), 1000);
  }

  return (
    <Card
      titulo="Minhas anotações"
      acao={
        <span className="text-xs text-fg/50">
          {salvando ? 'Salvando…' : salvo ? `Salvo ${salvo}` : ''}
        </span>
      }
    >
      <textarea
        value={conteudo}
        onChange={(e) => onChange(e.target.value)}
        disabled={!carregado}
        placeholder="Escreva lembretes, pendências, recados… (salvo automaticamente)"
        rows={6}
        className="w-full resize-y rounded border border-border bg-bg p-2 text-sm text-fg placeholder:text-fg/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      />
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Página principal                                                    */
/* ------------------------------------------------------------------ */

export default function PainelBiPage() {
  const [d, setD] = useState<Dashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(() => {
    setCarregando(true);
    fetch(`${apiBase}/api/admin/dashboard`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error('Falha ao carregar o painel.');
        return res.json();
      })
      .then((data) => setD(data))
      .catch((e) => setErro(e instanceof Error ? e.message : String(e)))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando && !d) {
    return (
      <div aria-live="polite" aria-busy="true" className="text-fg/60">
        Carregando o painel…
      </div>
    );
  }
  if (erro && !d) {
    return (
      <div role="alert" className="rounded border border-danger bg-danger/10 p-4 text-danger">
        {erro}
      </div>
    );
  }
  if (!d) return null;

  const k = d.kpis;

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-fg">Painel</h1>
          <p className="mt-0.5 text-sm text-fg/60">
            Visão geral · atualizado {dataHora(d.atualizadoEm)}
          </p>
        </div>
        <button
          type="button"
          onClick={carregar}
          className="rounded border border-border px-3 py-1.5 text-sm font-medium text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Atualizar
        </button>
      </div>

      {/* Alertas */}
      {d.alertas.length > 0 && (
        <div className="space-y-2">
          {d.alertas.map((a, i) => (
            <a
              key={i}
              href={a.href}
              className={`flex items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                a.nivel === 'critico'
                  ? 'border-danger bg-danger/10 text-danger hover:bg-danger/20'
                  : a.nivel === 'alerta'
                    ? 'border-warning bg-warning/10 text-fg hover:bg-warning/20'
                    : 'border-border bg-muted text-fg hover:bg-muted/70'
              }`}
            >
              <Ic d={a.nivel === 'critico' ? I.alert : I.warn} className="h-5 w-5 shrink-0" />
              <span className="flex-1">{a.texto}</span>
              <span aria-hidden="true">→</span>
            </a>
          ))}
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Notícias publicadas" value={k.noticiasPublicadas} sub={`${k.noticiasMes} no mês`} icon={I.news} href="/admin/noticias" />
        <Kpi label="Comentários pendentes" value={k.comentariosPendentes} icon={I.comment} href="/admin/comentarios" accent={k.comentariosPendentes > 0 ? 'warning' : 'primary'} />
        <Kpi label="Manifestações abertas" value={k.manifestacoesAbertas} sub={k.manifestacoesVencidas > 0 ? `${k.manifestacoesVencidas} vencidas` : undefined} icon={I.mail} href="/admin/ouvidoria" accent={k.manifestacoesVencidas > 0 ? 'danger' : 'primary'} />
        <Kpi label="Denúncias abertas" value={k.chamadosAbertos} icon={I.alert} href="/admin/chamados" />
        <Kpi label="Atendimentos ativos" value={k.atendimentosAbertos} icon={I.chat} href="/admin/atendimento" />
        <Kpi label="Respostas de formulários" value={k.formulariosRespostasMes} sub="no mês" icon={I.form} href="/admin/formularios" />
        <Kpi label="Documentos" value={k.documentos} icon={I.file} href="/admin/documentos" />
        <Kpi label="Usuários ativos" value={k.usuariosAtivos} icon={I.users} href="/admin/usuarios" />
        <Kpi label="Sessões online" value={k.sessoesOnline} icon={I.monitor} href="/admin/sessoes" accent="success" />
        <Kpi label="Solicitações LGPD" value={k.lgpdSolicitacoesPendentes} icon={I.lock} href="/admin/lgpd-solicitacoes" accent={k.lgpdSolicitacoesPendentes > 0 ? 'warning' : 'primary'} />
        <Kpi label="Incidentes abertos" value={k.lgpdIncidentesAbertos} icon={I.warn} href="/admin/lgpd-incidentes" accent={k.lgpdIncidentesAbertos > 0 ? 'danger' : 'primary'} />
        <Kpi label={`PNTP · ${k.pntpSelo}`} value={`${k.pntpIndice}%`} icon={I.shield} href="/admin/conformidade" accent="success" />
      </div>

      {/* Linha de gráficos */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Tendência (6 meses)" className="lg:col-span-2">
          <Tendencia dados={d.tendencia} />
        </Card>
        <Card titulo="Satisfação do cidadão">
          <Satisfacao s={d.satisfacao} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Manifestações por status">
          <Barras dados={d.manifestacoesPorStatus} vazio="Sem manifestações." />
        </Card>
        <Card titulo="Denúncias por categoria">
          <Barras dados={d.chamadosPorCategoria} vazio="Sem denúncias." />
        </Card>
        <Card titulo="Demandas por secretaria">
          <Barras dados={d.manifestacoesPorSecretaria} vazio="Sem dados." />
        </Card>
      </div>

      {/* Prazos + Notícias + Nota */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card titulo="Prazos a vencer" acao={<a href="/admin/ouvidoria" className="text-xs font-medium text-primary hover:underline">ver todos</a>}>
          {d.filaPrazos.length === 0 ? (
            <p className="text-sm text-fg/50">Nenhum prazo em aberto.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {d.filaPrazos.map((f) => (
                <li key={f.protocolo} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs text-fg/70">{f.protocolo}</span>
                    <span className="block truncate capitalize text-fg">{f.tipo.replace(/_/g, ' ')}</span>
                  </span>
                  <span
                    className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                      f.diasRestantes < 0
                        ? 'bg-danger/15 text-danger'
                        : f.diasRestantes <= 2
                          ? 'bg-warning/15 text-warning'
                          : 'bg-muted text-fg/70'
                    }`}
                  >
                    {f.diasRestantes < 0 ? `${Math.abs(f.diasRestantes)}d atrasado` : `${f.diasRestantes}d`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card titulo="Últimas notícias" acao={<a href="/admin/noticias" className="text-xs font-medium text-primary hover:underline">gerenciar</a>}>
          {d.ultimasNoticias.length === 0 ? (
            <p className="text-sm text-fg/50">Nenhuma notícia.</p>
          ) : (
            <ul className="divide-y divide-border" role="list">
              {d.ultimasNoticias.map((n) => (
                <li key={n.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-fg" title={n.titulo}>{n.titulo}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-xs text-fg/50">{dataCurta(n.publicadoEm)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${n.status === 'publicado' ? 'bg-success/15 text-success' : 'bg-muted text-fg/60'}`}>
                      {n.status}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <NotaPessoal />
      </div>

      {/* Comentários recentes (cards) */}
      <Card titulo="Comentários recentes nas notícias" acao={<a href="/admin/comentarios" className="text-xs font-medium text-primary hover:underline">moderar</a>}>
        {d.comentariosRecentes.length === 0 ? (
          <p className="text-sm text-fg/50">Nenhum comentário ainda.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {d.comentariosRecentes.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-muted/40 p-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold text-fg" title={c.autor}>{c.autor}</span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${c.aprovado ? 'bg-success/15 text-success' : 'bg-warning/15 text-warning'}`}>
                    {c.aprovado ? 'aprovado' : 'pendente'}
                  </span>
                </div>
                <p className="line-clamp-3 text-sm text-fg/80">{c.texto}</p>
                <p className="mt-2 truncate text-xs text-fg/50" title={c.noticiaTitulo}>
                  em “{c.noticiaTitulo}” · {dataCurta(c.criadoEm)}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Atalhos */}
      <Card titulo="Atalhos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {ATALHOS.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="flex flex-col items-center gap-2 rounded-lg border border-border p-3 text-center text-xs font-medium text-fg transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <Ic d={a.icon} className="h-6 w-6 text-primary" />
              {a.label}
            </a>
          ))}
        </div>
      </Card>
    </div>
  );
}
