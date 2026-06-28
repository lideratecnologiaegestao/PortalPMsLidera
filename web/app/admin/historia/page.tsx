'use client';

/**
 * Admin — História do Município (página institucional singleton).
 * Editor básico: formato HTML ou Markdown, barra de formatação que insere a
 * sintaxe no cursor, e pré-visualização ao vivo. Endpoints:
 *   GET /api/admin/historia-municipio
 *   PUT /api/admin/historia-municipio
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminGet, adminPut, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import ConteudoRico from '../../../components/portal/ConteudoRico';

interface Historia { titulo: string | null; conteudo: string; formato: string; imagemUrl: string | null }

type Botao = { l: string; t: string; b: string; a: string };
const BOTOES_MD: Botao[] = [
  { l: 'N', t: 'Negrito', b: '**', a: '**' },
  { l: 'I', t: 'Itálico', b: '*', a: '*' },
  { l: 'H2', t: 'Título', b: '\n## ', a: '' },
  { l: 'H3', t: 'Subtítulo', b: '\n### ', a: '' },
  { l: '• Lista', t: 'Lista', b: '\n- ', a: '' },
  { l: '🔗 Link', t: 'Link', b: '[', a: '](https://)' },
  { l: '❝ Citação', t: 'Citação', b: '\n> ', a: '' },
];
const BOTOES_HTML: Botao[] = [
  { l: 'N', t: 'Negrito', b: '<strong>', a: '</strong>' },
  { l: 'I', t: 'Itálico', b: '<em>', a: '</em>' },
  { l: 'H2', t: 'Título', b: '<h2>', a: '</h2>' },
  { l: 'H3', t: 'Subtítulo', b: '<h3>', a: '</h3>' },
  { l: '¶', t: 'Parágrafo', b: '<p>', a: '</p>' },
  { l: '• Lista', t: 'Lista', b: '<ul>\n  <li>', a: '</li>\n</ul>' },
  { l: '🔗 Link', t: 'Link', b: '<a href="https://">', a: '</a>' },
  { l: '❝ Citação', t: 'Citação', b: '<blockquote>', a: '</blockquote>' },
];

export default function HistoriaAdminPage() {
  const [form, setForm] = useState<Historia>({ titulo: '', conteudo: '', formato: 'html', imagemUrl: null });
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [aba, setAba] = useState<'editar' | 'ver'>('editar');
  const [picker, setPicker] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const h = await adminGet<Historia>('/api/admin/historia-municipio');
      setForm({ titulo: h.titulo ?? '', conteudo: h.conteudo ?? '', formato: h.formato || 'html', imagemUrl: h.imagemUrl ?? null });
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function s<K extends keyof Historia>(k: K, v: Historia[K]) { setForm((p) => ({ ...p, [k]: v })); }

  /** Insere/embrulha a sintaxe no cursor da textarea. */
  function aplicar(b: string, a: string) {
    const ta = taRef.current;
    if (!ta) { s('conteudo', form.conteudo + b + a); return; }
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = form.conteudo.slice(start, end);
    const novo = form.conteudo.slice(0, start) + b + sel + a + form.conteudo.slice(end);
    s('conteudo', novo);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + b.length + sel.length + a.length;
      ta.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    setSalvando(true); setErro(''); setMsgOk('');
    try {
      await adminPut('/api/admin/historia-municipio', {
        titulo: form.titulo || undefined, conteudo: form.conteudo,
        formato: form.formato, imagemUrl: form.imagemUrl || undefined,
      });
      setMsgOk('História salva. A página pública já reflete a alteração.');
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  const botoes = form.formato === 'md' ? BOTOES_MD : BOTOES_HTML;

  return (
    <div className="space-y-4">
      <AdminHeader title="História do Município" description="Página exibida em “A Prefeitura → História do Município”. Escreva em HTML ou Markdown.">
        <a href="/institucional/historia" target="_blank" rel="noreferrer" className={ui.btnGhost}>Ver página ↗</a>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p className="py-12 text-center text-sm text-fg/60">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={ui.label}>Título da página <span className="text-fg/50">(opcional)</span></label>
            <input className={ui.input} value={form.titulo ?? ''} onChange={(e) => s('titulo', e.target.value)} placeholder="História do Município" />
          </div>

          {/* Imagem de capa */}
          <div>
            <label className={ui.label}>Imagem de capa <span className="text-fg/50">(opcional)</span></label>
            <div className="mt-1 flex gap-2">
              <input type="url" className={`flex-1 ${ui.input}`} value={form.imagemUrl ?? ''} onChange={(e) => s('imagemUrl', e.target.value)} placeholder="https://..." />
              <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>Escolher imagem</button>
              {form.imagemUrl && <button type="button" className={ui.btnGhost} onClick={() => s('imagemUrl', null)}>Remover</button>}
            </div>
          </div>

          {/* Formato + abas */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Formato:</span>
              <div className="inline-flex overflow-hidden rounded border border-border">
                {(['html', 'md'] as const).map((f) => (
                  <button key={f} type="button" onClick={() => s('formato', f)}
                    className={`px-3 py-1 text-sm ${form.formato === f ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
                    {f === 'html' ? 'HTML' : 'Markdown'}
                  </button>
                ))}
              </div>
            </div>
            <div className="inline-flex overflow-hidden rounded border border-border">
              {(['editar', 'ver'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setAba(t)}
                  className={`px-3 py-1 text-sm ${aba === t ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
                  {t === 'editar' ? 'Editar' : 'Pré-visualizar'}
                </button>
              ))}
            </div>
          </div>

          {aba === 'editar' ? (
            <div>
              {/* Barra de formatação */}
              <div className="mb-2 flex flex-wrap gap-1">
                {botoes.map((bt) => (
                  <button key={bt.t} type="button" title={bt.t} onClick={() => aplicar(bt.b, bt.a)}
                    className="rounded border border-border bg-bg px-2 py-1 text-sm hover:bg-muted">
                    {bt.l}
                  </button>
                ))}
              </div>
              <textarea
                ref={taRef}
                rows={18}
                className={`${ui.input} font-mono text-sm`}
                value={form.conteudo}
                onChange={(e) => s('conteudo', e.target.value)}
                placeholder={form.formato === 'md'
                  ? '## A origem do município\n\nO município foi fundado em **1850**...\n\n- Marco 1\n- Marco 2'
                  : '<h2>A origem do município</h2>\n<p>O município foi fundado em <strong>1850</strong>...</p>'}
              />
              <p className="mt-1 text-xs text-fg/55">
                {form.formato === 'md'
                  ? 'Markdown: **negrito**, *itálico*, ## títulos, listas com “-”, links [texto](url). Tabelas GFM suportadas.'
                  : 'HTML: use as tags diretamente (h2, p, strong, ul/li, a, blockquote, img…).'}
                {' '}Selecione um trecho e clique nos botões para formatar.
              </p>
            </div>
          ) : (
            <div className="rounded border border-border p-4">
              {form.conteudo.trim()
                ? <ConteudoRico formato={form.formato} conteudo={form.conteudo} />
                : <p className="text-sm text-fg/50">Nada para pré-visualizar ainda.</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={ui.btn} onClick={salvar} disabled={salvando} aria-busy={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      )}

      <MediaPicker open={picker} onClose={() => setPicker(false)} tipo="imagem" onSelect={(a) => { if (a.urlPublica) s('imagemUrl', a.urlPublica); setPicker(false); }} />
    </div>
  );
}
