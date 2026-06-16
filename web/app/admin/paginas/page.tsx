'use client';

import { useCallback, useEffect, useId, useRef, useState, type DragEvent } from 'react';
import {
  AdminApiError,
  Pagina,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import { sanitizeHtml } from '../../../lib/sanitize-html';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface PaginaCMS {
  id: string;
  slug: string;
  titulo: string;
  publicado: boolean;
  atualizadoEm: string;
  seo?: Record<string, unknown>;
}

interface Bloco {
  id: string;
  tipo: string;
  conteudo: Record<string, unknown>;
  ordem: number;
  visivel: boolean;
}

interface PaginaCMSCompleta extends PaginaCMS {
  blocks: Bloco[];
}

interface TemplateItem {
  id: string;
  nome: string;
  descricao?: string;
}

interface Snapshot {
  id: string;
  titulo: string;
  motivo?: string;
  criadoEm: string;
}

// ---------------------------------------------------------------------------
// Tipos de blocos suportados
// ---------------------------------------------------------------------------

const TIPOS_BLOCO = [
  'hero',
  'texto',
  'servicos',
  'galeria',
  'html',
  'botao',
  'cards',
  'tabela',
  'imagem',
  'divisor',
  'slider',
] as const;

type TipoBloco = (typeof TIPOS_BLOCO)[number];

const TIPO_LABEL: Record<string, string> = {
  hero: 'Hero (destaque)',
  texto: 'Texto',
  servicos: 'Serviços (links)',
  galeria: 'Galeria',
  html: 'HTML livre',
  botao: 'Botão (CTA)',
  cards: 'Cards',
  tabela: 'Tabela',
  imagem: 'Imagem',
  divisor: 'Divisor',
  slider: 'Slider (carrossel)',
};

const TIPO_ICONE: Record<string, string> = {
  hero: '★',
  texto: 'T',
  servicos: '⊞',
  galeria: '▦',
  html: '</>',
  botao: '⬡',
  cards: '▤',
  tabela: '⊟',
  imagem: '▣',
  divisor: '─',
  slider: '▷',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function blocoVazio(tipo: TipoBloco, ordem: number): Omit<Bloco, 'id'> {
  const conteudoInicial: Record<TipoBloco, Record<string, unknown>> = {
    hero: { titulo: 'Novo destaque', subtitulo: '', cta: { label: 'Saiba mais', href: '#' } },
    texto: { titulo: '', corpo: '' },
    servicos: { titulo: 'Serviços', itens: [] },
    galeria: { imagens: [] },
    html: { html: '' },
    botao: { label: 'Saiba mais', href: '#', estilo: 'primario' },
    cards: { titulo: '', itens: [] },
    tabela: { titulo: '', cabecalhos: ['Coluna 1', 'Coluna 2'], linhas: [['', '']] },
    imagem: { url: '', alt: '', legenda: '' },
    divisor: {},
    slider: { slides: [], autoplay: false, intervalo: 5 },
  };
  return {
    tipo,
    conteudo: conteudoInicial[tipo],
    ordem,
    visivel: true,
  };
}

// ---------------------------------------------------------------------------
// Formulários por tipo de bloco
// ---------------------------------------------------------------------------

function FormHero({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const cta = (conteudo.cta as Record<string, unknown>) ?? {};

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-titulo`} className={ui.label}>Título</label>
        <input
          id={`${idBase}-titulo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.titulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, titulo: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-sub`} className={ui.label}>Subtítulo</label>
        <input
          id={`${idBase}-sub`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.subtitulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, subtitulo: e.target.value })}
        />
      </div>
      <fieldset className="rounded border border-border p-3 space-y-2">
        <legend className={ui.label}>CTA (botão)</legend>
        <div>
          <label htmlFor={`${idBase}-cta-label`} className="text-xs font-semibold">Texto do botão</label>
          <input
            id={`${idBase}-cta-label`}
            className={`${ui.input} mt-1`}
            value={String(cta.label ?? '')}
            onChange={(e) => onChange({ ...conteudo, cta: { ...cta, label: e.target.value } })}
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-cta-href`} className="text-xs font-semibold">URL do botão</label>
          <input
            id={`${idBase}-cta-href`}
            className={`${ui.input} mt-1`}
            placeholder="/pagina ou https://..."
            value={String(cta.href ?? '')}
            onChange={(e) => onChange({ ...conteudo, cta: { ...cta, href: e.target.value } })}
          />
        </div>
      </fieldset>
    </div>
  );
}

function FormTexto({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-titulo`} className={ui.label}>Título (opcional)</label>
        <input
          id={`${idBase}-titulo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.titulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, titulo: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-corpo`} className={ui.label}>Corpo do texto</label>
        <textarea
          id={`${idBase}-corpo`}
          className={`${ui.input} mt-1 min-h-[120px] resize-y`}
          value={String(conteudo.corpo ?? '')}
          onChange={(e) => onChange({ ...conteudo, corpo: e.target.value })}
        />
      </div>
    </div>
  );
}

function FormServicos({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const itens = Array.isArray(conteudo.itens)
    ? (conteudo.itens as Record<string, unknown>[])
    : [];

  function setItem(idx: number, k: string, v: string) {
    const next = itens.map((it, i) => (i === idx ? { ...it, [k]: v } : it));
    onChange({ ...conteudo, itens: next });
  }

  function addItem() {
    onChange({ ...conteudo, itens: [...itens, { label: '', href: '' }] });
  }

  function removeItem(idx: number) {
    onChange({ ...conteudo, itens: itens.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-titulo`} className={ui.label}>Título da seção</label>
        <input
          id={`${idBase}-titulo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.titulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, titulo: e.target.value })}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className={ui.label}>Itens de serviço</legend>
        {itens.map((it, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <input
              className={`${ui.input} flex-1`}
              placeholder="Rótulo"
              value={String(it.label ?? '')}
              onChange={(e) => setItem(idx, 'label', e.target.value)}
              aria-label={`Item ${idx + 1} — rótulo`}
            />
            <input
              className={`${ui.input} flex-1`}
              placeholder="URL"
              value={String(it.href ?? '')}
              onChange={(e) => setItem(idx, 'href', e.target.value)}
              aria-label={`Item ${idx + 1} — URL`}
            />
            <button
              type="button"
              className={ui.btnDanger}
              onClick={() => removeItem(idx)}
              aria-label={`Remover item ${idx + 1}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" className={ui.btnGhost} onClick={addItem}>
          + Adicionar item
        </button>
      </fieldset>
    </div>
  );
}

function FormGaleria({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const imagens = Array.isArray(conteudo.imagens)
    ? (conteudo.imagens as Record<string, unknown>[])
    : [];

  function setImg(idx: number, k: string, v: string) {
    const next = imagens.map((img, i) => (i === idx ? { ...img, [k]: v } : img));
    onChange({ ...conteudo, imagens: next });
  }

  function addImg() {
    onChange({ ...conteudo, imagens: [...imagens, { url: '', alt: '' }] });
  }

  function removeImg(idx: number) {
    onChange({ ...conteudo, imagens: imagens.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <fieldset className="space-y-2">
        <legend className={ui.label}>Imagens da galeria</legend>
        {imagens.map((img, idx) => (
          <div key={idx} className="rounded border border-border p-2 space-y-2">
            <div className="flex gap-2 items-center">
              <span className="text-xs text-fg/50 w-6">{idx + 1}</span>
              <div className="flex-1 space-y-1">
                <input
                  id={`${idBase}-url-${idx}`}
                  className={ui.input}
                  placeholder="URL da imagem"
                  value={String(img.url ?? '')}
                  onChange={(e) => setImg(idx, 'url', e.target.value)}
                  aria-label={`Imagem ${idx + 1} — URL`}
                />
                <input
                  className={ui.input}
                  placeholder="Texto alternativo (acessibilidade)"
                  value={String(img.alt ?? '')}
                  onChange={(e) => setImg(idx, 'alt', e.target.value)}
                  aria-label={`Imagem ${idx + 1} — texto alternativo`}
                />
              </div>
              <button
                type="button"
                className={ui.btnDanger}
                onClick={() => removeImg(idx)}
                aria-label={`Remover imagem ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <button type="button" className={ui.btnGhost} onClick={addImg}>
          + Adicionar imagem
        </button>
      </fieldset>
    </div>
  );
}

function FormHtml({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  return (
    <div className="space-y-2">
      <div className="rounded border border-warning/40 bg-warning/5 p-2 text-xs text-fg/70">
        <strong>Atenção:</strong> apenas HTML seguro é renderizado publicamente — a API remove
        scripts, eventos inline e outros vetores de XSS antes de salvar.
      </div>
      <div>
        <label htmlFor={`${idBase}-html`} className={ui.label}>
          Conteúdo HTML
        </label>
        <textarea
          id={`${idBase}-html`}
          className={`${ui.input} mt-1 min-h-[200px] resize-y font-mono text-xs`}
          value={String(conteudo.html ?? '')}
          onChange={(e) => onChange({ ...conteudo, html: e.target.value })}
          spellCheck={false}
          aria-describedby={`${idBase}-html-hint`}
        />
        <p id={`${idBase}-html-hint`} className="mt-1 text-xs text-fg/50">
          Tags como &lt;p&gt;, &lt;h2&gt;, &lt;ul&gt;, &lt;strong&gt;, &lt;a&gt; são suportadas.
          Scripts e eventos são bloqueados pelo servidor.
        </p>
      </div>
    </div>
  );
}

function FormBotao({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-label`} className={ui.label}>Texto do botão</label>
        <input
          id={`${idBase}-label`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.label ?? '')}
          onChange={(e) => onChange({ ...conteudo, label: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-href`} className={ui.label}>URL de destino</label>
        <input
          id={`${idBase}-href`}
          className={`${ui.input} mt-1`}
          placeholder="/pagina ou https://..."
          value={String(conteudo.href ?? '')}
          onChange={(e) => onChange({ ...conteudo, href: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-estilo`} className={ui.label}>Estilo</label>
        <select
          id={`${idBase}-estilo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.estilo ?? 'primario')}
          onChange={(e) => onChange({ ...conteudo, estilo: e.target.value })}
        >
          <option value="primario">Primário (sólido)</option>
          <option value="secundario">Secundário (contorno)</option>
        </select>
      </div>
    </div>
  );
}

function FormCards({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const itens = Array.isArray(conteudo.itens)
    ? (conteudo.itens as Record<string, unknown>[])
    : [];

  function setCard(idx: number, k: string, v: string) {
    const next = itens.map((it, i) => (i === idx ? { ...it, [k]: v } : it));
    onChange({ ...conteudo, itens: next });
  }

  function addCard() {
    onChange({
      ...conteudo,
      itens: [...itens, { titulo: '', texto: '', href: '', icone: '' }],
    });
  }

  function removeCard(idx: number) {
    onChange({ ...conteudo, itens: itens.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-titulo`} className={ui.label}>Título da seção (opcional)</label>
        <input
          id={`${idBase}-titulo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.titulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, titulo: e.target.value })}
        />
      </div>
      <fieldset className="space-y-3">
        <legend className={ui.label}>Cards</legend>
        {itens.map((card, idx) => (
          <div key={idx} className="rounded border border-border p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-fg/60">Card {idx + 1}</span>
              <button
                type="button"
                className={ui.btnDanger}
                onClick={() => removeCard(idx)}
                aria-label={`Remover card ${idx + 1}`}
              >
                ✕
              </button>
            </div>
            <input
              className={ui.input}
              placeholder="Ícone (emoji ou texto, opcional)"
              value={String(card.icone ?? '')}
              onChange={(e) => setCard(idx, 'icone', e.target.value)}
              aria-label={`Card ${idx + 1} — ícone`}
            />
            <input
              className={ui.input}
              placeholder="Título do card"
              value={String(card.titulo ?? '')}
              onChange={(e) => setCard(idx, 'titulo', e.target.value)}
              aria-label={`Card ${idx + 1} — título`}
            />
            <textarea
              className={`${ui.input} min-h-[60px] resize-y`}
              placeholder="Texto do card"
              value={String(card.texto ?? '')}
              onChange={(e) => setCard(idx, 'texto', e.target.value)}
              aria-label={`Card ${idx + 1} — texto`}
            />
            <input
              className={ui.input}
              placeholder="URL (opcional)"
              value={String(card.href ?? '')}
              onChange={(e) => setCard(idx, 'href', e.target.value)}
              aria-label={`Card ${idx + 1} — URL`}
            />
          </div>
        ))}
        <button type="button" className={ui.btnGhost} onClick={addCard}>
          + Adicionar card
        </button>
      </fieldset>
    </div>
  );
}

function FormTabela({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const cabecalhos = Array.isArray(conteudo.cabecalhos)
    ? (conteudo.cabecalhos as unknown[]).map(String)
    : [''];
  const linhas = Array.isArray(conteudo.linhas)
    ? (conteudo.linhas as unknown[][]).map((l) =>
        Array.isArray(l) ? l.map(String) : [''],
      )
    : [['']];

  function setCabecalho(idx: number, v: string) {
    const next = cabecalhos.map((h, i) => (i === idx ? v : h));
    onChange({ ...conteudo, cabecalhos: next });
  }

  function addColuna() {
    const nextCab = [...cabecalhos, `Coluna ${cabecalhos.length + 1}`];
    const nextLinhas = linhas.map((l) => [...l, '']);
    onChange({ ...conteudo, cabecalhos: nextCab, linhas: nextLinhas });
  }

  function removeColuna(ci: number) {
    const nextCab = cabecalhos.filter((_, i) => i !== ci);
    const nextLinhas = linhas.map((l) => l.filter((_, i) => i !== ci));
    onChange({ ...conteudo, cabecalhos: nextCab, linhas: nextLinhas });
  }

  function setCell(ri: number, ci: number, v: string) {
    const nextLinhas = linhas.map((l, r) =>
      r === ri ? l.map((c, ci2) => (ci2 === ci ? v : c)) : l,
    );
    onChange({ ...conteudo, linhas: nextLinhas });
  }

  function addLinha() {
    const novaLinha = cabecalhos.map(() => '');
    onChange({ ...conteudo, linhas: [...linhas, novaLinha] });
  }

  function removeLinha(ri: number) {
    onChange({ ...conteudo, linhas: linhas.filter((_, i) => i !== ri) });
  }

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-titulo`} className={ui.label}>Título da tabela (opcional)</label>
        <input
          id={`${idBase}-titulo`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.titulo ?? '')}
          onChange={(e) => onChange({ ...conteudo, titulo: e.target.value })}
        />
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={ui.label}>Cabeçalhos</span>
          <button type="button" className={ui.btnGhost} onClick={addColuna}>
            + Coluna
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          {cabecalhos.map((h, ci) => (
            <div key={ci} className="flex items-center gap-1">
              <input
                className={`${ui.input} w-32`}
                value={h}
                onChange={(e) => setCabecalho(ci, e.target.value)}
                aria-label={`Cabeçalho coluna ${ci + 1}`}
              />
              {cabecalhos.length > 1 && (
                <button
                  type="button"
                  className="rounded p-1 text-danger hover:bg-danger/10 text-xs"
                  onClick={() => removeColuna(ci)}
                  aria-label={`Remover coluna ${ci + 1}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className={ui.label}>Linhas</span>
          <button type="button" className={ui.btnGhost} onClick={addLinha}>
            + Linha
          </button>
        </div>
        <div className="space-y-2 overflow-x-auto">
          {linhas.map((linha, ri) => (
            <div key={ri} className="flex items-center gap-1">
              <span className="text-xs text-fg/40 w-5">{ri + 1}</span>
              {linha.map((cel, ci) => (
                <input
                  key={ci}
                  className={`${ui.input} w-28`}
                  value={cel}
                  onChange={(e) => setCell(ri, ci, e.target.value)}
                  aria-label={`Linha ${ri + 1}, coluna ${ci + 1}`}
                />
              ))}
              <button
                type="button"
                className="rounded p-1 text-danger hover:bg-danger/10 text-xs"
                onClick={() => removeLinha(ri)}
                aria-label={`Remover linha ${ri + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FormImagem({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idBase}-url`} className={ui.label}>URL da imagem</label>
        <input
          id={`${idBase}-url`}
          className={`${ui.input} mt-1`}
          placeholder="https://..."
          value={String(conteudo.url ?? '')}
          onChange={(e) => onChange({ ...conteudo, url: e.target.value })}
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-alt`} className={ui.label}>
          Texto alternativo <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${idBase}-alt`}
          className={`${ui.input} mt-1`}
          placeholder="Descreva a imagem para acessibilidade"
          value={String(conteudo.alt ?? '')}
          onChange={(e) => onChange({ ...conteudo, alt: e.target.value })}
          required
          aria-required="true"
        />
      </div>
      <div>
        <label htmlFor={`${idBase}-legenda`} className={ui.label}>Legenda (opcional)</label>
        <input
          id={`${idBase}-legenda`}
          className={`${ui.input} mt-1`}
          value={String(conteudo.legenda ?? '')}
          onChange={(e) => onChange({ ...conteudo, legenda: e.target.value })}
        />
      </div>
    </div>
  );
}

function FormDivisor() {
  return (
    <p className="text-sm text-fg/50">Este bloco não possui propriedades editáveis.</p>
  );
}

// ---------------------------------------------------------------------------
// Formulário do bloco Slider
// ---------------------------------------------------------------------------

interface SlideItem {
  url: string;
  alt: string;
  legenda: string;
  href: string;
}

function FormSlider({
  conteudo,
  onChange,
}: {
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const slides = Array.isArray(conteudo.slides)
    ? (conteudo.slides as Record<string, unknown>[]).map((s) => ({
        url: String(s.url ?? ''),
        alt: String(s.alt ?? ''),
        legenda: String(s.legenda ?? ''),
        href: String(s.href ?? ''),
      }))
    : ([] as SlideItem[]);

  const autoplay = Boolean(conteudo.autoplay);
  const intervalo = typeof conteudo.intervalo === 'number' ? conteudo.intervalo : 5;

  function setSlide(idx: number, k: keyof SlideItem, v: string) {
    const next = slides.map((s, i) => (i === idx ? { ...s, [k]: v } : s));
    onChange({ ...conteudo, slides: next });
  }

  function addSlide() {
    onChange({ ...conteudo, slides: [...slides, { url: '', alt: '', legenda: '', href: '' }] });
  }

  function removeSlide(idx: number) {
    onChange({ ...conteudo, slides: slides.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-4">
      {/* Opcoes gerais */}
      <fieldset className="rounded border border-border p-3 space-y-3">
        <legend className={ui.label}>Configuracoes</legend>
        <div className="flex items-center gap-2">
          <input
            id={`${idBase}-autoplay`}
            type="checkbox"
            checked={autoplay}
            onChange={(e) => onChange({ ...conteudo, autoplay: e.target.checked })}
            className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
          />
          <label htmlFor={`${idBase}-autoplay`} className="text-sm">
            Autoplay (avanco automatico)
          </label>
        </div>
        {autoplay && (
          <div>
            <label htmlFor={`${idBase}-intervalo`} className={ui.label}>
              Intervalo (segundos)
            </label>
            <input
              id={`${idBase}-intervalo`}
              type="number"
              min={1}
              max={30}
              className={`${ui.input} mt-1 w-24`}
              value={intervalo}
              onChange={(e) =>
                onChange({ ...conteudo, intervalo: Math.max(1, Number(e.target.value)) })
              }
            />
            <p className="mt-1 text-xs text-fg/50">
              Autoplay e desativado automaticamente quando o usuario prefere movimento reduzido.
            </p>
          </div>
        )}
      </fieldset>

      {/* Lista de slides */}
      <fieldset className="space-y-3">
        <legend className={ui.label}>Slides ({slides.length})</legend>
        {slides.map((slide, idx) => (
          <div key={idx} className="rounded border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-fg/60">Slide {idx + 1}</span>
              <button
                type="button"
                className={ui.btnDanger}
                onClick={() => removeSlide(idx)}
                aria-label={`Remover slide ${idx + 1}`}
              >
                ✕
              </button>
            </div>
            <div>
              <label htmlFor={`${idBase}-url-${idx}`} className="text-xs font-semibold">
                URL da imagem <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${idBase}-url-${idx}`}
                className={`${ui.input} mt-1`}
                placeholder="https://... ou /caminho/imagem.jpg"
                value={slide.url}
                onChange={(e) => setSlide(idx, 'url', e.target.value)}
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-alt-${idx}`} className="text-xs font-semibold">
                Texto alternativo (acessibilidade) <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${idBase}-alt-${idx}`}
                className={`${ui.input} mt-1`}
                placeholder="Descreva a imagem"
                value={slide.alt}
                onChange={(e) => setSlide(idx, 'alt', e.target.value)}
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-legenda-${idx}`} className="text-xs font-semibold">
                Legenda (opcional)
              </label>
              <input
                id={`${idBase}-legenda-${idx}`}
                className={`${ui.input} mt-1`}
                placeholder="Texto exibido sobre a imagem"
                value={slide.legenda}
                onChange={(e) => setSlide(idx, 'legenda', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-href-${idx}`} className="text-xs font-semibold">
                Link ao clicar (opcional)
              </label>
              <input
                id={`${idBase}-href-${idx}`}
                className={`${ui.input} mt-1`}
                placeholder="/pagina ou https://..."
                value={slide.href}
                onChange={(e) => setSlide(idx, 'href', e.target.value)}
              />
            </div>
            {/* Mini-preview da imagem */}
            {slide.url && (
              <div className="mt-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={slide.url}
                  alt={slide.alt || `Preview slide ${idx + 1}`}
                  className="h-20 w-full rounded border border-border object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
            )}
          </div>
        ))}
        <button type="button" className={ui.btnGhost} onClick={addSlide}>
          + Adicionar slide
        </button>
      </fieldset>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Seletor de formulário por tipo
// ---------------------------------------------------------------------------

function FormBloco({
  tipo,
  conteudo,
  onChange,
}: {
  tipo: string;
  conteudo: Record<string, unknown>;
  onChange: (c: Record<string, unknown>) => void;
}) {
  switch (tipo as TipoBloco) {
    case 'hero':
      return <FormHero conteudo={conteudo} onChange={onChange} />;
    case 'texto':
      return <FormTexto conteudo={conteudo} onChange={onChange} />;
    case 'servicos':
      return <FormServicos conteudo={conteudo} onChange={onChange} />;
    case 'galeria':
      return <FormGaleria conteudo={conteudo} onChange={onChange} />;
    case 'html':
      return <FormHtml conteudo={conteudo} onChange={onChange} />;
    case 'botao':
      return <FormBotao conteudo={conteudo} onChange={onChange} />;
    case 'cards':
      return <FormCards conteudo={conteudo} onChange={onChange} />;
    case 'tabela':
      return <FormTabela conteudo={conteudo} onChange={onChange} />;
    case 'imagem':
      return <FormImagem conteudo={conteudo} onChange={onChange} />;
    case 'divisor':
      return <FormDivisor />;
    case 'slider':
      return <FormSlider conteudo={conteudo} onChange={onChange} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Preview de bloco (admin-side, HTML sanitizado localmente)
// ---------------------------------------------------------------------------

function PreviewBloco({ bloco }: { bloco: Bloco }) {
  const c = bloco.conteudo ?? {};

  switch (bloco.tipo) {
    case 'hero':
      return (
        <div className="rounded bg-primary p-6 text-primary-fg">
          <p className="font-heading text-2xl font-bold">{String(c.titulo ?? '')}</p>
          {c.subtitulo ? <p className="mt-1 text-base">{String(c.subtitulo)}</p> : null}
          {(c.cta as Record<string, unknown>)?.label ? (
            <span className="mt-3 inline-block rounded bg-primary-fg px-3 py-1.5 text-sm font-semibold text-primary">
              {String((c.cta as Record<string, unknown>).label)}
            </span>
          ) : null}
        </div>
      );

    case 'texto':
      return (
        <div className="prose max-w-none text-sm">
          {c.titulo ? <p className="font-bold">{String(c.titulo)}</p> : null}
          <p className="text-fg/70 line-clamp-3">{String(c.corpo ?? '')}</p>
        </div>
      );

    case 'servicos': {
      const itens = Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : [];
      return (
        <div>
          {c.titulo ? <p className="font-semibold text-sm mb-1">{String(c.titulo)}</p> : null}
          <div className="flex flex-wrap gap-1">
            {itens.slice(0, 4).map((it, i) => (
              <span key={i} className="rounded border border-primary px-2 py-0.5 text-xs">
                {String(it.label ?? '')}
              </span>
            ))}
            {itens.length > 4 && (
              <span className="text-xs text-fg/50">+{itens.length - 4} mais</span>
            )}
          </div>
        </div>
      );
    }

    case 'galeria': {
      const imgs = Array.isArray(c.imagens) ? (c.imagens as Record<string, unknown>[]) : [];
      return (
        <div className="flex gap-1">
          {imgs.slice(0, 3).map((img, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={String(img.url ?? '')}
              alt={String(img.alt ?? '')}
              className="h-12 w-16 rounded object-cover border border-border"
            />
          ))}
          {imgs.length > 3 && (
            <span className="flex items-center text-xs text-fg/50">+{imgs.length - 3}</span>
          )}
          {imgs.length === 0 && (
            <span className="text-xs text-fg/40">Nenhuma imagem</span>
          )}
        </div>
      );
    }

    case 'html': {
      const html = String(c.html ?? '');
      return (
        <div
          className="prose max-w-none text-sm line-clamp-3 text-fg/70"
          // Preview usa sanitização local (não confia no input ainda não salvo)
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
        />
      );
    }

    case 'botao':
      return (
        <span
          className={
            String(c.estilo ?? 'primario') === 'secundario'
              ? 'inline-block rounded border-2 border-primary px-3 py-1 text-sm text-primary'
              : 'inline-block rounded bg-primary px-3 py-1 text-sm text-primary-fg'
          }
        >
          {String(c.label ?? 'Botão')}
        </span>
      );

    case 'cards': {
      const cards = Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : [];
      return (
        <div>
          {c.titulo ? <p className="font-semibold text-sm mb-1">{String(c.titulo)}</p> : null}
          <div className="flex gap-1 flex-wrap">
            {cards.slice(0, 3).map((card, i) => (
              <span key={i} className="rounded border border-border px-2 py-0.5 text-xs">
                {String(card.titulo ?? `Card ${i + 1}`)}
              </span>
            ))}
            {cards.length > 3 && (
              <span className="text-xs text-fg/50">+{cards.length - 3} mais</span>
            )}
          </div>
        </div>
      );
    }

    case 'tabela': {
      const cabs = Array.isArray(c.cabecalhos) ? (c.cabecalhos as unknown[]).map(String) : [];
      const linhas = Array.isArray(c.linhas) ? c.linhas : [];
      return (
        <div className="text-xs text-fg/70">
          <span className="font-semibold">{cabs.join(' | ')}</span>
          {(linhas as unknown[]).length > 0 && (
            <span className="ml-1">— {(linhas as unknown[]).length} linha(s)</span>
          )}
        </div>
      );
    }

    case 'imagem':
      return (
        <div className="flex items-center gap-2">
          {c.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={String(c.url)}
              alt={String(c.alt ?? '')}
              className="h-12 w-20 rounded object-cover border border-border"
            />
          ) : (
            <div className="h-12 w-20 rounded border border-border bg-muted flex items-center justify-center text-xs text-fg/40">
              Sem URL
            </div>
          )}
          {c.legenda ? (
            <span className="text-xs text-fg/60">{String(c.legenda)}</span>
          ) : null}
        </div>
      );

    case 'divisor':
      return <hr className="border-border" />;

    case 'slider': {
      const sliderSlides = Array.isArray(c.slides)
        ? (c.slides as Record<string, unknown>[])
        : [];
      const primeiroSlide = sliderSlides[0];
      return (
        <div className="flex items-center gap-2">
          {primeiroSlide && String((primeiroSlide as Record<string, unknown>).url ?? '') ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={String((primeiroSlide as Record<string, unknown>).url)}
              alt={String((primeiroSlide as Record<string, unknown>).alt ?? '')}
              className="h-12 w-20 rounded border border-border object-cover"
            />
          ) : (
            <div className="h-12 w-20 rounded border border-border bg-muted flex items-center justify-center text-xs text-fg/40">
              ▷
            </div>
          )}
          <span className="text-xs text-fg/70">
            {sliderSlides.length} slide{sliderSlides.length !== 1 ? 's' : ''}
            {c.autoplay ? ' · autoplay' : ''}
          </span>
        </div>
      );
    }

    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Item do canvas (bloco arrastável)
// ---------------------------------------------------------------------------

function ItemCanvas({
  bloco,
  idx,
  total,
  selecionado,
  onSelecionar,
  onMover,
  onExcluir,
  onToggleVisivel,
  onDragStart,
  onDragOver,
  onDrop,
  dragOver,
}: {
  bloco: Bloco;
  idx: number;
  total: number;
  selecionado: boolean;
  onSelecionar: () => void;
  onMover: (de: number, para: number) => void;
  onExcluir: () => void;
  onToggleVisivel: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, idx: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, idx: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, idx: number) => void;
  dragOver: boolean;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, idx)}
      onDragOver={(e) => onDragOver(e, idx)}
      onDrop={(e) => onDrop(e, idx)}
      className={[
        'group relative rounded border transition-all cursor-grab active:cursor-grabbing',
        selecionado ? 'border-primary shadow-sm' : 'border-border hover:border-primary/40',
        !bloco.visivel ? 'opacity-50' : '',
        dragOver ? 'ring-2 ring-primary ring-offset-1' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="listitem"
    >
      <div className="flex items-start gap-2 p-2">
        {/* Handle */}
        <span
          className="mt-1 text-fg/30 group-hover:text-fg/60 select-none shrink-0"
          aria-hidden="true"
          title="Arraste para reordenar"
        >
          ⠿
        </span>

        {/* Tipo badge */}
        <span className="mt-1 shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-fg/60">
          {TIPO_ICONE[bloco.tipo] ?? bloco.tipo}
        </span>

        {/* Preview + selecionar */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left"
          onClick={onSelecionar}
          aria-pressed={selecionado}
          aria-label={`${selecionado ? 'Recolher' : 'Editar'} bloco ${TIPO_LABEL[bloco.tipo]}`}
        >
          <div className="flex items-center gap-1 mb-1">
            <span className="text-xs font-semibold text-fg/80">{TIPO_LABEL[bloco.tipo]}</span>
            {!bloco.visivel && (
              <span className="text-xs text-fg/40">(oculto)</span>
            )}
          </div>
          <div className="overflow-hidden">
            <PreviewBloco bloco={bloco} />
          </div>
        </button>

        {/* Ações acessíveis */}
        <div className="flex flex-col gap-1 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => onMover(idx, idx - 1)}
            className="rounded p-0.5 text-fg/50 hover:bg-muted disabled:opacity-30 text-xs"
            aria-label={`Mover bloco ${TIPO_LABEL[bloco.tipo]} para cima`}
            title="Mover para cima"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={idx === total - 1}
            onClick={() => onMover(idx, idx + 1)}
            className="rounded p-0.5 text-fg/50 hover:bg-muted disabled:opacity-30 text-xs"
            aria-label={`Mover bloco ${TIPO_LABEL[bloco.tipo]} para baixo`}
            title="Mover para baixo"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onToggleVisivel}
            className="rounded p-0.5 text-fg/50 hover:bg-muted text-xs"
            aria-label={bloco.visivel ? 'Ocultar bloco' : 'Mostrar bloco'}
            title={bloco.visivel ? 'Ocultar' : 'Mostrar'}
          >
            {bloco.visivel ? '○' : '●'}
          </button>
          <button
            type="button"
            onClick={onExcluir}
            className="rounded p-0.5 text-danger hover:bg-danger/10 text-xs"
            aria-label={`Excluir bloco ${TIPO_LABEL[bloco.tipo]}`}
            title="Excluir"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de propriedades (editor estruturado do bloco selecionado)
// ---------------------------------------------------------------------------

function PainelPropriedades({
  bloco,
  salvando,
  onConteudoChange,
  onSalvar,
  onFechar,
}: {
  bloco: Bloco;
  salvando: boolean;
  onConteudoChange: (c: Record<string, unknown>) => void;
  onSalvar: () => void;
  onFechar: () => void;
}) {
  return (
    <aside
      className="flex flex-col gap-3 overflow-y-auto rounded border border-border bg-bg p-4"
      aria-label={`Propriedades do bloco ${TIPO_LABEL[bloco.tipo]}`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">{TIPO_LABEL[bloco.tipo]}</h3>
        <button
          type="button"
          onClick={onFechar}
          className="rounded p-1 text-fg/50 hover:bg-muted"
          aria-label="Fechar painel de propriedades"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <FormBloco
          tipo={bloco.tipo}
          conteudo={bloco.conteudo}
          onChange={onConteudoChange}
        />
      </div>

      <button
        type="button"
        onClick={onSalvar}
        disabled={salvando}
        className={`${ui.btn} w-full justify-center`}
      >
        {salvando ? 'Salvando…' : 'Salvar bloco'}
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Painel SEO
// ---------------------------------------------------------------------------

function PainelSeo({
  paginaId,
  seo,
  onSalvo,
}: {
  paginaId: string;
  seo: Record<string, unknown>;
  onSalvo: (seo: Record<string, unknown>) => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState({
    title: String(seo.title ?? ''),
    description: String(seo.description ?? ''),
    ogImage: String(seo.ogImage ?? ''),
    keywords: String(seo.keywords ?? ''),
  });
  const [salvando, setSalvando] = useState(false);
  const [msgOk, setMsgOk] = useState('');
  const [erro, setErro] = useState('');

  async function salvar() {
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      const seoAtualizado = {
        title: form.title.trim() || undefined,
        description: form.description.trim() || undefined,
        ogImage: form.ogImage.trim() || undefined,
        keywords: form.keywords.trim() || undefined,
      };
      await adminPut(`/api/pages/${paginaId}`, { seo: seoAtualizado });
      setMsgOk('SEO salvo com sucesso.');
      onSalvo(seoAtualizado);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar SEO.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div>
        <label htmlFor={`${idBase}-title`} className={ui.label}>
          Title (meta title)
        </label>
        <input
          id={`${idBase}-title`}
          className={`${ui.input} mt-1`}
          placeholder="Título para buscadores (Google)"
          value={form.title}
          onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
          aria-describedby={`${idBase}-title-hint`}
        />
        <p id={`${idBase}-title-hint`} className="mt-1 text-xs text-fg/50">
          Recomendado: até 60 caracteres. Padrão: título da página.
        </p>
      </div>

      <div>
        <label htmlFor={`${idBase}-desc`} className={ui.label}>
          Descrição (meta description)
        </label>
        <textarea
          id={`${idBase}-desc`}
          className={`${ui.input} mt-1 min-h-[80px] resize-y`}
          placeholder="Resumo da página para buscadores"
          value={form.description}
          onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
          aria-describedby={`${idBase}-desc-hint`}
        />
        <p id={`${idBase}-desc-hint`} className="mt-1 text-xs text-fg/50">
          Recomendado: até 160 caracteres.
        </p>
      </div>

      <div>
        <label htmlFor={`${idBase}-og`} className={ui.label}>
          OG Image (URL)
        </label>
        <input
          id={`${idBase}-og`}
          className={`${ui.input} mt-1`}
          placeholder="https://... (imagem de compartilhamento)"
          value={form.ogImage}
          onChange={(e) => setForm((p) => ({ ...p, ogImage: e.target.value }))}
        />
      </div>

      <div>
        <label htmlFor={`${idBase}-kw`} className={ui.label}>
          Keywords (opcional)
        </label>
        <input
          id={`${idBase}-kw`}
          className={`${ui.input} mt-1`}
          placeholder="palavra1, palavra2, palavra3"
          value={form.keywords}
          onChange={(e) => setForm((p) => ({ ...p, keywords: e.target.value }))}
        />
      </div>

      <div className="flex justify-end pt-2">
        <button type="button" onClick={salvar} disabled={salvando} className={ui.btn}>
          {salvando ? 'Salvando…' : 'Salvar SEO'}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Painel de Versões (snapshots)
// ---------------------------------------------------------------------------

function PainelVersoes({
  paginaId,
  onRestaurado,
}: {
  paginaId: string;
  onRestaurado: () => void;
}) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [motivo, setMotivo] = useState('');
  const [salvandoVersao, setSalvandoVersao] = useState(false);
  const [restaurando, setRestaurando] = useState<string | null>(null);
  const idBase = useId();

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<Snapshot[]>(`/api/admin/pages/${paginaId}/snapshots`);
      setSnapshots(data);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar versões.');
    } finally {
      setCarregando(false);
    }
  }, [paginaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function salvarVersao() {
    setSalvandoVersao(true);
    setErro('');
    try {
      await adminPost(`/api/admin/pages/${paginaId}/snapshots`, {
        motivo: motivo.trim() || undefined,
      });
      setMotivo('');
      carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar versão.');
    } finally {
      setSalvandoVersao(false);
    }
  }

  async function restaurar(snapId: string) {
    if (!window.confirm('Restaurar esta versão? O conteúdo atual será substituído.')) return;
    setRestaurando(snapId);
    setErro('');
    try {
      await adminPost(`/api/admin/pages/${paginaId}/snapshots/${snapId}/restaurar`);
      onRestaurado();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao restaurar versão.');
    } finally {
      setRestaurando(null);
    }
  }

  return (
    <div className="space-y-4">
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label htmlFor={`${idBase}-motivo`} className={ui.label}>
            Motivo da versão (opcional)
          </label>
          <input
            id={`${idBase}-motivo`}
            className={`${ui.input} mt-1`}
            placeholder="Ex.: Publicação de conteúdo atualizado"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={salvarVersao}
          disabled={salvandoVersao}
          className={ui.btn}
        >
          {salvandoVersao ? 'Salvando…' : 'Salvar versão agora'}
        </button>
      </div>

      {carregando ? (
        <p className="py-4 text-center text-sm text-fg/60" role="status">
          Carregando versões…
        </p>
      ) : snapshots.length === 0 ? (
        <p className="py-4 text-center text-sm text-fg/60">
          Nenhuma versão salva ainda.
        </p>
      ) : (
        <div className={`${ui.card} overflow-hidden`}>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className={ui.th} scope="col">Data</th>
                <th className={ui.th} scope="col">Motivo</th>
                <th className={ui.th} scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap) => (
                <tr key={snap.id}>
                  <td className={ui.td}>
                    <time dateTime={snap.criadoEm}>{formatarData(snap.criadoEm)}</time>
                  </td>
                  <td className={ui.td}>{snap.motivo ?? '—'}</td>
                  <td className={`${ui.td} whitespace-nowrap`}>
                    <button
                      type="button"
                      disabled={restaurando === snap.id}
                      onClick={() => restaurar(snap.id)}
                      className={ui.btnGhost}
                      aria-label={`Restaurar versão de ${formatarData(snap.criadoEm)}`}
                    >
                      {restaurando === snap.id ? 'Restaurando…' : 'Restaurar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Construtor visual de páginas (substitui ModalEditorPagina + ModalBloco)
// ---------------------------------------------------------------------------

function ConstrutorPagina({
  pagina: paginaInicial,
  onVoltar,
}: {
  pagina: PaginaCMS;
  onVoltar: () => void;
}) {
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [paginaInfo, setPaginaInfo] = useState<PaginaCMS>(paginaInicial);

  // Bloco selecionado no painel de propriedades
  const [blocoSelecionadoId, setBlocoSelecionadoId] = useState<string | null>(null);
  // Conteúdo local editado (antes de salvar)
  const [conteudoLocal, setConteudoLocal] = useState<Record<string, unknown>>({});
  const [salvandoBloco, setSalvandoBloco] = useState(false);

  // Aba
  const [aba, setAba] = useState<'blocos' | 'seo' | 'versoes'>('blocos');

  // Drag-drop
  const dragIdxRef = useRef<number | null>(null);
  const dragTipoRef = useRef<TipoBloco | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Debounce para reorder
  const reorderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const blocoSelecionado = blocos.find((b) => b.id === blocoSelecionadoId) ?? null;

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<PaginaCMSCompleta>(`/api/admin/pages/${paginaInicial.id}`);
      setBlocos(dados.blocks.slice().sort((a, b) => a.ordem - b.ordem));
      setPaginaInfo(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar blocos.');
    } finally {
      setCarregando(false);
    }
  }, [paginaInicial.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Quando seleciona um bloco, inicializa o conteúdo local
  useEffect(() => {
    if (blocoSelecionado) {
      setConteudoLocal({ ...blocoSelecionado.conteudo });
    }
  }, [blocoSelecionadoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Drag-drop da paleta → canvas
  // ---------------------------------------------------------------------------

  function handlePaletteDragStart(tipo: TipoBloco) {
    dragTipoRef.current = tipo;
    dragIdxRef.current = null;
  }

  function handleItemDragStart(e: DragEvent<HTMLDivElement>, idx: number) {
    dragIdxRef.current = idx;
    dragTipoRef.current = null;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleItemDragOver(e: DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTipoRef.current ? 'copy' : 'move';
    setDragOverIdx(idx);
  }

  function handleCanvasDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTipoRef.current ? 'copy' : 'move';
  }

  async function criarBloco(tipo: TipoBloco, insertAt?: number) {
    const maxOrdem = blocos.length > 0 ? Math.max(...blocos.map((b) => b.ordem)) + 1 : 0;
    const novoBlocoBase = blocoVazio(tipo, insertAt !== undefined ? insertAt : maxOrdem);
    try {
      const criado = await adminPost<Bloco>(`/api/pages/${paginaInicial.id}/blocks`, novoBlocoBase);
      await carregar();
      setBlocoSelecionadoId(criado.id);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao criar bloco.');
    }
  }

  function handleItemDrop(e: DragEvent<HTMLDivElement>, paraIdx: number) {
    e.preventDefault();
    setDragOverIdx(null);

    if (dragTipoRef.current) {
      const tipo = dragTipoRef.current;
      dragTipoRef.current = null;
      criarBloco(tipo, paraIdx);
      return;
    }

    if (dragIdxRef.current === null || dragIdxRef.current === paraIdx) return;
    const deIdx = dragIdxRef.current;
    dragIdxRef.current = null;
    reordenarBlocos(deIdx, paraIdx);
  }

  function handleCanvasDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverIdx(null);

    if (dragTipoRef.current) {
      const tipo = dragTipoRef.current;
      dragTipoRef.current = null;
      criarBloco(tipo);
      return;
    }

    dragIdxRef.current = null;
  }

  // ---------------------------------------------------------------------------
  // Reordenar blocos
  // ---------------------------------------------------------------------------

  function reordenarBlocos(deIdx: number, paraIdx: number) {
    setBlocos((prev) => {
      const next = [...prev];
      const removed = next.splice(deIdx, 1);
      const item = removed[0];
      if (!item) return next;
      next.splice(paraIdx, 0, item);
      // Recalcula ordens
      return next.map((b, i) => ({ ...b, ordem: i }));
    });

    // Debounce: envia reorder para API ao parar de arrastar
    if (reorderTimerRef.current) clearTimeout(reorderTimerRef.current);
    reorderTimerRef.current = setTimeout(() => {
      setBlocos((current) => {
        const ordens = current.map((b, i) => ({ id: b.id, ordem: i }));
        adminPatch(`/api/admin/pages/${paginaInicial.id}/blocks/reorder`, { ordens }).catch(
          () => {},
        );
        return current;
      });
    }, 500);
  }

  function moverBloco(de: number, para: number) {
    reordenarBlocos(de, para);
  }

  // ---------------------------------------------------------------------------
  // Excluir / toggle visível
  // ---------------------------------------------------------------------------

  async function excluirBloco(bloco: Bloco) {
    if (!window.confirm(`Excluir o bloco "${TIPO_LABEL[bloco.tipo]}"?`)) return;
    if (blocoSelecionadoId === bloco.id) setBlocoSelecionadoId(null);
    setErro('');
    try {
      await adminDelete(`/api/blocks/${bloco.id}`);
      carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir bloco.');
    }
  }

  async function toggleVisivel(bloco: Bloco) {
    setErro('');
    try {
      await adminPut(`/api/blocks/${bloco.id}`, { visivel: !bloco.visivel });
      setBlocos((prev) =>
        prev.map((b) => (b.id === bloco.id ? { ...b, visivel: !b.visivel } : b)),
      );
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao atualizar bloco.');
    }
  }

  // ---------------------------------------------------------------------------
  // Salvar bloco selecionado
  // ---------------------------------------------------------------------------

  async function salvarBlocoSelecionado() {
    if (!blocoSelecionado) return;
    setSalvandoBloco(true);
    setErro('');
    try {
      await adminPut(`/api/blocks/${blocoSelecionado.id}`, {
        tipo: blocoSelecionado.tipo,
        conteudo: conteudoLocal,
        visivel: blocoSelecionado.visivel,
        ordem: blocoSelecionado.ordem,
      });
      setBlocos((prev) =>
        prev.map((b) =>
          b.id === blocoSelecionado.id ? { ...b, conteudo: conteudoLocal } : b,
        ),
      );
      setMsgOk('Bloco salvo.');
      setTimeout(() => setMsgOk(''), 2000);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar bloco.');
    } finally {
      setSalvandoBloco(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Publicar / despublicar
  // ---------------------------------------------------------------------------

  async function togglePublicado() {
    setErro('');
    try {
      await adminPut(`/api/pages/${paginaInfo.id}`, { publicado: !paginaInfo.publicado });
      setPaginaInfo((p) => ({ ...p, publicado: !p.publicado }));
      setMsgOk(paginaInfo.publicado ? 'Página despublicada.' : 'Página publicada.');
      setTimeout(() => setMsgOk(''), 2500);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao alterar publicação.');
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onVoltar} className={ui.btnGhost} aria-label="Voltar para lista de páginas">
            ← Voltar
          </button>
          <h2 className="font-heading text-lg font-bold">{paginaInfo.titulo}</h2>
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-fg/60">
            /{paginaInfo.slug}
          </code>
          {paginaInfo.publicado ? (
            <span className={`${ui.badge} bg-success/20 text-success`}>Publicada</span>
          ) : (
            <span className={`${ui.badge} bg-muted text-fg/60`}>Rascunho</span>
          )}
        </div>
        <button type="button" onClick={togglePublicado} className={ui.btnGhost}>
          {paginaInfo.publicado ? 'Despublicar' : 'Publicar'}
        </button>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

      {/* Abas */}
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Seções do editor de página">
        {(
          [
            { id: 'blocos', label: `Blocos (${blocos.length})` },
            { id: 'seo', label: 'SEO' },
            { id: 'versoes', label: 'Versões' },
          ] as { id: typeof aba; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={[
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              aba === id
                ? 'border-primary text-primary'
                : 'border-transparent text-fg/60 hover:text-fg',
            ].join(' ')}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ABA: BLOCOS */}
      {aba === 'blocos' && (
        <>
          {carregando ? (
            <p className="py-8 text-center text-sm text-fg/60" role="status">
              Carregando blocos…
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_320px] gap-4 min-h-[560px]">
              {/* Paleta */}
              <aside
                aria-label="Paleta de tipos de bloco"
                className="flex flex-col gap-1 rounded border border-border bg-bg p-3"
              >
                <h3 className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-2">
                  Tipos de bloco
                </h3>
                {TIPOS_BLOCO.map((tipo) => (
                  <div
                    key={tipo}
                    draggable
                    onDragStart={() => handlePaletteDragStart(tipo)}
                    className="flex items-center gap-2 rounded border border-border/50 bg-bg px-2 py-1.5 text-xs cursor-grab active:cursor-grabbing hover:border-primary/60 hover:bg-primary/5 transition-colors select-none"
                    role="button"
                    tabIndex={0}
                    aria-label={`Adicionar bloco ${TIPO_LABEL[tipo]}`}
                    onClick={() => criarBloco(tipo)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        criarBloco(tipo);
                      }
                    }}
                  >
                    <span className="text-fg/40 shrink-0 font-mono text-xs w-6 text-center" aria-hidden="true">
                      {TIPO_ICONE[tipo]}
                    </span>
                    <span className="truncate">{TIPO_LABEL[tipo]}</span>
                  </div>
                ))}
                <p className="mt-3 text-xs text-fg/50">
                  Arraste para o canvas ou clique para adicionar ao final.
                </p>
              </aside>

              {/* Canvas */}
              <div
                className={[
                  'flex flex-col gap-2 rounded border-2 border-dashed p-3 min-h-[400px] transition-colors overflow-y-auto',
                  blocos.length === 0 ? 'border-border/50 bg-muted/20' : 'border-border',
                ].join(' ')}
                onDragOver={handleCanvasDragOver}
                onDrop={handleCanvasDrop}
                aria-label="Canvas da página — blocos de conteúdo"
                role="list"
              >
                {blocos.length === 0 && (
                  <p className="m-auto text-sm text-fg/50 text-center">
                    Arraste um tipo da paleta ou clique nele para adicionar blocos.
                  </p>
                )}
                {blocos.map((bloco, idx) => (
                  <ItemCanvas
                    key={bloco.id}
                    bloco={bloco}
                    idx={idx}
                    total={blocos.length}
                    selecionado={blocoSelecionadoId === bloco.id}
                    onSelecionar={() =>
                      setBlocoSelecionadoId((prev) =>
                        prev === bloco.id ? null : bloco.id,
                      )
                    }
                    onMover={moverBloco}
                    onExcluir={() => excluirBloco(bloco)}
                    onToggleVisivel={() => toggleVisivel(bloco)}
                    onDragStart={handleItemDragStart}
                    onDragOver={handleItemDragOver}
                    onDrop={handleItemDrop}
                    dragOver={dragOverIdx === idx}
                  />
                ))}
              </div>

              {/* Painel de propriedades */}
              {blocoSelecionado ? (
                <PainelPropriedades
                  bloco={{ ...blocoSelecionado, conteudo: conteudoLocal }}
                  salvando={salvandoBloco}
                  onConteudoChange={setConteudoLocal}
                  onSalvar={salvarBlocoSelecionado}
                  onFechar={() => setBlocoSelecionadoId(null)}
                />
              ) : (
                <div className="hidden lg:flex items-center justify-center rounded border border-dashed border-border/50 bg-muted/10 text-sm text-fg/40 text-center p-4">
                  Clique em um bloco para editar suas propriedades
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ABA: SEO */}
      {aba === 'seo' && (
        <div className="max-w-xl">
          <PainelSeo
            paginaId={paginaInfo.id}
            seo={paginaInfo.seo ?? {}}
            onSalvo={(seo) => setPaginaInfo((p) => ({ ...p, seo }))}
          />
        </div>
      )}

      {/* ABA: VERSÕES */}
      {aba === 'versoes' && (
        <PainelVersoes
          paginaId={paginaInfo.id}
          onRestaurado={() => {
            carregar();
            setAba('blocos');
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: Nova página (com seletor de template)
// ---------------------------------------------------------------------------

function ModalNovaPagina({
  open,
  onClose,
  onSalvo,
}: {
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [slug, setSlug] = useState('');
  const [titulo, setTitulo] = useState('');
  const [criarMenu, setCriarMenu] = useState(false);
  const [template, setTemplate] = useState('');
  const [templates, setTemplates] = useState<TemplateItem[]>([]);
  const [carregandoTemplates, setCarregandoTemplates] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setSlug('');
    setTitulo('');
    setCriarMenu(false);
    setTemplate('');
    setErro('');

    // Carrega templates disponíveis
    setCarregandoTemplates(true);
    adminGet<TemplateItem[]>('/api/admin/pages/templates')
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setCarregandoTemplates(false));
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !titulo.trim()) {
      setErro('Slug e título são obrigatórios.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await adminPost('/api/pages', {
        slug: slug.trim(),
        titulo: titulo.trim(),
        criarMenu,
        template: template || undefined,
      });
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova página">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor={`${idBase}-slug`} className={ui.label}>
            Slug (URL) <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-slug`}
            className={`${ui.input} mt-1`}
            placeholder="ex.: sobre-o-municipio"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
            required
            aria-required="true"
            aria-describedby={`${idBase}-slug-hint`}
          />
          <p id={`${idBase}-slug-hint`} className="mt-1 text-xs text-fg/60">
            Somente letras minúsculas, números e hífens. Aparece na URL: /p/slug
          </p>
        </div>

        <div>
          <label htmlFor={`${idBase}-titulo`} className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-titulo`}
            className={`${ui.input} mt-1`}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            aria-required="true"
          />
        </div>

        {/* Template */}
        <div>
          <label htmlFor={`${idBase}-template`} className={ui.label}>
            Começar de um template
          </label>
          <select
            id={`${idBase}-template`}
            className={`${ui.input} mt-1`}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            disabled={carregandoTemplates}
            aria-describedby={`${idBase}-template-hint`}
          >
            <option value="">Em branco (sem template)</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
                {t.descricao ? ` — ${t.descricao}` : ''}
              </option>
            ))}
          </select>
          <p id={`${idBase}-template-hint`} className="mt-1 text-xs text-fg/60">
            Templates criam a página já com blocos pré-configurados.
          </p>
        </div>

        {/* Opção: adicionar ao menu */}
        <div className="flex items-start gap-2 rounded border border-border p-3">
          <input
            id={`${idBase}-criar-menu`}
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
            checked={criarMenu}
            onChange={(e) => setCriarMenu(e.target.checked)}
            aria-describedby={`${idBase}-criar-menu-hint`}
          />
          <div>
            <label htmlFor={`${idBase}-criar-menu`} className="block text-sm font-semibold">
              Adicionar ao menu do cabeçalho
            </label>
            <p id={`${idBase}-criar-menu-hint`} className="text-xs text-fg/60">
              Cria automaticamente um item de menu interno apontando para esta página.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Criando…' : 'Criar página'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Modal: Renomear página
// ---------------------------------------------------------------------------

function ModalRenomearPagina({
  open,
  pagina,
  onClose,
  onSalvo,
}: {
  open: boolean;
  pagina: PaginaCMS | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const idBase = useId();
  const [titulo, setTitulo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !pagina) return;
    setTitulo(pagina.titulo);
    setErro('');
  }, [open, pagina]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pagina) return;
    if (!titulo.trim()) {
      setErro('O título é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await adminPut(`/api/pages/${pagina.id}`, { titulo: titulo.trim() });
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Renomear página">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor={`${idBase}-titulo`} className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-titulo`}
            className={`${ui.input} mt-1`}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            aria-required="true"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

type Tela = 'lista' | 'construtor';

export default function PaginasAdminPage() {
  const [tela, setTela] = useState<Tela>('lista');
  const [paginaEditando, setPaginaEditando] = useState<PaginaCMS | null>(null);

  const [pagina, setPagina] = useState<Pagina<PaginaCMS> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [modalNova, setModalNova] = useState(false);
  const [paginaRenomear, setPaginaRenomear] = useState<PaginaCMS | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<PaginaCMS>>(
        `/api/admin/pages${qs({ q, page, pageSize: PAGE_SIZE })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar páginas.');
    } finally {
      setCarregando(false);
    }
  }, [q, page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  function abrirConstrutor(pag: PaginaCMS) {
    setPaginaEditando(pag);
    setTela('construtor');
  }

  function voltarParaLista() {
    setPaginaEditando(null);
    setTela('lista');
    buscar();
  }

  async function togglePublicado(pag: PaginaCMS) {
    setErro('');
    setAviso('');
    try {
      await adminPut(`/api/pages/${pag.id}`, { publicado: !pag.publicado });
      setAviso(pag.publicado ? 'Página despublicada.' : 'Página publicada com sucesso.');
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao alterar publicação.');
    }
  }

  async function excluir(pag: PaginaCMS) {
    if (
      !window.confirm(
        `Excluir a página "${pag.titulo}" (/${pag.slug})? Todos os blocos serão removidos. Ação irreversível.`,
      )
    )
      return;
    setErro('');
    setAviso('');
    try {
      await adminDelete(`/api/pages/${pag.id}`);
      setAviso('Página excluída.');
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir página.');
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  // Tela: construtor visual
  if (tela === 'construtor' && paginaEditando) {
    return (
      <main className="space-y-4 p-4 md:p-6">
        <ConstrutorPagina pagina={paginaEditando} onVoltar={voltarParaLista} />
      </main>
    );
  }

  // Tela: lista de páginas
  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Páginas (CMS)"
        description="Crie e gerencie páginas de conteúdo do portal. Use o construtor visual para compor blocos."
      >
        <button onClick={() => setModalNova(true)} className={ui.btn}>
          + Nova página
        </button>
      </AdminHeader>

      {/* Busca */}
      <section aria-label="Filtros de páginas" className={`${ui.card} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48">
            <label htmlFor="filtro-q-pag" className={ui.label}>
              Buscar (título ou slug)
            </label>
            <input
              id="filtro-q-pag"
              className={`${ui.input} mt-1`}
              placeholder="Digite para filtrar…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              onKeyDown={(e) => e.key === 'Enter' && buscar()}
            />
          </div>
          <button onClick={() => buscar()} className={ui.btn}>
            Buscar
          </button>
        </div>
      </section>

      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de páginas"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhuma página encontrada.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[680px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Slug</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Atualizado em</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((pag) => (
                  <tr key={pag.id}>
                    <td className={ui.td}>
                      <span className="font-medium">{pag.titulo}</span>
                    </td>
                    <td className={ui.td}>
                      <code className="rounded bg-muted px-1 py-0.5 text-xs">{pag.slug}</code>
                    </td>
                    <td className={ui.td}>
                      {pag.publicado ? (
                        <span className={`${ui.badge} bg-success/20 text-success`}>Publicada</span>
                      ) : (
                        <span className={`${ui.badge} bg-muted text-fg/60`}>Rascunho</span>
                      )}
                    </td>
                    <td className={ui.td}>
                      <time dateTime={pag.atualizadoEm}>{formatarData(pag.atualizadoEm)}</time>
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => togglePublicado(pag)}
                          className={ui.btnGhost}
                          aria-label={
                            pag.publicado
                              ? `Despublicar página ${pag.titulo}`
                              : `Publicar página ${pag.titulo}`
                          }
                        >
                          {pag.publicado ? 'Despublicar' : 'Publicar'}
                        </button>
                        <button
                          onClick={() => setPaginaRenomear(pag)}
                          className={ui.btnGhost}
                          aria-label={`Renomear página ${pag.titulo}`}
                        >
                          Renomear
                        </button>
                        <button
                          onClick={() => abrirConstrutor(pag)}
                          className={ui.btn}
                          aria-label={`Editar conteúdo da página ${pag.titulo}`}
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => excluir(pag)}
                          className={ui.btnDanger}
                          aria-label={`Excluir página ${pag.titulo}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paginação */}
      {pagina && pagina.total > PAGE_SIZE && (
        <nav
          aria-label="Paginação de páginas"
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="text-fg/60">
            Página {page} de {totalPaginas} — {pagina.total} página(s)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className={ui.btnGhost}
              aria-label="Página anterior"
            >
              ← Anterior
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
              disabled={page >= totalPaginas}
              className={ui.btnGhost}
              aria-label="Próxima página"
            >
              Próxima →
            </button>
          </div>
        </nav>
      )}

      {/* Modais */}
      <ModalNovaPagina
        open={modalNova}
        onClose={() => setModalNova(false)}
        onSalvo={buscar}
      />

      <ModalRenomearPagina
        open={paginaRenomear !== null}
        pagina={paginaRenomear}
        onClose={() => setPaginaRenomear(null)}
        onSalvo={buscar}
      />
    </main>
  );
}
