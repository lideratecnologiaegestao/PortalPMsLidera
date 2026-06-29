'use client';

/**
 * Editor básico reutilizável: alterna HTML/Markdown, barra de formatação que
 * insere a sintaxe no cursor e pré-visualização ao vivo (via ConteudoRico).
 */
import { useRef } from 'react';
import { ui } from './ui';
import ConteudoRico from '../../../components/portal/ConteudoRico';

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

export default function EditorRico({
  conteudo, formato, onConteudo, onFormato, aba, onAba, rows = 14,
}: {
  conteudo: string;
  formato: string;
  onConteudo: (v: string) => void;
  onFormato: (f: 'html' | 'md') => void;
  aba: 'editar' | 'ver';
  onAba: (a: 'editar' | 'ver') => void;
  rows?: number;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const botoes = formato === 'md' ? BOTOES_MD : BOTOES_HTML;

  function aplicar(b: string, a: string) {
    const ta = taRef.current;
    if (!ta) { onConteudo(conteudo + b + a); return; }
    const start = ta.selectionStart, end = ta.selectionEnd;
    const sel = conteudo.slice(start, end);
    onConteudo(conteudo.slice(0, start) + b + sel + a + conteudo.slice(end));
    requestAnimationFrame(() => { ta.focus(); const pos = start + b.length + sel.length + a.length; ta.setSelectionRange(pos, pos); });
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Formato:</span>
          <div className="inline-flex overflow-hidden rounded border border-border">
            {(['html', 'md'] as const).map((f) => (
              <button key={f} type="button" onClick={() => onFormato(f)}
                className={`px-3 py-1 text-sm ${formato === f ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
                {f === 'html' ? 'HTML' : 'Markdown'}
              </button>
            ))}
          </div>
        </div>
        <div className="inline-flex overflow-hidden rounded border border-border">
          {(['editar', 'ver'] as const).map((t) => (
            <button key={t} type="button" onClick={() => onAba(t)}
              className={`px-3 py-1 text-sm ${aba === t ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
              {t === 'editar' ? 'Editar' : 'Pré-visualizar'}
            </button>
          ))}
        </div>
      </div>

      {aba === 'editar' ? (
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {botoes.map((bt) => (
              <button key={bt.t} type="button" title={bt.t} onClick={() => aplicar(bt.b, bt.a)}
                className="rounded border border-border bg-bg px-2 py-1 text-sm hover:bg-muted">{bt.l}</button>
            ))}
          </div>
          <textarea ref={taRef} rows={rows} className={`${ui.input} font-mono text-sm`} value={conteudo} onChange={(e) => onConteudo(e.target.value)}
            placeholder={formato === 'md' ? '## Título\n\nTexto em **markdown**...' : '<h2>Título</h2>\n<p>Texto em HTML...</p>'} />
          <p className="mt-1 text-xs text-fg/55">
            {formato === 'md' ? 'Markdown: **negrito**, ## títulos, listas com “-”, links [texto](url).' : 'HTML: tags diretas (h2, p, strong, ul/li, a…).'}{' '}
            Selecione um trecho e clique nos botões para formatar.
          </p>
        </div>
      ) : (
        <div className="rounded border border-border p-4">
          {conteudo.trim() ? <ConteudoRico formato={formato} conteudo={conteudo} /> : <p className="text-sm text-fg/50">Nada para pré-visualizar.</p>}
        </div>
      )}
    </div>
  );
}
