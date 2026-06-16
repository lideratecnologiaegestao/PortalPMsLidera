'use client';

/**
 * SvgEditorCores — modal para editar cores de um arquivo SVG na Biblioteca de Midia.
 *
 * Fluxo:
 *  1. Abre → busca SVG sanitizado + cores unicas via GET /api/midia/:id/svg-conteudo
 *  2. Exibe preview ao vivo do SVG (iframe sandbox sem scripts) + lista de color pickers
 *  3. Swatches de sugestao a partir da paleta do tema (GET /api/theme via CSS vars)
 *  4. Controle "Cor base" sempre visivel — recolore tracos/linhas de brasoes moncromaticos
 *     que nao declaram fill explicito (herdam preto implicito via fill="currentColor" ou default)
 *  5. Botao "Salvar copia" → POST /api/midia/:id/recolorir → fecha e notifica parent
 *
 * Mudancas (2026-06-14):
 *  - coresUnicas aceitam cores nomeadas (ex.: "white") alem de hex
 *  - campo corBase sempre visivel — mapeia para o novo campo do DTO
 *  - preview ao vivo injeta fill="<corBase>" no elemento <svg> raiz
 *  - salvar habilitado quando ha corBase OU substituicoes (antes exigia as duas)
 *
 * Acessibilidade: role=dialog via <Modal>, labels em todos os inputs de cor,
 * aria-live para erros/carregamento, foco gerenciado pelo <Modal> pai.
 * Nenhuma informacao transmitida somente por cor.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { Modal, Aviso, ui } from './ui';
import {
  getSvgConteudo,
  recolorirSvg,
  listarCategorias,
  type MediaAsset,
  type MediaCategoria,
  type MediaVisibilidade,
} from '../../../lib/media';
import { AdminApiError } from '../../../lib/admin-api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Le as CSS variables do tema injetadas no :root pelo layout do admin.
 * Retorna apenas as cores com valor definido.
 */
function lerCoresTema(): { nome: string; valor: string }[] {
  if (typeof window === 'undefined') return [];
  const style = getComputedStyle(document.documentElement);
  const nomes = [
    { nome: 'Primaria', var: '--color-primary' },
    { nome: 'Primaria (texto)', var: '--color-primary-fg' },
    { nome: 'Secundaria', var: '--color-secondary' },
    { nome: 'Secundaria (texto)', var: '--color-secondary-fg' },
    { nome: 'Destaque', var: '--color-accent' },
    { nome: 'Fundo', var: '--color-bg' },
    { nome: 'Texto', var: '--color-fg' },
    { nome: 'Suave', var: '--color-muted' },
    { nome: 'Borda', var: '--color-border' },
    { nome: 'Sucesso', var: '--color-success' },
    { nome: 'Aviso', var: '--color-warning' },
    { nome: 'Perigo', var: '--color-danger' },
  ];
  return nomes
    .map(({ nome, var: v }) => ({ nome, valor: style.getPropertyValue(v).trim() }))
    .filter((c) => Boolean(c.valor));
}

/**
 * Converte um nome de cor CSS (ex.: "white", "black", "red") em hex para
 * alimentar o <input type="color"> nativo, que exige #rrggbb.
 * Usa o truque do canvas 1x1 — nao depende de APIs externas.
 * Retorna o proprio valor se ja for hex ou se a conversao falhar.
 */
function corNomeParaHex(cor: string): string {
  if (!cor) return '#000000';
  // Ja e hex — retorna direto
  if (/^#[0-9a-fA-F]{3,8}$/.test(cor.trim())) return cor.trim();

  if (typeof document === 'undefined') return '#000000';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '#000000';
    ctx.fillStyle = cor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return (
      '#' +
      [r, g, b]
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
    );
  } catch {
    return '#000000';
  }
}

/** Aplica substituicoes de cor no conteudo SVG para preview ao vivo. */
function aplicarSubstituicoes(
  conteudo: string,
  substituicoes: Record<string, string>,
): string {
  let resultado = conteudo;
  for (const [original, nova] of Object.entries(substituicoes)) {
    if (!nova || original === nova) continue;
    resultado = resultado.split(original).join(nova);
  }
  return resultado;
}

