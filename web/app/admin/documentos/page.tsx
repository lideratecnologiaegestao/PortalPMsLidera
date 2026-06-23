'use client';

import { Fragment, useCallback, useEffect, useId, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, qs, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import { useSessaoAdmin } from '../../../lib/session-context';
import { escopoRestrito } from '../../../lib/roles';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface Grupo { id: string; nome: string }

interface Cadastro {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  visibilidade: 'publico' | 'restrito';
  grupoIds: string[];
  _count: { documentos: number; tipos: number };
}

interface TipoAdmin {
  id: string;
  nome: string;
  slug: string;
  codigo: string | null;
  ordem: number;
  ativo: boolean;
  parentId: string | null;
}

interface TipoNo extends TipoAdmin {
  filhos: TipoNo[];
}

interface DocRow {
  id: string;
  numero: string | null;
  ano: number | null;
  titulo: string;
  situacao: string | null;
  downloads: number;
  ativo: boolean;
  arquivoUrl: string | null;
  tipo: { id: string; nome: string } | null;
}

interface Pag<T> { total: number; page: number; pageSize: number; items: T[] }

// ---------------------------------------------------------------------------
// Helpers de árvore
// ---------------------------------------------------------------------------

/** Constrói árvore a partir de lista plana usando parentId. */
function buildTree(tipos: TipoAdmin[]): TipoNo[] {
  const mapa = new Map<string, TipoNo>();
  tipos.forEach((t) => mapa.set(t.id, { ...t, filhos: [] }));
  const raizes: TipoNo[] = [];
  mapa.forEach((no) => {
    if (no.parentId && mapa.has(no.parentId)) {
      mapa.get(no.parentId)!.filhos.push(no);
    } else {
      raizes.push(no);
    }
  });
  // ordena por campo `ordem`
  function ordenar(nos: TipoNo[]) {
    nos.sort((a, b) => a.ordem - b.ordem);
    nos.forEach((n) => ordenar(n.filhos));
  }
  ordenar(raizes);
  return raizes;
}

/** Achata a árvore em lista plana com nível de profundidade. */
function flatTree(nos: TipoNo[], nivel = 0): Array<TipoAdmin & { nivel: number }> {
  return nos.flatMap((n) => [{ ...n, nivel }, ...flatTree(n.filhos, nivel + 1)]);
}

// ---------------------------------------------------------------------------
// Componente multi-select de grupos (checkbox list)
// ---------------------------------------------------------------------------

function GruposMultiSelect({
  grupos,
  selecionados,
  onChange,
  idBase,
}: {
  grupos: Grupo[];
  selecionados: string[];
  onChange: (ids: string[]) => void;
  idBase: string;
}) {
  function toggle(id: string) {
    if (selecionados.includes(id)) {
      onChange(selecionados.filter((x) => x !== id));
    } else {
      onChange([...selecionados, id]);
    }
  }

  if (grupos.length === 0) {
    return <p className="text-xs text-fg/60">Nenhum grupo disponível.</p>;
  }

  return (
    <fieldset className="max-h-40 overflow-y-auto rounded border border-border p-2 space-y-1">
      <legend className="sr-only">Grupos com acesso</legend>
      {grupos.map((g) => {
        const inputId = `${idBase}-grupo-${g.id}`;
        return (
          <div key={g.id} className="flex items-center gap-2">
            <input
              id={inputId}
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
              checked={selecionados.includes(g.id)}
              onChange={() => toggle(g.id)}
            />
            <label htmlFor={inputId} className="text-sm cursor-pointer select-none">
              {g.nome}
            </label>
          </div>
        );
      })}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Modal de Cadastro (criar/editar)
// ---------------------------------------------------------------------------

const vazioFormCad = { nome: '', slug: '', descricao: '', visibilidade: 'publico' as 'publico' | 'restrito', grupoIds: [] as string[] };

function ModalCadastro({
  open,
  cadastro,
  grupos,
  onClose,
  onSalvo,
}: {
  open: boolean;
  cadastro: Cadastro | null;
  grupos: Grupo[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState({ ...vazioFormCad });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    if (cadastro) {
      setForm({
        nome: cadastro.nome,
        slug: cadastro.slug,
        descricao: '',
        visibilidade: cadastro.visibilidade ?? 'publico',
        grupoIds: cadastro.grupoIds ?? [],
      });
    } else {
      setForm({ ...vazioFormCad });
    }
  }, [open, cadastro]);

  function campo<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome do cadastro.'); return; }
    setSalvando(true); setErro('');
    const body: Record<string, unknown> = {
      nome: form.nome.trim(),
      visibilidade: form.visibilidade,
      grupoIds: form.visibilidade === 'restrito' ? form.grupoIds : [],
    };
    if (!cadastro) body.slug = form.slug.trim() || undefined;
    try {
      if (cadastro) {
        await adminPut(`/api/admin/documentos/cadastros/${cadastro.id}`, body);
      } else {
        await adminPost('/api/admin/documentos/cadastros', body);
      }
      onSalvo();
      onClose();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar cadastro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={cadastro ? `Editar cadastro: ${cadastro.nome}` : 'Novo cadastro'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor={`${idBase}-nome`} className={ui.label}>Nome *</label>
          <input
            id={`${idBase}-nome`}
            className={`${ui.input} mt-1`}
            value={form.nome}
            onChange={(e) => campo('nome', e.target.value)}
            required
            aria-required="true"
          />
        </div>

        {!cadastro && (
          <div>
            <label htmlFor={`${idBase}-slug`} className={ui.label}>Slug (URL)</label>
            <input
              id={`${idBase}-slug`}
              className={`${ui.input} mt-1`}
              value={form.slug}
              onChange={(e) => campo('slug', e.target.value)}
              placeholder="gerado automaticamente se vazio"
            />
          </div>
        )}

        {/* Visibilidade */}
        <fieldset>
          <legend className={`${ui.label} mb-2`}>Visibilidade</legend>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name={`${idBase}-vis`}
                value="publico"
                checked={form.visibilidade === 'publico'}
                onChange={() => campo('visibilidade', 'publico')}
                className="accent-primary focus:ring-2 focus:ring-primary"
              />
              Público
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name={`${idBase}-vis`}
                value="restrito"
                checked={form.visibilidade === 'restrito'}
                onChange={() => campo('visibilidade', 'restrito')}
                className="accent-primary focus:ring-2 focus:ring-primary"
              />
              Restrito
            </label>
          </div>
        </fieldset>

        {/* Grupos — só quando Restrito */}
        {form.visibilidade === 'restrito' && (
          <div>
            <p className={`${ui.label} mb-1`}>
              Grupos com acesso{' '}
              <span className="font-normal text-fg/60">
                ({form.grupoIds.length} selecionado{form.grupoIds.length !== 1 ? 's' : ''})
              </span>
            </p>
            <GruposMultiSelect
              grupos={grupos}
              selecionados={form.grupoIds}
              onChange={(ids) => campo('grupoIds', ids)}
              idBase={idBase}
            />
            <p className="mt-1 text-xs text-fg/60">
              Cadastro restrito não aparece no portal público; só usuários dos grupos
              selecionados (e administradores) têm acesso.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" className={ui.btn} disabled={salvando}>
            {salvando ? 'Salvando…' : cadastro ? 'Salvar alterações' : 'Criar cadastro'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Linha de tipo na árvore
// ---------------------------------------------------------------------------

function LinhasTipoArvore({
  nos,
  nivel,
  onEditar,
  onExcluir,
}: {
  nos: TipoNo[];
  nivel: number;
  onEditar: (t: TipoAdmin) => void;
  onExcluir: (t: TipoAdmin) => void;
}) {
  return (
    <>
      {nos.map((no) => (
        <Fragment key={no.id}>
          <tr>
            <td className={ui.td} style={{ paddingLeft: `${0.5 + nivel * 1.25}rem` }}>
              {nivel > 0 && (
                <span aria-hidden="true" className="mr-1 text-fg/30">&#x2514;</span>
              )}
              <span className={nivel === 0 ? 'font-semibold' : ''}>{no.nome}</span>
              {no.codigo && <span className="ml-2 text-xs text-fg/50">[{no.codigo}]</span>}
              {!no.ativo && <span className="ml-2 text-xs text-fg/40">(inativo)</span>}
            </td>
            <td className={ui.td}>{no.slug}</td>
            <td className={ui.td}>{no.ordem}</td>
            <td className={ui.td}>
              <div className="flex gap-2">
                <button className={ui.btnGhost} onClick={() => onEditar(no)}>Editar</button>
                <button className={ui.btnDanger} onClick={() => onExcluir(no)}>Excluir</button>
              </div>
            </td>
          </tr>
          {no.filhos.length > 0 && (
            <LinhasTipoArvore
              nos={no.filhos}
              nivel={nivel + 1}
              onEditar={onEditar}
              onExcluir={onExcluir}
            />
          )}
        </Fragment>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Constante de form vazio de documento
// ---------------------------------------------------------------------------

const vaziodoc = {
  tipoId: '', numero: '', ano: '', dataDocumento: '', titulo: '',
  ementa: '', situacao: '', arquivoUrl: '', secretariaId: '',
};

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function DocumentosAdminPage() {
  const { role } = useSessaoAdmin();
  const [cadastros, setCadastros] = useState<Cadastro[]>([]);
  const [cadSel, setCadSel] = useState<string>('');
  const [tipos, setTipos] = useState<TipoAdmin[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [pagina, setPagina] = useState<Pag<DocRow> | null>(null);
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'documentos' | 'tipos'>('documentos');

  // Modal documento
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vaziodoc });
  const [secretarias, setSecretarias] = useState<{ id: string; nome: string }[]>([]);
  const [arquivoNome, setArquivoNome] = useState('');
  const [picker, setPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Modal cadastro
  const [modalCad, setModalCad] = useState(false);
  const [cadEditando, setCadEditando] = useState<Cadastro | null>(null);

  // Modal tipo
  const [modalTipo, setModalTipo] = useState(false);
  const [tipoEditando, setTipoEditando] = useState<TipoAdmin | null>(null);
  // Para novo tipo, guarda o cadastroId alvo
  // Carrega dados iniciais
  useEffect(() => {
    adminGet<any>('/api/admin/secretarias?pageSize=200')
      .then((r) => setSecretarias(r.items ?? r))
      .catch(() => setSecretarias([]));
    adminGet<Grupo[]>('/api/admin/grupos')
      .then(setGrupos)
      .catch(() => setGrupos([]));
  }, []);

  // Carrega cadastros
  const carregarCadastros = useCallback(async () => {
    try {
      const cs = await adminGet<Cadastro[]>('/api/admin/documentos/cadastros');
      setCadastros(cs);
      if (cs.length > 0 && !cadSel) setCadSel(cs[0].id);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar cadastros.');
    }
  }, [cadSel]);

  useEffect(() => { carregarCadastros(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Carrega tipos do cadastro selecionado
  const carregarTipos = useCallback(async () => {
    if (!cadSel) return;
    try {
      const ts = await adminGet<TipoAdmin[]>(`/api/admin/documentos/cadastros/${cadSel}/tipos`);
      setTipos(ts);
    } catch {
      setTipos([]);
    }
  }, [cadSel]);

  useEffect(() => { carregarTipos(); }, [carregarTipos]);

  // Carrega documentos
  const carregar = useCallback(async (pg: number) => {
    if (!cadSel) return;
    setErro('');
    try {
      const data = await adminGet<Pag<DocRow>>(
        `/api/admin/documentos${qs({ cadastroId: cadSel, q: busca, page: pg, pageSize: 20 })}`
      );
      setPagina(data); setPage(pg);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar documentos.');
    }
  }, [cadSel, busca]);

  useEffect(() => { if (aba === 'documentos') carregar(1); }, [carregar, aba]);

  // ----- CRUD de documentos -----

  function abrirNovo() {
    setEditId(null); setForm({ ...vaziodoc }); setArquivoNome(''); setModal(true);
  }

  async function abrirEdicao(id: string) {
    setErro('');
    try {
      const d = await adminGet<any>(`/api/admin/documentos/${id}`);
      setEditId(id);
      setForm({
        tipoId: d.tipoId ?? '', numero: d.numero ?? '',
        ano: d.ano ? String(d.ano) : '',
        dataDocumento: d.dataDocumento ? String(d.dataDocumento).slice(0, 10) : '',
        titulo: d.titulo ?? '', ementa: d.ementa ?? '',
        situacao: d.situacao ?? '', arquivoUrl: d.arquivoUrl ?? '',
        secretariaId: d.secretariaId ?? '',
      });
      setArquivoNome(d.arquivoUrl ? 'arquivo selecionado' : '');
      setModal(true);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir documento.');
    }
  }

  async function salvar() {
    if (!form.titulo.trim()) { setErro('Informe o título.'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      cadastroId: cadSel,
      tipoId: form.tipoId || null,
      numero: form.numero || undefined,
      ano: form.ano ? Number(form.ano) : undefined,
      dataDocumento: form.dataDocumento || undefined,
      titulo: form.titulo.trim(),
      ementa: form.ementa || undefined,
      situacao: form.situacao || undefined,
      arquivoUrl: form.arquivoUrl || undefined,
      secretariaId: form.secretariaId || null,
    };
    try {
      if (editId) await adminPut(`/api/admin/documentos/${editId}`, body);
      else await adminPost('/api/admin/documentos', body);
      setModal(false);
      await carregar(editId ? page : 1);
      carregarCadastros();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este documento?')) return;
    try { await adminDelete(`/api/admin/documentos/${id}`); await carregar(page); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  // ----- CRUD de tipos -----

  function abrirNovoTipo() {
    setTipoEditando(null); setModalTipo(true);
  }

  async function excluirTipo(t: TipoAdmin) {
    if (!confirm(`Excluir o tipo "${t.nome}"? Documentos vinculados perderão o tipo.`)) return;
    try {
      await adminDelete(`/api/admin/documentos/tipos/${t.id}`);
      await carregarTipos();
      await carregarCadastros();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir tipo.');
    }
  }

  // ----- ModalTipo salva (editar via adminPut já no próprio modal) -----

  // ----- Derivados -----

  const totalPaginas = pagina ? Math.max(1, Math.ceil(pagina.total / pagina.pageSize)) : 1;
  const cadAtual = cadastros.find((c) => c.id === cadSel);
  const arvore = buildTree(tipos);

  // Tipos em lista plana com nível (para o seletor do formulário de documento)
  const tiposFlat = flatTree(arvore);

  return (
    <div>
      <AdminHeader
        title="Cadastro de Documentos"
        description="Leis, decretos, portarias, alvarás e documentos diversos — com contador de downloads."
      >
        <button
          className={ui.btnGhost}
          onClick={() => { setCadEditando(null); setModalCad(true); }}
        >
          + Novo cadastro
        </button>
        {cadSel && (
          <button className={ui.btn} onClick={abrirNovo}>Novo documento</button>
        )}
      </AdminHeader>

      {/* Abas de cadastro */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Cadastros de documentos">
        {cadastros.map((c) => (
          <button
            key={c.id}
            role="tab"
            aria-selected={c.id === cadSel}
            onClick={() => { setCadSel(c.id); setAba('documentos'); }}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-semibold ${
              c.id === cadSel
                ? 'bg-primary text-primary-fg'
                : 'border border-border hover:bg-muted'
            }`}
          >
            {c.nome}
            {c.visibilidade === 'restrito' && (
              <span
                className={`${ui.badge} ${c.id === cadSel ? 'bg-white/20 text-primary-fg' : 'bg-warning/20 text-warning'}`}
                title="Cadastro restrito — não aparece no portal público"
              >
                Restrito
              </span>
            )}
            <span className="opacity-70">({c._count.documentos})</span>
            {cadSel === c.id && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCadEditando(c); setModalCad(true); }}
                className="ml-1 rounded px-1 text-xs opacity-70 hover:opacity-100 underline"
                aria-label={`Editar cadastro ${c.nome}`}
              >
                editar
              </button>
            )}
          </button>
        ))}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Aviso de escopo restrito (gestor / servidor) */}
      {escopoRestrito(role) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="mt-0.5 shrink-0 text-primary">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <span>Você gerencia apenas o conteúdo da sua secretaria.</span>
        </div>
      )}

      {/* Sub-abas: Documentos | Tipos */}
      {cadSel && (
        <div className="mb-4 flex gap-1 border-b border-border">
          <button
            role="tab"
            aria-selected={aba === 'documentos'}
            onClick={() => setAba('documentos')}
            className={`px-4 py-2 text-sm font-semibold ${aba === 'documentos' ? 'border-b-2 border-primary text-primary' : 'text-fg/60 hover:text-fg'}`}
          >
            Documentos ({cadAtual?._count.documentos ?? 0})
          </button>
          <button
            role="tab"
            aria-selected={aba === 'tipos'}
            onClick={() => setAba('tipos')}
            className={`px-4 py-2 text-sm font-semibold ${aba === 'tipos' ? 'border-b-2 border-primary text-primary' : 'text-fg/60 hover:text-fg'}`}
          >
            Tipos ({cadAtual?._count.tipos ?? 0})
          </button>
        </div>
      )}

      {/* ===== ABA DOCUMENTOS ===== */}
      {aba === 'documentos' && (
        <>
          <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setBusca(q); }}>
            <input
              className={ui.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título ou número…"
              aria-label="Buscar documentos"
            />
            <button className={ui.btnGhost} type="submit">Buscar</button>
          </form>

          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={ui.th}>Documento</th>
                  <th className={ui.th}>Tipo</th>
                  <th className={ui.th}>Nº / Ano</th>
                  <th className={ui.th}>Downloads</th>
                  <th className={ui.th}>Arquivo</th>
                  <th className={ui.th}><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {pagina?.items.map((d) => (
                  <tr key={d.id}>
                    <td className={ui.td}>
                      <button
                        className="text-left font-semibold text-primary hover:underline"
                        onClick={() => abrirEdicao(d.id)}
                      >
                        {d.titulo}
                      </button>
                      {!d.ativo && <span className="ml-2 text-xs text-fg/50">(inativo)</span>}
                    </td>
                    <td className={ui.td}>{d.tipo?.nome ?? '—'}</td>
                    <td className={ui.td}>{d.numero ?? '—'}{d.ano ? `/${d.ano}` : ''}</td>
                    <td className={ui.td}>
                      <span className="font-semibold tabular-nums">
                        <span aria-hidden>⬇</span>{' '}
                        <span aria-label={`${d.downloads} downloads`}>{d.downloads}</span>
                      </span>
                    </td>
                    <td className={ui.td}>
                      {d.arquivoUrl
                        ? <span className="text-success" aria-label="Arquivo disponível">✓</span>
                        : <span className="text-fg/40" aria-label="Sem arquivo">—</span>}
                    </td>
                    <td className={ui.td}>
                      <div className="flex gap-2">
                        <button className={ui.btnGhost} onClick={() => abrirEdicao(d.id)}>Editar</button>
                        <button className={ui.btnDanger} onClick={() => excluir(d.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {pagina && pagina.items.length === 0 && (
                  <tr>
                    <td className={ui.td} colSpan={6}>Nenhum documento neste cadastro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {pagina && pagina.total > 0 && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-fg/70">
                {pagina.total} documento(s) · página {page} de {totalPaginas}
              </span>
              <div className="flex gap-2">
                <button className={ui.btnGhost} disabled={page <= 1} onClick={() => carregar(page - 1)}>Anterior</button>
                <button className={ui.btnGhost} disabled={page >= totalPaginas} onClick={() => carregar(page + 1)}>Próxima</button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== ABA TIPOS ===== */}
      {aba === 'tipos' && (
        <>
          <div className="mb-3 flex justify-end">
            <button className={ui.btn} onClick={abrirNovoTipo}>+ Novo tipo</button>
          </div>

          {tipos.length === 0 ? (
            <p className="rounded border border-border p-6 text-center text-sm text-fg/60">
              Nenhum tipo cadastrado. Crie o primeiro tipo para organizar os documentos.
            </p>
          ) : (
            <div className={`${ui.card} overflow-x-auto`}>
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className={ui.th}>Nome</th>
                    <th className={ui.th}>Slug</th>
                    <th className={ui.th}>Ordem</th>
                    <th className={ui.th}><span className="sr-only">Ações</span></th>
                  </tr>
                </thead>
                <tbody>
                  <LinhasTipoArvore
                    nos={arvore}
                    nivel={0}
                    onEditar={(t) => { setTipoEditando(t); setModalTipo(true); }}
                    onExcluir={excluirTipo}
                  />
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal de documento */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={editId ? 'Editar documento' : `Novo documento — ${cadAtual?.nome ?? ''}`}
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>Tipo</label>
              <select
                className={ui.input}
                value={form.tipoId}
                onChange={(e) => setForm({ ...form, tipoId: e.target.value })}
              >
                <option value="">— selecione —</option>
                {tiposFlat.map((t) => (
                  <option key={t.id} value={t.id}>
                    {' '.repeat(t.nivel * 3)}{t.nivel > 0 ? '└ ' : ''}{t.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={ui.label}>Situação</label>
              <input
                className={ui.input}
                value={form.situacao}
                onChange={(e) => setForm({ ...form, situacao: e.target.value })}
                placeholder="vigente / revogada…"
              />
            </div>
            <div>
              <label className={ui.label}>Número</label>
              <input
                className={ui.input}
                value={form.numero}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={ui.label}>Ano</label>
                <input
                  className={ui.input}
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm({ ...form, ano: e.target.value })}
                />
              </div>
              <div>
                <label className={ui.label}>Data</label>
                <input
                  className={ui.input}
                  type="date"
                  value={form.dataDocumento}
                  onChange={(e) => setForm({ ...form, dataDocumento: e.target.value })}
                />
              </div>
            </div>
          </div>
          <div>
            <label className={ui.label}>Título *</label>
            <input
              className={ui.input}
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
            />
          </div>
          <div>
            <label className={ui.label}>Ementa</label>
            <textarea
              className={ui.input}
              rows={3}
              value={form.ementa}
              onChange={(e) => setForm({ ...form, ementa: e.target.value })}
            />
          </div>
          {escopoRestrito(role) ? (
            /* Gestor/servidor: secretaria definida pela lotação — somente-leitura */
            <div>
              <p className={ui.label} id="doc-secretaria-lbl">Secretaria</p>
              <p
                aria-labelledby="doc-secretaria-lbl"
                className="mt-1 rounded border border-border bg-muted px-3 py-2 text-sm text-fg/70"
              >
                {secretarias.find((s) => s.id === form.secretariaId)?.nome ?? 'Definida pela sua lotação'}
              </p>
              <p className="mt-1 text-xs text-fg/60">
                A secretaria é definida automaticamente pela sua lotação e não pode ser alterada aqui.
              </p>
            </div>
          ) : (
            <div>
              <label className={ui.label}>Secretaria (opcional)</label>
              <select
                className={ui.input}
                value={form.secretariaId}
                onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}
              >
                <option value="">— nenhuma —</option>
                {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
              <p className="mt-1 text-xs text-fg/60">
                Se vinculado, o documento aparece também na página da secretaria.
              </p>
            </div>
          )}
          <div>
            <label className={ui.label}>Arquivo (PDF da biblioteca de mídia)</label>
            <div className="flex items-center gap-2">
              <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>
                Selecionar arquivo…
              </button>
              <span className="text-sm text-fg/70">
                {form.arquivoUrl ? (arquivoNome || 'arquivo selecionado') : 'nenhum'}
              </span>
              {form.arquivoUrl && (
                <button
                  type="button"
                  className="text-sm text-danger hover:underline"
                  onClick={() => { setForm({ ...form, arquivoUrl: '' }); setArquivoNome(''); }}
                >
                  remover
                </button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Cancelar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal de cadastro */}
      <ModalCadastro
        open={modalCad}
        cadastro={cadEditando}
        grupos={grupos}
        onClose={() => setModalCad(false)}
        onSalvo={() => {
          carregarCadastros();
        }}
      />

      {/* Modal de tipo */}
      <ModalTipoWrapper
        open={modalTipo}
        tipo={tipoEditando}
        tiposDisponiveis={tipos}
        cadSel={cadSel}
        onClose={() => setModalTipo(false)}
        onSalvo={() => { carregarTipos(); carregarCadastros(); }}
      />

      {picker && (
        <MediaPicker
          open
          tipo="documento"
          onClose={() => setPicker(false)}
          onSelect={(a) => {
            setForm((f) => ({ ...f, arquivoUrl: a.urlPublica ?? '' }));
            setArquivoNome(a.nomeOriginal);
            setPicker(false);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Wrapper de ModalTipo que distingue criar x editar
// ---------------------------------------------------------------------------

function ModalTipoWrapper({
  open,
  tipo,
  tiposDisponiveis,
  cadSel,
  onClose,
  onSalvo,
}: {
  open: boolean;
  tipo: TipoAdmin | null;
  tiposDisponiveis: TipoAdmin[];
  cadSel: string;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState({ nome: '', codigo: '', parentId: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    if (tipo) {
      setForm({ nome: tipo.nome, codigo: tipo.codigo ?? '', parentId: tipo.parentId ?? '' });
    } else {
      setForm({ nome: '', codigo: '', parentId: '' });
    }
  }, [open, tipo]);

  function campo(k: keyof typeof form, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome.trim()) { setErro('Informe o nome do tipo.'); return; }
    setSalvando(true); setErro('');
    const body: Record<string, unknown> = {
      nome: form.nome.trim(),
      codigo: form.codigo.trim() || undefined,
      parentId: form.parentId || null,
    };
    try {
      if (tipo) {
        await adminPut(`/api/admin/documentos/tipos/${tipo.id}`, body);
      } else {
        await adminPost(`/api/admin/documentos/cadastros/${cadSel}/tipos`, body);
      }
      onSalvo();
      onClose();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar tipo.');
    } finally {
      setSalvando(false);
    }
  }

  // Tipos elegíveis como pai: todos exceto o próprio (ao editar)
  const elegiveis = tiposDisponiveis.filter((t) => !tipo || t.id !== tipo.id);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tipo ? `Editar tipo: ${tipo.nome}` : 'Novo tipo'}
    >
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor={`${idBase}-nome`} className={ui.label}>Nome *</label>
          <input
            id={`${idBase}-nome`}
            className={`${ui.input} mt-1`}
            value={form.nome}
            onChange={(e) => campo('nome', e.target.value)}
            required
            aria-required="true"
          />
        </div>

        <div>
          <label htmlFor={`${idBase}-codigo`} className={ui.label}>
            Código (TCE-MT / externo)
          </label>
          <input
            id={`${idBase}-codigo`}
            className={`${ui.input} mt-1`}
            value={form.codigo}
            onChange={(e) => campo('codigo', e.target.value)}
            placeholder="opcional"
          />
        </div>

        <div>
          <label htmlFor={`${idBase}-pai`} className={ui.label}>
            Tipo pai (hierarquia)
          </label>
          <select
            id={`${idBase}-pai`}
            className={`${ui.input} mt-1`}
            value={form.parentId}
            onChange={(e) => campo('parentId', e.target.value)}
          >
            <option value="">— nenhum (raiz) —</option>
            {elegiveis.map((t) => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-fg/60">
            Deixe em branco para criar um tipo de primeiro nível.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose}>Cancelar</button>
          <button type="submit" className={ui.btn} disabled={salvando}>
            {salvando ? 'Salvando…' : tipo ? 'Salvar alterações' : 'Criar tipo'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
