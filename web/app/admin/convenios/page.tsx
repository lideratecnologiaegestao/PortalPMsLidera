'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

const SITUACOES = ['vigente', 'encerrado', 'prestacao de contas', 'rescindido'];
const CATEGORIAS = ['Termo de Convênio', 'Plano de Trabalho', 'Termo Aditivo', 'Prestação de Contas', 'Relatório de Execução', 'Outros'];

interface Row { id: string; numero: string | null; ano: number | null; objeto: string; convenente: string | null; situacao: string | null; ativo: boolean; _count: { documentos: number } }
interface Doc { id: string; categoria: string; titulo: string; arquivoUrl: string | null; downloads: number }

const vazio = { numero: '', ano: '', objeto: '', concedente: '', convenente: '', valorRepasse: '', contrapartida: '', situacao: '', orgao: '', dataAssinatura: '', vigenciaInicio: '', vigenciaFim: '' };

export default function ConveniosAdminPage() {
  const [lista, setLista] = useState<Row[]>([]);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [docs, setDocs] = useState<Doc[]>([]);
  const [novoDoc, setNovoDoc] = useState({ categoria: 'Termo de Convênio', titulo: '', arquivoUrl: '' });
  const [picker, setPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try { setLista(await adminGet<Row[]>('/api/admin/convenios')); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() { setEditId(null); setForm({ ...vazio }); setDocs([]); setModal(true); }
  async function abrirEdicao(id: string) {
    try {
      const c = await adminGet<any>(`/api/admin/convenios/${id}`);
      setEditId(id);
      setForm({
        numero: c.numero ?? '', ano: c.ano ? String(c.ano) : '', objeto: c.objeto ?? '', concedente: c.concedente ?? '', convenente: c.convenente ?? '',
        valorRepasse: c.valorRepasse ? String(c.valorRepasse) : '', contrapartida: c.contrapartida ? String(c.contrapartida) : '', situacao: c.situacao ?? '', orgao: c.orgao ?? '',
        dataAssinatura: c.dataAssinatura ? String(c.dataAssinatura).slice(0, 10) : '', vigenciaInicio: c.vigenciaInicio ? String(c.vigenciaInicio).slice(0, 10) : '', vigenciaFim: c.vigenciaFim ? String(c.vigenciaFim).slice(0, 10) : '',
      });
      setDocs(c.documentos ?? []); setModal(true);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir.'); }
  }
  async function salvar() {
    if (!form.objeto.trim()) { setErro('Informe o objeto.'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      numero: form.numero || undefined, ano: form.ano ? Number(form.ano) : undefined, objeto: form.objeto.trim(),
      concedente: form.concedente || undefined, convenente: form.convenente || undefined,
      valorRepasse: form.valorRepasse ? Number(form.valorRepasse) : undefined, contrapartida: form.contrapartida ? Number(form.contrapartida) : undefined,
      situacao: form.situacao || undefined, orgao: form.orgao || undefined,
      dataAssinatura: form.dataAssinatura || undefined, vigenciaInicio: form.vigenciaInicio || undefined, vigenciaFim: form.vigenciaFim || undefined,
    };
    try {
      if (editId) await adminPut(`/api/admin/convenios/${editId}`, body);
      else { const n = await adminPost<any>('/api/admin/convenios', body); setEditId(n.id); }
      await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }
  async function addDoc() {
    if (!editId || !novoDoc.titulo.trim()) { setErro('Salve o convênio e informe o título.'); return; }
    try {
      await adminPost(`/api/admin/convenios/${editId}/documentos`, { categoria: novoDoc.categoria, titulo: novoDoc.titulo.trim(), arquivoUrl: novoDoc.arquivoUrl || undefined, ordem: docs.length + 1 });
      const c = await adminGet<any>(`/api/admin/convenios/${editId}`); setDocs(c.documentos ?? []);
      setNovoDoc({ categoria: novoDoc.categoria, titulo: '', arquivoUrl: '' }); await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar documento.'); }
  }
  async function delDoc(id: string) {
    try { await adminDelete(`/api/admin/convenios/documentos/${id}`); setDocs((d) => d.filter((x) => x.id !== id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover.'); }
  }
  async function excluirConvenio(id: string) {
    if (!confirm('Excluir este convênio e seus documentos?')) return;
    try { await adminDelete(`/api/admin/convenios/${id}`); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  return (
    <div>
      <AdminHeader title="Convênios e Transferências" description="Partes, valores, vigência e documentos (plano de trabalho, prestação de contas).">
        <button className={ui.btn} onClick={abrirNovo}>Novo convênio</button>
      </AdminHeader>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead><tr><th className={ui.th}>Objeto</th><th className={ui.th}>Nº/Ano</th><th className={ui.th}>Convenente</th><th className={ui.th}>Situação</th><th className={ui.th}>Docs</th><th className={ui.th}></th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className={ui.td}><button className="text-left font-semibold text-primary hover:underline" onClick={() => abrirEdicao(c.id)}>{c.objeto}</button></td>
                <td className={ui.td}>{c.numero ?? '—'}{c.ano ? `/${c.ano}` : ''}</td>
                <td className={ui.td}>{c.convenente ?? '—'}</td>
                <td className={ui.td}><span className="capitalize">{c.situacao ?? '—'}</span></td>
                <td className={ui.td}>{c._count.documentos}</td>
                <td className={ui.td}><div className="flex gap-2"><button className={ui.btnGhost} onClick={() => abrirEdicao(c.id)}>Editar</button><button className={ui.btnDanger} onClick={() => excluirConvenio(c.id)}>Excluir</button></div></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td className={ui.td} colSpan={6}>Nenhum convênio cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar convênio' : 'Novo convênio'}>
        <div className="space-y-3">
          <div><label className={ui.label}>Objeto *</label><textarea className={ui.input} rows={2} value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className={ui.label}>Número</label><input className={ui.input} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
            <div><label className={ui.label}>Ano</label><input className={ui.input} type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></div>
            <div><label className={ui.label}>Concedente</label><input className={ui.input} value={form.concedente} onChange={(e) => setForm({ ...form, concedente: e.target.value })} /></div>
            <div><label className={ui.label}>Convenente</label><input className={ui.input} value={form.convenente} onChange={(e) => setForm({ ...form, convenente: e.target.value })} /></div>
            <div><label className={ui.label}>Valor do repasse (R$)</label><input className={ui.input} type="number" step="0.01" value={form.valorRepasse} onChange={(e) => setForm({ ...form, valorRepasse: e.target.value })} /></div>
            <div><label className={ui.label}>Contrapartida (R$)</label><input className={ui.input} type="number" step="0.01" value={form.contrapartida} onChange={(e) => setForm({ ...form, contrapartida: e.target.value })} /></div>
            <div><label className={ui.label}>Situação</label><select className={ui.input} value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value })}><option value="">—</option>{SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className={ui.label}>Assinatura</label><input className={ui.input} type="date" value={form.dataAssinatura} onChange={(e) => setForm({ ...form, dataAssinatura: e.target.value })} /></div>
            <div><label className={ui.label}>Vig. início</label><input className={ui.input} type="date" value={form.vigenciaInicio} onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })} /></div>
            <div><label className={ui.label}>Vig. fim</label><input className={ui.input} type="date" value={form.vigenciaFim} onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })} /></div>
            <div className="col-span-2"><label className={ui.label}>Órgão</label><input className={ui.input} value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2"><button className={ui.btnGhost} onClick={() => setModal(false)}>Fechar</button><button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Salvar e anexar documentos')}</button></div>

          {editId && (
            <div className="mt-2 rounded border border-border p-3">
              <h3 className="mb-2 text-sm font-semibold">Documentos</h3>
              {docs.length === 0 ? <p className="text-sm text-fg/60">Nenhum documento.</p> : (
                <ul className="mb-3 space-y-1">
                  {docs.map((d) => (
                    <li key={d.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                      <span><span className="font-semibold">[{d.categoria}]</span> {d.titulo} {d.arquivoUrl ? <span className="text-success">✓</span> : ''} · ⬇{d.downloads}</span>
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
