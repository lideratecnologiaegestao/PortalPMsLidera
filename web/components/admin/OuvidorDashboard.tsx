'use client';

/**
 * Dashboard do Ouvidor — ADR-0005 Fase 3 (A).
 *
 * Busca GET /api/admin/manifestacoes/dashboard e renderiza:
 *  - KPIs no topo (com rótulo textual + ícone, nunca só cor)
 *  - Gráficos de barras horizontais acessíveis (sem lib externa)
 *  - Atalhos rápidos para os sub-módulos
 *
 * Trata 403 { code:'EULA_REQUIRED' } disparando onEulaRequired() para que o
 * componente-pai possa acionar o gate de EULA.
 */

import { useCallback, useEffect, useState } from 'react';
import { adminGet, AdminApiError } from '../../lib/admin-api';
import type { DashboardData, DashboardItem } from '../../lib/ouvidor-dashboard';
import BarraHorizontal, { BarraItem } from './BarraHorizontal';

// ─── Ícones inline ───────────────────────────────────────────────────────────

function IcoTotal() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z"/>
    </svg>
  );
}
function IcoAberta() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V8l8 5 8-5v10zm-8-7L4 6h16l-8 5z"/>
    </svg>
  );
}
function IcoVencida() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  );
}
function IcoVencendo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  );
}
function IcoPrazo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
    </svg>
  );
}
function IcoTempo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
    </svg>
  );
}
function IcoStar() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
    </svg>
  );
}
function IcoLink() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
    </svg>
  );
}

// ─── Tipos internos ──────────────────────────────────────────────────────────

interface KpiCardProps {
  rotulo: string;
  valor: string | number;
  icone: React.ReactNode;
  variante?: 'normal' | 'danger' | 'warning' | 'ok';
  descricao?: string;
}

// ─── Cartão de KPI ───────────────────────────────────────────────────────────

function KpiCard({ rotulo, valor, icone, variante = 'normal', descricao }: KpiCardProps) {
  const cor: Record<string, string> = {
    normal: 'border-border bg-bg',
    danger: 'border-danger bg-danger/10',
    warning: 'border-warning bg-warning/10',
    ok: 'border-success bg-success/10',
  };
  const textoCor: Record<string, string> = {
    normal: 'text-fg',
    danger: 'text-danger',
    warning: 'text-secondary-fg',
    ok: 'text-success',
  };
  const iconeCor: Record<string, string> = {
    normal: 'text-primary',
    danger: 'text-danger',
    warning: 'text-secondary-fg',
    ok: 'text-success',
  };

  return (
    <div
      className={`rounded border ${cor[variante]} p-4 flex flex-col gap-1`}
      role="region"
      aria-label={rotulo}
    >
      <div className={`flex items-center gap-2 text-sm font-semibold ${textoCor[variante]}`}>
        <span className={iconeCor[variante]}>{icone}</span>
        <span>{rotulo}</span>
      </div>
      <p className={`text-3xl font-bold font-heading ${textoCor[variante]}`} aria-label={`${rotulo}: ${valor}`}>
        {valor}
      </p>
      {descricao && (
        <p className="text-xs text-fg/60">{descricao}</p>
      )}
    </div>
  );
}

// ─── Atalho rápido ───────────────────────────────────────────────────────────

function Atalho({ href, rotulo, descricao }: { href: string; rotulo: string; descricao: string }) {
  return (
    <a
      href={href}
      className="flex items-start gap-3 rounded border border-border bg-bg p-4 hover:bg-muted transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span className="mt-0.5 text-primary" aria-hidden="true">
        <IcoLink />
      </span>
      <div>
        <p className="font-semibold text-fg text-sm">{rotulo}</p>
        <p className="text-xs text-fg/60 mt-0.5">{descricao}</p>
      </div>
    </a>
  );
}

// ─── Mapa de cores por status ─────────────────────────────────────────────────

function corStatus(status: string): string {
  const mapa: Record<string, string> = {
    registrada: 'bg-muted',
    em_analise: 'bg-primary',
    em_tratamento: 'bg-secondary',
    aguardando_cidadao: 'bg-warning',
    prorrogada: 'bg-warning',
    respondida: 'bg-success',
    indeferida: 'bg-danger',
    parcialmente_atendida: 'bg-accent',
    recurso_1a_instancia: 'bg-danger',
    recurso_2a_instancia: 'bg-danger',
    concluida: 'bg-success',
    arquivada: 'bg-muted',
  };
  return mapa[status] ?? 'bg-primary';
}

const STATUS_LABELS: Record<string, string> = {
  registrada: 'Registrada',
  em_analise: 'Em análise',
  em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Ag. cidadão',
  prorrogada: 'Prorrogada',
  respondida: 'Respondida',
  indeferida: 'Indeferida',
  parcialmente_atendida: 'Parc. atendida',
  recurso_1a_instancia: 'Recurso 1ª',
  recurso_2a_instancia: 'Recurso 2ª',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};

