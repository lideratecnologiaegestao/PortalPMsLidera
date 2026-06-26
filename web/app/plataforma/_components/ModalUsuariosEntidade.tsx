'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal, Aviso, ui } from '../../admin/_components/ui';
import {
  listarUsuariosEntidade,
  criarUsuarioEntidade,
  atualizarUsuarioEntidade,
  rotuloPapel,
  PAPEIS_TENANT,
  type UsuarioEntidade,
  type PapelTenant,
  type Tenant,
} from '../../../lib/platform';
import type { Pagina } from '../../../lib/admin-api';
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

const PAGE_SIZE = 20;

/** Opções do filtro de papel (UI → valor do parâmetro `role` da API). */
const FILTROS_PAPEL: { value: string; label: string }[] = [
  { value: 'equipe', label: 'Equipe (todos os papéis)' },
  ...PAPEIS_TENANT.map((p) => ({ value: p.value as string, label: p.label })),
  { value: 'cidadao', label: 'Cidadão' },
  { value: '', label: 'Todos' },
];

/**
 * Modal do Gerenciador (super_admin) para gerir TODOS os usuários de uma entidade
 * (admin, gestor, ouvidor, assistente de ouvidoria, servidor, TI): listar (com
 * filtro por papel e busca), criar, editar (inclui papel), bloquear/desbloquear
 * e resetar senha. Senha provisória é mostrada UMA vez (criação/reset). Bloquear
 * ou resetar a senha encerra as sessões ativas do usuário.
 */
