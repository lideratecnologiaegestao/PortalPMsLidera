'use client';

/**
 * Admin — Hino e Brasão (página institucional singleton).
 *   GET /api/admin/hino-brasao
 *   PUT /api/admin/hino-brasao
 */

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPut, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

interface Brasao { url: string; titulo: string | null }
interface Form {
  hinoTexto: string;
  hinoMidiaTipo: '' | 'audio' | 'video' | 'youtube';
  hinoMidiaUrl: string;
  brasaoHistoria: string;
  brasoes: Brasao[];
}

export default function HinoBrasaoAdminPage() {
  const [form, setForm] = useState<Form>({ hinoTexto: '', hinoMidiaTipo: '', hinoMidiaUrl: '', brasaoHistoria: '', brasoes: [] });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [picker, setPicker] = useState<null | 'hino' | 'brasao'>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const h = await adminGet<any>('/api/admin/hino-brasao');
      setForm({
        hinoTexto: h.hinoTexto ?? '', hinoMidiaTipo: (h.hinoMidiaTipo ?? '') as Form['hinoMidiaTipo'],
        hinoMidiaUrl: h.hinoMidiaUrl ?? '', brasaoHistoria: h.brasaoHistoria ?? '',
        brasoes: Array.isArray(h.brasoes) ? h.brasoes.map((b: any) => ({ url: b.url, titulo: b.titulo ?? '' })) : [],
      });
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function s<K extends keyof Form>(k: K, v: Form[K]) { setForm((p) => ({ ...p, [k]: v })); }

  function addBrasao(url: string) { setForm((p) => ({ ...p, brasoes: [...p.brasoes, { url, titulo: '' }] })); }
  function setBrasaoTitulo(i: number, titulo: string) { setForm((p) => ({ ...p, brasoes: p.brasoes.map((b, j) => j === i ? { ...b, titulo } : b) })); }
  function removeBrasao(i: number) { setForm((p) => ({ ...p, brasoes: p.brasoes.filter((_, j) => j !== i) })); }
  function moveBrasao(i: number, dir: -1 | 1) {
    setForm((p) => {
      const arr = [...p.brasoes]; const j = i + dir;
      if (j < 0 || j >= arr.length) return p;
      [arr[i], arr[j]] = [arr[j], arr[i]];
      return { ...p, brasoes: arr };
    });
  }

  async function salvar() {
    setSalvando(true); setErro(''); setMsgOk('');
    try {
      await adminPut('/api/admin/hino-brasao', {
        hinoTexto: form.hinoTexto || undefined,
        hinoMidiaTipo: form.hinoMidiaTipo || undefined,
        hinoMidiaUrl: form.hinoMidiaUrl || undefined,
        brasaoHistoria: form.brasaoHistoria || undefined,
        brasoes: form.brasoes.filter((b) => b.url),
      });
      setMsgOk('Salvo. A página pública já reflete a alteração.');
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  const tipoMidiaPicker = form.hinoMidiaTipo === 'audio' ? 'audio' : 'video';

  return (
    <div className="space-y-4">
      <AdminHeader title="Hino e Brasão" description="Página exibida em “A Prefeitura → Hino e Brasão”.">
        <a href="/institucional/hino-brasao" target="_blank" rel="noreferrer" className={ui.btnGhost}>Ver página ↗</a>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p className="py-12 text-center text-sm text-fg/60">Carregando…</p>
      ) : (
        <div className="space-y-8">
          {/* Hino */}
          <section className="rounded border border-border p-4">
            <h2 className="mb-3 font-heading text-lg font-bold text-fg">Hino do Município</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={ui.label}>Letra do hino</label>
                <textarea rows={12} className={`${ui.input} font-mono text-sm`} value={form.hinoTexto} onChange={(e) => s('hinoTexto', e.target.value)} placeholder={'Verso 1...\nVerso 2...\n\n(quebras de linha são preservadas)'} />
              </div>
              <div className="space-y-3">
                <div>
                  <label className={ui.label}>Mídia do hino</label>
                  <select className={ui.input} value={form.hinoMidiaTipo} onChange={(e) => s('hinoMidiaTipo', e.target.value as Form['hinoMidiaTipo'])}>
                    <option value="">Nenhuma</option>
                    <option value="youtube">YouTube</option>
                    <option value="audio">Áudio (arquivo)</option>
                    <option value="video">Vídeo (arquivo)</option>
                  </select>
                </div>
                {form.hinoMidiaTipo && (
                  <div>
                    <label className={ui.label}>{form.hinoMidiaTipo === 'youtube' ? 'Link do YouTube' : 'URL do arquivo'}</label>
                    <div className="mt-1 flex gap-2">
                      <input type="url" className={`flex-1 ${ui.input}`} value={form.hinoMidiaUrl} onChange={(e) => s('hinoMidiaUrl', e.target.value)} placeholder={form.hinoMidiaTipo === 'youtube' ? 'https://youtube.com/watch?v=...' : 'https://...'} />
                      {form.hinoMidiaTipo !== 'youtube' && (
                        <button type="button" className={ui.btnGhost} onClick={() => setPicker('hino')}>Biblioteca</button>
                      )}
                    </div>
                  </div>
                )}
                {/* Pré-visualização simples */}
                {form.hinoMidiaUrl && form.hinoMidiaTipo === 'audio' && <audio className="w-full" src={form.hinoMidiaUrl} controls preload="metadata" />}
                {form.hinoMidiaUrl && form.hinoMidiaTipo === 'video' && <video className="w-full rounded border border-border" src={form.hinoMidiaUrl} controls preload="metadata" />}
              </div>
            </div>
          </section>

          {/* Brasão */}
          <section className="rounded border border-border p-4">
            <h2 className="mb-3 font-heading text-lg font-bold text-fg">Brasão do Município</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className={ui.label}>Brasões (imagens)</label>
                  <button type="button" className={ui.btnGhost} onClick={() => setPicker('brasao')}>+ Adicionar da biblioteca</button>
                </div>
                {form.brasoes.length === 0 ? (
                  <p className="text-sm text-fg/55">Nenhum brasão. Clique em “Adicionar da biblioteca”.</p>
                ) : (
                  <ul className="space-y-2">
                    {form.brasoes.map((b, i) => (
                      <li key={`${b.url}-${i}`} className="flex items-center gap-2 rounded border border-border p-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={b.url} alt="" className="h-12 w-12 shrink-0 rounded object-contain" />
                        <input className={`flex-1 ${ui.input}`} value={b.titulo ?? ''} onChange={(e) => setBrasaoTitulo(i, e.target.value)} placeholder="Legenda (ex.: Brasão atual)" />
                        <button type="button" className={ui.btnGhost} title="Subir" onClick={() => moveBrasao(i, -1)}>↑</button>
                        <button type="button" className={ui.btnGhost} title="Descer" onClick={() => moveBrasao(i, 1)}>↓</button>
                        <button type="button" className="text-danger hover:underline" onClick={() => removeBrasao(i)}>remover</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <label className={ui.label}>História do brasão <span className="text-fg/50">(aceita HTML)</span></label>
                <textarea rows={12} className={ui.input} value={form.brasaoHistoria} onChange={(e) => s('brasaoHistoria', e.target.value)} placeholder="<p>O brasão representa...</p>" />
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button type="button" className={ui.btn} onClick={salvar} disabled={salvando} aria-busy={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      )}

      <MediaPicker
        open={picker === 'hino'}
        onClose={() => setPicker(null)}
        tipo={tipoMidiaPicker}
        onSelect={(a) => { if (a.urlPublica) s('hinoMidiaUrl', a.urlPublica); setPicker(null); }}
      />
      <MediaPicker
        open={picker === 'brasao'}
        onClose={() => setPicker(null)}
        tipo="imagem"
        onSelect={(a) => { if (a.urlPublica) addBrasao(a.urlPublica); setPicker(null); }}
      />
    </div>
  );
}
