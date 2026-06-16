'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface CampoExtra { key: string; label: string; tipo: 'bool' | 'text' }
interface TaxConfig {
  id: string;
  grupo: string;
  nome: string;
  list: string;
  create: string;
  item: (id: string) => string;
  campos: CampoExtra[];
}
interface Item { id: string; nome: string; ativo: boolean; [k: string]: unknown }

const CAMPOS_MOD: CampoExtra[] = [
  { key: 'lei8666', label: 'Lei 8.666', tipo: 'bool' },
  { key: 'lei14133', label: 'Lei 14.133', tipo: 'bool' },
];

export default function TiposAdminPage() {
  const [configs, setConfigs] = useState<TaxConfig[]>([]);
  const [sel, setSel] = useState<string>('');
  const [itens, setItens] = useState<Item[]>([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  // form (novo/editar)
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({ nome: '' });
  const [salvando, setSalvando] = useState(false);

  // monta a lista de taxonomias (cadastros de documentos são dinâmicos)
  useEffect(() => {
    (async () => {
      const base: TaxConfig[] = [];
      try {
        const cads = await adminGet<{ id: string; nome: string }[]>('/api/admin/documentos/cadastros');
        for (const c of cads) {
          base.push({
            id: `doc-${c.id}`, grupo: 'Documentos', nome: c.nome, campos: [],
            list: `/api/admin/documentos/cadastros/${c.id}/tipos`,
            create: `/api/admin/documentos/cadastros/${c.id}/tipos`,
            item: (id) => `/api/admin/documentos/tipos/${id}`,
          });
        }
      } catch { /* segue com os fixos */ }
      base.push(
        { id: 'lic-mod', grupo: 'Licitações', nome: 'Modalidades', campos: CAMPOS_MOD, list: '/api/admin/licitacoes/modalidades/todas', create: '/api/admin/licitacoes/modalidades', item: (id) => `/api/admin/licitacoes/modalidades/${id}` },
        { id: 'lic-cri', grupo: 'Licitações', nome: 'Critérios de julgamento', campos: [], list: '/api/admin/licitacoes/criterios/todas', create: '/api/admin/licitacoes/criterios', item: (id) => `/api/admin/licitacoes/criterios/${id}` },
        { id: 'con-tipo', grupo: 'Conselhos', nome: 'Tipos de conselho', campos: [{ key: 'obrigatorio', label: 'Obrigatório', tipo: 'bool' }], list: '/api/admin/conselhos/tipos/todas', create: '/api/admin/conselhos/tipos', item: (id) => `/api/admin/conselhos/tipos/${id}` },
        { id: 'conc-tipo', grupo: 'Concursos', nome: 'Tipos de certame', campos: [], list: '/api/admin/concursos/tipos/todas', create: '/api/admin/concursos/tipos', item: (id) => `/api/admin/concursos/tipos/${id}` },
        { id: 'conc-doc', grupo: 'Concursos', nome: 'Tipos de documento', campos: [{ key: 'situacao', label: 'Fase/Situação', tipo: 'text' }, { key: 'obrigatorio', label: 'Publicação obrigatória', tipo: 'bool' }], list: '/api/admin/concursos/doc-tipos/todas', create: '/api/admin/concursos/doc-tipos', item: (id) => `/api/admin/concursos/doc-tipos/${id}` },
      );
      setConfigs(base);
      if (base[0]) setSel(base[0].id);
    })();
  }, []);

  const cfg = configs.find((c) => c.id === sel);

  const carregar = useCallback(async () => {
    if (!cfg) return;
    setCarregando(true); setErro('');
    try { setItens(await adminGet<Item[]>(cfg.list)); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); setItens([]); }
    finally { setCarregando(false); }
  }, [cfg]);
  useEffect(() => { setEditId(null); setForm({ nome: '' }); carregar(); }, [carregar]);

  function editar(it: Item) {
    const f: Record<string, unknown> = { nome: it.nome };
    cfg?.campos.forEach((c) => { f[c.key] = it[c.key]; });
    setForm(f); setEditId(it.id);
  }
  async function salvar() {
    if (!cfg || !String(form.nome ?? '').trim()) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro('');
    try {
      if (editId) await adminPut(cfg.item(editId), form);
      else await adminPost(cfg.create, form);
      setForm({ nome: '' }); setEditId(null);
      await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }
  async function alternarAtivo(it: Item) {
    if (!cfg) return;
    try { await adminPut(cfg.item(it.id), { ativo: !it.ativo }); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao alterar.'); }
  }
  async function excluir(it: Item) {
    if (!cfg || !confirm(`Excluir "${it.nome}"?`)) return;
    try { await adminDelete(cfg.item(it.id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Não foi possível excluir (talvez esteja em uso). Tente desativar.'); }
  }

  const grupos = Array.from(new Set(configs.map((c) => c.grupo)));

  return (
    <div>
      <AdminHeader title="Tipos e Taxonomias" description="Cadastre manualmente os tipos de cada cadastro (naturezas de lei, modalidades, tipos de conselho/concurso…)." />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-5 md:grid-cols-[280px_1fr]">
        {/* Seletor de taxonomia */}
        <nav className={`${ui.card} h-fit p-3`}>
          {grupos.map((g) => (
            <div key={g} className="mb-3">
              <p className="mb-1 px-2 text-xs font-bold uppercase tracking-wide text-fg/50">{g}</p>
              <ul>
                {configs.filter((c) => c.grupo === g).map((c) => (
                  <li key={c.id}>
                    <button onClick={() => setSel(c.id)} className={`w-full rounded px-2 py-1.5 text-left text-sm ${c.id === sel ? 'bg-primary text-primary-fg font-semibold' : 'hover:bg-muted'}`}>{c.nome}</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        {/* Painel da taxonomia */}
        <div>
          {/* Formulário */}
          <div className={`${ui.card} mb-4 p-4`}>
            <h2 className="mb-2 text-sm font-semibold">{editId ? 'Editar tipo' : 'Novo tipo'} {cfg && <span className="text-fg/50">· {cfg.grupo} / {cfg.nome}</span>}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="grow">
                <label className={ui.label}>Nome *</label>
                <input className={ui.input} value={String(form.nome ?? '')} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              {cfg?.campos.map((c) => (
                <div key={c.key}>
                  <label className={ui.label}>{c.label}</label>
                  {c.tipo === 'bool' ? (
                    <select className={ui.input} value={form[c.key] ? '1' : '0'} onChange={(e) => setForm({ ...form, [c.key]: e.target.value === '1' })}>
                      <option value="0">Não</option><option value="1">Sim</option>
                    </select>
                  ) : (
                    <input className={ui.input} value={String(form[c.key] ?? '')} onChange={(e) => setForm({ ...form, [c.key]: e.target.value })} />
                  )}
                </div>
              ))}
              <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Adicionar')}</button>
              {editId && <button className={ui.btnGhost} onClick={() => { setEditId(null); setForm({ nome: '' }); }}>Cancelar</button>}
            </div>
          </div>

          {/* Tabela */}
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={ui.th}>Nome</th>
                  {cfg?.campos.map((c) => <th key={c.key} className={ui.th}>{c.label}</th>)}
                  <th className={ui.th}>Ativo</th>
                  <th className={ui.th}></th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => (
                  <tr key={it.id} className={it.ativo ? '' : 'opacity-50'}>
                    <td className={ui.td}>{it.nome}</td>
                    {cfg?.campos.map((c) => (
                      <td key={c.key} className={ui.td}>{c.tipo === 'bool' ? (it[c.key] ? 'Sim' : 'Não') : (String(it[c.key] ?? '') || '—')}</td>
                    ))}
                    <td className={ui.td}>
                      <button className="text-sm hover:underline" onClick={() => alternarAtivo(it)}>{it.ativo ? '✓ ativo' : 'inativo'}</button>
                    </td>
                    <td className={ui.td}>
                      <div className="flex gap-2">
                        <button className={ui.btnGhost} onClick={() => editar(it)}>Editar</button>
                        <button className={ui.btnDanger} onClick={() => excluir(it)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!carregando && itens.length === 0 && <tr><td className={ui.td} colSpan={4}>Nenhum tipo cadastrado.</td></tr>}
              </tbody>
            </table>
          </div>
          {cfg && <p className="mt-2 text-xs text-fg/50">{itens.length} tipo(s). Dica: se um tipo estiver em uso e não puder ser excluído, use <strong>desativar</strong> (clique em “ativo”).</p>}
        </div>
      </div>
    </div>
  );
}
