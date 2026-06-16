'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  qs,
} from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso, ui } from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PorPapel {
  papel: string;
  total: number;
}

interface PorGrupo {
  grupo: string;
  membros: number;
}

interface ResumoRelatorio {
  total: number;
  ativos: number;
  inativos: number;
  comMfa: number;
  porPapel: PorPapel[];
  porGrupo: PorGrupo[];
  onlineAgora: number;
}

interface EventoLogin {
  data: string;
  acao: string;
  atorId: string;
  nomeAtor: string;
  email: string;
}

interface UltimoAcesso {
  id: string;
  nome: string;
  email: string;
  papel: string;
  ultimoLoginEm: string | null;
  ativo: boolean;
}

interface RelatorioUsuarios {
  resumo: ResumoRelatorio;
  logins: EventoLogin[];
  ultimosAcessos: UltimoAcesso[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  servidor: 'Servidor',
  gestor: 'Gestor',
  ouvidor: 'Ouvidor',
  admin_prefeitura: 'Administrador',
  super_admin: 'Super Admin',
  cidadao: 'Cidadão',
};

function rotuloRole(role: string): string {
  return ROLE_LABELS[role] ?? role;
}

const ACAO_LABELS: Record<string, { label: string; alerta: boolean }> = {
  LOGIN_LOCAL: { label: 'Login (senha)', alerta: false },
  LOGIN_GOVBR: { label: 'Login gov.br', alerta: false },
  LOGIN_CIDADAO: { label: 'Login cidadão', alerta: false },
  LOGIN_FALHOU: { label: 'Tentativa falha', alerta: true },
};

function traduzirAcao(acao: string): { label: string; alerta: boolean } {
  return ACAO_LABELS[acao] ?? { label: acao, alerta: false };
}

function formatarData(iso: string | null): string {
  if (!iso) return '—';
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

function formatarDataCurta(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('pt-BR').format(v);
}

// ---------------------------------------------------------------------------
// Card de resumo
// ---------------------------------------------------------------------------

function CardResumo({
  titulo,
  valor,
  destaque,
  corClasse,
}: {
  titulo: string;
  valor: number;
  destaque?: boolean;
  corClasse?: string;
}) {
  return (
    <div
      className={`${ui.card} p-4 flex flex-col gap-1 ${destaque ? 'border-primary' : ''}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-fg/50">{titulo}</p>
      <p className={`text-3xl font-bold ${corClasse ?? 'text-fg'}`}>{fmtNum(valor)}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function UsuariosRelatorioPage() {
  const idBase = useId();
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [relatorio, setRelatorio] = useState<RelatorioUsuarios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params = qs({ formato: 'json', dataDe: dataDe || undefined, dataAte: dataAte || undefined });
      const dados = await adminGet<RelatorioUsuarios>(`/api/admin/users/relatorio${params}`);
      setRelatorio(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar relatório.');
    } finally {
      setCarregando(false);
    }
  }, [dataDe, dataAte]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /** Monta URL de download (CSV/PDF) replicando exatamente o padrão de ManifestacoesAdmin. */
  function urlExport(formato: 'csv' | 'pdf'): string {
    const p = new URLSearchParams({ formato });
    if (dataDe) p.set('dataDe', dataDe);
    if (dataAte) p.set('dataAte', dataAte);
    return `${apiBase}/api/admin/users/relatorio?${p.toString()}`;
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <AdminHeader
        title="Relatório de Usuários"
        description="Resumo estatístico, últimos acessos e eventos de login dos usuários do painel."
      >
        <a href={urlExport('csv')} className={ui.btnGhost} download>
          Exportar CSV
        </a>
        <a href={urlExport('pdf')} className={ui.btn} download>
          Exportar PDF
        </a>
      </AdminHeader>

      {/* Filtros de período */}
      <section
        aria-label="Filtro de período"
        className={`${ui.card} flex flex-wrap items-end gap-3 p-4`}
      >
        <div>
          <label htmlFor={`${idBase}-dataDe`} className={ui.label}>
            De
          </label>
          <input
            id={`${idBase}-dataDe`}
            type="date"
            className={`${ui.input} mt-1`}
            value={dataDe}
            onChange={(e) => setDataDe(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-dataAte`} className={ui.label}>
            Até
          </label>
          <input
            id={`${idBase}-dataAte`}
            type="date"
            className={`${ui.input} mt-1`}
            value={dataAte}
            onChange={(e) => setDataAte(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className={ui.btn}
        >
          {carregando ? 'Carregando…' : 'Aplicar filtro'}
        </button>
        {(dataDe || dataAte) && (
          <button
            type="button"
            onClick={() => {
              setDataDe('');
              setDataAte('');
            }}
            className={ui.btnGhost}
          >
            Limpar
          </button>
        )}
      </section>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando && (
        <p className="py-8 text-center text-sm text-fg/60" role="status">
          Carregando…
        </p>
      )}

      {!carregando && relatorio && (
        <>
          {/* Cards de resumo */}
          <section aria-label="Resumo de usuários">
            <h2 className="mb-3 font-heading text-lg font-bold">Resumo</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <CardResumo titulo="Total" valor={relatorio.resumo.total} />
              <CardResumo
                titulo="Ativos"
                valor={relatorio.resumo.ativos}
                corClasse="text-success"
              />
              <CardResumo
                titulo="Inativos"
                valor={relatorio.resumo.inativos}
                corClasse="text-fg/60"
              />
              <CardResumo
                titulo="Com MFA"
                valor={relatorio.resumo.comMfa}
                corClasse="text-primary"
              />
              <CardResumo
                titulo="Online agora"
                valor={relatorio.resumo.onlineAgora}
                corClasse="text-success"
                destaque
              />
            </div>
          </section>

          {/* Por papel e por grupo */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Por papel */}
            <section aria-label="Usuários por papel" className={`${ui.card} p-4`}>
              <h2 className="mb-3 font-semibold">Por papel</h2>
              {relatorio.resumo.porPapel.length === 0 ? (
                <p className="text-sm text-fg/60">Sem dados.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={ui.th} scope="col">Papel</th>
                      <th className={`${ui.th} text-right`} scope="col">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.resumo.porPapel.map((item) => (
                      <tr key={item.papel}>
                        <td className={ui.td}>
                          <span className={`${ui.badge} bg-primary/10 text-primary`}>
                            {rotuloRole(item.papel)}
                          </span>
                        </td>
                        <td className={`${ui.td} text-right font-semibold`}>
                          {fmtNum(item.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Por grupo */}
            <section aria-label="Usuários por grupo" className={`${ui.card} p-4`}>
              <h2 className="mb-3 font-semibold">Por grupo</h2>
              {relatorio.resumo.porGrupo.length === 0 ? (
                <p className="text-sm text-fg/60">Nenhum grupo cadastrado.</p>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className={ui.th} scope="col">Grupo</th>
                      <th className={`${ui.th} text-right`} scope="col">Membros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.resumo.porGrupo.map((item) => (
                      <tr key={item.grupo}>
                        <td className={ui.td}>{item.grupo}</td>
                        <td className={`${ui.td} text-right font-semibold`}>
                          {fmtNum(item.membros)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>

          {/* Últimos acessos */}
          <section aria-label="Últimos acessos">
            <h2 className="mb-3 font-heading text-lg font-bold">Últimos acessos</h2>
            {relatorio.ultimosAcessos.length === 0 ? (
              <p className="py-4 text-sm text-fg/60">Sem registros de acesso no período.</p>
            ) : (
              <div className={`${ui.card} overflow-x-auto`}>
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className={ui.th} scope="col">Usuário</th>
                      <th className={ui.th} scope="col">Papel</th>
                      <th className={ui.th} scope="col">Último login</th>
                      <th className={ui.th} scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.ultimosAcessos.map((u) => (
                      <tr key={u.id} className="hover:bg-muted/30 transition-colors">
                        <td className={ui.td}>
                          <div>
                            <span className="font-semibold">{u.nome}</span>
                            <br />
                            <span className="text-xs text-fg/60">{u.email}</span>
                          </div>
                        </td>
                        <td className={ui.td}>
                          <span className={`${ui.badge} bg-primary/10 text-primary`}>
                            {rotuloRole(u.papel)}
                          </span>
                        </td>
                        <td className={ui.td}>
                          <time
                            dateTime={u.ultimoLoginEm ?? undefined}
                            className="text-fg/70 text-sm"
                          >
                            {formatarData(u.ultimoLoginEm)}
                          </time>
                        </td>
                        <td className={ui.td}>
                          {u.ativo ? (
                            <span className={`${ui.badge} bg-success/20 text-success`}>
                              Ativo
                            </span>
                          ) : (
                            <span className={`${ui.badge} bg-muted text-fg/50`}>
                              Inativo
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Eventos de login recentes */}
          <section aria-label="Eventos de login recentes">
            <h2 className="mb-3 font-heading text-lg font-bold">Eventos de login recentes</h2>
            {relatorio.logins.length === 0 ? (
              <p className="py-4 text-sm text-fg/60">
                Nenhum evento de login registrado no período.
              </p>
            ) : (
              <div className={`${ui.card} overflow-x-auto`}>
                <table className="w-full min-w-[640px] border-collapse">
                  <thead>
                    <tr>
                      <th className={ui.th} scope="col">Data</th>
                      <th className={ui.th} scope="col">Ação</th>
                      <th className={ui.th} scope="col">Usuário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relatorio.logins.map((ev, idx) => {
                      const { label, alerta } = traduzirAcao(ev.acao);
                      return (
                        // usa idx como tiebreaker pois eventos podem não ter id único
                        <tr
                          key={`${ev.data}-${ev.atorId}-${idx}`}
                          className={`transition-colors ${alerta ? 'bg-danger/5 hover:bg-danger/10' : 'hover:bg-muted/30'}`}
                        >
                          <td className={`${ui.td} whitespace-nowrap`}>
                            <time dateTime={ev.data} className="text-sm text-fg/70">
                              {formatarDataCurta(ev.data)}{' '}
                              <span className="text-fg/50 text-xs">
                                {new Date(ev.data).toLocaleTimeString('pt-BR', {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </time>
                          </td>
                          <td className={ui.td}>
                            <span
                              className={`${ui.badge} ${
                                alerta
                                  ? 'bg-danger/20 text-danger'
                                  : 'bg-primary/10 text-primary'
                              }`}
                            >
                              {label}
                            </span>
                          </td>
                          <td className={ui.td}>
                            <span className="font-medium">{ev.nomeAtor || '—'}</span>
                            {ev.email && (
                              <span className="ml-2 text-xs text-fg/60">{ev.email}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
