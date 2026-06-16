'use client';

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, adminGet } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface PorTipo {
  tipo: string;
  total: number;
}

interface PorSeveridade {
  severidade: string;
  total: number;
}

interface ConformidadeData {
  geradoEm: string;
  encarregado: {
    configurado: boolean;
    nome: string | null;
    email: string | null;
  };
  solicitacoes: {
    total: number;
    abertas: number;
    concluidas: number;
    indeferidas: number;
    atrasadas: number;
    vencendoEm48h: number;
    porTipo: PorTipo[];
    tempoMedioRespostaDias: number | null;
  };
  incidentes: {
    total: number;
    abertos: number;
    comunicacaoAtrasada: number;
    porSeveridade: PorSeveridade[];
    comunicadosAnpd: number;
  };
  retencao: {
    solicitacoesGuardaAnos: number;
    incidentesGuardaAnos: number;
  };
  score: number;
  alertas: string[];
}

// ─── Labels art. 18 LGPD ─────────────────────────────────────────────────────

const TIPO_LABEL: Record<string, string> = {
  confirmacao_existencia: 'Confirmação de existência',
  acesso: 'Acesso aos dados',
  correcao: 'Correção de dados',
  anonimizacao: 'Anonimização',
  bloqueio: 'Bloqueio',
  eliminacao: 'Eliminação',
  portabilidade: 'Portabilidade',
  info_compartilhamento: 'Informação sobre compartilhamento',
  revogacao_consentimento: 'Revogação de consentimento',
  oposicao: 'Oposição',
  revisao_decisao_automatizada: 'Revisão de decisão automatizada',
};

