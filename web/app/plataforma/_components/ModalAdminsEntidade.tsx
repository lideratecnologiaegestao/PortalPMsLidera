'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Aviso, ui } from '../../admin/_components/ui';
import {
  listarAdminsEntidade,
  criarAdminEntidade,
  atualizarAdminEntidade,
  type AdminEntidade,
  type Tenant,
} from '../../../lib/platform';
import { AdminApiError } from '../../../lib/admin-api';

function erroMsg(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido.';
}

function fmtData(iso: string | null): string {
  if (!iso) return 'nunca';
  try {
    return new Date(iso).toLocaleString('pt-BR');
  } catch {
    return iso;
  }
}

/**
 * Modal do Gerenciador (super_admin) para gerir o(s) usuário(s) admin_prefeitura
 * de uma entidade: criar, editar (nome/e-mail), bloquear/desbloquear e resetar a
 * senha. Senha provisória é mostrada UMA vez (criação/reset). Bloquear ou
 * resetar a senha encerra as sessões ativas do admin.
 */
export function ModalAdminsEntidade({
  tenant,
  onClose,
}: {
  tenant: Tenant | null;
  onClose: () => void;
}) {
  const [admins, setAdmins] = useState<AdminEntidade[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Formulário (criar/editar)
  const [formMode, setFormMode] = useState<'lista' | 'novo' | 'editar'>('lista');
  const [formId, setFormId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');

  // Senha provisória revelada uma vez (após criar/resetar)
  const [senha, setSenha] = useState<{ email: string; valor: string } | null>(null);

  const tenantId = tenant?.id ?? null;

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      setAdmins(await listarAdminsEntidade(tenantId));
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setCarregando(false);
    }
  }, [tenantId]);

  // Ao abrir (tenant muda), zera o estado e carrega.
  useEffect(() => {
    if (!tenantId) return;
    setFormMode('lista');
    setSenha(null);
    setOk(null);
    setErro(null);
    void carregar();
  }, [tenantId, carregar]);

  if (!tenant) return null;

  function abrirNovo() {
    setFormId(null);
    setFormNome('');
    setFormEmail('');
    setErro(null);
    setOk(null);
    setSenha(null);
    setFormMode('novo');
  }

  function abrirEditar(a: AdminEntidade) {
    setFormId(a.id);
    setFormNome(a.nome);
    setFormEmail(a.email);
    setErro(null);
    setOk(null);
    setSenha(null);
    setFormMode('editar');
  }

  async function salvarForm() {
    if (!tenantId) return;
    const nome = formNome.trim();
    const email = formEmail.trim();
    if (!nome || !email) {
      setErro('Informe nome e e-mail.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      if (formMode === 'novo') {
        const r = await criarAdminEntidade(tenantId, { nome, email });
        if (r.senhaProvisoria) setSenha({ email: r.user.email, valor: r.senhaProvisoria });
        setOk('Administrador criado.');
      } else if (formMode === 'editar' && formId) {
        await atualizarAdminEntidade(tenantId, formId, { nome, email });
        setOk('Administrador atualizado.');
      }
      setFormMode('lista');
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function toggleBloqueio(a: AdminEntidade) {
    if (!tenantId) return;
    const bloquear = a.ativo;
    if (
      bloquear &&
      !window.confirm(`Bloquear ${a.nome}? As sessões ativas dele serão encerradas imediatamente.`)
    ) {
      return;
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    setSenha(null);
    try {
      const r = await atualizarAdminEntidade(tenantId, a.id, { ativo: !a.ativo });
      setOk(
        bloquear
          ? `Acesso bloqueado (${r.sessoesRevogadas ?? 0} sessão(ões) encerrada(s)).`
          : 'Acesso desbloqueado.',
      );
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function resetarSenha(a: AdminEntidade) {
    if (!tenantId) return;
    if (
      !window.confirm(
        `Gerar nova senha provisória para ${a.nome}? A senha atual deixa de valer e as sessões são encerradas.`,
      )
    ) {
      return;
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const r = await atualizarAdminEntidade(tenantId, a.id, { resetarSenha: true });
      if (r.senhaProvisoria) setSenha({ email: a.email, valor: r.senhaProvisoria });
      setOk('Nova senha provisória gerada.');
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={!!tenant} onClose={onClose} title={`Administradores — ${tenant.nome}`}>
      <div className="space-y-3">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ok && <Aviso tipo="ok">{ok}</Aviso>}

        {/* Senha provisória — mostrada uma única vez */}
        {senha && (
          <div className="space-y-1 rounded border border-success bg-success/10 p-3 text-sm">
            <p className="font-semibold text-success">
              Senha provisória — anote agora (não será mostrada de novo)
            </p>
            <p>
              Usuário: <strong>{senha.email}</strong>
            </p>
            <div className="flex items-center gap-2">
              <code className="select-all rounded bg-bg px-2 py-1 text-sm">{senha.valor}</code>
              <button
                type="button"
                className={`${ui.btnGhost} py-1 text-xs`}
                onClick={() => navigator.clipboard?.writeText(senha.valor)}
              >
                Copiar
              </button>
            </div>
          </div>
        )}

        {formMode === 'lista' ? (
          <>
            <div className="flex justify-end">
              <button type="button" className={`${ui.btn} py-1 text-xs`} onClick={abrirNovo}>
                + Novo administrador
              </button>
            </div>

            {carregando && <p className="text-sm text-fg/60">Carregando…</p>}

            {admins && admins.length === 0 && !carregando && (
              <p className="text-sm text-fg/60">
                Nenhum administrador cadastrado. Crie o primeiro acima.
              </p>
            )}

            {admins && admins.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={ui.th}>Nome / E-mail</th>
                    <th className={ui.th}>Status</th>
                    <th className={ui.th}>Último login</th>
                    <th className={ui.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id}>
                      <td className={ui.td}>
                        <span className="block font-medium">{a.nome}</span>
                        <span className="block text-xs text-fg/60">{a.email}</span>
                      </td>
                      <td className={ui.td}>
                        <span
                          className={`${ui.badge} ${
                            a.ativo ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                          }`}
                        >
                          {a.ativo ? 'ativo' : 'bloqueado'}
                        </span>
                      </td>
                      <td className={ui.td}>{fmtData(a.ultimoLoginEm)}</td>
                      <td className={ui.td}>
                        <span className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            disabled={salvando}
                            className={`${ui.btnGhost} py-1 text-xs`}
                            onClick={() => abrirEditar(a)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            disabled={salvando}
                            className={`${ui.btnGhost} py-1 text-xs`}
                            onClick={() => resetarSenha(a)}
                          >
                            Resetar senha
                          </button>
                          <button
                            type="button"
                            disabled={salvando}
                            className={`${a.ativo ? ui.btnDanger : ui.btnGhost} py-1 text-xs`}
                            onClick={() => toggleBloqueio(a)}
                          >
                            {a.ativo ? 'Bloquear' : 'Desbloquear'}
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void salvarForm();
            }}
            className="space-y-3"
          >
            <div>
              <label className={ui.label} htmlFor="adm-nome">
                Nome <span className="text-danger">*</span>
              </label>
              <input
                id="adm-nome"
                className={ui.input}
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className={ui.label} htmlFor="adm-email">
                E-mail <span className="text-danger">*</span>
              </label>
              <input
                id="adm-email"
                type="email"
                className={ui.input}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
              {formMode === 'novo' && (
                <p className="mt-0.5 text-xs text-fg/60">
                  Uma senha provisória será gerada e mostrada uma única vez.
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={`${ui.btnGhost} py-1 text-sm`}
                onClick={() => {
                  setFormMode('lista');
                  setErro(null);
                }}
              >
                Cancelar
              </button>
              <button type="submit" disabled={salvando} className={`${ui.btn} py-1 text-sm`}>
                {salvando ? 'Salvando…' : formMode === 'novo' ? 'Criar' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
