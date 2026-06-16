'use client';

/**
 * Página de gestão de menus dinâmicos do portal.
 * Permite criar/editar/excluir itens do cabeçalho e do rodapé.
 *
 * Usa: adminGet, adminPost, adminPut, adminDelete
 * UI:  AdminHeader, Aviso, Modal, ui (tokens — sem cores fixas).
 */

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import { ICON_NAMES } from '../../../components/portal/MenuIcon';
import type { MenuItemAdmin, RotaGrupo } from '../../../lib/portal-types';

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Local = 'cabecalho' | 'rodape';
type TipoItem = 'interno' | 'externo' | 'grupo';

interface FormMenu {
  label: string;
  tipo: TipoItem;
  href: string;
  rotaHref: string;
  icone: string;
  ordem: string;
  ativo: boolean;
  parentId: string;
}

function formVazio(): FormMenu {
  return {
    label: '',
    tipo: 'interno',
    href: '',
    rotaHref: '',
    icone: '',
    ordem: '',
    ativo: true,
    parentId: '',
  };
}

function itemParaForm(item: MenuItemAdmin): FormMenu {
  return {
    label: item.label,
    tipo: item.tipo,
    href: item.href ?? '',
    rotaHref: item.tipo === 'interno' ? (item.href ?? '') : '',
    icone: item.icone ?? '',
    ordem: String(item.ordem),
    ativo: item.ativo,
    parentId: item.parentId ?? '',
  };
}

// ── Badges ────────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<TipoItem, string> = {
  interno: 'Interno',
  externo: 'Externo',
  grupo: 'Grupo',
};

const TIPO_CLS: Record<TipoItem, string> = {
  interno: 'bg-primary/20 text-primary',
  externo: 'bg-warning/30 text-fg',
  grupo: 'bg-muted text-fg/60',
};

// ── Modal criar/editar ─────────────────────────────────────────────────────────

