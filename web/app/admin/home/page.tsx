'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import { CampoIcone } from '../_components/IconeEmojiPicker';

interface Config {
  arColunas: number; arCardsLinha: number; arLadoCards: string;
  cardIconeForma: string; cardCorDestaque: string | null;
  sliderTipo: string; sliderImagem: string | null; sliderLink: string | null;
  sliderHtml: string | null; sliderVideo: string | null; sliderYoutube: string | null;
  sliderEnqueteId: string | null;
  googleAnalyticsId: string | null; ogImageUrl: string | null;
  modoManutencao: boolean; manutencaoMensagem: string | null;
}
interface Atalho { id: string; label: string; descricao: string | null; href: string; icone: string; ordem: number; ativo: boolean }

export default function HomeAdminPage() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [atalhos, setAtalhos] = useState<Atalho[]>([]);
  const [enquetes, setEnquetes] = useState<{ id: string; pergunta: string }[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [picker, setPicker] = useState<null | 'imagem' | 'video'>(null);

  const carregar = useCallback(() => {
    adminGet<Config>('/api/admin/home/config').then(setCfg).catch((e) => setErro(e instanceof AdminApiError ? e.message : 'Falha.'));
    adminGet<Atalho[]>('/api/admin/home/atalhos').then(setAtalhos).catch(() => undefined);
    adminGet<any[]>('/api/admin/enquetes').then((r) => setEnquetes(r.map((e) => ({ id: e.id, pergunta: e.pergunta })))).catch(() => undefined);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof Config>(k: K, v: Config[K]) { setCfg((c) => (c ? { ...c, [k]: v } : c)); }

  async function salvarCfg() {
    if (!cfg) return;
    setSalvando(true); setErro(''); setAviso('');
    try { await adminPut('/api/admin/home/config', cfg); setAviso('Layout salvo.'); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
    finally { setSalvando(false); }
  }

  if (!cfg) return <p className="p-6 text-sm text-fg/60">Carregando…</p>;

  return (
    <div className="space-y-6">
      <AdminHeader title="Layout da Home" description="Configure a seção Acesso Rápido, o estilo dos cards e o painel/slider lateral." />
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* Acesso Rápido */}
      <section className={`${ui.card} space-y-4 p-4`}>
        <h2 className="font-heading font-bold">Seção “Acesso Rápido”</h2>
        <div>
          <label className={ui.label}>Colunas da seção</label>
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="radio" checked={cfg.arColunas === 1} onChange={() => set('arColunas', 1)} /> 1 coluna (só cards)</label>
            <label className="flex items-center gap-2"><input type="radio" checked={cfg.arColunas === 2} onChange={() => set('arColunas', 2)} /> 2 colunas (cards + painel)</label>
          </div>
        </div>

        {cfg.arColunas === 1 ? (
          <div>
            <label className={ui.label}>Cards por linha (desktop)</label>
            <select className={`${ui.input} max-w-[140px]`} value={cfg.arCardsLinha} onChange={(e) => set('arCardsLinha', Number(e.target.value))}>
              {[4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        ) : (
          <div>
            <label className={ui.label}>Lado dos cards</label>
            <div className="mt-1 flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={cfg.arLadoCards !== 'direita'} onChange={() => set('arLadoCards', 'esquerda')} /> Cards à esquerda · painel à direita</label>
              <label className="flex items-center gap-2"><input type="radio" checked={cfg.arLadoCards === 'direita'} onChange={() => set('arLadoCards', 'direita')} /> Cards à direita · painel à esquerda</label>
            </div>
          </div>
        )}
      </section>

      {/* Estilo dos cards */}
      <section className={`${ui.card} space-y-4 p-4`}>
        <h2 className="font-heading font-bold">Estilo dos cards</h2>
        <p className="text-xs text-fg/60">Por padrão os cards seguem as cores/fontes do <a href="/admin/tema" className="text-primary hover:underline">Tema</a>. Abaixo você ajusta o ícone e uma cor de destaque opcional.</p>
        <div className="flex flex-wrap gap-6">
          <div>
            <label className={ui.label}>Forma do ícone</label>
            <div className="mt-1 flex gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={cfg.cardIconeForma !== 'quadrado'} onChange={() => set('cardIconeForma', 'circulo')} /> Círculo</label>
              <label className="flex items-center gap-2"><input type="radio" checked={cfg.cardIconeForma === 'quadrado'} onChange={() => set('cardIconeForma', 'quadrado')} /> Quadrado</label>
            </div>
          </div>
          <div>
            <label className={ui.label}>Cor de destaque do card</label>
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={cfg.cardCorDestaque ?? '#1351b4'} onChange={(e) => set('cardCorDestaque', e.target.value)} className="h-9 w-12 rounded border border-border" />
              {cfg.cardCorDestaque && <button type="button" className="text-xs text-primary hover:underline" onClick={() => set('cardCorDestaque', null)}>usar cor do tema</button>}
            </div>
          </div>
        </div>
      </section>

      {/* Painel / slider lateral (2 colunas) */}
      {cfg.arColunas === 2 && (
        <section className={`${ui.card} space-y-4 p-4`}>
          <h2 className="font-heading font-bold">Painel lateral</h2>
          <div>
            <label className={ui.label}>Tipo de conteúdo</label>
            <select className={`${ui.input} max-w-[220px]`} value={cfg.sliderTipo} onChange={(e) => set('sliderTipo', e.target.value)}>
              <option value="imagem">Imagem</option>
              <option value="html">HTML livre</option>
              <option value="video">Vídeo (.mp4)</option>
              <option value="youtube">YouTube</option>
              <option value="enquete">Enquete</option>
            </select>
          </div>

          {cfg.sliderTipo === 'imagem' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPicker('imagem')}>Selecionar imagem…</button>
                <span className="text-sm text-fg/70">{cfg.sliderImagem ? 'selecionada' : 'nenhuma'}</span>
                {cfg.sliderImagem && <button type="button" className="text-sm text-danger hover:underline" onClick={() => set('sliderImagem', null)}>remover</button>}
              </div>
              {cfg.sliderImagem && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cfg.sliderImagem} alt="" className="h-28 rounded border border-border object-cover" />}
              <div>
                <label className={ui.label}>Link ao clicar (opcional)</label>
                <input className={ui.input} value={cfg.sliderLink ?? ''} onChange={(e) => set('sliderLink', e.target.value)} placeholder="/servicos ou https://…" />
              </div>
            </div>
          )}
          {cfg.sliderTipo === 'html' && (
            <textarea className={`${ui.input} min-h-[140px]`} value={cfg.sliderHtml ?? ''} onChange={(e) => set('sliderHtml', e.target.value)} placeholder="<h3>Destaque</h3><p>…</p>" />
          )}
          {cfg.sliderTipo === 'video' && (
            <div className="flex items-center gap-2">
              <button type="button" className={ui.btnGhost} onClick={() => setPicker('video')}>Selecionar vídeo…</button>
              <span className="text-sm text-fg/70">{cfg.sliderVideo ? 'selecionado' : 'nenhum'}</span>
              {cfg.sliderVideo && <button type="button" className="text-sm text-danger hover:underline" onClick={() => set('sliderVideo', null)}>remover</button>}
            </div>
          )}
          {cfg.sliderTipo === 'youtube' && (
            <input className={ui.input} value={cfg.sliderYoutube ?? ''} onChange={(e) => set('sliderYoutube', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
          )}
          {cfg.sliderTipo === 'enquete' && (
            <div>
              <label className={ui.label}>Enquete</label>
              <select className={ui.input} value={cfg.sliderEnqueteId ?? ''} onChange={(e) => set('sliderEnqueteId', e.target.value || null)}>
                <option value="">Enquete ativa (automática)</option>
                {enquetes.map((e) => <option key={e.id} value={e.id}>{e.pergunta}</option>)}
              </select>
              <p className="mt-1 text-xs text-fg/60">Gerencie as enquetes em <a href="/admin/enquetes" className="text-primary hover:underline">Enquetes</a>.</p>
            </div>
          )}
        </section>
      )}

      {/* Site, SEO e Manutenção */}
      <section className={`${ui.card} space-y-4 p-4`}>
        <h2 className="font-heading font-bold">Site, SEO e Manutenção</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className={ui.label}>Google Analytics (ID GA4)</label>
            <input className={ui.input} value={cfg.googleAnalyticsId ?? ''} onChange={(e) => set('googleAnalyticsId', e.target.value)} placeholder="G-XXXXXXXXXX" />
            <p className="mt-1 text-xs text-fg/60">Deixe vazio para não carregar analytics.</p>
          </div>
          <div>
            <label className={ui.label}>Imagem de compartilhamento (Open Graph)</label>
            <input className={ui.input} value={cfg.ogImageUrl ?? ''} onChange={(e) => set('ogImageUrl', e.target.value)} placeholder="/midia/... ou https://…" />
            <p className="mt-1 text-xs text-fg/60">Usada ao compartilhar o portal em redes sociais. Vazio = usa o logo.</p>
          </div>
        </div>
        <div className="rounded border border-warning/40 bg-warning/5 p-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={cfg.modoManutencao} onChange={(e) => set('modoManutencao', e.target.checked)} />
            Ativar modo manutenção (tira o portal público do ar)
          </label>
          <p className="mt-1 text-xs text-fg/60">O painel administrativo continua acessível. Use para atualizações.</p>
          {cfg.modoManutencao && (
            <textarea className={`${ui.input} mt-2`} rows={2} value={cfg.manutencaoMensagem ?? ''} onChange={(e) => set('manutencaoMensagem', e.target.value)} placeholder="Mensagem exibida ao cidadão durante a manutenção…" />
          )}
        </div>
      </section>

      <div>
        <button className={ui.btn} disabled={salvando} onClick={salvarCfg}>{salvando ? 'Salvando…' : 'Salvar layout'}</button>
      </div>

      <AtalhosManager atalhos={atalhos} onChange={carregar} setErro={setErro} />

      <MediaPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tipo={picker ?? 'imagem'}
        onSelect={(a) => {
          if (picker === 'imagem') set('sliderImagem', a.urlPublica ?? null);
          if (picker === 'video') set('sliderVideo', a.urlPublica ?? null);
          setPicker(null);
        }}
      />
    </div>
  );
}

// --------------------------------------------------------------- atalhos
function AtalhosManager({ atalhos, onChange, setErro }: { atalhos: Atalho[]; onChange: () => void; setErro: (s: string) => void }) {
  const vazio = { label: '', descricao: '', href: '', icone: 'link', ordem: 0, ativo: true };
  const [form, setForm] = useState<{ id?: string } & typeof vazio>({ ...vazio });
  const [salvando, setSalvando] = useState(false);

  function set<K extends keyof typeof vazio>(k: K, v: (typeof vazio)[K]) { setForm((p) => ({ ...p, [k]: v })); }
  function editar(a: Atalho) { setForm({ id: a.id, label: a.label, descricao: a.descricao ?? '', href: a.href, icone: a.icone, ordem: a.ordem, ativo: a.ativo }); }

  async function salvar() {
    if (!form.label.trim() || !form.href.trim()) { setErro('Atalho: informe rótulo e link.'); return; }
    setSalvando(true); setErro('');
    const body = { label: form.label, descricao: form.descricao || undefined, href: form.href, icone: form.icone, ordem: Number(form.ordem) || 0, ativo: form.ativo };
    try {
      if (form.id) await adminPut(`/api/admin/home/atalhos/${form.id}`, body);
      else await adminPost('/api/admin/home/atalhos', body);
      setForm({ ...vazio }); onChange();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar atalho.'); }
    finally { setSalvando(false); }
  }
  async function remover(id: string) {
    if (!confirm('Excluir este atalho?')) return;
    try { await adminDelete(`/api/admin/home/atalhos/${id}`); onChange(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha.'); }
  }

  return (
    <section className={`${ui.card} space-y-4 p-4`}>
      <div>
        <h2 className="font-heading font-bold">Atalhos (cards) do Acesso Rápido</h2>
        <p className="text-xs text-fg/60">Se nenhum atalho for cadastrado, a home usa um conjunto padrão.</p>
      </div>

      {atalhos.length > 0 && (
        <ul className="divide-y divide-border rounded border border-border">
          {atalhos.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span>{a.ativo ? '' : '🚫 '}<strong>{a.label}</strong> <span className="text-fg/50">· {a.href} · {a.icone}</span></span>
              <span className="flex gap-2">
                <button className="text-xs text-primary hover:underline" onClick={() => editar(a)}>editar</button>
                <button className="text-xs text-danger hover:underline" onClick={() => remover(a.id)}>excluir</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">{form.id ? 'Editar atalho' : 'Novo atalho'}</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input className={ui.input} value={form.label} onChange={(e) => set('label', e.target.value)} placeholder="Rótulo *" />
          <input className={ui.input} value={form.href} onChange={(e) => set('href', e.target.value)} placeholder="Link (/transparencia ou https://…) *" />
        </div>
        <input className={ui.input} value={form.descricao} onChange={(e) => set('descricao', e.target.value)} placeholder="Descrição (opcional)" />
        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-3">
          <CampoIcone label="Ícone" valor={form.icone} onChange={(v) => set('icone', v || 'link')} modo="icone" />
          <input className={ui.input} type="number" value={form.ordem} onChange={(e) => set('ordem', Number(e.target.value))} placeholder="Ordem" aria-label="Ordem" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.ativo} onChange={(e) => set('ativo', e.target.checked)} /> Ativo</label>
        </div>
        <div className="flex justify-end gap-2">
          {form.id && <button className={ui.btnGhost} onClick={() => setForm({ ...vazio })}>Cancelar</button>}
          <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : form.id ? 'Salvar atalho' : 'Adicionar atalho'}</button>
        </div>
      </div>
    </section>
  );
}