export function ModalUsuariosEntidade({
  tenant,
  onClose,
}: {
  tenant: Tenant | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<Pagina<UsuarioEntidade> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Filtros e paginação
  const [roleFiltro, setRoleFiltro] = useState('equipe');
  const [buscaInput, setBuscaInput] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);

  // Formulário (criar/editar)
  const [formMode, setFormMode] = useState<'lista' | 'novo' | 'editar'>('lista');
  const [formId, setFormId] = useState<string | null>(null);
  const [formNome, setFormNome] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<string>('admin_prefeitura');

  // Senha provisória revelada uma vez (após criar/resetar)
  const [senha, setSenha] = useState<{ email: string; valor: string } | null>(null);

  const tenantId = tenant?.id ?? null;

  const carregar = useCallback(async () => {
    if (!tenantId) return;
    setCarregando(true);
    setErro(null);
    try {
      setData(
        await listarUsuariosEntidade(tenantId, {
          role: roleFiltro,
          q: busca || undefined,
          page,
          pageSize: PAGE_SIZE,
        }),
      );
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setCarregando(false);
    }
  }, [tenantId, roleFiltro, busca, page]);

  // (Re)abertura: zera filtros/estado.
  useEffect(() => {
    if (!tenantId) return;
    setRoleFiltro('equipe');
    setBuscaInput('');
    setBusca('');
    setPage(1);
    setFormMode('lista');
    setSenha(null);
    setOk(null);
    setErro(null);
  }, [tenantId]);

  // Carrega quando filtros/página mudam.
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!tenant) return null;

  function abrirNovo() {
    setFormId(null);
    setFormNome('');
    setFormEmail('');
    setFormRole('admin_prefeitura');
    setErro(null);
    setOk(null);
    setSenha(null);
    setFormMode('novo');
  }

  function abrirEditar(u: UsuarioEntidade) {
    setFormId(u.id);
    setFormNome(u.nome);
    setFormEmail(u.email);
    setFormRole(u.role);
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
        const r = await criarUsuarioEntidade(tenantId, {
          nome,
          email,
          role: formRole as PapelTenant,
        });
        if (r.senhaProvisoria) setSenha({ email: r.user.email, valor: r.senhaProvisoria });
        setOk('Usuário criado.');
      } else if (formMode === 'editar' && formId) {
        await atualizarUsuarioEntidade(tenantId, formId, {
          nome,
          email,
          role: formRole as PapelTenant,
        });
        setOk('Usuário atualizado.');
      }
      setFormMode('lista');
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function toggleBloqueio(u: UsuarioEntidade) {
    if (!tenantId) return;
    const bloquear = u.ativo;
    if (
      bloquear &&
      !window.confirm(`Bloquear ${u.nome}? As sessões ativas dele serão encerradas imediatamente.`)
    ) {
      return;
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    setSenha(null);
    try {
      const r = await atualizarUsuarioEntidade(tenantId, u.id, { ativo: !u.ativo });
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

  async function resetarSenha(u: UsuarioEntidade) {
    if (!tenantId) return;
    if (
      !window.confirm(
        `Gerar nova senha provisória para ${u.nome}? A senha atual deixa de valer e as sessões são encerradas.`,
      )
    ) {
      return;
    }
    setSalvando(true);
    setErro(null);
    setOk(null);
    try {
      const r = await atualizarUsuarioEntidade(tenantId, u.id, { resetarSenha: true });
      if (r.senhaProvisoria) setSenha({ email: u.email, valor: r.senhaProvisoria });
      setOk('Nova senha provisória gerada.');
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  // Opções do select de papel no formulário (preserva o papel atual se não-gerenciável).
  const opcoesPapel = [...PAPEIS_TENANT] as { value: string; label: string }[];
  if (!opcoesPapel.some((p) => p.value === formRole)) {
    opcoesPapel.unshift({ value: formRole, label: rotuloPapel(formRole) });
  }

  const total = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Modal open={!!tenant} onClose={onClose} title={`Usuários — ${tenant.nome}`}>
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
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs font-semibold text-fg/60" htmlFor="usr-papel">
                  Papel
                </label>
                <select
                  id="usr-papel"
                  className={ui.input}
                  value={roleFiltro}
                  onChange={(e) => {
                    setRoleFiltro(e.target.value);
                    setPage(1);
                  }}
                >
                  {FILTROS_PAPEL.map((f) => (
                    <option key={f.value || 'todos'} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <form
                className="flex flex-1 items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  setBusca(buscaInput.trim());
                  setPage(1);
                }}
              >
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-fg/60" htmlFor="usr-busca">
                    Buscar (nome ou e-mail)
                  </label>
                  <input
                    id="usr-busca"
                    className={ui.input}
                    value={buscaInput}
                    onChange={(e) => setBuscaInput(e.target.value)}
                    placeholder="ex.: maria, ouvidor@…"
                  />
                </div>
                <button type="submit" className={`${ui.btnGhost} py-2 text-sm`}>
                  Buscar
                </button>
              </form>
              <button type="button" className={`${ui.btn} py-2 text-sm`} onClick={abrirNovo}>
                + Novo usuário
              </button>
            </div>

            {carregando && <p className="text-sm text-fg/60">Carregando…</p>}

            {data && data.items.length === 0 && !carregando && (
              <p className="text-sm text-fg/60">Nenhum usuário encontrado com esse filtro.</p>
            )}

            {data && data.items.length > 0 && (
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={ui.th}>Nome / E-mail</th>
                    <th className={ui.th}>Papel</th>
                    <th className={ui.th}>Status</th>
                    <th className={ui.th}>Último login</th>
                    <th className={ui.th}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((u) => {
                    const ehSuper = u.role === 'super_admin';
                    return (
                      <tr key={u.id}>
                        <td className={ui.td}>
                          <span className="block font-medium">{u.nome}</span>
                          <span className="block text-xs text-fg/60">{u.email}</span>
                        </td>
                        <td className={ui.td}>
                          <span className={`${ui.badge} bg-muted text-fg/70`}>
                            {rotuloPapel(u.role)}
                          </span>
                        </td>
                        <td className={ui.td}>
                          <span
                            className={`${ui.badge} ${
                              u.ativo ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
                            }`}
                          >
                            {u.ativo ? 'ativo' : 'bloqueado'}
                          </span>
                        </td>
                        <td className={ui.td}>{fmtData(u.ultimoLoginEm)}</td>
                        <td className={ui.td}>
                          {ehSuper ? (
                            <span className="text-xs text-fg/50">—</span>
                          ) : (
                            <span className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                disabled={salvando}
                                className={`${ui.btnGhost} py-1 text-xs`}
                                onClick={() => abrirEditar(u)}
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                disabled={salvando}
                                className={`${ui.btnGhost} py-1 text-xs`}
                                onClick={() => resetarSenha(u)}
                              >
                                Resetar senha
                              </button>
                              <button
                                type="button"
                                disabled={salvando}
                                className={`${u.ativo ? ui.btnDanger : ui.btnGhost} py-1 text-xs`}
                                onClick={() => toggleBloqueio(u)}
                              >
                                {u.ativo ? 'Bloquear' : 'Desbloquear'}
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* Paginação */}
            {data && total > PAGE_SIZE && (
              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  className={`${ui.btnGhost} py-1 text-xs`}
                  disabled={page <= 1 || carregando}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Anterior
                </button>
                <span className="text-fg/60">
                  Página {page} de {totalPaginas} · {total} usuário{total === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  className={`${ui.btnGhost} py-1 text-xs`}
                  disabled={page >= totalPaginas || carregando}
                  onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima
                </button>
              </div>
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
              <label className={ui.label} htmlFor="usr-nome">
                Nome <span className="text-danger">*</span>
              </label>
              <input
                id="usr-nome"
                className={ui.input}
                value={formNome}
                onChange={(e) => setFormNome(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className={ui.label} htmlFor="usr-email">
                E-mail <span className="text-danger">*</span>
              </label>
              <input
                id="usr-email"
                type="email"
                className={ui.input}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
              />
            </div>
            <div>
              <label className={ui.label} htmlFor="usr-role">
                Papel <span className="text-danger">*</span>
              </label>
              <select
                id="usr-role"
                className={ui.input}
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
              >
                {opcoesPapel.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
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
