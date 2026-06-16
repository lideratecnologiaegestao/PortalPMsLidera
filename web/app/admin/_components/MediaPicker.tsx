'use client';

/**
 * MediaPicker — componente reutilizavel de selecao de midia.
 *
 * Abre um Modal com duas abas:
 *  - Galeria: filtros + grid de miniaturas; clicar em uma midia chama onSelect e fecha.
 *  - Upload: envia via uploadMidia e chama onSelect com o asset criado.
 *
 * Props:
 *  open      — controla visibilidade
 *  onClose   — callback para fechar
 *  onSelect  — callback com o MediaAsset escolhido
 *  tipo?     — filtra o picker para um tipo especifico
 */

import { useState } from 'react';
import { Modal, ui } from './ui';
import MediaGrid, { MediaFiltros, Paginacao } from './MediaGrid';
import MediaUploadForm from './MediaUploadForm';
import { useMediaLibrary } from './useMediaLibrary';
import type { MediaAsset, MediaTipo } from '../../../lib/media';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (asset: MediaAsset) => void;
  tipo?: MediaTipo;
}

export default function MediaPicker({ open, onClose, onSelect, tipo }: Props) {
  const [aba, setAba] = useState<'galeria' | 'upload'>('galeria');

  const lib = useMediaLibrary({ tipoInicial: tipo ?? '' });

  function selecionarEFechar(asset: MediaAsset) {
    onSelect(asset);
    onClose();
  }

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={tipo ? `Selecionar ${tipo}` : 'Selecionar midia'}
    >
      {/* Abas */}
      <div role="tablist" aria-label="Secoes do seletor de midia" className="mb-4 flex gap-1 border-b border-border">
        {(['galeria', 'upload'] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            type="button"
            onClick={() => setAba(a)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
              aba === a
                ? 'border-b-2 border-primary text-primary'
                : 'text-fg/60 hover:text-fg',
            ].join(' ')}
          >
            {a === 'galeria' ? 'Galeria' : 'Enviar novo'}
          </button>
        ))}
      </div>

      {aba === 'galeria' && (
        <div className="space-y-4">
          <MediaFiltros
            filtroQ={lib.filtroQ}
            onQ={lib.setFiltroQ}
            filtroTipo={lib.filtroTipo}
            onTipo={lib.setFiltroTipo}
            filtroCategoria={lib.filtroCategoria}
            onCategoria={lib.setFiltroCategoria}
            categorias={lib.categorias}
            onBuscar={lib.buscar}
            carregando={lib.carregando}
          />

          {lib.erro && (
            <p role="alert" className="text-sm text-danger">
              {lib.erro}
            </p>
          )}

          <MediaGrid
            items={lib.items}
            carregando={lib.carregando}
            onSelect={selecionarEFechar}
          />

          <Paginacao
            page={lib.page}
            totalPaginas={lib.totalPaginas}
            total={lib.total}
            onPage={lib.setPage}
          />
        </div>
      )}

      {aba === 'upload' && (
        <MediaUploadForm
          categorias={lib.categorias}
          tipoFixo={tipo}
          onSucesso={(asset) => {
            // Apos upload bem sucedido, seleciona automaticamente e fecha
            selecionarEFechar(asset);
          }}
        />
      )}
    </Modal>
  );
}
