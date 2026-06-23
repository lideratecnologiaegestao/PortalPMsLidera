'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import { useSessaoAdmin } from '../../../lib/session-context';
import { escopoRestrito } from '../../../lib/roles';

interface Item {
  id: string;
  tipo: 'foto' | 'video' | 'audio';
  fonte: 'upload' | 'youtube';
  titulo?: string | null;
  url?: string | null;
  youtubeId?: string | null;
  ordem: number;
  secretariaId?: string | null;
  secretaria?: { nome: string } | null;
}
interface Pag<T> { items: T[]; total: number; page: number; pageSize: number }

const vazio = { tipo: 'foto' as 'foto' | 'video' | 'audio', titulo: '', url: '', youtube: '', secretariaId: '', ordem: 0 };

export default function GaleriaAdminPage() {
  const { role } = useSessaoAdmin();
  const [pagina, setPagina] = useState<Pag<Item> | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'' | 'foto' | 'video'>('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [secretarias, setSecretarias] = useState<{ id: string; nome: string }[]>([]);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...vazio });
  const [salvando, setSalvando] = useState(false);
  const [picker, setPicker] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const q = filtroTipo ? `?tipo=${filtroTipo}&pageSize=100` : '?pageSize=100';
      setPagina(await adminGet<Pag<Item>>(`/api/admin/galeria${q}`));
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar galeria.');
    }
  }, [filtroTipo]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    adminGet<any>('/api/admin/secretarias?pageSize=200').then((r) => setSecretarias(r.items ?? r)).catch(() => setSecretarias([]));
  }, []);

  function abrirNovo() {
    setEditId(null); setForm({ ...vazio }); setModal(true);
  }
  function abrirEdicao(it: Item) {
    setEditId(it.id);
    setForm({
      tipo: it.tipo,
      titulo: it.titulo ?? '',
      url: it.url ?? '',
      youtube: it.youtubeId ?? '',
      secretariaId: it.secretariaId ?? '',
      ordem: it.ordem ?? 0,
    });
    setModal(true);
  }

  async function salvar() {
    setErro('');
    if (form.tipo === 'foto' && !form.url) { setErro('Selecione uma imagem.'); return; }
    if (form.tipo === 'audio' && !form.url) { setErro('Selecione um arquivo de áudio.'); return; }
    if (form.tipo === 'video' && !form.youtube && !form.url) { setErro('Informe um vídeo do YouTube ou selecione um arquivo .mp4.'); return; }
    setSalvando(true);
    const body: any = {
      tipo: form.tipo,
      titulo: form.titulo || undefined,
      secretariaId: form.secretariaId || null,
      ordem: Number(form.ordem) || 0,
    };
    if (form.tipo === 'video' && form.youtube) body.youtube = form.youtube;
    else body.url = form.url || undefined;
    try {
      if (editId) await adminPut(`/api/admin/galeria/${editId}`, body);
      else await adminPost('/api/admin/galeria', body);
      setModal(false);
      setAviso('Item salvo.');
      await carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: string) {
    if (!confirm('Excluir este item da galeria?')) return;
    try {
      await adminDelete(`/api/admin/galeria/${id}`);
      await carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.');
    }
  }

  const itens = pagina?.items ?? [];

  return (
    <div>
      <AdminHeader title="Galeria" description="Fotos e vídeos do site (compartilhados com as páginas das secretarias).">
        <button className={ui.btn} onClick={abrirNovo}>Novo item</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

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

      <div className="mb-4 flex gap-2">
        {(['', 'foto', 'video'] as const).map((t) => (
          <button
            key={t || 'todos'}
            onClick={() => setFiltroTipo(t)}
            className={filtroTipo === t ? ui.btn : ui.btnGhost}
          >
            {t === '' ? 'Todos' : t === 'foto' ? 'Fotos' : 'Vídeos'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {itens.map((it) => (
          <div key={it.id} className="overflow-hidden rounded border border-border bg-bg">
            <div className="aspect-video bg-muted">
              {it.tipo === 'video' ? (
                it.fonte === 'youtube' && it.youtubeId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`https://img.youtube.com/vi/${it.youtubeId}/mqdefault.jpg`} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl text-fg/40">▶</div>
                )
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url ?? ''} alt={it.titulo ?? ''} className="h-full w-full object-cover" />
              )}
            </div>
            <div className="p-2">
              <p className="truncate text-xs font-semibold">{it.titulo || (it.tipo === 'video' ? 'Vídeo' : 'Foto')}</p>
              <p className="text-[11px] text-fg/60">
                {it.tipo === 'video' ? (it.fonte === 'youtube' ? 'YouTube' : 'MP4') : 'Foto'}
                {it.secretaria ? ` · ${it.secretaria.nome}` : ''}
              </p>
              <div className="mt-1 flex gap-2">
                <button className="text-xs text-primary hover:underline" onClick={() => abrirEdicao(it)}>editar</button>
                <button className="text-xs text-danger hover:underline" onClick={() => excluir(it.id)}>excluir</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {itens.length === 0 && <p className="text-sm text-fg/60">Nenhum item ainda.</p>}

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar item' : 'Novo item da galeria'}>
        <div className="space-y-3">
          <div>
            <label className={ui.label}>Tipo</label>
            <select className={ui.input} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as 'foto' | 'video' | 'audio', url: '', youtube: '' })}>
              <option value="foto">Foto</option>
              <option value="video">Vídeo</option>
              <option value="audio">Áudio</option>
            </select>
          </div>

          <div>
            <label className={ui.label}>Título (opcional)</label>
            <input className={ui.input} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
          </div>

          {form.tipo === 'foto' && (
            <div>
              <label className={ui.label}>Imagem</label>
              <div className="flex items-center gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>Selecionar imagem…</button>
                <span className="text-sm text-fg/70">{form.url ? 'imagem selecionada' : 'nenhuma'}</span>
                {form.url && <button type="button" className="text-sm text-danger hover:underline" onClick={() => setForm({ ...form, url: '' })}>remover</button>}
              </div>
              {form.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.url} alt="" className="mt-2 h-28 rounded border border-border object-cover" />
              )}
            </div>
          )}

          {form.tipo === 'audio' && (
            <div>
              <label className={ui.label}>Áudio (.mp3)</label>
              <div className="flex items-center gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>Selecionar áudio…</button>
                <span className="text-sm text-fg/70">{form.url ? 'áudio selecionado' : 'nenhum'}</span>
                {form.url && <button type="button" className="text-sm text-danger hover:underline" onClick={() => setForm({ ...form, url: '' })}>remover</button>}
              </div>
              {form.url && <audio src={form.url} controls className="mt-2 w-full" />}
            </div>
          )}

          {form.tipo === 'video' && (
            <>
              <div>
                <label className={ui.label}>URL do YouTube</label>
                <input
                  className={ui.input}
                  value={form.youtube}
                  onChange={(e) => setForm({ ...form, youtube: e.target.value, url: '' })}
                  placeholder="https://www.youtube.com/watch?v=..."
                />
                <p className="mt-1 text-xs text-fg/60">Cole o link do vídeo (watch, youtu.be, embed ou shorts).</p>
              </div>
              <div className="text-center text-xs text-fg/50">— ou —</div>
              <div>
                <label className={ui.label}>Arquivo de vídeo (.mp4)</label>
                <div className="flex items-center gap-2">
                  <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>Selecionar arquivo…</button>
                  <span className="text-sm text-fg/70">{form.url ? 'arquivo selecionado' : 'nenhum'}</span>
                  {form.url && <button type="button" className="text-sm text-danger hover:underline" onClick={() => setForm({ ...form, url: '' })}>remover</button>}
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              {escopoRestrito(role) ? (
                /* Gestor/servidor: secretaria definida pela lotação — somente-leitura */
                <>
                  <p className={ui.label} id="gal-secretaria-lbl">Secretaria</p>
                  <p
                    aria-labelledby="gal-secretaria-lbl"
                    className="mt-1 rounded border border-border bg-muted px-3 py-2 text-sm text-fg/70"
                  >
                    {secretarias.find((s) => s.id === form.secretariaId)?.nome ?? 'Definida pela sua lotação'}
                  </p>
                  <p className="mt-1 text-xs text-fg/60">
                    Definida pela sua lotação; não pode ser alterada aqui.
                  </p>
                </>
              ) : (
                <>
                  <label className={ui.label}>Secretaria (opcional)</label>
                  <select className={ui.input} value={form.secretariaId} onChange={(e) => setForm({ ...form, secretariaId: e.target.value })}>
                    <option value="">— nenhuma —</option>
                    {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                  </select>
                </>
              )}
            </div>
            <div>
              <label className={ui.label}>Ordem</label>
              <input className={ui.input} type="number" value={form.ordem} onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) })} />
            </div>
          </div>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex justify-end gap-2 pt-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Cancelar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>

      <MediaPicker
        open={picker}
        onClose={() => setPicker(false)}
        tipo={form.tipo === 'video' ? 'video' : form.tipo === 'audio' ? 'audio' : 'imagem'}
        onSelect={(a) => { setForm((f) => ({ ...f, url: a.urlPublica ?? '', youtube: '' })); setPicker(false); }}
      />
    </div>
  );
}
