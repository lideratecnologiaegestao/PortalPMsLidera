'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

interface Popup {
  id: string; titulo: string | null; tipo: string; imagemUrl: string | null; linkUrl: string | null;
  youtube: string | null; videoUrl: string | null; conteudoHtml: string | null; pagina: string | null;
  mostrarTitulo: boolean; ativo: boolean; inicioEm: string | null; fimEm: string | null;
  frequenciaHoras: number; ordem: number;
}

const vazio = {
  titulo: '', tipo: 'imagem', imagemUrl: '', linkUrl: '', youtube: '', videoUrl: '', conteudoHtml: '',
  pagina: '', mostrarTitulo: true, ativo: true, inicioEm: '', fimEm: '', frequenciaHoras: 24, ordem: 0,
};

function dt(v: string | null) { return v ? String(v).slice(0, 16) : ''; }

export default function PopupsAdminPage() {
  const [lista, setLista] = useState<Popup[]>([]);
  const [erro, setErro] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [picker, setPicker] = useState<null | 'imagem' | 'video'>(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    adminGet<Popup[]>('/api/admin/popups').then(setLista).catch((e) => setErro(e instanceof AdminApiError ? e.message : 'Falha.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function s<K extends keyof typeof vazio>(k: K, v: (typeof vazio)[K]) { setForm((p) => ({ ...p, [k]: v })); }
  function novo() { setEditId(null); setForm({ ...vazio }); setModal(true); }
  function editar(p: Popup) {
    setEditId(p.id);
    setForm({
      titulo: p.titulo ?? '', tipo: p.tipo, imagemUrl: p.imagemUrl ?? '', linkUrl: p.linkUrl ?? '',
      youtube: p.youtube ?? '', videoUrl: p.videoUrl ?? '', conteudoHtml: p.conteudoHtml ?? '',
      pagina: p.pagina ?? '', mostrarTitulo: p.mostrarTitulo, ativo: p.ativo,
      inicioEm: dt(p.inicioEm), fimEm: dt(p.fimEm), frequenciaHoras: p.frequenciaHoras, ordem: p.ordem,
    });
    setModal(true);
  }

  async function salvar() {
    setErro(''); setSalvando(true);
    const body = {
      ...form,
      inicioEm: form.inicioEm || null, fimEm: form.fimEm || null,
      frequenciaHoras: Number(form.frequenciaHoras) || 0, ordem: Number(form.ordem) || 0,
    };
    try {
      if (editId) await adminPut(`/api/admin/popups/${editId}`, body);
      else await adminPost('/api/admin/popups', body);
      setModal(false); carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }
  async function excluir(id: string) {
    if (!confirm('Excluir este popup?')) return;
    try { await adminDelete(`/api/admin/popups/${id}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha.'); }
  }

  return (
    <div>
      <AdminHeader title="Popups" description="Janelas de aviso exibidas ao cidadão (imagem, vídeo, YouTube ou HTML), por página, com datas e frequência.">
        <button className={ui.btn} onClick={novo}>Novo popup</button>
      </AdminHeader>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="space-y-2">
        {lista.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-border bg-bg p-3">
            <div className="text-sm">
              <span className="font-semibold">{p.titulo || '(sem título)'}</span>
              <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{p.tipo}</span>
              {!p.ativo && <span className="ml-2 text-xs text-fg/50">inativo</span>}
              <span className="ml-2 text-xs text-fg/60">página: {p.pagina || 'todas'} · a cada {p.frequenciaHoras}h</span>
            </div>
            <div className="flex gap-2">
              <button className="text-xs text-primary hover:underline" onClick={() => editar(p)}>editar</button>
              <button className="text-xs text-danger hover:underline" onClick={() => excluir(p.id)}>excluir</button>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-fg/60">Nenhum popup cadastrado.</p>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar popup' : 'Novo popup'}>
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={ui.label}>Título</label><input className={ui.input} value={form.titulo} onChange={(e) => s('titulo', e.target.value)} /></div>
            <div><label className={ui.label}>Tipo</label>
              <select className={ui.input} value={form.tipo} onChange={(e) => s('tipo', e.target.value)}>
                <option value="imagem">Imagem</option><option value="youtube">YouTube</option>
                <option value="video">Vídeo (.mp4)</option><option value="html">HTML livre</option>
              </select>
            </div>
          </div>

          {form.tipo === 'imagem' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPicker('imagem')}>Selecionar imagem…</button>
                <span className="text-sm text-fg/70">{form.imagemUrl ? 'selecionada' : 'nenhuma'}</span>
              </div>
              <input className={ui.input} value={form.linkUrl} onChange={(e) => s('linkUrl', e.target.value)} placeholder="Link ao clicar (opcional)" />
            </div>
          )}
          {form.tipo === 'youtube' && <input className={ui.input} value={form.youtube} onChange={(e) => s('youtube', e.target.value)} placeholder="URL do YouTube" />}
          {form.tipo === 'video' && (
            <div className="flex items-center gap-2">
              <button type="button" className={ui.btnGhost} onClick={() => setPicker('video')}>Selecionar vídeo…</button>
              <span className="text-sm text-fg/70">{form.videoUrl ? 'selecionado' : 'nenhum'}</span>
            </div>
          )}
          {form.tipo === 'html' && <textarea className={`${ui.input} min-h-[120px]`} value={form.conteudoHtml} onChange={(e) => s('conteudoHtml', e.target.value)} placeholder="<h3>…</h3>" />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div><label className={ui.label}>Página (rota)</label><input className={ui.input} value={form.pagina} onChange={(e) => s('pagina', e.target.value)} placeholder="/ ou /servicos (vazio=todas)" /></div>
            <div><label className={ui.label}>Frequência (horas)</label><input type="number" className={ui.input} value={form.frequenciaHoras} onChange={(e) => s('frequenciaHoras', Number(e.target.value))} /></div>
            <div><label className={ui.label}>Ordem</label><input type="number" className={ui.input} value={form.ordem} onChange={(e) => s('ordem', Number(e.target.value))} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className={ui.label}>Início</label><input type="datetime-local" className={ui.input} value={form.inicioEm} onChange={(e) => s('inicioEm', e.target.value)} /></div>
            <div><label className={ui.label}>Fim</label><input type="datetime-local" className={ui.input} value={form.fimEm} onChange={(e) => s('fimEm', e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.ativo} onChange={(e) => s('ativo', e.target.checked)} /> Ativo</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.mostrarTitulo} onChange={(e) => s('mostrarTitulo', e.target.checked)} /> Mostrar título</label>
          </div>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex justify-end gap-2 pt-1">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Cancelar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      <MediaPicker open={picker !== null} onClose={() => setPicker(null)} tipo={picker ?? 'imagem'}
        onSelect={(a) => { if (picker === 'imagem') s('imagemUrl', a.urlPublica ?? ''); if (picker === 'video') s('videoUrl', a.urlPublica ?? ''); setPicker(null); }} />
    </div>
  );
}
