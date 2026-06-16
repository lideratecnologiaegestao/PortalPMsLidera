'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PermissaoCatalogo {
  key: string;
  label: string;
}

type CatalogoPermissoes = Record<string, PermissaoCatalogo[]>;

interface GrupoResumo {
  id: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  ativo: boolean;
  _count: { membros: number };
}

interface Membro {
  id: string;
  nome: string;
  email: string;
}

interface GrupoDetalhe extends GrupoResumo {
  membros: Membro[];
}

interface UsuarioBusca {
  id: string;
  nome: string;
  email: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatarNumero(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n);
}

// ---------------------------------------------------------------------------
// Checkbox com suporte a indeterminate
// ---------------------------------------------------------------------------

function CheckboxIndeterminate({
  id,
  checked,
  indeterminate,
  onChange,
  'aria-label': ariaLabel,
  className,
}: {
  id: string;
  checked: boolean;
  indeterminate: boolean;
  onChange: () => void;
  'aria-label'?: string;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      className={className}
      checked={checked}
      onChange={onChange}
      aria-label={ariaLabel}
    />
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: checkboxes de permissões agrupadas por módulo
// ---------------------------------------------------------------------------

function PermissoesCheckboxes({
  catalogo,
  selecionadas,
  onChange,
  idBase,
}: {
  catalogo: CatalogoPermissoes;
  selecionadas: string[];
  onChange: (novas: string[]) => void;
  idBase: string;
}) {
  function togglePermissao(key: string) {
    if (selecionadas.includes(key)) {
      onChange(selecionadas.filter((p) => p !== key));
    } else {
      onChange([...selecionadas, key]);
    }
  }

  function toggleModulo(modulo: string, permissoesModulo: PermissaoCatalogo[]) {
    const keysModulo = permissoesModulo.map((p) => p.key);
    const todasSelecionadas = keysModulo.every((k) => selecionadas.includes(k));
    if (todasSelecionadas) {
      onChange(selecionadas.filter((p) => !keysModulo.includes(p)));
    } else {
      const novasUnicas = keysModulo.filter((k) => !selecionadas.includes(k));
      onChange([...selecionadas, ...novasUnicas]);
    }
  }

  const modulos = Object.entries(catalogo);

  if (modulos.length === 0) {
    return (
      <p className="text-sm text-fg/60 py-2">Nenhuma permissão disponível no catálogo.</p>
    );
  }

  return (
    <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
      {modulos.map(([modulo, permissoes]) => {
        const keysModulo = permissoes.map((p) => p.key);
        const todasSelecionadas = keysModulo.every((k) => selecionadas.includes(k));
        const algumasSelecionadas =
          !todasSelecionadas && keysModulo.some((k) => selecionadas.includes(k));
        const checkboxModuloId = `${idBase}-mod-${modulo}`;
        return (
          <fieldset key={modulo} className="rounded border border-border p-3">
            <legend className="flex items-center gap-2 px-1 text-sm font-semibold">
              <CheckboxIndeterminate
                id={checkboxModuloId}
                className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                checked={todasSelecionadas}
                indeterminate={algumasSelecionadas}
                onChange={() => toggleModulo(modulo, permissoes)}
                aria-label={`Selecionar todas as permissões de ${modulo}`}
              />
              <label htmlFor={checkboxModuloId} className="capitalize cursor-pointer">
                {modulo.replace(/_/g, ' ')}
              </label>
            </legend>
            <div className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {permissoes.map((perm) => {
                const inputId = `${idBase}-perm-${perm.key.replace(/\./g, '-')}`;
                return (
                  <div key={perm.key} className="flex items-center gap-2">
                    <input
                      id={inputId}
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                      checked={selecionadas.includes(perm.key)}
                      onChange={() => togglePermissao(perm.key)}
                    />
                    <label htmlFor={inputId} className="text-sm cursor-pointer">
                      {perm.label}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-componente: Painel de membros (dentro do modal de edição)
// ---------------------------------------------------------------------------

function PainelMembros({
  grupoId,
  membros,
  onAtualizar,
  idBase,
}: {
  grupoId: string;
  membros: Membro[];
  onAtualizar: () => void;
  idBase: string;
}) {
  const [buscaQ, setBuscaQ] = useState('');
  const [resultados, setResultados] = useState<UsuarioBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [adicionando, setAdicionando] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erroMembros, setErroMembros] = useState('');
  const [msgOkMembros, setMsgOkMembros] = useState('');

  const buscarUsuarios = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResultados([]);
      return;
    }
    setBuscando(true);
    try {
      // Reutiliza o mesmo endpoint de usuários da tela de usuários
      type Pg = { items: UsuarioBusca[] };
      const res = await adminGet<Pg>(`/api/admin/users${qs({ q, pageSize: 10 })}`);
      setResultados(res.items ?? []);
    } catch {
      setResultados([]);
    } finally {
      setBuscando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarUsuarios(buscaQ), 350);
    return () => clearTimeout(t);
  }, [buscaQ, buscarUsuarios]);

  async function adicionarMembro(userId: string) {
    setAdicionando(userId);
    setErroMembros('');
    setMsgOkMembros('');
    try {
      await adminPost(`/api/admin/grupos/${grupoId}/membros`, { userId });
      setMsgOkMembros('Membro adicionado com sucesso.');
      setBuscaQ('');
      setResultados([]);
      onAtualizar();
    } catch (err) {
      setErroMembros(err instanceof AdminApiError ? err.message : 'Erro ao adicionar membro.');
    } finally {
      setAdicionando(null);
    }
  }

  async function removerMembro(userId: string, nome: string) {
    if (!window.confirm(`Remover "${nome}" do grupo?`)) return;
    setRemovendo(userId);
    setErroMembros('');
    setMsgOkMembros('');
    try {
      await adminDelete(`/api/admin/grupos/${grupoId}/membros/${userId}`);
      setMsgOkMembros('Membro removido.');
      onAtualizar();
    } catch (err) {
      setErroMembros(err instanceof AdminApiError ? err.message : 'Erro ao remover membro.');
    } finally {
      setRemovendo(null);
    }
  }

  const inputBuscaId = `${idBase}-busca-membro`;

  return (
    <section aria-label="Membros do grupo" className="space-y-3">
      <h3 className="font-semibold text-sm">Membros ({membros.length})</h3>

      {erroMembros && <Aviso tipo="erro">{erroMembros}</Aviso>}
      {msgOkMembros && <Aviso tipo="ok">{msgOkMembros}</Aviso>}

      {/* Lista de membros atuais */}
      {membros.length === 0 ? (
        <p className="text-sm text-fg/60">Nenhum membro neste grupo.</p>
      ) : (
        <ul className="divide-y divide-border rounded border border-border" role="list">
          {membros.map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{m.nome}</span>
                <span className="ml-2 text-fg/60">{m.email}</span>
              </div>
              <button
                type="button"
                className={ui.btnDanger}
                disabled={removendo === m.id}
                onClick={() => removerMembro(m.id, m.nome)}
                aria-label={`Remover ${m.nome} do grupo`}
              >
                {removendo === m.id ? 'Removendo…' : 'Remover'}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Adicionar membro */}
      <div className="space-y-2">
        <label htmlFor={inputBuscaId} className={ui.label}>
          Adicionar membro
        </label>
        <input
          id={inputBuscaId}
          className={`${ui.input} mt-1`}
          placeholder="Busque por nome ou e-mail…"
          value={buscaQ}
          onChange={(e) => setBuscaQ(e.target.value)}
          aria-autocomplete="list"
          aria-controls={`${idBase}-lista-busca`}
        />
        {buscando && (
          <p className="text-xs text-fg/60" role="status">
            Buscando…
          </p>
        )}
        {!buscando && resultados.length > 0 && (
          <ul
            id={`${idBase}-lista-busca`}
            className="rounded border border-border bg-bg shadow-sm"
            role="listbox"
            aria-label="Resultados da busca de usuários"
          >
            {resultados.map((u) => (
              <li key={u.id} role="option" aria-selected="false">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                  disabled={
                    adicionando === u.id ||
                    membros.some((m) => m.id === u.id)
                  }
                  onClick={() => adicionarMembro(u.id)}
                  aria-label={`Adicionar ${u.nome} (${u.email}) ao grupo`}
                >
                  <span>
                    <span className="font-medium">{u.nome}</span>
                    <span className="ml-2 text-fg/60">{u.email}</span>
                  </span>
                  {membros.some((m) => m.id === u.id) ? (
                    <span className={`${ui.badge} bg-muted text-fg/50`}>Já é membro</span>
                  ) : (
                    <span className={`${ui.badge} bg-primary/10 text-primary`}>
                      {adicionando === u.id ? 'Adicionando…' : 'Adicionar'}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!buscando && buscaQ.trim() && resultados.length === 0 && (
          <p className="text-xs text-fg/60" role="status">
            Nenhum usuário encontrado para &quot;{buscaQ}&quot;.
          </p>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Modal: Criar / Editar grupo
// ---------------------------------------------------------------------------

interface FormGrupoState {
  nome: string;
  descricao: string;
  ativo: boolean;
  permissoes: string[];
}

function ModalGrupo({
  open,
  grupo,
  catalogo,
  onClose,
  onSalvo,
}: {
  open: boolean;
  grupo: GrupoDetalhe | null; // null = novo grupo
  catalogo: CatalogoPermissoes;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormGrupoState>({
    nome: '',
    descricao: '',
    ativo: true,
    permissoes: [],
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  // Para recarregar membros após adicionar/remover sem fechar o modal
  const [grupoAtual, setGrupoAtual] = useState<GrupoDetalhe | null>(grupo);

  // Inicializa o formulário ao abrir
  useEffect(() => {
    if (!open) return;
    setErro('');
    setMsgOk('');
    if (grupo) {
      setForm({
        nome: grupo.nome,
        descricao: grupo.descricao ?? '',
        ativo: grupo.ativo,
        permissoes: grupo.permissoes,
      });
      setGrupoAtual(grupo);
    } else {
      setForm({ nome: '', descricao: '', ativo: true, permissoes: [] });
      setGrupoAtual(null);
    }
  }, [open, grupo]);

  function campo<K extends keyof FormGrupoState>(k: K, v: FormGrupoState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function recarregarMembros() {
    if (!grupoAtual) return;
    try {
      const det = await adminGet<GrupoDetalhe>(`/api/admin/grupos/${grupoAtual.id}`);
      setGrupoAtual(det);
    } catch {
      // ignora erro de recarga de membros
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) {
      setErro('O nome do grupo é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      const payload = {
        nome: form.nome.trim(),
        descricao: form.descricao.trim() || undefined,
        ativo: form.ativo,
        permissoes: form.permissoes,
      };
      if (grupo) {
        await adminPut(`/api/admin/grupos/${grupo.id}`, payload);
        setMsgOk('Grupo atualizado com sucesso.');
      } else {
        await adminPost('/api/admin/grupos', payload);
        setMsgOk('Grupo criado com sucesso.');
      }
      onSalvo();
      if (!grupo) onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = grupo ? `Editar grupo: ${grupo.nome}` : 'Novo grupo';

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <div className="space-y-5">
        {/* Formulário principal */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

          {/* Nome */}
          <div>
            <label htmlFor={`${idBase}-nome`} className={ui.label}>
              Nome do grupo <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-nome`}
              className={`${ui.input} mt-1`}
              value={form.nome}
              onChange={(e) => campo('nome', e.target.value)}
              required
              aria-required="true"
              maxLength={100}
            />
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor={`${idBase}-descricao`} className={ui.label}>
              Descrição
            </label>
            <textarea
              id={`${idBase}-descricao`}
              className={`${ui.input} mt-1 min-h-[72px] resize-y`}
              value={form.descricao}
              onChange={(e) => campo('descricao', e.target.value)}
              maxLength={500}
              placeholder="Descreva a finalidade deste grupo…"
            />
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
              Grupo ativo
            </label>
          </div>

          {/* Permissões */}
          <div>
            <p className={`${ui.label} mb-2`}>
              Permissões ({form.permissoes.length} selecionada(s))
            </p>
            <PermissoesCheckboxes
              catalogo={catalogo}
              selecionadas={form.permissoes}
              onChange={(novas) => campo('permissoes', novas)}
              idBase={`${idBase}-perms`}
            />
          </div>

          {/* Ações do formulário */}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Cancelar
            </button>
            <button type="submit" disabled={salvando} className={ui.btn}>
              {salvando
                ? 'Salvando…'
                : grupo
                ? 'Salvar alterações'
                : 'Criar grupo'}
            </button>
          </div>
        </form>

        {/* Seção de membros — só exibida ao editar */}
        {grupo && grupoAtual && (
          <>
            <hr className="border-border" />
            <PainelMembros
              grupoId={grupo.id}
              membros={grupoAtual.membros}
              onAtualizar={recarregarMembros}
              idBase={`${idBase}-membros`}
            />
          </>
        )}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Confirmação de exclusão
// ---------------------------------------------------------------------------

function ModalConfirmarExclusao({
  open,
  grupo,
  onClose,
  onExcluido,
}: {
  open: boolean;
  grupo: GrupoResumo | null;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) setErro('');
  }, [open]);

  async function confirmar() {
    if (!grupo) return;
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/grupos/${grupo.id}`);
      onExcluido();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir grupo.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Excluir grupo">
      <div className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <p className="text-sm">
          Tem certeza que deseja excluir o grupo{' '}
          <strong>&quot;{grupo?.nome}&quot;</strong>? Esta ação não pode ser desfeita.
        </p>
        {grupo && grupo._count.membros > 0 && (
          <Aviso tipo="erro">
            Este grupo possui {formatarNumero(grupo._count.membros)} membro(s). Remova-os antes de excluir.
          </Aviso>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={excluindo || (grupo?._count.membros ?? 0) > 0}
            className={ui.btnDanger}
          >
            {excluindo ? 'Excluindo…' : 'Excluir grupo'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function GruposAdminPage() {
  const [grupos, setGrupos] = useState<GrupoResumo[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoPermissoes>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [grupoEditando, setGrupoEditando] = useState<GrupoDetalhe | null>(null);
  const [grupoExcluindo, setGrupoExcluindo] = useState<GrupoResumo | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [lista, cat] = await Promise.all([
        adminGet<GrupoResumo[]>('/api/admin/grupos'),
        adminGet<CatalogoPermissoes>('/api/admin/grupos/catalogo'),
      ]);
      setGrupos(lista);
      setCatalogo(cat);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar grupos.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirEdicao(grupo: GrupoResumo) {
    setCarregandoDetalhe(true);
    setErro('');
    try {
      const det = await adminGet<GrupoDetalhe>(`/api/admin/grupos/${grupo.id}`);
      setGrupoEditando(det);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar detalhes do grupo.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Grupos e Permissões"
        description="Gerencie grupos de acesso e as permissões concedidas a cada um."
      >
        <button onClick={() => setModalNovoAberto(true)} className={ui.btn}>
          + Novo grupo
        </button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de grupos"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : grupos.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum grupo cadastrado.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Nome</th>
                  <th className={ui.th} scope="col">Descrição</th>
                  <th className={ui.th} scope="col">Permissões</th>
                  <th className={ui.th} scope="col">Membros</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {grupos.map((g) => (
                  <tr key={g.id} className="hover:bg-muted/30 transition-colors">
                    <td className={ui.td}>
                      <span className="font-semibold">{g.nome}</span>
                    </td>
                    <td className={`${ui.td} max-w-[220px]`}>
                      <span className="line-clamp-2 text-fg/70">
                        {g.descricao || '—'}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} bg-primary/10 text-primary`}>
                        {formatarNumero(g.permissoes.length)}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} bg-secondary/10 text-secondary`}>
                        {formatarNumero(g._count.membros)}
                      </span>
                    </td>
                    <td className={ui.td}>
                      {g.ativo ? (
                        <span className={`${ui.badge} bg-success/20 text-success`}>
                          Ativo
                        </span>
                      ) : (
                        <span className={`${ui.badge} bg-muted text-fg/50`}>
                          Inativo
                        </span>
                      )}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEdicao(g)}
                          disabled={carregandoDetalhe}
                          className={ui.btnGhost}
                          aria-label={`Editar grupo ${g.nome}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => setGrupoExcluindo(g)}
                          className={ui.btnDanger}
                          aria-label={`Excluir grupo ${g.nome}`}
                        >
                          Excluir
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

      {/* Modal novo grupo */}
      <ModalGrupo
        open={modalNovoAberto}
        grupo={null}
        catalogo={catalogo}
        onClose={() => setModalNovoAberto(false)}
        onSalvo={carregar}
      />

      {/* Modal editar grupo */}
      <ModalGrupo
        open={grupoEditando !== null}
        grupo={grupoEditando}
        catalogo={catalogo}
        onClose={() => setGrupoEditando(null)}
        onSalvo={carregar}
      />

      {/* Modal confirmar exclusão */}
      <ModalConfirmarExclusao
        open={grupoExcluindo !== null}
        grupo={grupoExcluindo}
        onClose={() => setGrupoExcluindo(null)}
        onExcluido={carregar}
      />
    </main>
  );
}
