'use client';

/**
 * Grid de miniaturas de midia, filtros e paginacao compartilhados.
 * Reutilizados pela galeria /admin/midia e pelo MediaPicker.
 */

import { iconePorExt, type MediaAsset, type MediaCategoria, type MediaTipo } from '../../../lib/media';
import { ui } from './ui';

// ─── Icone de extensao ────────────────────────────────────────────────────────

function ExtIcon({ ext, tamanho = 'normal' }: { ext: string; tamanho?: 'normal' | 'grande' }) {
  const label = iconePorExt(ext);
  const cls =
    tamanho === 'grande'
      ? 'flex h-32 w-32 items-center justify-center rounded bg-muted text-2xl font-bold text-fg/60'
      : 'flex h-full w-full items-center justify-center rounded bg-muted text-xs font-bold text-fg/60';
  return (
    <span className={cls} aria-hidden="true">
      {label}
    </span>
  );
}

export function ExtIconGrande({ ext }: { ext: string }) {
  return <ExtIcon ext={ext} tamanho="grande" />;
}

// ─── Grid de miniaturas ───────────────────────────────────────────────────────

interface GridProps {
  items: MediaAsset[];
  carregando: boolean;
  /** Modo picker: clicar seleciona o asset. */
  onSelect?: (asset: MediaAsset) => void;
  /** Modo galeria: clicar abre detalhe. */
  onOpen?: (asset: MediaAsset) => void;
}

export default function MediaGrid({ items, carregando, onSelect, onOpen }: GridProps) {
  const handler = onSelect ?? onOpen;

  if (carregando) {
    return (
      <p aria-live="polite" className="py-12 text-center text-sm text-fg/60">
        Carregando midia…
      </p>
    );
  }

  if (items.length === 0) {
    return (
      <p aria-live="polite" className="py-12 text-center text-sm text-fg/60">
        Nenhuma midia encontrada com os filtros selecionados.
      </p>
    );
  }

  return (
    <ul
      role="list"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      aria-label="Grade de midia"
    >
      {items.map((asset) => {
        const ehImagem = asset.tipo === 'imagem' && asset.urlPublica;
        const label = asset.altText || asset.nomeOriginal;

        return (
          <li key={asset.id}>
            <button
              type="button"
              onClick={() => handler?.(asset)}
              className={[
                'group relative flex w-full flex-col overflow-hidden rounded border border-border bg-bg',
                'hover:border-primary hover:shadow-md',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                'transition-all',
                onSelect ? 'cursor-pointer' : '',
              ].join(' ')}
              aria-label={`${onSelect ? 'Selecionar' : 'Ver detalhes de'}: ${label}`}
            >
              {/* Miniatura */}
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {ehImagem ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.urlPublica!}
                    alt={label}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <ExtIcon ext={asset.ext} />
                )}
              </div>

              {/* Legenda */}
              <div className="px-2 py-1.5 text-left">
                <p className="truncate text-xs font-medium text-fg" title={asset.nomeOriginal}>
                  {asset.nomeOriginal}
                </p>
                <p className="truncate text-xs text-fg/50">{asset.categoria}</p>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Filtros compartilhados ───────────────────────────────────────────────────

const TIPOS: { value: MediaTipo | ''; label: string }[] = [
  { value: '', label: 'Todos os tipos' },
  { value: 'imagem', label: 'Imagem' },
  { value: 'documento', label: 'Documento' },
  { value: 'video', label: 'Video' },
  { value: 'audio', label: 'Audio' },
  { value: 'outro', label: 'Outro' },
];

interface FiltrosProps {
  filtroQ: string;
  onQ: (v: string) => void;
  filtroTipo: MediaTipo | '';
  onTipo: (v: MediaTipo | '') => void;
  filtroCategoria: string;
  onCategoria: (v: string) => void;
  categorias: MediaCategoria[];
  onBuscar: () => void;
  carregando?: boolean;
}

export function MediaFiltros({
  filtroQ,
  onQ,
  filtroTipo,
  onTipo,
  filtroCategoria,
  onCategoria,
  categorias,
  onBuscar,
  carregando,
}: FiltrosProps) {
  return (
    <form
      role="search"
      aria-label="Filtros de midia"
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onBuscar();
      }}
    >
      <div className="flex-1 min-w-[180px]">
        <label htmlFor="media-q" className="sr-only">
          Buscar por nome
        </label>
        <input
          id="media-q"
          type="search"
          placeholder="Buscar por nome…"
          className={ui.input}
          value={filtroQ}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="media-tipo" className="sr-only">
          Tipo
        </label>
        <select
          id="media-tipo"
          className={ui.input}
          value={filtroTipo}
          onChange={(e) => onTipo(e.target.value as MediaTipo | '')}
        >
          {TIPOS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="media-cat" className="sr-only">
          Categoria
        </label>
        <select
          id="media-cat"
          className={ui.input}
          value={filtroCategoria}
          onChange={(e) => onCategoria(e.target.value)}
        >
          <option value="">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      <button
        type="submit"
        className={ui.btn}
        disabled={carregando}
        aria-busy={carregando}
      >
        Buscar
      </button>
    </form>
  );
}

// ─── Paginacao compartilhada ──────────────────────────────────────────────────

interface PaginacaoProps {
  page: number;
  totalPaginas: number;
  total: number;
  onPage: (p: number) => void;
}

export function Paginacao({ page, totalPaginas, total, onPage }: PaginacaoProps) {
  if (totalPaginas <= 1) return null;
  return (
    <nav aria-label="Paginacao de midia" className="flex items-center justify-between gap-3 pt-2">
      <p className="text-sm text-fg/60">
        {total} {total === 1 ? 'item' : 'itens'}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className={ui.btnGhost}
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Pagina anterior"
        >
          &laquo; Anterior
        </button>
        <span className="flex items-center px-2 text-sm text-fg/70">
          {page} / {totalPaginas}
        </span>
        <button
          type="button"
          className={ui.btnGhost}
          disabled={page >= totalPaginas}
          onClick={() => onPage(page + 1)}
          aria-label="Proxima pagina"
        >
          Proxima &raquo;
        </button>
      </div>
    </nav>
  );
}
