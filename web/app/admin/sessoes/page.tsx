'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  adminPost,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface SessaoAtiva {
  id: string;
  userId: string;
  nome: string;
  email: string;
  role: string;
  ip: string;
  userAgent: string;
  criadoEm: string;
  ultimaAtividadeEm: string;
  online: boolean;
}

interface OnlineTotal {
  total: number;
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

/** Formata data no padrão pt-BR completo. */
function formatarData(iso: string): string {
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

/** Retorna tempo relativo em pt-BR (ex.: "há 3 min", "há 2 h"). */
function tempoRelativo(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const seg = Math.floor(diff / 1000);
    if (seg < 60) return 'agora';
    const min = Math.floor(seg / 60);
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} h`;
    const d = Math.floor(h / 24);
    return `há ${d} dia${d !== 1 ? 's' : ''}`;
  } catch {
    return iso;
  }
}

/**
 * Extrai nome do navegador e sistema operacional a partir do User-Agent.
 * Retorna uma string curta para exibir na tabela.
 */
function parsearUserAgent(ua: string): string {
  if (!ua) return '—';
  // Ordem importa: mais específico primeiro
  let navegador = 'Outro';
  if (/Edg\//i.test(ua)) navegador = 'Edge';
  else if (/OPR\//i.test(ua) || /Opera/i.test(ua)) navegador = 'Opera';
  else if (/Chrome\//i.test(ua)) navegador = 'Chrome';
  else if (/Firefox\//i.test(ua)) navegador = 'Firefox';
  else if (/Safari\//i.test(ua)) navegador = 'Safari';
  else if (/MSIE|Trident/i.test(ua)) navegador = 'IE';

  let so = '';
  if (/Windows/i.test(ua)) so = 'Windows';
  else if (/Macintosh/i.test(ua)) so = 'macOS';
  else if (/Android/i.test(ua)) so = 'Android';
  else if (/iPhone|iPad/i.test(ua)) so = 'iOS';
  else if (/Linux/i.test(ua)) so = 'Linux';

  return so ? `${navegador} / ${so}` : navegador;
}

// ---------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------

export default function SessoesAdminPage() {
  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([]);
  const [online, setOnline] = useState<number | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [encerrando, setEncerrando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setMsgOk('');
    try {
      const [lista, cnt] = await Promise.all([
        adminGet<SessaoAtiva[]>('/api/admin/sessoes'),
        adminGet<OnlineTotal>('/api/admin/sessoes/online'),
      ]);
      setSessoes(lista);
      setOnline(cnt.total);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar sessões.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function encerrarSessao(id: string, nome: string) {
    if (!window.confirm(`Encerrar a sessão de "${nome}"? O usuário será desconectado imediatamente.`)) {
      return;
    }
    setEncerrando(id);
    setErro('');
    setMsgOk('');
    try {
      await adminPost(`/api/admin/sessoes/${id}/revogar`);
      setMsgOk(`Sessão de "${nome}" encerrada com sucesso.`);
      await carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao encerrar sessão.');
    } finally {
      setEncerrando(null);
    }
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Sessões Ativas"
        description="Visualize e encerre sessões de usuários logados no painel."
      >
        <button
          onClick={carregar}
          disabled={carregando}
          className={ui.btnGhost}
          aria-label="Atualizar lista de sessões"
        >
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </AdminHeader>

      {/* Destaque: usuários online agora */}
      {online !== null && (
        <section
          aria-label="Usuários online agora"
          className={`${ui.card} flex items-center gap-4 p-4`}
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-success/20"
            aria-hidden="true"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="text-success"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="5" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-bold text-fg" aria-live="polite">
              {new Intl.NumberFormat('pt-BR').format(online)}
            </p>
            <p className="text-sm text-fg/60">
              {online === 1 ? 'usuário online agora' : 'usuários online agora'}
            </p>
          </div>
        </section>
      )}

      {/* Feedbacks */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de sessões ativas"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : sessoes.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhuma sessão ativa encontrada.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Usuário</th>
                  <th className={ui.th} scope="col">Papel</th>
                  <th className={ui.th} scope="col">IP</th>
                  <th className={ui.th} scope="col">Dispositivo</th>
                  <th className={ui.th} scope="col">Início</th>
                  <th className={ui.th} scope="col">Última atividade</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sessoes.map((s) => {
                  const dispositivo = parsearUserAgent(s.userAgent);
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <td className={ui.td}>
                        <div>
                          <span className="font-semibold">{s.nome}</span>
                          <br />
                          <span className="text-xs text-fg/60">{s.email}</span>
                        </div>
                      </td>
                      <td className={ui.td}>
                        <span className={`${ui.badge} bg-primary/10 text-primary`}>
                          {rotuloRole(s.role)}
                        </span>
                      </td>
                      <td className={`${ui.td} font-mono text-xs`}>
                        {s.ip || '—'}
                      </td>
                      <td className={ui.td}>
                        <span
                          title={s.userAgent}
                          className="cursor-help underline decoration-dotted"
                        >
                          {dispositivo}
                        </span>
                      </td>
                      <td className={ui.td}>
                        <time dateTime={s.criadoEm} className="text-fg/70 text-xs">
                          {formatarData(s.criadoEm)}
                        </time>
                      </td>
                      <td className={ui.td}>
                        <time
                          dateTime={s.ultimaAtividadeEm}
                          title={formatarData(s.ultimaAtividadeEm)}
                          className="text-fg/70 text-xs cursor-help"
                        >
                          {tempoRelativo(s.ultimaAtividadeEm)}
                        </time>
                      </td>
                      <td className={ui.td}>
                        {s.online ? (
                          <span
                            className={`${ui.badge} bg-success/20 text-success`}
                            role="status"
                            aria-label="Usuário online"
                          >
                            online
                          </span>
                        ) : (
                          <span className={`${ui.badge} bg-muted text-fg/50`}>
                            inativo
                          </span>
                        )}
                      </td>
                      <td className={`${ui.td} whitespace-nowrap`}>
                        <button
                          type="button"
                          className={ui.btnDanger}
                          disabled={encerrando === s.id}
                          onClick={() => encerrarSessao(s.id, s.nome)}
                          aria-label={`Encerrar sessão de ${s.nome}`}
                        >
                          {encerrando === s.id ? 'Encerrando…' : 'Encerrar'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