/**
 * Injeta fill="<corBase>" no atributo do elemento <svg> raiz do markup.
 * Se corBase nao for definido, retorna o markup inalterado.
 * Preserva quaisquer atributos fill ja existentes na tag de abertura
 * substituindo-os para que o preview reflita a intencao do usuario.
 */
function injetarCorBase(svgMarkup: string, corBase: string): string {
  if (!corBase) return svgMarkup;
  // Remove fill existente na tag de abertura do <svg> e insere o novo
  return svgMarkup.replace(
    /(<svg\b[^>]*?)(\sfill="[^"]*")?([^>]*>)/i,
    (_, antes, _fillExistente, depois) =>
      `${antes} fill="${corBase}"${depois}`,
  );
}

/** Valida que uma string e um valor de cor CSS minimamente aceitavel. */
function corValida(valor: string): boolean {
  if (!valor) return false;
  // Aceita hex (#rgb, #rrggbb, #rrggbbaa), rgb(), rgba(), hsl(), named colors
  return /^(#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\(|[a-zA-Z]+)/.test(valor.trim());
}

// ─── Sub-componente: linha de uma cor detectada ───────────────────────────────

interface LinhaCorProps {
  cor: string;
  index: number;
  nova: string;
  coresTema: { nome: string; valor: string }[];
  onChange: (nova: string) => void;
}

function LinhaCor({ cor, index, nova, coresTema, onChange }: LinhaCorProps) {
  const pickerId = useId();
  const hexId = useId();
  const valorExibido = nova || cor;

  /**
   * O <input type="color"> exige hex #rrggbb.
   * Se a cor original ou a nova for um nome (ex.: "white"), converte.
   */
  const hexParaPicker = corNomeParaHex(valorExibido);
  // Cor original pode ser nomeada — tambem converte para o swatch
  const hexOriginalParaSwatch = corNomeParaHex(cor);

  return (
    <li className="flex flex-col gap-2 rounded border border-border bg-muted/30 p-3">
      {/* Cabecalho: cor original */}
      <div className="flex items-center gap-2">
        {/* Amostra visual (decorativa) — backgroundColor aceita nomes CSS diretamente */}
        <span
          className="inline-block h-5 w-8 shrink-0 rounded border border-border"
          style={{ backgroundColor: cor }}
          aria-hidden="true"
        />
        <span
          className="flex-1 truncate font-mono text-xs text-fg/70"
          aria-label={`Cor original ${index + 1}: ${cor}`}
        >
          {cor}
        </span>
        {nova && nova !== cor && (
          <>
            <span className="text-xs text-fg/50" aria-label="Sera substituida por:">
              &rarr;
            </span>
            <span
              className="inline-block h-5 w-8 shrink-0 rounded border border-border"
              style={{ backgroundColor: nova }}
              aria-hidden="true"
            />
          </>
        )}
      </div>

      {/* Inputs de nova cor */}
      <div className="flex flex-wrap items-end gap-2">
        {/* Color picker nativo — recebe sempre hex */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor={pickerId} className="text-xs font-semibold">
            Seletor de cor
          </label>
          <input
            id={pickerId}
            type="color"
            value={hexParaPicker}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-bg p-0.5 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label={`Escolher nova cor para ${cor}`}
          />
        </div>

        {/* Campo hex/texto — permite digitar nome ou hex */}
        <div className="flex flex-1 flex-col gap-0.5 min-w-[120px]">
          <label htmlFor={hexId} className="text-xs font-semibold">
            Valor hex / CSS
          </label>
          <input
            id={hexId}
            type="text"
            className={ui.input}
            value={nova}
            placeholder={cor}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`Valor de nova cor para ${cor} (hex ou CSS)`}
            aria-describedby={`${hexId}-hint`}
            spellCheck={false}
          />
          <p id={`${hexId}-hint`} className="text-xs text-fg/50">
            Ex.: #1351b4 ou rgb(19,81,180)
          </p>
        </div>

        {/* Botao de reset */}
        {nova && nova !== cor && (
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => onChange('')}
            aria-label={`Desfazer substituicao da cor ${cor}`}
          >
            Desfazer
          </button>
        )}
      </div>

      {/* Swatches de sugestao do tema */}
      {coresTema.length > 0 && (
        <div className="mt-1">
          <p className="mb-1 text-xs font-semibold text-fg/60">Sugestoes do tema:</p>
          <div
            role="group"
            aria-label={`Sugestoes de cor do tema para ${cor}`}
            className="flex flex-wrap gap-1.5"
          >
            {coresTema.map((t) => (
              <button
                key={t.nome + t.valor}
                type="button"
                onClick={() => onChange(t.valor)}
                title={`${t.nome}: ${t.valor}`}
                aria-label={`Usar cor do tema: ${t.nome} (${t.valor})`}
                aria-pressed={nova === t.valor}
                className={[
                  'h-6 w-6 rounded border transition-all',
                  nova === t.valor
                    ? 'border-primary ring-2 ring-primary ring-offset-1'
                    : 'border-border hover:scale-110 hover:border-primary',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                ].join(' ')}
                style={{ backgroundColor: t.valor }}
              />
            ))}
          </div>
        </div>
      )}
    </li>
  );
}