const SEVERIDADE_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const SEVERIDADE_COR: Record<string, string> = {
  baixa: 'bg-success/20 text-success',
  media: 'bg-warning/20 text-warning',
  alta: 'bg-danger/10 text-danger',
  critica: 'bg-danger text-white',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatarDataHora(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatarNumero(n: number): string {
  return n.toLocaleString('pt-BR');
}

// ─── Score ────────────────────────────────────────────────────────────────────

function scoreCor(score: number): { bg: string; text: string; border: string; label: string } {
  if (score >= 80)
    return {
      bg: 'bg-success/10',
      text: 'text-success',
      border: 'border-success',
      label: 'Conforme',
    };
  if (score >= 50)
    return {
      bg: 'bg-warning/10',
      text: 'text-warning',
      border: 'border-warning',
      label: 'Atenção',
    };
  return {
    bg: 'bg-danger/10',
    text: 'text-danger',
    border: 'border-danger',
    label: 'Crítico',
  };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function ScoreCard({ score }: { score: number }) {
  const cor = scoreCor(score);
  return (
    <section
      aria-label="Score de conformidade LGPD"
      className={`rounded-lg border-2 ${cor.border} ${cor.bg} p-6 flex flex-col items-center gap-2 text-center`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-fg/60">
        Score de Conformidade LGPD
      </p>
      <p
        className={`font-heading text-7xl font-extrabold tabular-nums ${cor.text}`}
        aria-label={`Score de conformidade: ${score} de 100 — ${cor.label}`}
      >
        {score}
        <span className="text-3xl">/100</span>
      </p>
      <span
        className={`${ui.badge} text-base px-4 py-1 ${cor.bg} ${cor.text} border ${cor.border}`}
      >
        {cor.label}
      </span>
      <details className="mt-3 w-full max-w-sm text-left text-xs text-fg/70">
        <summary className="cursor-pointer select-none font-semibold hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded">
          Como o score é calculado
        </summary>
        <ul className="mt-2 list-disc pl-5 space-y-1">
          <li>
            <strong>DPO configurado</strong> — Encarregado com nome e e-mail cadastrados (+25 pts).
          </li>
          <li>
            <strong>Solicitações no prazo</strong> — Nenhuma solicitação atrasada (+25 pts; penalidade proporcional).
          </li>
          <li>
            <strong>Incidentes comunicados</strong> — Todos os incidentes com comunicação à ANPD
            dentro do prazo legal (+25 pts; penalidade proporcional).
          </li>
          <li>
            <strong>Incidentes abertos</strong> — Nenhum incidente aberto sem resolução (+25 pts;
            penalidade proporcional).
          </li>
        </ul>
      </details>
    </section>
  );
}

function AlertasCard({ alertas }: { alertas: string[] }) {
  if (alertas.length === 0) {
    return (
      <section
        aria-label="Alertas de conformidade"
        className="rounded border border-success/40 bg-success/5 p-4 flex items-center gap-3"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
          className="shrink-0 text-success"
        >
          <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
        </svg>
        <p className="text-sm font-semibold text-success">
          Sem pendências de conformidade.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Alertas de conformidade">
      <div className="rounded border border-warning/50 bg-warning/10 p-4 space-y-2">
        <div className="flex items-center gap-2 mb-1">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="currentColor"
            className="shrink-0 text-warning"
          >
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          <p className="font-semibold text-sm text-warning">
            {alertas.length === 1 ? '1 pendência de conformidade' : `${alertas.length} pendências de conformidade`}
          </p>
        </div>
        <ul className="space-y-1" role="list">
          {alertas.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-fg">
              <span aria-hidden="true" className="mt-0.5 text-warning font-bold">•</span>
              {a}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function DpoCard({
  encarregado,
}: {
  encarregado: ConformidadeData['encarregado'];
}) {
  return (
    <section aria-label="Encarregado de dados (DPO)" className={`${ui.card} p-4 space-y-2`}>
      <h2 className="font-heading text-base font-bold flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
          className="text-primary"
        >
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
        Encarregado de Dados (DPO)
      </h2>

      {encarregado.configurado ? (
        <div className="text-sm space-y-1">
          <span className={`${ui.badge} bg-success/20 text-success`}>Configurado</span>
          {encarregado.nome && (
            <p className="pt-1">
              <span className="text-fg/60">Nome:</span>{' '}
              <strong>{encarregado.nome}</strong>
            </p>
          )}
          {encarregado.email && (
            <p>
              <span className="text-fg/60">E-mail:</span>{' '}
              <a
                href={`mailto:${encarregado.email}`}
                className="text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
              >
                {encarregado.email}
              </a>
            </p>
          )}
        </div>
      ) : (
        <div className="text-sm space-y-2">
          <span className={`${ui.badge} bg-danger/10 text-danger`}>Não configurado</span>
          <p className="text-fg/60 text-xs">
            O DPO é obrigatório pela LGPD (art. 41). Configure-o nas solicitações LGPD.
          </p>
          <a
            href="/admin/lgpd-solicitacoes"
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
          >
            Configurar DPO
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
            </svg>
          </a>
        </div>
      )}
    </section>
  );
}

function SolicitacoesCard({
  sol,
}: {
  sol: ConformidadeData['solicitacoes'];
}) {
  return (
    <section aria-label="Solicitações dos titulares" className={`${ui.card} p-4 space-y-4`}>
      <h2 className="font-heading text-base font-bold flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
          className="text-primary"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z" />
        </svg>
        Solicitações dos Titulares (art. 18)
      </h2>

      {/* Contadores principais */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Total" value={formatarNumero(sol.total)} />
        <Stat label="Abertas" value={formatarNumero(sol.abertas)} />
        <Stat label="Concluídas" value={formatarNumero(sol.concluidas)} />
        <Stat label="Indeferidas" value={formatarNumero(sol.indeferidas)} />
        <Stat
          label="Atrasadas"
          value={formatarNumero(sol.atrasadas)}
          destaque={sol.atrasadas > 0}
          corDestaque="text-danger"
        />
        <Stat
          label="Vencendo em 48h"
          value={formatarNumero(sol.vencendoEm48h)}
          destaque={sol.vencendoEm48h > 0}
          corDestaque="text-warning"
        />
      </dl>

      {/* Tempo médio */}
      <p className="text-sm text-fg/70">
        Tempo médio de resposta:{' '}
        <strong className="text-fg">
          {sol.tempoMedioRespostaDias !== null
            ? `${sol.tempoMedioRespostaDias.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`
            : '—'}
        </strong>
        <span className="ml-1 text-xs text-fg/50">(prazo legal: 15 dias)</span>
      </p>

      {/* Mini-tabela por tipo */}
      {sol.porTipo.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-2">
            Por tipo de solicitação
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[280px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${ui.th} text-xs`} scope="col">Tipo (art. 18)</th>
                  <th className={`${ui.th} text-xs text-right`} scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {sol.porTipo.map((t) => (
                  <tr key={t.tipo} className="hover:bg-muted/30">
                    <td className={`${ui.td} text-xs`}>
                      {TIPO_LABEL[t.tipo] ?? t.tipo}
                    </td>
                    <td className={`${ui.td} text-xs text-right tabular-nums`}>
                      {formatarNumero(t.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <a
        href="/admin/lgpd-solicitacoes"
        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
      >
        Gerenciar solicitações
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
        </svg>
      </a>
    </section>
  );
}

function IncidentesCard({
  inc,
}: {
  inc: ConformidadeData['incidentes'];
}) {
  return (
    <section aria-label="Incidentes de segurança" className={`${ui.card} p-4 space-y-4`}>
      <h2 className="font-heading text-base font-bold flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
          className="text-danger"
        >
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
        </svg>
        Incidentes de Segurança (LGPD art. 48)
      </h2>

      {/* Contadores principais */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total" value={formatarNumero(inc.total)} />
        <Stat label="Abertos" value={formatarNumero(inc.abertos)} destaque={inc.abertos > 0} corDestaque="text-warning" />
        <Stat
          label="Comunicação atrasada"
          value={formatarNumero(inc.comunicacaoAtrasada)}
          destaque={inc.comunicacaoAtrasada > 0}
          corDestaque="text-danger"
        />
        <Stat label="Comunicados à ANPD" value={formatarNumero(inc.comunicadosAnpd)} />
      </dl>

      {/* Mini-tabela por severidade */}
      {inc.porSeveridade.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-2">
            Por severidade
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[220px] border-collapse text-sm">
              <thead>
                <tr>
                  <th className={`${ui.th} text-xs`} scope="col">Severidade</th>
                  <th className={`${ui.th} text-xs text-right`} scope="col">Total</th>
                </tr>
              </thead>
              <tbody>
                {inc.porSeveridade.map((s) => (
                  <tr key={s.severidade} className="hover:bg-muted/30">
                    <td className={`${ui.td} text-xs`}>
                      <span className={`${ui.badge} ${SEVERIDADE_COR[s.severidade] ?? 'bg-muted text-fg'}`}>
                        {SEVERIDADE_LABEL[s.severidade] ?? s.severidade}
                      </span>
                    </td>
                    <td className={`${ui.td} text-xs text-right tabular-nums`}>
                      {formatarNumero(s.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <a
        href="/admin/lgpd-incidentes"
        className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
      >
        Gerenciar incidentes
        <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z" />
        </svg>
      </a>
    </section>
  );
}

function RetencaoCard({
  retencao,
}: {
  retencao: ConformidadeData['retencao'];
}) {
  return (
    <section aria-label="Política de retenção de dados" className={`${ui.card} p-4 space-y-2`}>
      <h2 className="font-heading text-base font-bold flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          aria-hidden="true"
          fill="currentColor"
          className="text-primary"
        >
          <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
        </svg>
        Política de Retenção de Dados
      </h2>
      <ul className="space-y-2 text-sm" role="list">
        <li className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-primary font-bold">•</span>
          <span>
            <strong>Solicitações dos titulares:</strong> guardadas por{' '}
            <strong>{retencao.solicitacoesGuardaAnos} anos</strong> após o encerramento (conforme
            legislação aplicável).
          </span>
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden="true" className="mt-0.5 text-primary font-bold">•</span>
          <span>
            <strong>Registros de incidentes:</strong> guardados por{' '}
            <strong>{retencao.incidentesGuardaAnos} anos</strong> após encerramento (LGPD art. 48,
            Resolução CD/ANPD nº 2/2022).
          </span>
        </li>
      </ul>
    </section>
  );
}

/** Card de estatística individual acessível. */
function Stat({
  label,
  value,
  destaque = false,
  corDestaque = 'text-danger',
}: {
  label: string;
  value: string;
  destaque?: boolean;
  corDestaque?: string;
}) {
  return (
    <div className="rounded border border-border bg-muted/30 p-3 text-center" role="group">
      <dt className="text-xs text-fg/60 font-medium leading-tight">{label}</dt>
      <dd
        className={`mt-1 font-heading text-2xl font-bold tabular-nums ${destaque ? corDestaque : 'text-fg'}`}
        aria-label={`${label}: ${value}`}
      >
        {value}
        {destaque && (
          <span className="sr-only"> — requer atenção</span>
        )}
      </dd>
    </div>
  );
}

// ─── Esqueleto de carregamento ─────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Carregando dashboard">
      <div className="h-48 rounded-lg bg-muted" />
      <div className="h-16 rounded bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="h-40 rounded bg-muted" />
        <div className="h-40 rounded bg-muted col-span-2" />
        <div className="h-56 rounded bg-muted col-span-2" />
        <div className="h-32 rounded bg-muted" />
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LgpdConformidadePage() {
  const [dados, setDados] = useState<ConformidadeData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<ConformidadeData>('/api/lgpd/admin/conformidade');
      setDados(data);
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Erro ao carregar dados de conformidade. Tente novamente.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <main className="space-y-6 p-4 md:p-6">
      <AdminHeader
        title="Conformidade LGPD"
        description="Visão consolidada do grau de conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018)."
      >
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className={ui.btnGhost}
          aria-label="Atualizar dados de conformidade"
        >
          {carregando ? (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="currentColor"
                className="animate-spin"
              >
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
              </svg>
              Atualizando…
            </>
          ) : (
            <>
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
              </svg>
              Atualizar
            </>
          )}
        </button>
      </AdminHeader>

      {/* Data de geração */}
      {dados && !carregando && (
        <p className="text-xs text-fg/50" aria-live="polite">
          Gerado em:{' '}
          <time dateTime={dados.geradoEm}>{formatarDataHora(dados.geradoEm)}</time>
        </p>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <Skeleton />
      ) : dados ? (
        <div className="space-y-6">
          {/* Score em destaque */}
          <ScoreCard score={dados.score} />

          {/* Alertas */}
          <AlertasCard alertas={dados.alertas} />

          {/* Grid de cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {/* DPO — ocupa 1 coluna */}
            <DpoCard encarregado={dados.encarregado} />

            {/* Solicitações — ocupa 2 colunas em telas largas */}
            <div className="md:col-span-1 lg:col-span-2">
              <SolicitacoesCard sol={dados.solicitacoes} />
            </div>

            {/* Incidentes — ocupa 2 colunas em telas largas */}
            <div className="md:col-span-2 lg:col-span-2">
              <IncidentesCard inc={dados.incidentes} />
            </div>

            {/* Retenção — ocupa 1 coluna */}
            <RetencaoCard retencao={dados.retencao} />
          </div>
        </div>
      ) : null}
    </main>
  );
}