function ModalMenu({
  open,
  editando,
  local,
  itensRaiz,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: MenuItemAdmin | null;
  local: Local;
  itensRaiz: MenuItemAdmin[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormMenu>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [rotas, setRotas] = useState<RotaGrupo[]>([]);
  const [rotasCarregando, setRotasCarregando] = useState(false);
  const [hrefManual, setHrefManual] = useState(false);

  // Carrega rotas disponíveis para itens internos
  useEffect(() => {
    if (!open || form.tipo !== 'interno') return;
    setRotasCarregando(true);
    adminGet<RotaGrupo[]>('/api/admin/menus/rotas')
      .then(setRotas)
      .catch(() => setRotas([]))
      .finally(() => setRotasCarregando(false));
  }, [open, form.tipo]);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setHrefManual(false);
    setForm(editando ? itemParaForm(editando) : formVazio());
  }, [open, editando]);

  function campo<K extends keyof FormMenu>(k: K, v: FormMenu[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function montarHref(): string | null {
    if (form.tipo === 'grupo') return null;
    if (form.tipo === 'externo') return form.href.trim() || null;
    // interno
    if (hrefManual) return form.href.trim() || null;
    return form.rotaHref || null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setErro('O rótulo é obrigatório.');
      return;
    }
    const href = montarHref();
    if (form.tipo === 'externo' && !href) {
      setErro('Informe a URL externa.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      const body = {
        local,
        label: form.label.trim(),
        tipo: form.tipo,
        href,
        icone: form.icone || null,
        ordem: form.ordem ? Number(form.ordem) : undefined,
        ativo: form.ativo,
        parentId: form.parentId || null,
      };
      if (editando && editando.id) {
        await adminPut(`/api/admin/menus/${editando.id}`, body);
      } else {
        await adminPost('/api/admin/menus', body);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = (editando && editando.id) ? 'Editar item de menu' : 'Novo item de menu';

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Rótulo */}
        <div>
          <label htmlFor={`${idBase}-label`} className={ui.label}>
            Rótulo <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-label`}
            className={`${ui.input} mt-1`}
            value={form.label}
            onChange={(e) => campo('label', e.target.value)}
            required
            aria-required="true"
            placeholder="Ex.: Transparência"
          />
        </div>

        {/* Tipo */}
        <div>
          <label htmlFor={`${idBase}-tipo`} className={ui.label}>
            Tipo <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${idBase}-tipo`}
            className={`${ui.input} mt-1`}
            value={form.tipo}
            onChange={(e) => campo('tipo', e.target.value as TipoItem)}
          >
            <option value="interno">Interno (página do portal)</option>
            <option value="externo">Externo (URL externa)</option>
            <option value="grupo">Grupo (só rótulo, sem link)</option>
          </select>
        </div>

        {/* Campos condicionais por tipo */}
        {form.tipo === 'interno' && (
          <div>
            {!hrefManual ? (
              <>
                <label htmlFor={`${idBase}-rota`} className={ui.label}>
                  Rota interna
                </label>
                {rotasCarregando ? (
                  <p className="mt-1 text-sm text-fg/60" role="status">Carregando rotas…</p>
                ) : (
                  <select
                    id={`${idBase}-rota`}
                    className={`${ui.input} mt-1`}
                    value={form.rotaHref}
                    onChange={(e) => campo('rotaHref', e.target.value)}
                  >
                    <option value="">— Selecione uma rota —</option>
                    {rotas.map((g) => (
                      <optgroup key={g.grupo} label={g.grupo}>
                        {g.rotas.map((r) => (
                          <option key={r.href} value={r.href}>
                            {r.label} ({r.href})
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => { setHrefManual(true); campo('href', form.rotaHref); }}
                  className="mt-1 text-xs text-primary underline"
                >
                  Digitar URL manualmente
                </button>
              </>
            ) : (
              <>
                <label htmlFor={`${idBase}-href-manual`} className={ui.label}>
                  URL interna (manual)
                </label>
                <input
                  id={`${idBase}-href-manual`}
                  className={`${ui.input} mt-1`}
                  value={form.href}
                  onChange={(e) => campo('href', e.target.value)}
                  placeholder="/caminho/da/pagina"
                />
                <button
                  type="button"
                  onClick={() => { setHrefManual(false); campo('rotaHref', ''); }}
                  className="mt-1 text-xs text-primary underline"
                >
                  Voltar ao seletor de rotas
                </button>
              </>
            )}
          </div>
        )}

        {form.tipo === 'externo' && (
          <div>
            <label htmlFor={`${idBase}-url`} className={ui.label}>
              URL externa <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-url`}
              className={`${ui.input} mt-1`}
              type="url"
              value={form.href}
              onChange={(e) => campo('href', e.target.value)}
              placeholder="https://..."
              required={form.tipo === 'externo'}
              aria-required={form.tipo === 'externo'}
            />
          </div>
        )}

        {/* parentId */}
        <div>
          <label htmlFor={`${idBase}-parent`} className={ui.label}>
            Posição na hierarquia
          </label>
          <select
            id={`${idBase}-parent`}
            className={`${ui.input} mt-1`}
            value={form.parentId}
            onChange={(e) => campo('parentId', e.target.value)}
          >
            <option value="">Nível superior (raiz)</option>
            {itensRaiz
              .filter((r) => !editando || r.id !== editando.id)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-fg/60">
            Escolha um item raiz para tornar este um filho (sub-item do dropdown).
          </p>
        </div>

        {/* Ícone */}
        <div>
          <label htmlFor={`${idBase}-icone`} className={ui.label}>
            Ícone
          </label>
          <select
            id={`${idBase}-icone`}
            className={`${ui.input} mt-1`}
            value={form.icone}
            onChange={(e) => campo('icone', e.target.value)}
          >
            <option value="">Nenhum</option>
            {ICON_NAMES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        {/* Ordem + Ativo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${idBase}-ordem`} className={ui.label}>
              Ordem
            </label>
            <input
              id={`${idBase}-ordem`}
              type="number"
              min="0"
              className={`${ui.input} mt-1`}
              value={form.ordem}
              onChange={(e) => campo('ordem', e.target.value)}
            />
          </div>
          <div className="flex items-end pb-2">
            <div className="flex items-center gap-2">
              <input
                id={`${idBase}-ativo`}
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                checked={form.ativo}
                onChange={(e) => campo('ativo', e.target.checked)}
              />
              <label htmlFor={`${idBase}-ativo`} className={ui.label}>
                Ativo (visível no portal)
              </label>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : (editando && editando.id) ? 'Salvar' : 'Criar item'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Árvore de itens de uma aba ─────────────────────────────────────────────────

function ItemRow({
  item,
  depth,
  itensRaiz,
  local,
  onEditar,
  onExcluir,
  onAdicionarFilho,
}: {
  item: MenuItemAdmin;
  depth: number;
  itensRaiz: MenuItemAdmin[];
  local: Local;
  onEditar: (item: MenuItemAdmin) => void;
  onExcluir: (item: MenuItemAdmin) => void;
  onAdicionarFilho: (parent: MenuItemAdmin) => void;
}) {
  return (
    <>
      <tr>
        <td className={ui.td}>
          <span
            className="font-medium"
            style={{ paddingLeft: `${depth * 1.5}rem` }}
          >
            {depth > 0 && (
              <span aria-hidden="true" className="mr-1 text-fg/30">└</span>
            )}
            {item.label}
          </span>
        </td>
        <td className={ui.td}>
          <span className={`${ui.badge} ${TIPO_CLS[item.tipo]}`}>
            {TIPO_LABEL[item.tipo]}
          </span>
        </td>
        <td className={`${ui.td} max-w-[200px] truncate`}>
          {item.href ? (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">{item.href}</code>
          ) : (
            <span className="text-fg/40">—</span>
          )}
        </td>
        <td className={ui.td}>
          {item.ativo ? (
            <span className={`${ui.badge} bg-success/20 text-success`}>Ativo</span>
          ) : (
            <span className={`${ui.badge} bg-muted text-fg/50`}>Inativo</span>
          )}
        </td>
        <td className={`${ui.td} whitespace-nowrap`}>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => onEditar(item)}
              className={ui.btnGhost}
              aria-label={`Editar item ${item.label}`}
            >
              Editar
            </button>
            {depth === 0 && (
              <button
                onClick={() => onAdicionarFilho(item)}
                className={ui.btnGhost}
                aria-label={`Adicionar sub-item em ${item.label}`}
              >
                + Filho
              </button>
            )}
            <button
              onClick={() => onExcluir(item)}
              className={ui.btnDanger}
              aria-label={`Excluir item ${item.label}`}
            >
              Excluir
            </button>
          </div>
        </td>
      </tr>
      {/* Filhos recursivos (profundidade 1) */}
      {item.children.map((filho) => (
        <ItemRow
          key={filho.id}
          item={filho as MenuItemAdmin}
          depth={depth + 1}
          itensRaiz={itensRaiz}
          local={local}
          onEditar={onEditar}
          onExcluir={onExcluir}
          onAdicionarFilho={onAdicionarFilho}
        />
      ))}
    </>
  );
}

function AbaMenus({
  local,
}: {
  local: Local;
}) {
  const [itens, setItens] = useState<MenuItemAdmin[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<MenuItemAdmin | null>(null);
  // parentId pré-preenchido ao clicar em "+ Filho"
  const [parentIdPreenchido, setParentIdPreenchido] = useState<string>('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<MenuItemAdmin[]>(`/api/admin/menus?local=${local}`);
      setItens(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar menus.');
    } finally {
      setCarregando(false);
    }
  }, [local]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Itens raiz (parentId nulo) para uso no seletor de parentId do modal
  const itensRaiz = itens.filter((i) => !i.parentId);

  function abrirNovoItem() {
    setEditando(null);
    setParentIdPreenchido('');
    setModalAberto(true);
  }

  function abrirEditar(item: MenuItemAdmin) {
    setEditando(item);
    setParentIdPreenchido('');
    setModalAberto(true);
  }

  function abrirAdicionarFilho(parent: MenuItemAdmin) {
    setEditando(null);
    setParentIdPreenchido(parent.id);
    setModalAberto(true);
  }

  async function excluir(item: MenuItemAdmin) {
    const temFilhos = item.children && item.children.length > 0;
    const msg = temFilhos
      ? `Excluir "${item.label}" e TODOS os seus sub-itens? Ação irreversível.`
      : `Excluir "${item.label}"? Ação irreversível.`;
    if (!window.confirm(msg)) return;
    setErro('');
    setAviso('');
    try {
      await adminDelete(`/api/admin/menus/${item.id}`);
      setAviso('Item excluído com sucesso.');
      carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir item.');
    }
  }

  // Quando o modal é aberto para "adicionar filho", monta um rascunho com
  // parentId já preenchido
  const editandoComParent: MenuItemAdmin | null = editando
    ? editando
    : parentIdPreenchido
    ? ({
        id: '',
        label: '',
        tipo: 'interno',
        href: null,
        icone: null,
        ordem: 0,
        children: [],
        parentId: parentIdPreenchido,
        local,
        ativo: true,
        refTipo: null,
      } as unknown as MenuItemAdmin)
    : null;

  return (
    <section aria-label={`Menus do ${local === 'cabecalho' ? 'cabeçalho' : 'rodapé'}`} className="space-y-4">
      <div className="flex justify-end">
        <button onClick={abrirNovoItem} className={ui.btn}>
          + Novo item
        </button>
      </div>

      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : itens.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum item configurado. Clique em &ldquo;+ Novo item&rdquo; para começar.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Rótulo</th>
                  <th className={ui.th} scope="col">Tipo</th>
                  <th className={ui.th} scope="col">Href</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {itensRaiz.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    depth={0}
                    itensRaiz={itensRaiz}
                    local={local}
                    onEditar={abrirEditar}
                    onExcluir={excluir}
                    onAdicionarFilho={abrirAdicionarFilho}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ModalMenu
        open={modalAberto}
        editando={editandoComParent}
        local={local}
        itensRaiz={itensRaiz}
        onClose={() => { setModalAberto(false); setEditando(null); setParentIdPreenchido(''); }}
        onSalvo={() => { carregar(); setAviso('Item salvo com sucesso.'); }}
      />
    </section>
  );
}

// ── Página principal ───────────────────────────────────────────────────────────

const ABAS: { id: Local; label: string }[] = [
  { id: 'cabecalho', label: 'Cabeçalho' },
  { id: 'rodape', label: 'Rodapé' },
];

export default function MenusAdminPage() {
  const [abaAtiva, setAbaAtiva] = useState<Local>('cabecalho');

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Menus do portal"
        description="Configure os itens de navegação exibidos no cabeçalho e no rodapé do portal público."
      />

      {/* Abas */}
      <div
        role="tablist"
        aria-label="Localização do menu"
        className="flex gap-1 border-b border-border"
      >
        {ABAS.map((aba) => (
          <button
            key={aba.id}
            role="tab"
            id={`tab-${aba.id}`}
            aria-selected={abaAtiva === aba.id}
            aria-controls={`painel-${aba.id}`}
            onClick={() => setAbaAtiva(aba.id)}
            className={[
              'px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded-t',
              abaAtiva === aba.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-fg/60 hover:text-fg',
            ].join(' ')}
          >
            {aba.label}
          </button>
        ))}
      </div>

      {ABAS.map((aba) => (
        <div
          key={aba.id}
          role="tabpanel"
          id={`painel-${aba.id}`}
          aria-labelledby={`tab-${aba.id}`}
          hidden={abaAtiva !== aba.id}
        >
          {abaAtiva === aba.id && <AbaMenus local={aba.id} />}
        </div>
      ))}
    </main>
  );
}
