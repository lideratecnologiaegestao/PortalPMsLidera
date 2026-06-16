'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, qs, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

const FASES = [
  'Aviso de Licitação', 'Edital', 'Anexos do Edital', 'Impugnações e Esclarecimentos',
  'Ata de Abertura/Sessão', 'Resultado de Julgamento', 'Habilitação', 'Recursos',
  'Homologação', 'Ata de Registro de Preço', 'Contrato', 'Aditivo', 'Outros',
];
const SITUACOES = ['aberta', 'em andamento', 'homologada', 'deserta', 'fracassada', 'revogada', 'anulada'];

interface Opt { id: string; nome: string }
interface Row { id: string; numero: string | null; ano: number | null; objeto: string; situacao: string | null; ativo: boolean; modalidade: { nome: string } | null; _count: { documentos: number } }
interface Pag<T> { total: number; page: number; pageSize: number; items: T[] }
interface DocRow { id: string; fase: string; titulo: string; arquivoUrl: string | null; downloads: number }

const vazio = { modalidadeId: '', criterioId: '', numero: '', ano: '', objeto: '', situacao: '', orgao: '', dataAbertura: '' };

export default function LicitacoesAdminPage() {
  const [modalidades, setModalidades] = useState<Opt[]>([]);
  const [criterios, setCriterios] = useState<Opt[]>([]);
  const [pagina, setPagina] = useState<Pag<Row> | null>(null);
  const [q, setQ] = useState(''); const [busca, setBusca] = useState(''); const [page, setPage] = useState(1);
  const [erro, setErro] = useState('');

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [novoDoc, setNovoDoc] = useState({ fase: 'Edital', titulo: '', arquivoUrl: '' });
  const [picker, setPicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    adminGet<Opt[]>('/api/admin/licitacoes/modalidades').then(setModalidades).catch(() => undefined);
    adminGet<Opt[]>('/api/admin/licitacoes/criterios').then(setCriterios).catch(() => undefined);
  }, []);

  const carregar = useCallback(async (pg: number) => {
    setErro('');
    try {
      const data = await adminGet<Pag<Row>>(`/api/admin/licitacoes${qs({ q: busca, page: pg })}`);
      setPagina(data); setPage(pg);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); }
  }, [busca]);
  useEffect(() => { carregar(1); }, [carregar]);

  function abrirNovo() { setEditId(null); setForm({ ...vazio }); setDocs([]); setModal(true); }
  async function abrirEdicao(id: string) {
    try {
      const l = await adminGet<any>(`/api/admin/licitacoes/${id}`);
      setEditId(id);
      setForm({
        modalidadeId: l.modalidadeId ?? '', criterioId: l.criterioId ?? '', numero: l.numero ?? '',
        ano: l.ano ? String(l.ano) : '', objeto: l.objeto ?? '', situacao: l.situacao ?? '', orgao: l.orgao ?? '',
        dataAbertura: l.dataAbertura ? String(l.dataAbertura).slice(0, 10) : '',
      });
      setDocs(l.documentos ?? []);
      setModal(true);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir.'); }
  }

  async function salvarLicitacao() {
    if (!form.objeto.trim()) { setErro('Informe o objeto.'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      modalidadeId: form.modalidadeId || null, criterioId: form.criterioId || null,
      numero: form.numero || undefined, ano: form.ano ? Number(form.ano) : undefined,
      objeto: form.objeto.trim(), situacao: form.situacao || undefined, orgao: form.orgao || undefined,
      dataAbertura: form.dataAbertura || undefined,
    };
    try {
      if (editId) { await adminPut(`/api/admin/licitacoes/${editId}`, body); }
      else { const nova = await adminPost<any>('/api/admin/licitacoes', body); setEditId(nova.id); } // vira modo edição p/ anexar docs
      await carregar(page);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }

  async function addDoc() {
    if (!editId || !novoDoc.titulo.trim()) { setErro('Salve a licitação e informe o título do documento.'); return; }
    try {
      await adminPost(`/api/admin/licitacoes/${editId}/documentos`, { fase: novoDoc.fase, titulo: novoDoc.titulo.trim(), arquivoUrl: novoDoc.arquivoUrl || undefined, ordem: docs.length + 1 });
      const l = await adminGet<any>(`/api/admin/licitacoes/${editId}`);
      setDocs(l.documentos ?? []);
      setNovoDoc({ fase: novoDoc.fase, titulo: '', arquivoUrl: '' });
      await carregar(page);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar documento.'); }
  }
  async function delDoc(id: string) {
    try { await adminDelete(`/api/admin/licitacoes/documentos/${id}`); setDocs((d) => d.filter((x) => x.id !== id)); await carregar(page); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir documento.'); }
  }
  async function excluirLic(id: string) {
    if (!confirm('Excluir esta licitação e seus documentos?')) return;
    try { await adminDelete(`/api/admin/licitacoes/${id}`); await carregar(page); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  const totalPaginas = pagina ? Math.max(1, Math.ceil(pagina.total / pagina.pageSize)) : 1;

  return (
    <div>
      <AdminHeader title="Licitações" description="Processos licitatórios com modalidade, critério e documentos por fase.">
        <button className={ui.btn} onClick={abrirNovo}>Nova licitação</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <form className="mb-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setBusca(q); }}>
        <input className={ui.input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por objeto ou número…" />
        <button className={ui.btnGhost} type="submit">Buscar</button>
      </form>

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead><tr>
            <th className={ui.th}>Objeto</th><th className={ui.th}>Modalidade</th><th className={ui.th}>Nº/Ano</th>
            <th className={ui.th}>Situação</th><th className={ui.th}>Docs</th><th className={ui.th}></th>
          </tr></thead>
          <tbody>
            {pagina?.items.map((l) => (
              <tr key={l.id}>
                <td className={ui.td}><button className="text-left font-semibold text-primary hover:underline" onClick={() => abrirEdicao(l.id)}>{l.objeto}</button></td>
                <td className={ui.td}>{l.modalidade?.nome ?? '—'}</td>
                <td className={ui.td}>{l.numero ?? '—'}{l.ano ? `/${l.ano}` : ''}</td>
                <td className={ui.td}><span className="capitalize">{l.situacao ?? '—'}</span></td>
                <td className={ui.td}>{l._count.documentos}</td>
                <td className={ui.td}><div className="flex gap-2"><button className={ui.btnGhost} onClick={() => abrirEdicao(l.id)}>Editar</button><button className={ui.btnDanger} onClick={() => excluirLic(l.id)}>Excluir</button></div></td>
              </tr>
            ))}
            {pagina && pagina.items.length === 0 && <tr><td className={ui.td} colSpan={6}>Nenhuma licitação cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>

      {pagina && pagina.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-fg/70">{pagina.total} licitação(ões) · página {page} de {totalPaginas}</span>
          <div className="flex gap-2">
            <button className={ui.btnGhost} disabled={page <= 1} onClick={() => carregar(page - 1)}>Anterior</button>
            <button className={ui.btnGhost} disabled={page >= totalPaginas} onClick={() => carregar(page + 1)}>Próxima</button>
          </div>
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar licitação' : 'Nova licitação'}>
        <div className="space-y-3">
          <div>
            <label className={ui.label}>Objeto *</label>
            <textarea className={ui.input} rows={2} value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={ui.label}>Modalidade</label>
              <select className={ui.input} value={form.modalidadeId} onChange={(e) => setForm({ ...form, modalidadeId: e.target.value })}>
                <option value="">—</option>
                {modalidades.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={ui.label}>Critério de julgamento</label>
              <select className={ui.input} value={form.criterioId} onChange={(e) => setForm({ ...form, criterioId: e.target.value })}>
                <option value="">—</option>
                {criterios.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className={ui.label}>Número</label><input className={ui.input} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
              <div><label className={ui.label}>Ano</label><input className={ui.input} type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></div>
            </div>
            <div>
              <label className={ui.label}>Situação</label>
              <select className={ui.input} value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value })}>
                <option value="">—</option>
                {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div><label className={ui.label}>Órgão</label><input className={ui.input} value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} /></div>
            <div><label className={ui.label}>Data de abertura</label><input className={ui.input} type="date" value={form.dataAbertura} onChange={(e) => setForm({ ...form, dataAbertura: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Fechar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvarLicitacao}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Salvar e adicionar documentos')}</button>
          </div>

          {/* Documentos por fase (após salvar) */}
          {editId && (
            <div className="mt-2 rounded border border-border p-3">
              <h3 className="mb-2 text-sm font-semibold">Documentos do processo</h3>
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
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className={ui.label}>Fase</label>
                  <select className={ui.input} value={novoDoc.fase} onChange={(e) => setNovoDoc({ ...novoDoc, fase: e.target.value })}>
                    {FASES.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="grow"><label className={ui.label}>Título</label><input className={ui.input} value={novoDoc.titulo} onChange={(e) => setNovoDoc({ ...novoDoc, titulo: e.target.value })} placeholder="Ex.: Edital de Pregão 001/2026" /></div>
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
