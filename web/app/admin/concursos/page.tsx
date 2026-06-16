'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

const SITUACOES = ['aberto', 'em andamento', 'homologado', 'prorrogado', 'suspenso', 'cancelado', 'encerrado'];

interface Opt { id: string; nome: string }
interface DocTipo { id: string; nome: string; situacao: string | null; obrigatorio: boolean }
interface Row { id: string; numero: string | null; ano: number | null; objeto: string; situacao: string | null; ativo: boolean; tipo: { nome: string } | null; _count: { documentos: number } }
interface Doc { id: string; fase: string; titulo: string; arquivoUrl: string | null; downloads: number }

const vazio = { tipoId: '', numero: '', ano: '', objeto: '', situacao: '', orgao: '', banca: '' };

export default function ConcursosAdminPage() {
  const [tipos, setTipos] = useState<Opt[]>([]);
  const [docTipos, setDocTipos] = useState<DocTipo[]>([]);
  const [lista, setLista] = useState<Row[]>([]);
  const [erro, setErro] = useState('');

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [novoDoc, setNovoDoc] = useState({ docTipoId: '', fase: '', titulo: '', arquivoUrl: '' });
  const [picker, setPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    adminGet<Opt[]>('/api/admin/concursos/tipos').then(setTipos).catch(() => undefined);
    adminGet<DocTipo[]>('/api/admin/concursos/doc-tipos').then(setDocTipos).catch(() => undefined);
  }, []);

  const carregar = useCallback(async () => {
    setErro('');
    try { setLista(await adminGet<Row[]>('/api/admin/concursos')); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() { setEditId(null); setForm({ ...vazio }); setDocs([]); setModal(true); }
  async function abrirEdicao(id: string) {
    try {
      const c = await adminGet<any>(`/api/admin/concursos/${id}`);
      setEditId(id);
      setForm({ tipoId: c.tipoId ?? '', numero: c.numero ?? '', ano: c.ano ? String(c.ano) : '', objeto: c.objeto ?? '', situacao: c.situacao ?? '', orgao: c.orgao ?? '', banca: c.banca ?? '' });
      setDocs(c.documentos ?? []); setModal(true);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir.'); }
  }

  async function salvar() {
    if (!form.objeto.trim()) { setErro('Informe o objeto (cargos/área).'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      tipoId: form.tipoId || null, numero: form.numero || undefined, ano: form.ano ? Number(form.ano) : undefined,
      objeto: form.objeto.trim(), situacao: form.situacao || undefined, orgao: form.orgao || undefined, banca: form.banca || undefined,
    };
    try {
      if (editId) await adminPut(`/api/admin/concursos/${editId}`, body);
      else { const n = await adminPost<any>('/api/admin/concursos', body); setEditId(n.id); }
      await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }

  function escolherDocTipo(id: string) {
    const dt = docTipos.find((x) => x.id === id);
    setNovoDoc({ docTipoId: id, fase: dt?.situacao ?? 'Outros', titulo: dt?.nome ?? '', arquivoUrl: novoDoc.arquivoUrl });
  }
  async function addDoc() {
    if (!editId || !novoDoc.titulo.trim() || !novoDoc.fase) { setErro('Selecione o tipo de documento e informe o título.'); return; }
    try {
      await adminPost(`/api/admin/concursos/${editId}/documentos`, { docTipoId: novoDoc.docTipoId || undefined, fase: novoDoc.fase, titulo: novoDoc.titulo.trim(), arquivoUrl: novoDoc.arquivoUrl || undefined, ordem: docs.length + 1 });
      const c = await adminGet<any>(`/api/admin/concursos/${editId}`);
      setDocs(c.documentos ?? []); setNovoDoc({ docTipoId: '', fase: '', titulo: '', arquivoUrl: '' }); await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar documento.'); }
  }
  async function delDoc(id: string) {
    try { await adminDelete(`/api/admin/concursos/documentos/${id}`); setDocs((d) => d.filter((x) => x.id !== id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover.'); }
  }
  async function excluirConcurso(id: string) {
    if (!confirm('Excluir este concurso e seus documentos?')) return;
    try { await adminDelete(`/api/admin/concursos/${id}`); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  return (
    <div>
      <AdminHeader title="Concursos e Processos Seletivos" description="Certames com tipo (TCE-MT) e documentos por fase (com tipos oficiais).">
        <button className={ui.btn} onClick={abrirNovo}>Novo concurso</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={ui.th}>Objeto</th><th className={ui.th}>Tipo</th><th className={ui.th}>Nº/Ano</th><th className={ui.th}>Situação</th><th className={ui.th}>Docs</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className={ui.td}><button className="text-left font-semibold text-primary hover:underline" onClick={() => abrirEdicao(c.id)}>{c.objeto}</button></td>
                <td className={ui.td}>{c.tipo?.nome ?? '—'}</td>
                <td className={ui.td}>{c.numero ?? '—'}{c.ano ? `/${c.ano}` : ''}</td>
                <td className={ui.td}><span className="capitalize">{c.situacao ?? '—'}</span></td>
                <td className={ui.td}>{c._count.documentos}</td>
                <td className={ui.td}><div className="flex gap-2"><button className={ui.btnGhost} onClick={() => abrirEdicao(c.id)}>Editar</button><button className={ui.btnDanger} onClick={() => excluirConcurso(c.id)}>Excluir</button></div></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td className={ui.td} colSpan={6}>Nenhum concurso cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar concurso' : 'Novo concurso'}>
        <div className="space-y-3">
          <div>
            <label className={ui.label}>Objeto * (cargos / áreas)</label>
            <textarea className={ui.input} rows={2} value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} placeholder="Ex.: Professores, Agentes de Saúde e Auxiliares" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={ui.label}>Tipo do certame (TCE-MT)</label>
              <select className={ui.input} value={form.tipoId} onChange={(e) => setForm({ ...form, tipoId: e.target.value })}>
                <option value="">— selecione —</option>
                {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div><label className={ui.label}>Número</label><input className={ui.input} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
            <div><label className={ui.label}>Ano</label><input className={ui.input} type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></div>
            <div>
              <label className={ui.label}>Situação</label>
              <select className={ui.input} value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value })}>
                <option value="">—</option>
                {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={ui.label}>Banca</label><input className={ui.input} value={form.banca} onChange={(e) => setForm({ ...form, banca: e.target.value })} /></div>
            <div className="col-span-2"><label className={ui.label}>Órgão</label><input className={ui.input} value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Fechar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Salvar e adicionar documentos')}</button>
          </div>

          {editId && (
            <div className="mt-2 rounded border border-border p-3">
              <h3 className="mb-2 text-sm font-semibold">Documentos do certame (por fase)</h3>
              {docs.length === 0 ? <p className="text-sm text-fg/60">Nenhum documento ainda.</p> : (
                <ul className="mb-3 space-y-1">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                      <span><span className="font-semibold">[{d.fase}]</span> {d.titulo} {d.arquivoUrl ? <span className="text-success">✓</span> : <span className="text-fg/40">(sem arquivo)</span>} · ⬇{d.downloads}</span>
                      <button className="text-danger hover:underline" onClick={() => delDoc(d.id)}>remover</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="space-y-2">
                <div>
                  <label className={ui.label}>Tipo de documento (TCE-MT)</label>
                  <select className={ui.input} value={novoDoc.docTipoId} onChange={(e) => escolherDocTipo(e.target.value)}>
                    <option value="">— selecione —</option>
                    {docTipos.map((dt) => <option key={dt.id} value={dt.id}>{dt.situacao ? `${dt.situacao} · ` : ''}{dt.nome}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="grow"><label className={ui.label}>Título</label><input className={ui.input} value={novoDoc.titulo} onChange={(e) => setNovoDoc({ ...novoDoc, titulo: e.target.value })} /></div>
                  <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>{novoDoc.arquivoUrl ? 'Arquivo ✓' : 'Arquivo…'}</button>
                  <button type="button" className={ui.btn} onClick={addDoc}>Adicionar</button>
                </div>
              </div>
            </div>
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