// ─── Sub-componente: controle de cor base ─────────────────────────────────────

interface CorBaseControlProps {
  corBase: string;
  coresTema: { nome: string; valor: string }[];
  onChange: (valor: string) => void;
}

function CorBaseControl({ corBase, coresTema, onChange }: CorBaseControlProps) {
  const pickerId = useId();
  const hexId = useId();
  const descId = useId();

  const hexParaPicker = corBase ? corNomeParaHex(corBase) : '#000000';

  return (
    <section
      aria-labelledby="cor-base-titulo"
      className="rounded border border-border bg-muted/20 p-3"
    >
      <h4
        id="cor-base-titulo"
        className="mb-1 text-xs font-semibold text-fg"
      >
        Cor base (linhas / preenchimento)
      </h4>
      <p id={descId} className="mb-3 text-xs text-fg/60">
        Aplica uma cor de preenchimento diretamente no elemento{' '}
        <code className="rounded bg-muted px-1 font-mono">&lt;svg&gt;</code>{' '}
        raiz. Use para recolorir tracos e linhas de brasoes e icones
        moncromaticos que nao declaram cor explicita (herdam preto implicito).
      </p>

      <div className="flex flex-wrap items-end gap-2">
        {/* Picker */}
        <div className="flex flex-col gap-0.5">
          <label htmlFor={pickerId} className="text-xs font-semibold">
            Seletor
          </label>
          <input
            id={pickerId}
            type="color"
            value={hexParaPicker}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-border bg-bg p-0.5 focus:outline-none focus:ring-2 focus:ring-primary"
            aria-label="Seletor de cor base para o SVG"
            aria-describedby={descId}
          />
        </div>

        {/* Campo texto */}
        <div className="flex flex-1 flex-col gap-0.5 min-w-[140px]">
          <label htmlFor={hexId} className="text-xs font-semibold">
            Valor hex / CSS
          </label>
          <input
            id={hexId}
            type="text"
            className={ui.input}
            value={corBase}
            placeholder="Ex.: #1351b4"
            onChange={(e) => onChange(e.target.value)}
            aria-label="Cor base em hex ou CSS"
            aria-describedby={descId}
            spellCheck={false}
          />
        </div>

        {/* Limpar */}
        {corBase && (
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => onChange('')}
            aria-label="Remover cor base"
          >
            Remover
          </button>
        )}
      </div>

      {/* Swatches do tema */}
      {coresTema.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold text-fg/60">
            Sugestoes do tema:
          </p>
          <div
            role="group"
            aria-label="Sugestoes de cor base do tema"
            className="flex flex-wrap gap-1.5"
          >
            {coresTema.map((t) => (
              <button
                key={t.nome + t.valor}
                type="button"
                onClick={() => onChange(t.valor)}
                title={`${t.nome}: ${t.valor}`}
                aria-label={`Usar cor base do tema: ${t.nome} (${t.valor})`}
                aria-pressed={corBase === t.valor}
                className={[
                  'h-6 w-6 rounded border transition-all',
                  corBase === t.valor
                    ? 'border-primary ring-2 ring-primary ring-offset-1'
                    : 'border-border hover:scale-110 hover:border-primary',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
                ].join(' ')}
                style={{ backgroundColor: t.valor }}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export interface SvgEditorCoresProps {
  /** Asset SVG a editar. */
  asset: MediaAsset;
  /** Chamado apos salvar com sucesso; recebe o novo asset criado. */
  onSalvo: (novoAsset: MediaAsset) => void;
  /** Fecha o modal sem salvar. */
  onClose: () => void;
}

export default function SvgEditorCores({ asset, onSalvo, onClose }: SvgEditorCoresProps) {
  // ── Estado de carregamento inicial ──
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');
  const [svgOriginal, setSvgOriginal] = useState('');
  const [coresUnicas, setCoresUnicas] = useState<string[]>([]);
  const [categorias, setCategorias] = useState<MediaCategoria[]>([]);
  const [coresTema, setCoresTema] = useState<{ nome: string; valor: string }[]>([]);

  // ── Estado das substituicoes de cor detectada (cor original → nova cor) ──
  const [substituicoes, setSubstituicoes] = useState<Record<string, string>>({});

  // ── Cor base para recolorir o SVG raiz (brasoes/icones moncromaticos) ──
  const [corBase, setCorBase] = useState('');

  // ── Metadados da copia ──
  const [categoriaId, setCategoriaId] = useState('');
  const [visibilidade, setVisibilidade] = useState<MediaVisibilidade>('publico');
  const [altText, setAltText] = useState('');

  // ── Estado de salvar ──
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState('');

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // ── Carrega dados ao abrir ──
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErroCarregar('');

    Promise.all([
      getSvgConteudo(asset.id),
      listarCategorias('imagem'),
    ])
      .then(([svg, cats]) => {
        if (cancelado) return;
        setSvgOriginal(svg.conteudo);
        setCoresUnicas(svg.coresUnicas);
        setCategorias(cats);
        // Pre-seleciona a categoria atual do asset
        const catAtual = cats.find((c) => c.slug === asset.categoria);
        if (catAtual) setCategoriaId(catAtual.id);
        // Alt text inicial da copia
        setAltText(asset.altText ?? '');
        // Cores do tema (CSS vars injetadas no :root pelo layout do admin)
        setCoresTema(lerCoresTema());
      })
      .catch((e) => {
        if (cancelado) return;
        setErroCarregar(
          e instanceof AdminApiError ? e.message : 'Erro ao carregar o SVG.',
        );
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [asset.id, asset.categoria, asset.altText]);

  // ── SVG com substituicoes + corBase aplicados (para preview) ──
  const svgComSubstituicoes = aplicarSubstituicoes(svgOriginal, substituicoes);
  const svgPreview = corBase
    ? injetarCorBase(svgComSubstituicoes, corBase)
    : svgComSubstituicoes;

  // ── Atualiza o iframe ao mudar o preview ──
  useEffect(() => {
    if (!svgPreview || !iframeRef.current) return;
    // srcdoc: injeta o SVG como documento HTML minimo, sem scripts.
    // sandbox="allow-same-origin" permite leitura do DOM proprio;
    // sem "allow-scripts" nenhum JS e executado.
    const doc = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;display:flex;align-items:center;justify-content:center;height:100%;background:transparent}svg{max-width:100%;max-height:100%;}</style></head><body>${svgPreview}</body></html>`;
    iframeRef.current.srcdoc = doc;
  }, [svgPreview]);

  function atualizarCor(original: string, nova: string) {
    setSubstituicoes((prev) => {
      const next = { ...prev };
      if (!nova || nova === original) {
        delete next[original];
      } else {
        next[original] = nova;
      }
      return next;
    });
  }

  // ── Validacao e envio ──
  async function salvarCopia(e: React.FormEvent) {
    e.preventDefault();
    setErroSalvar('');

    if (!categoriaId) {
      setErroSalvar('Selecione uma categoria para a copia.');
      return;
    }
    if (visibilidade === 'publico' && !altText.trim()) {
      setErroSalvar(
        'O texto alternativo (alt) e obrigatorio para imagens publicas (WCAG 2.1 AA).',
      );
      return;
    }

    // Valida corBase (se preenchida)
    if (corBase && !corValida(corBase)) {
      setErroSalvar(
        `Cor base invalida: "${corBase}". Use hex (#rrggbb) ou valor CSS valido.`,
      );
      return;
    }

    // Valida cada nova cor informada nas substituicoes
    for (const [original, nova] of Object.entries(substituicoes)) {
      if (nova && !corValida(nova)) {
        setErroSalvar(
          `Cor invalida para "${original}": "${nova}". Use hex (#rrggbb) ou valor CSS valido.`,
        );
        return;
      }
    }

    setSalvando(true);
    try {
      const novoAsset = await recolorirSvg(asset.id, {
        substituicoes,
        corBase: corBase || undefined,
        categoriaId,
        visibilidade,
        altText: altText.trim() || undefined,
      });
      onSalvo(novoAsset);
    } catch (err) {
      setErroSalvar(
        err instanceof AdminApiError
          ? err.message
          : 'Erro ao salvar a copia recolorida.',
      );
    } finally {
      setSalvando(false);
    }
  }

  const temSubstituicoes = Object.keys(substituicoes).length > 0;
  // Habilita salvar se ha ao menos uma substituicao OU uma corBase definida
  const temAlteracoes = temSubstituicoes || Boolean(corBase);

  // Descricao do estado do preview para aria-live
  const descPreview = corBase && temSubstituicoes
    ? 'com cor base e substituicoes'
    : corBase
    ? 'com cor base'
    : temSubstituicoes
    ? 'com substituicoes'
    : 'original';

  return (
    <Modal open onClose={onClose} title={`Editar cores: ${asset.nomeOriginal}`}>
      {/* Estado de carregamento */}
      {carregando && (
        <p aria-live="polite" className="py-8 text-center text-sm text-fg/60">
          Carregando SVG e cores…
        </p>
      )}

      {/* Erro ao carregar */}
      {!carregando && erroCarregar && (
        <div className="space-y-3">
          <Aviso tipo="erro">{erroCarregar}</Aviso>
          <div className="flex justify-end">
            <button type="button" className={ui.btnGhost} onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Conteudo principal */}
      {!carregando && !erroCarregar && (
        <form onSubmit={salvarCopia} noValidate>
          {/* Layout: preview a esquerda, painel de cores a direita em telas medias+ */}
          <div className="flex flex-col gap-4 lg:flex-row">
            {/* Preview do SVG */}
            <div className="flex flex-col gap-2 lg:w-56 lg:shrink-0">
              <p className="text-xs font-semibold text-fg/70" aria-live="polite">
                Preview ({descPreview})
              </p>
              <div
                className="rounded border border-border bg-white"
                style={{ height: '200px' }}
                aria-label="Preview ao vivo do SVG com as cores selecionadas"
              >
                {svgOriginal ? (
                  <iframe
                    ref={iframeRef}
                    title="Preview do SVG recolorido"
                    sandbox="allow-same-origin"
                    className="h-full w-full rounded"
                    aria-label="Visualizacao do SVG com cores aplicadas"
                  />
                ) : (
                  <p className="flex h-full items-center justify-center text-xs text-fg/50">
                    Sem preview disponivel
                  </p>
                )}
              </div>
              {temAlteracoes && (
                <p className="text-xs text-fg/60" aria-live="polite">
                  {[
                    temSubstituicoes
                      ? `${Object.keys(substituicoes).length} cor(es) substituida(s)`
                      : null,
                    corBase ? 'cor base definida' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>

            {/* Painel de edicao de cores */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              {/* Cor base — sempre visivel */}
              <CorBaseControl
                corBase={corBase}
                coresTema={coresTema}
                onChange={setCorBase}
              />

              {/* Cores detectadas no SVG */}
              {coresUnicas.length === 0 ? (
                <p className="text-sm text-fg/60">
                  Nenhuma cor explicita identificada neste SVG.
                  Use a &ldquo;Cor base&rdquo; acima para recolorir tracos e linhas.
                </p>
              ) : (
                <div>
                  <p className="mb-2 text-xs font-semibold text-fg/70">
                    Cores detectadas no SVG
                  </p>
                  <ul
                    aria-label="Cores do SVG para substituicao"
                    className="space-y-3 max-h-72 overflow-y-auto pr-1"
                  >
                    {coresUnicas.map((cor, i) => (
                      <LinhaCor
                        key={cor}
                        cor={cor}
                        index={i}
                        nova={substituicoes[cor] ?? ''}
                        coresTema={coresTema}
                        onChange={(nova) => atualizarCor(cor, nova)}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Separador */}
          <hr className="my-5 border-border" aria-hidden="true" />

          {/* Metadados da copia */}
          <section aria-labelledby="secao-metadados-titulo">
            <h3 id="secao-metadados-titulo" className="mb-3 text-sm font-semibold">
              Metadados da copia
            </h3>

            <div className="space-y-4">
              {/* Categoria */}
              <div>
                <label htmlFor="svg-cat" className={ui.label}>
                  Categoria{' '}
                  <span aria-hidden="true" className="text-danger ml-1">
                    *
                  </span>
                </label>
                <select
                  id="svg-cat"
                  required
                  className={`mt-1 ${ui.input}`}
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  aria-required="true"
                >
                  <option value="">Selecione uma categoria…</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Visibilidade */}
              <fieldset>
                <legend className={`${ui.label} mb-1`}>Visibilidade</legend>
                <div className="flex flex-wrap gap-4">
                  {(['publico', 'restrito'] as MediaVisibilidade[]).map((v) => (
                    <label
                      key={v}
                      className="flex cursor-pointer items-center gap-2 text-sm"
                    >
                      <input
                        type="radio"
                        name="svg-vis"
                        value={v}
                        checked={visibilidade === v}
                        onChange={() => setVisibilidade(v)}
                        className="accent-primary"
                      />
                      {v === 'publico'
                        ? 'Publico (URL acessivel)'
                        : 'Restrito (somente interno)'}
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Alt text */}
              <div>
                <label htmlFor="svg-alt" className={ui.label}>
                  Texto alternativo (alt)
                  {visibilidade === 'publico' && (
                    <span aria-hidden="true" className="ml-1 text-danger">
                      *
                    </span>
                  )}
                </label>
                <p id="svg-alt-desc" className="mt-0.5 text-xs text-fg/60">
                  {visibilidade === 'publico'
                    ? 'Obrigatorio para imagens publicas — descreva o conteudo visual para leitores de tela (WCAG 2.1 AA).'
                    : 'Recomendado. Descreva o conteudo visual do SVG.'}
                </p>
                <input
                  id="svg-alt"
                  type="text"
                  className={`mt-1 ${ui.input}`}
                  value={altText}
                  onChange={(e) => setAltText(e.target.value)}
                  aria-describedby="svg-alt-desc"
                  aria-required={visibilidade === 'publico'}
                  placeholder="Ex.: Brasao municipal em azul e branco"
                />
              </div>
            </div>
          </section>

          {/* Erro ao salvar */}
          {erroSalvar && (
            <div className="mt-4" role="alert">
              <Aviso tipo="erro">{erroSalvar}</Aviso>
            </div>
          )}

          {/* Acoes */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-fg/50">
              Uma nova copia sera criada — o original nao sera alterado.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className={ui.btnGhost}
                onClick={onClose}
                disabled={salvando}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={ui.btn}
                disabled={salvando || !temAlteracoes}
                aria-busy={salvando}
                aria-disabled={!temAlteracoes}
              >
                {salvando ? 'Salvando…' : 'Salvar copia'}
              </button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  );
}
