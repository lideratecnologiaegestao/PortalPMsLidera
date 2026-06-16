'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

const PAPEIS = ['Presidente', 'Membro Representante', 'Membro Designado'];
const CATEGORIAS = ['Ata de Reunião', 'Lei de Criação', 'Regimento Interno', 'Edital de Convocação', 'Resolução', 'Composição/Nomeação', 'Plano/Relatório', 'Outros'];

interface Opt { id: string; nome: string; obrigatorio?: boolean }
interface Row { id: string; nome: string; sigla: string | null; ativo: boolean; tipo: { nome: string } | null; _count: { membros: number; documentos: number } }
interface Membro { id: string; nome: string; papel: string; segmento: string | null }
interface Doc { id: string; categoria: string; titulo: string; arquivoUrl: string | null; downloads: number }

const vazio = { tipoId: '', nome: '', sigla: '', leiCriacao: '', mandatoInicio: '', mandatoFim: '', email: '', descricao: '' };

export default function ConselhosAdminPage() {
  const [tipos, setTipos] = useState<Opt[]>([]);
  const [lista, setLista] = useState<Row[]>([]);
  const [erro, setErro] = useState('');

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [membros, setMembros] = useState<Membro[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [novoMembro, setNovoMembro] = useState({ nome: '', papel: 'Membro Representante', segmento: '' });
  const [novoDoc, setNovoDoc] = useState({ categoria: 'Ata de Reunião', titulo: '', arquivoUrl: '' });
  const [picker, setPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { adminGet<Opt[]>('/api/admin/conselhos/tipos').then(setTipos).catch(() => undefined); }, []);

  const carregar = useCallback(async () => {
    setErro('');
    try { setLista(await adminGet<Row[]>('/api/admin/conselhos')); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() { setEditId(null); setForm({ ...vazio }); setMembros([]); setDocs([]); setModal(true); }
  async function abrirEdicao(id: string) {
    try {
      const c = await adminGet<any>(`/api/admin/conselhos/${id}`);
      setEditId(id);
      setForm({
        tipoId: c.tipoId ?? '', nome: c.nome ?? '', sigla: c.sigla ?? '', leiCriacao: c.leiCriacao ?? '',
        mandatoInicio: c.mandatoInicio ? String(c.mandatoInicio).slice(0, 10) : '',
        mandatoFim: c.mandatoFim ? String(c.mandatoFim).slice(0, 10) : '',
        email: c.email ?? '', descricao: c.descricao ?? '',
      });
      setMembros(c.membros ?? []); setDocs(c.documentos ?? []);
      setModal(true);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir.'); }
  }

  async function recarregarFilhos(id: string) {
    const c = await adminGet<any>(`/api/admin/conselhos/${id}`);
    setMembros(c.membros ?? []); setDocs(c.documentos ?? []);
  }

  async function salvar() {
    if (!form.nome.trim()) { setErro('Informe o nome do conselho.'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      tipoId: form.tipoId || null, nome: form.nome.trim(), sigla: form.sigla || undefined,
      leiCriacao: form.leiCriacao || undefined, email: form.email || undefined, descricao: form.descricao || undefined,
      mandatoInicio: form.mandatoInicio || undefined, mandatoFim: form.mandatoFim || undefined,
    };
    try {
      if (editId) await adminPut(`/api/admin/conselhos/${editId}`, body);
      else { const novo = await adminPost<any>('/api/admin/conselhos', body); setEditId(novo.id); }
      await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }

  async function addMembro() {
    if (!editId || !novoMembro.nome.trim()) { setErro('Salve o conselho e informe o nome do membro.'); return; }
    try {
      await adminPost(`/api/admin/conselhos/${editId}/membros`, { ...novoMembro, ordem: membros.length + 1 });
      await recarregarFilhos(editId); setNovoMembro({ nome: '', papel: novoMembro.papel, segmento: '' }); await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar membro.'); }
  }
  async function delMembro(id: string) {
    try { await adminDelete(`/api/admin/conselhos/membros/${id}`); setMembros((m) => m.filter((x) => x.id !== id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover membro.'); }
  }
  async function addDoc() {
    if (!editId || !novoDoc.titulo.trim()) { setErro('Salve o conselho e informe o título do documento.'); return; }
    try {
      await adminPost(`/api/admin/conselhos/${editId}/documentos`, { categoria: novoDoc.categoria, titulo: novoDoc.titulo.trim(), arquivoUrl: novoDoc.arquivoUrl || undefined, ordem: docs.length + 1 });
      await recarregarFilhos(editId); setNovoDoc({ categoria: novoDoc.categoria, titulo: '', arquivoUrl: '' }); await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar documento.'); }
  }
  async function delDoc(id: string) {
    try { await adminDelete(`/api/admin/conselhos/documentos/${id}`); setDocs((d) => d.filter((x) => x.id !== id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover documento.'); }
  }
  async function excluirConselho(id: string) {
    if (!confirm('Excluir este conselho, seus membros e documentos?')) return;
    try { await adminDelete(`/api/admin/conselhos/${id}`); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  return (
    <div>
      <AdminHeader title="Conselhos Municipais" description="Tipo, composição (membros), mandato, lei de criação e atas.">
        <button className={ui.btn} onClick={abrirNovo}>Novo conselho</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={ui.th}>Conselho</th><th className={ui.th}>Tipo</th><th className={ui.th}>Membros</th><th className={ui.th}>Docs</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className={ui.td}><button className="text-left font-semibold text-primary hover:underline" onClick={() => abrirEdicao(c.id)}>{c.nome}{c.sigla ? ` (${c.sigla})` : ''}</button></td>
                <td className={ui.td}>{c.tipo?.nome ?? '—'}</td>
                <td className={ui.td}>{c._count.membros}</td>
                <td className={ui.td}>{c._count.documentos}</td>
                <td className={ui.td}><div className="flex gap-2"><button className={ui.btnGhost} onClick={() => abrirEdicao(c.id)}>Editar</button><button className={ui.btnDanger} onClick={() => excluirConselho(c.id)}>Excluir</button></div></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td className={ui.td} colSpan={5}>Nenhum conselho cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar conselho' : 'Novo conselho'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={ui.label}>Tipo (TCE-MT)</label>
              <select className={ui.input} value={form.tipoId} onChange={(e) => setForm({ ...form, tipoId: e.target.value })}>
                <option value="">— selecione —</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}{t.obrigatorio ? ' (obrigatório)' : ''}</option>)}
              </select>
            </div>
            <div><label className={ui.label}>Nome *</label><input className={ui.input} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></div>
            <div><label className={ui.label}>Sigla</label><input className={ui.input} value={form.sigla} onChange={(e) => setForm({ ...form, sigla: e.target.value })} /></div>
            <div><label className={ui.label}>Lei de criação</label><input className={ui.input} value={form.leiCriacao} onChange={(e) => setForm({ ...form, leiCriacao: e.target.value })} placeholder="Lei nº …" /></div>
            <div><label className={ui.label}>E-mail/contato</label><input className={ui.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className={ui.label}>Mandato — início</label><input className={ui.input} type="date" value={form.mandatoInicio} onChange={(e) => setForm({ ...form, mandatoInicio: e.target.value })} /></div>
            <div><label className={ui.label}>Mandato — fim</label><input className={ui.input} type="date" value={form.mandatoFim} onChange={(e) => setForm({ ...form, mandatoFim: e.target.value })} /></div>
          </div>
          <div><label className={ui.label}>Descrição</label><textarea className={ui.input} rows={2} value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} /></div>
          <div className="flex justify-end gap-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Fechar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Salvar e compor')}</button>
          </div>

          {editId && (
            <>
              {/* Membros */}
              <div className="mt-2 rounded border border-border p-3">
                <h3 className="mb-2 text-sm font-semibold">Composição (membros)</h3>
                {membros.length === 0 ? <p className="text-sm text-fg/60">Nenhum membro ainda.</p> : (
                  <ul className="mb-3 space-y-1">
                    {membros.map((m) => (
                      <li key={m.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                        <span><span className="font-semibold">{m.nome}</span> — {m.papel}{m.segmento ? ` · ${m.segmento}` : ''}</span>
                        <button className="text-danger hover:underline" onClick={() => delMembro(m.id)}>remover</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grow"><label className={ui.label}>Nome</label><input className={ui.input} value={novoMembro.nome} onChange={(e) => setNovoMembro({ ...novoMembro, nome: e.target.value })} /></div>
                  <div><label className={ui.label}>Papel</label><select className={ui.input} value={novoMembro.papel} onChange={(e) => setNovoMembro({ ...novoMembro, papel: e.target.value })}>{PAPEIS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
                  <div><label className={ui.label}>Segmento</label><input className={ui.input} value={novoMembro.segmento} onChange={(e) => setNovoMembro({ ...novoMembro, segmento: e.target.value })} placeholder="Governo / Soc. civil" /></div>
                  <button type="button" className={ui.btn} onClick={addMembro}>Adicionar</button>
                </div>
              </div>

              {/* Documentos */}
              <div className="rounded border border-border p-3">
                <h3 className="mb-2 text-sm font-semibold">Documentos e atas</h3>
                {docs.length === 0 ? <p className="text-sm text-fg/60">Nenhum documento ainda.</p> : (
                  <ul className="mb-3 space-y-1">
                    {docs.map((d) => (
                      <li key={d.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                        <span><span className="font-semibold">[{d.categoria}]</span> {d.titulo} {d.arquivoUrl ? <span className="text-success">✓</span> : <span className="text-fg/40">(sem arquivo)</span>} · ⬇{d.downloads}</span>
                        <button className="text-danger hover:underline" onClick={() => delDoc(d.id)}>remover</button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex flex-wrap items-end gap-2">
                  <div><label className={ui.label}>Categoria</label><select className={ui.input} value={novoDoc.categoria} onChange={(e) => setNovoDoc({ ...novoDoc, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
                  <div className="grow"><label className={ui.label}>Título</label><input className={ui.input} value={novoDoc.titulo} onChange={(e) => setNovoDoc({ ...novoDoc, titulo: e.target.value })} /></div>
                  <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>{novoDoc.arquivoUrl ? 'Arquivo ✓' : 'Arquivo…'}</button>
                  <button type="button" className={ui.btn} onClick={addDoc}>Adicionar</button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {picker && (
        <MediaPicker open tipo="documento" onClose={() => setPicker(false)}
          onSelect={(a) => { setNovoDoc((d) => ({ ...d, arquivoUrl: a.urlPublica ?? '' })); setPicker(false); }} />
      )}
    </div>
  );
}
