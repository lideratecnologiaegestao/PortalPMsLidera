'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  Pagina,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  qs,
} from '../../../lib/admin-api';
import {
  AdminHeader,
  Aviso,
  Modal,
  ui,
} from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type Role = 'servidor' | 'gestor' | 'ouvidor' | 'admin_prefeitura';

interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: Role;
  ativo: boolean;
  ultimoLoginEm: string | null;
  mfaHabilitado: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLES: { value: Role; label: string }[] = [
  { value: 'servidor', label: 'Servidor' },
  { value: 'gestor', label: 'Gestor' },
  { value: 'ouvidor', label: 'Ouvidor' },
  { value: 'admin_prefeitura', label: 'Administrador' },
];

function rotuloRole(role: string): string {
  return ROLES.find((r) => r.value === role)?.label ?? role;
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

// ---------------------------------------------------------------------------
// Modal: Novo usuário
// ---------------------------------------------------------------------------

interface FormNovoState {
  nome: string;
  email: string;
  role: Role;
  senhaProvisoria: string;
}

function ModalNovoUsuario({
  open,
  onClose,
  onSalvo,
}: {
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormNovoState>({
    nome: '',
    email: '',
    role: 'servidor',
    senhaProvisoria: '',
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    setForm({ nome: '', email: '', role: 'servidor', senhaProvisoria: '' });
  }, [open]);

  function campo<K extends keyof FormNovoState>(k: K, v: FormNovoState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.senhaProvisoria.length < 8) {
      setErro('A senha provisória deve ter no mínimo 8 caracteres.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await adminPost('/api/admin/users', form);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo usuário">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Nome */}
        <div>
          <label htmlFor={`${idBase}-nome`} className={ui.label}>
            Nome completo <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-nome`}
            className={`${ui.input} mt-1`}
            value={form.nome}
            onChange={(e) => campo('nome', e.target.value)}
            required
            aria-required="true"
            autoComplete="name"
          />
        </div>

        {/* E-mail */}
        <div>
          <label htmlFor={`${idBase}-email`} className={ui.label}>
            E-mail <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-email`}
            type="email"
            className={`${ui.input} mt-1`}
            value={form.email}
            onChange={(e) => campo('email', e.target.value)}
            required
            aria-required="true"
            autoComplete="email"
          />
        </div>

        {/* Papel */}
        <div>
          <label htmlFor={`${idBase}-role`} className={ui.label}>
            Papel <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${idBase}-role`}
            className={`${ui.input} mt-1`}
            value={form.role}
            onChange={(e) => campo('role', e.target.value as Role)}
            required
            aria-required="true"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Senha provisória */}
        <div>
          <label htmlFor={`${idBase}-senha`} className={ui.label}>
            Senha provisória <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-senha`}
            type="password"
            className={`${ui.input} mt-1`}
            value={form.senhaProvisoria}
            onChange={(e) => campo('senhaProvisoria', e.target.value)}
            required
            aria-required="true"
            minLength={8}
            autoComplete="new-password"
            aria-describedby={`${idBase}-senha-hint`}
          />
          <p id={`${idBase}-senha-hint`} className="mt-1 text-xs text-fg/60">
            Mínimo de 8 caracteres. O usuário deverá alterá-la no primeiro acesso.
          </p>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Criando…' : 'Criar usuário'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal: Editar usuário
// ---------------------------------------------------------------------------

interface FormEditarState {
  nome: string;
  role: Role;
  ativo: boolean;
}

function ModalEditarUsuario({
  open,
  usuario,
  onClose,
  onSalvo,
}: {
  open: boolean;
  usuario: Usuario | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormEditarState>({
    nome: '',
    role: 'servidor',
    ativo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !usuario) return;
    setErro('');
    setForm({ nome: usuario.nome, role: usuario.role, ativo: usuario.ativo });
  }, [open, usuario]);

  function campo<K extends keyof FormEditarState>(k: K, v: FormEditarState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!usuario) return;
    setSalvando(true);
    setErro('');
    try {
      await adminPatch(`/api/admin/users/${usuario.id}`, form);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar usuário">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Nome */}
        <div>
          <label htmlFor={`${idBase}-nome`} className={ui.label}>
            Nome completo <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-nome`}
            className={`${ui.input} mt-1`}
            value={form.nome}
            onChange={(e) => campo('nome', e.target.value)}
            required
            aria-required="true"
            autoComplete="name"
          />
        </div>

        {/* Papel */}
        <div>
          <label htmlFor={`${idBase}-role`} className={ui.label}>
            Papel <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${idBase}-role`}
            className={`${ui.input} mt-1`}
            value={form.role}
            onChange={(e) => campo('role', e.target.value as Role)}
            required
            aria-required="true"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input
            id={`${idBase}-ativo`}
            type="checkbox"
            className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
            checked={form.ativo}
            onChange={(e) => campo('ativo', e.target.checked)}
          />
          <label htmlFor={`${idBase}-ativo`} className={ui.label}>
            Conta ativa
          </label>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function UsuariosAdminPage() {
  const [pagina, setPagina] = useState<Pagina<Usuario> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [ativo, setAtivo] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Modais
  const [modalNovo, setModalNovo] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<Usuario | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<Usuario>>(
        `/api/admin/users${qs({ q, role, ativo, page, pageSize: PAGE_SIZE })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar usuários.');
    } finally {
      setCarregando(false);
    }
  }, [q, role, ativo, page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  function aplicarFiltros() {
    setPage(1);
    buscar();
  }

  async function desativar(usuario: Usuario) {
    if (
      !window.confirm(
        `Desativar o usuário "${usuario.nome}"? Ele perderá acesso ao painel imediatamente.`,
      )
    )
      return;
    setErro('');
    try {
      await adminDelete(`/api/admin/users/${usuario.id}`);
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao desativar usuário.');
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Usuários e Servidores"
        description="Gerencie os servidores e gestores com acesso ao painel administrativo."
      >
        <button onClick={() => setModalNovo(true)} className={ui.btn}>
          + Novo usuário
        </button>
      </AdminHeader>

      {/* Filtros */}
      <section aria-label="Filtros de busca" className={`${ui.card} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="filtro-q" className={ui.label}>
              Buscar
            </label>
            <input
              id="filtro-q"
              className={`${ui.input} mt-1`}
              placeholder="Nome ou e-mail…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
            />
          </div>
          <div className="min-w-40">
            <label htmlFor="filtro-role" className={ui.label}>
              Papel
            </label>
            <select
              id="filtro-role"
              className={`${ui.input} mt-1`}
              value={role}
              onChange={(e) => { setRole(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-36">
            <label htmlFor="filtro-ativo" className={ui.label}>
              Status
            </label>
            <select
              id="filtro-ativo"
              className={`${ui.input} mt-1`}
              value={ativo}
              onChange={(e) => { setAtivo(e.target.value); setPage(1); }}
            >
              <option value="">Todos</option>
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </div>
          <button onClick={aplicarFiltros} className={ui.btn}>
            Buscar
          </button>
        </div>
      </section>

      {/* Mensagem de erro global */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de usuários"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum usuário encontrado.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Nome</th>
                  <th className={ui.th} scope="col">E-mail</th>
                  <th className={ui.th} scope="col">Papel</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Último login</th>
                  <th className={ui.th} scope="col">MFA</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((u) => (
                  <tr key={u.id}>
                    <td className={ui.td}>
                      <span className="font-semibold">{u.nome}</span>
                    </td>
                    <td className={ui.td}>{u.email}</td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} bg-primary/10 text-primary`}>
                        {rotuloRole(u.role)}
                      </span>
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
                    <td className={ui.td}>
                      <time
                        dateTime={u.ultimoLoginEm ?? undefined}
                        className="text-fg/70"
                      >
                        {formatarData(u.ultimoLoginEm)}
                      </time>
                    </td>
                    <td className={ui.td}>
                      {u.mfaHabilitado ? (
                        <span
                          className={`${ui.badge} bg-success/20 text-success`}
                          title="MFA habilitado"
                        >
                          Ativo
                        </span>
                      ) : (
                        <span
                          className={`${ui.badge} bg-muted text-fg/50`}
                          title="MFA não configurado"
                        >
                          Off
                        </span>
                      )}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUsuarioEditando(u)}
                          className={ui.btnGhost}
                          aria-label={`Editar usuário ${u.nome}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => desativar(u)}
                          disabled={!u.ativo}
                          className={ui.btnDanger}
                          aria-label={
                            u.ativo
                              ? `Desativar usuário ${u.nome}`
                              : `${u.nome} já está inativo`
                          }
                        >
                          Desativar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paginação */}
      {pagina && pagina.total > PAGE_SIZE && (
        <nav
          aria-label="Paginação"
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="text-fg/60">
            Página {page} de {totalPaginas} — {pagina.total} usuário(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={ui.btnGhost}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
              className={ui.btnGhost}
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>
        </nav>
      )}

      {/* Modal novo usuário */}
      <ModalNovoUsuario
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        onSalvo={buscar}
      />

      {/* Modal editar usuário */}
      <ModalEditarUsuario
        open={usuarioEditando !== null}
        usuario={usuarioEditando}
        onClose={() => setUsuarioEditando(null)}
        onSalvo={buscar}
      />
    </main>
  );
}