const TIPO_LABELS: Record<string, string> = {
  acesso_informacao: 'Acesso à informação',
  denuncia: 'Denúncia',
  reclamacao: 'Reclamação',
  sugestao: 'Sugestão',
  elogio: 'Elogio',
  solicitacao: 'Solicitação',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function OuvidorDashboard({
  onEulaRequired,
}: {
  onEulaRequired: () => void;
}) {
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const d = await adminGet<DashboardData>('/api/admin/manifestacoes/dashboard');
      setDados(d);
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 403) {
        // Verifica se é EULA_REQUIRED (o corpo já foi consumido pelo adminGet,
        // então capturamos pelo status 403 e delegamos para o gate)
        onEulaRequired();
        return;
      }
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar o painel.');
    } finally {
      setCarregando(false);
    }
  }, [onEulaRequired]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-16" aria-live="polite" aria-busy="true">
        <span className="text-fg/60 text-sm">Carregando painel…</span>
      </div>
    );
  }

  if (erro) {
    return (
      <div role="alert" className="rounded border border-danger bg-danger/10 p-4 text-sm text-danger">
        {erro}
        <button
          onClick={carregar}
          className="ml-3 underline hover:no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!dados) return null;

  const { kpis } = dados;

  // ─── Prepara arrays de barras ────────────────────────────────────────────

  const barrasStatus: BarraItem[] = dados.porStatus.map((i: DashboardItem) => ({
    rotulo: STATUS_LABELS[i.status ?? ''] ?? i.status ?? '—',
    valor: i.total,
    cor: corStatus(i.status ?? ''),
  }));

  const barrasTipo: BarraItem[] = dados.porTipo.map((i: DashboardItem) => ({
    rotulo: TIPO_LABELS[i.tipo ?? ''] ?? i.tipo ?? '—',
    valor: i.total,
    cor: 'bg-secondary',
  }));

  const barrasCanal: BarraItem[] = dados.porCanal.map((i: DashboardItem) => ({
    rotulo: i.canal === 'esic' ? 'e-SIC' : i.canal === 'ouvidoria' ? 'Ouvidoria' : i.canal ?? '—',
    valor: i.total,
    cor: i.canal === 'esic' ? 'bg-accent' : 'bg-primary',
  }));

  const barrasSecretaria: BarraItem[] = dados.porSecretaria.map((i: DashboardItem) => ({
    rotulo: i.secretaria ?? 'Sem secretaria',
    valor: i.total,
    cor: 'bg-primary',
  }));

  const barrasMensal: BarraItem[] = dados.serieMensal.map((i: DashboardItem) => ({
    rotulo: i.mes ?? '—',
    valor: i.total,
    cor: 'bg-secondary',
  }));

  const barrasSatisfacao: BarraItem[] = dados.satisfacaoDistribuicao.map((i: DashboardItem) => ({
    rotulo: `${i.nota} estrela${i.nota !== 1 ? 's' : ''}`,
    valor: i.total,
    cor: i.nota !== undefined && i.nota >= 4 ? 'bg-success' : i.nota !== undefined && i.nota === 3 ? 'bg-warning' : 'bg-danger',
  }));

  const satisfacaoStr = kpis.satisfacaoMedia !== null
    ? `${kpis.satisfacaoMedia.toFixed(1)} / 5 (${kpis.satisfacaoTotal} avaliações)`
    : 'Sem avaliações';

  return (
    <section aria-label="Painel do Ouvidor">

      {/* ── Atalhos rápidos ──────────────────────────────────────────── */}
      <nav aria-label="Atalhos rápidos do painel do ouvidor" className="mb-6">
        <h2 className="font-heading text-base font-semibold mb-3">Atalhos rápidos</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Atalho href="/admin/ouvidoria" rotulo="Ouvidoria" descricao="Manifestações da Ouvidoria" />
          <Atalho href="/admin/esic" rotulo="e-SIC" descricao="Pedidos de acesso à informação" />
          <Atalho href="/admin/minhas-atribuicoes" rotulo="Minhas atribuições" descricao="Manifestações atribuídas a mim" />
          <Atalho href="#caixa-unificada" rotulo="Caixa unificada" descricao="Todos os canais nesta página" />
          <Atalho href="/admin/usuarios-relatorio" rotulo="Relatórios" descricao="Relatório de usuários e acessos" />
          <Atalho href="/admin/paineis-tv" rotulo="Painel TV" descricao="Wallboard para tela cheia" />
        </div>
      </nav>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div
        className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        role="region"
        aria-label="Indicadores-chave do painel"
      >
        <KpiCard
          rotulo="Total de manifestações"
          valor={kpis.total}
          icone={<IcoTotal />}
        />
        <KpiCard
          rotulo="Em aberto"
          valor={kpis.abertas}
          icone={<IcoAberta />}
          variante="normal"
        />
        <KpiCard
          rotulo="Vencidas (prazo ultrapassado)"
          valor={kpis.vencidas}
          icone={<IcoVencida />}
          variante={kpis.vencidas > 0 ? 'danger' : 'ok'}
          descricao={kpis.vencidas > 0 ? 'Ação imediata necessária' : 'Nenhuma vencida'}
        />
        <KpiCard
          rotulo="Vencem em 48 h"
          valor={kpis.vencendo48h}
          icone={<IcoVencendo />}
          variante={kpis.vencendo48h > 0 ? 'warning' : 'ok'}
          descricao={kpis.vencendo48h > 0 ? 'Atenção urgente' : 'Nenhuma vencendo em breve'}
        />
        <KpiCard
          rotulo="No prazo (%)"
          valor={kpis.noPrazoPct !== null ? `${kpis.noPrazoPct.toFixed(0)}%` : '—'}
          icone={<IcoPrazo />}
          variante={
            kpis.noPrazoPct === null ? 'normal'
            : kpis.noPrazoPct >= 90 ? 'ok'
            : kpis.noPrazoPct >= 70 ? 'warning'
            : 'danger'
          }
          descricao={kpis.noPrazoPct !== null ? 'Manifestações concluídas dentro do prazo' : 'Sem manifestações concluídas ainda'}
        />
        <KpiCard
          rotulo="Tempo médio de resposta"
          valor={kpis.tempoMedioDias !== null ? `${kpis.tempoMedioDias.toFixed(1)} dias` : '—'}
          icone={<IcoTempo />}
        />
        <KpiCard
          rotulo="Satisfação média"
          valor={kpis.satisfacaoMedia !== null ? `${kpis.satisfacaoMedia.toFixed(1)} ★` : '—'}
          icone={<IcoStar />}
          variante={
            kpis.satisfacaoMedia === null ? 'normal'
            : kpis.satisfacaoMedia >= 4 ? 'ok'
            : kpis.satisfacaoMedia >= 3 ? 'warning'
            : 'danger'
          }
          descricao={satisfacaoStr}
        />
      </div>

      {/* ── Gráficos ─────────────────────────────────────────────────── */}
      <div className="grid gap-6 md:grid-cols-2">

        {/* Por status */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Por status</h2>
          {barrasStatus.length === 0
            ? <p className="text-sm text-fg/60">Sem dados</p>
            : <BarraHorizontal
                itens={barrasStatus}
                titulo="Manifestações por status"
                colunaRotulo="Status"
                colunaValor="Quantidade"
              />
          }
        </div>

        {/* Por tipo */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Por tipo de manifestação</h2>
          {barrasTipo.length === 0
            ? <p className="text-sm text-fg/60">Sem dados</p>
            : <BarraHorizontal
                itens={barrasTipo}
                titulo="Manifestações por tipo"
                colunaRotulo="Tipo"
                colunaValor="Quantidade"
              />
          }
        </div>

        {/* Por canal */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Por canal (Ouvidoria × e-SIC)</h2>
          {barrasCanal.length === 0
            ? <p className="text-sm text-fg/60">Sem dados</p>
            : <BarraHorizontal
                itens={barrasCanal}
                titulo="Manifestações por canal"
                colunaRotulo="Canal"
                colunaValor="Quantidade"
              />
          }
        </div>

        {/* Por secretaria */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Por secretaria responsável</h2>
          {barrasSecretaria.length === 0
            ? <p className="text-sm text-fg/60">Nenhuma secretaria atribuída</p>
            : <BarraHorizontal
                itens={barrasSecretaria}
                titulo="Manifestações por secretaria"
                colunaRotulo="Secretaria"
                colunaValor="Quantidade"
              />
          }
        </div>

        {/* Série mensal */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Série mensal (6 meses)</h2>
          {barrasMensal.length === 0
            ? <p className="text-sm text-fg/60">Sem dados mensais</p>
            : <BarraHorizontal
                itens={barrasMensal}
                titulo="Manifestações por mês"
                colunaRotulo="Mês"
                colunaValor="Total"
              />
          }
        </div>

        {/* Distribuição de satisfação */}
        <div className="rounded border border-border bg-bg p-4">
          <h2 className="font-heading text-base font-semibold mb-3">Distribuição de satisfação (1–5)</h2>
          {barrasSatisfacao.length === 0
            ? <p className="text-sm text-fg/60">Nenhuma avaliação registrada</p>
            : <BarraHorizontal
                itens={barrasSatisfacao}
                titulo="Distribuição de notas de satisfação"
                colunaRotulo="Nota"
                colunaValor="Quantidade"
              />
          }
        </div>

      </div>

      {/* Botão de atualização */}
      <div className="mt-6 flex justify-end">
        <button
          onClick={carregar}
          className="inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm font-semibold hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
          aria-label="Atualizar dados do painel"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
          </svg>
          Atualizar
        </button>
      </div>

    </section>
  );
}
