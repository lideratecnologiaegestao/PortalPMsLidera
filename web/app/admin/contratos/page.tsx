'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

const SITUACOES = ['vigente', 'encerrado', 'rescindido', 'suspenso'];
const TIPOS_ADITIVO = ['prazo', 'valor', 'prazo e valor', 'reajuste', 'apostilamento'];

interface Row { id: string; numero: string | null; ano: number | null; objeto: string; contratado: string | null; situacao: string | null; ativo: boolean; _count: { aditivos: number } }
interface Lic { id: string; numero: string | null; ano: number | null; objeto: string }
interface Aditivo { id: string; numero: string | null; tipo: string | null; objeto: string | null; valor: string | null; arquivoUrl: string | null; downloads: number }

const vazio = { licitacaoId: '', numero: '', ano: '', objeto: '', contratado: '', contratadoDoc: '', valor: '', situacao: '', orgao: '', fundamento: '', dataAssinatura: '', vigenciaInicio: '', vigenciaFim: '', arquivoUrl: '' };

export default function ContratosAdminPage() {
  const [lista, setLista] = useState<Row[]>([]);
  const [licitacoes, setLicitacoes] = useState<Lic[]>([]);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [aditivos, setAditivos] = useState<Aditivo[]>([]);
  const [novoAd, setNovoAd] = useState({ numero: '', tipo: 'prazo', objeto: '', valor: '', data: '', vigenciaFim: '', arquivoUrl: '' });
  const [picker, setPicker] = useState<'contrato' | 'aditivo' | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { adminGet<Lic[]>('/api/admin/contratos/licitacoes').then(setLicitacoes).catch(() => undefined); }, []);
  const carregar = useCallback(async () => {
    try { setLista(await adminGet<Row[]>('/api/admin/contratos')); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovo() { setEditId(null); setForm({ ...vazio }); setAditivos([]); setModal(true); }
  async function abrirEdicao(id: string) {
    try {
      const c = await adminGet<any>(`/api/admin/contratos/${id}`);
      setEditId(id);
      setForm({
        licitacaoId: c.licitacaoId ?? '', numero: c.numero ?? '', ano: c.ano ? String(c.ano) : '', objeto: c.objeto ?? '',
        contratado: c.contratado ?? '', contratadoDoc: c.contratadoDoc ?? '', valor: c.valor ? String(c.valor) : '',
        situacao: c.situacao ?? '', orgao: c.orgao ?? '', fundamento: c.fundamento ?? '',
        dataAssinatura: c.dataAssinatura ? String(c.dataAssinatura).slice(0, 10) : '',
        vigenciaInicio: c.vigenciaInicio ? String(c.vigenciaInicio).slice(0, 10) : '',
        vigenciaFim: c.vigenciaFim ? String(c.vigenciaFim).slice(0, 10) : '',
        arquivoUrl: c.arquivoUrl ?? '',
      });
      setAditivos(c.aditivos ?? []); setModal(true);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir.'); }
  }
  async function salvar() {
    if (!form.objeto.trim()) { setErro('Informe o objeto.'); return; }
    setSalvando(true); setErro('');
    const body: any = {
      licitacaoId: form.licitacaoId || null, numero: form.numero || undefined, ano: form.ano ? Number(form.ano) : undefined,
      objeto: form.objeto.trim(), contratado: form.contratado || undefined, contratadoDoc: form.contratadoDoc || undefined,
      valor: form.valor ? Number(form.valor) : undefined, situacao: form.situacao || undefined, orgao: form.orgao || undefined,
      fundamento: form.fundamento || undefined, arquivoUrl: form.arquivoUrl || undefined,
      dataAssinatura: form.dataAssinatura || undefined, vigenciaInicio: form.vigenciaInicio || undefined, vigenciaFim: form.vigenciaFim || undefined,
    };
    try {
      if (editId) await adminPut(`/api/admin/contratos/${editId}`, body);
      else { const n = await adminPost<any>('/api/admin/contratos', body); setEditId(n.id); }
      await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }
  async function addAditivo() {
    if (!editId) { setErro('Salve o contrato primeiro.'); return; }
    try {
      await adminPost(`/api/admin/contratos/${editId}/aditivos`, { ...novoAd, valor: novoAd.valor ? Number(novoAd.valor) : undefined, ordem: aditivos.length + 1 });
      const c = await adminGet<any>(`/api/admin/contratos/${editId}`); setAditivos(c.aditivos ?? []);
      setNovoAd({ numero: '', tipo: 'prazo', objeto: '', valor: '', data: '', vigenciaFim: '', arquivoUrl: '' }); await carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar aditivo.'); }
  }
  async function delAditivo(id: string) {
    try { await adminDelete(`/api/admin/contratos/aditivos/${id}`); setAditivos((a) => a.filter((x) => x.id !== id)); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover aditivo.'); }
  }
  async function excluirContrato(id: string) {
    if (!confirm('Excluir este contrato e seus aditivos?')) return;
    try { await adminDelete(`/api/admin/contratos/${id}`); await carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  return (
    <div>
      <AdminHeader title="Contratos e Aditivos" description="Contratos firmados pelo município, vínculo à licitação e aditivos.">
        <button className={ui.btn} onClick={abrirNovo}>Novo contrato</button>
      </AdminHeader>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead><tr><th className={ui.th}>Objeto</th><th className={ui.th}>Nº/Ano</th><th className={ui.th}>Contratado</th><th className={ui.th}>Situação</th><th className={ui.th}>Aditivos</th><th className={ui.th}></th></tr></thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td className={ui.td}><button className="text-left font-semibold text-primary hover:underline" onClick={() => abrirEdicao(c.id)}>{c.objeto}</button></td>
                <td className={ui.td}>{c.numero ?? '—'}{c.ano ? `/${c.ano}` : ''}</td>
                <td className={ui.td}>{c.contratado ?? '—'}</td>
                <td className={ui.td}><span className="capitalize">{c.situacao ?? '—'}</span></td>
                <td className={ui.td}>{c._count.aditivos}</td>
                <td className={ui.td}><div className="flex gap-2"><button className={ui.btnGhost} onClick={() => abrirEdicao(c.id)}>Editar</button><button className={ui.btnDanger} onClick={() => excluirContrato(c.id)}>Excluir</button></div></td>
              </tr>
            ))}
            {lista.length === 0 && <tr><td className={ui.td} colSpan={6}>Nenhum contrato cadastrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar contrato' : 'Novo contrato'}>
        <div className="space-y-3">
          <div><label className={ui.label}>Objeto *</label><textarea className={ui.input} rows={2} value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={ui.label}>Licitação de origem (opcional)</label>
              <select className={ui.input} value={form.licitacaoId} onChange={(e) => setForm({ ...form, licitacaoId: e.target.value })}>
                <option value="">— nenhuma —</option>
                {licitacoes.map((l) => <option key={l.id} value={l.id}>{l.numero ? `${l.numero}/${l.ano} — ` : ''}{l.objeto.slice(0, 60)}</option>)}
              </select>
            </div>
            <div><label className={ui.label}>Número</label><input className={ui.input} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} /></div>
            <div><label className={ui.label}>Ano</label><input className={ui.input} type="number" value={form.ano} onChange={(e) => setForm({ ...form, ano: e.target.value })} /></div>
            <div><label className={ui.label}>Contratado</label><input className={ui.input} value={form.contratado} onChange={(e) => setForm({ ...form, contratado: e.target.value })} /></div>
            <div><label className={ui.label}>CNPJ/CPF</label><input className={ui.input} value={form.contratadoDoc} onChange={(e) => setForm({ ...form, contratadoDoc: e.target.value })} /></div>
            <div><label className={ui.label}>Valor (R$)</label><input className={ui.input} type="number" step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} /></div>
            <div><label className={ui.label}>Situação</label><select className={ui.input} value={form.situacao} onChange={(e) => setForm({ ...form, situacao: e.target.value })}><option value="">—</option>{SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label className={ui.label}>Assinatura</label><input className={ui.input} type="date" value={form.dataAssinatura} onChange={(e) => setForm({ ...form, dataAssinatura: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3"><div><label className={ui.label}>Vig. início</label><input className={ui.input} type="date" value={form.vigenciaInicio} onChange={(e) => setForm({ ...form, vigenciaInicio: e.target.value })} /></div><div><label className={ui.label}>Vig. fim</label><input className={ui.input} type="date" value={form.vigenciaFim} onChange={(e) => setForm({ ...form, vigenciaFim: e.target.value })} /></div></div>
            <div><label className={ui.label}>Órgão</label><input className={ui.input} value={form.orgao} onChange={(e) => setForm({ ...form, orgao: e.target.value })} /></div>
            <div><label className={ui.label}>Fundamento</label><input className={ui.input} value={form.fundamento} onChange={(e) => setForm({ ...form, fundamento: e.target.value })} placeholder="Pregão / Dispensa / Lei…" /></div>
          </div>
          <div className="flex items-center gap-2">
            <label className={ui.label}>Arquivo do contrato:</label>
            <button type="button" className={ui.btnGhost} onClick={() => setPicker('contrato')}>{form.arquivoUrl ? 'PDF ✓' : 'Selecionar…'}</button>
            {form.arquivoUrl && <button type="button" className="text-sm text-danger hover:underline" onClick={() => setForm({ ...form, arquivoUrl: '' })}>remover</button>}
          </div>
          <div className="flex justify-end gap-2"><button className={ui.btnGhost} onClick={() => setModal(false)}>Fechar</button><button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : (editId ? 'Salvar' : 'Salvar e adicionar aditivos')}</button></div>

          {editId && (
            <div className="mt-2 rounded border border-border p-3">
              <h3 className="mb-2 text-sm font-semibold">Aditivos</h3>
              {aditivos.length === 0 ? <p className="text-sm text-fg/60">Nenhum aditivo.</p> : (
                <ul className="mb-3 space-y-1">
                  {aditivos.map((a) => (
                    <li key={a.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                      <span><span className="font-semibold">{a.numero ? `Nº ${a.numero}` : 'Aditivo'}</span>{a.tipo ? ` — ${a.tipo}` : ''} {a.arquivoUrl ? <span className="text-success">✓</span> : ''} · ⬇{a.downloads}</span>
                      <button className="text-danger hover:underline" onClick={() => delAditivo(a.id)}>remover</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div><label className={ui.label}>Número</label><input className={ui.input} value={novoAd.numero} onChange={(e) => setNovoAd({ ...novoAd, numero: e.target.value })} /></div>
                <div><label className={ui.label}>Tipo</label><select className={ui.input} value={novoAd.tipo} onChange={(e) => setNovoAd({ ...novoAd, tipo: e.target.value })}>{TIPOS_ADITIVO.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="col-span-2"><label className={ui.label}>Objeto/justificativa</label><input className={ui.input} value={novoAd.objeto} onChange={(e) => setNovoAd({ ...novoAd, objeto: e.target.value })} /></div>
                <div><label className={ui.label}>Valor (R$)</label><input className={ui.input} type="number" step="0.01" value={novoAd.valor} onChange={(e) => setNovoAd({ ...novoAd, valor: e.target.value })} /></div>
                <div><label className={ui.label}>Nova vigência</label><input className={ui.input} type="date" value={novoAd.vigenciaFim} onChange={(e) => setNovoAd({ ...novoAd, vigenciaFim: e.target.value })} /></div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPicker('aditivo')}>{novoAd.arquivoUrl ? 'PDF ✓' : 'Arquivo…'}</button>
                <button type="button" className={ui.btn} onClick={addAditivo}>Adicionar aditivo</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {picker && (
        <MediaPicker open tipo="documento" onClose={() => setPicker(null)}
          onSelect={(a) => { if (picker === 'contrato') setForm((f) => ({ ...f, arquivoUrl: a.urlPublica ?? '' })); else setNovoAd((d) => ({ ...d, arquivoUrl: a.urlPublica ?? '' })); setPicker(null); }} />
      )}
    </div>
  );
}
