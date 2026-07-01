'use client';

/**
 * Galeria de Midia — painel administrativo.
 * Rota: /admin/midia
 *
 * Responsabilidades:
 *  - Listagem paginada com filtros (tipo, categoria, busca)
 *  - Grid de miniaturas (imagem ou icone por extensao)
 *  - Modal de detalhe: preview + metadados + URL publica + acoes (editar, excluir)
 *  - Modal de upload (aba separada)
 */

import { useState, useCallback, useEffect } from 'react';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaGrid, { ExtIconGrande, MediaFiltros, Paginacao } from '../_components/MediaGrid';
import MediaUploadForm from '../_components/MediaUploadForm';
import SvgEditorCores from '../_components/SvgEditorCores';
import { useMediaLibrary } from '../_components/useMediaLibrary';
import {
  formatarBytes,
  listarTiposMidia,
  type MediaAsset,
  type MediaCategoria,
  type MediaTipoMidia,
} from '../../../lib/media';
import { AdminApiError } from '../../../lib/admin-api';
import { dataCurta } from '../../../lib/format';

// ─── Modal de detalhe de um asset ────────────────────────────────────────────

interface ModalDetalheProps {
  asset: MediaAsset;
  categorias: MediaCategoria[];
  tipos: MediaTipoMidia[];
  onClose: () => void;
  onAtualizar: (
    id: string,
    dto: { altText?: string; categoriaId?: string; tipoMidiaId?: string | null },
  ) => Promise<MediaAsset>;
  onExcluir: (id: string) => Promise<void>;
  onAlterado: () => void;
  /** Abre o editor de cores SVG para este asset. */
  onEditarCores: (asset: MediaAsset) => void;
}

function ModalDetalhe({
  asset,
  categorias,
  tipos,
  onClose,
  onAtualizar,
  onExcluir,
  onAlterado,
  onEditarCores,
}: ModalDetalheProps) {
  const [aba, setAba] = useState<'detalhe' | 'editar'>('detalhe');
  const [altEdit, setAltEdit] = useState(asset.altText ?? '');
  const [catEdit, setCatEdit] = useState(
    categorias.find((c) => c.slug === asset.categoria)?.id ?? '',
  );
  const [tipoEdit, setTipoEdit] = useState(asset.tipoMidiaId ?? '');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);

  const ehImagem = asset.tipo === 'imagem' && asset.urlPublica;

  // O seletor de tipos só traz os ATIVOS. Se o tipo vinculado a esta mídia foi
  // desativado, injeta-o como opção (marcado "inativo") para o dropdown não
  // mentir/perder o rótulo ao editar. Dado já vem no DTO (asset.tipoMidia).
  const tiposParaSelect: MediaTipoMidia[] =
    asset.tipoMidia && !tipos.some((t) => t.id === asset.tipoMidia!.id)
      ? [
          ...tipos,
          {
            id: asset.tipoMidia.id,
            nome: `${asset.tipoMidia.nome} (inativo)`,
            slug: asset.tipoMidia.slug,
          },
        ]
      : tipos;

  async function salvar() {
    setErro('');
    if (asset.tipo === 'imagem' && !altEdit.trim()) {
      setErro('O texto alternativo e obrigatorio para imagens.');
      return;
    }
    setSalvando(true);
    try {
      await onAtualizar(asset.id, {
        altText: altEdit.trim() || undefined,
        categoriaId: catEdit || undefined,
        // '' → null remove o rótulo; id vincula
        tipoMidiaId: tipoEdit || null,
      });
      onAlterado();
      onClose();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar alteracoes.');
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    setErro('');
    setExcluindo(true);
    try {
      await onExcluir(asset.id);
      onAlterado();
      onClose();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir midia.');
    } finally {
      setExcluindo(false);
    }
  }

  async function copiarUrl() {
    if (!asset.urlPublica) return;
    await navigator.clipboard.writeText(asset.urlPublica);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <Modal open onClose={onClose} title={asset.nomeOriginal}>
      {/* Abas */}
      <div role="tablist" aria-label="Secoes do detalhe" className="mb-4 flex gap-1 border-b border-border">
        {(['detalhe', 'editar'] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            type="button"
            onClick={() => setAba(a)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary',
              aba === a
                ? 'border-b-2 border-primary text-primary'
                : 'text-fg/60 hover:text-fg',
            ].join(' ')}
          >
            {a === 'detalhe' ? 'Detalhe' : 'Editar'}
          </button>
        ))}
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {aba === 'detalhe' && (
        <div className="flex flex-col gap-4 sm:flex-row">
          {/* Preview */}
          <div className="flex shrink-0 items-center justify-center sm:w-48">
            {ehImagem ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={asset.urlPublica!}
                alt={asset.altText || asset.nomeOriginal}
                className="max-h-48 max-w-full rounded border border-border object-contain"
              />
            ) : (
              <ExtIconGrande ext={asset.ext} />
            )}
          </div>

          {/* Metadados */}
          <div className="flex-1 space-y-2 text-sm">
            <dl className="space-y-1">
              {[
                { label: 'Nome original', value: asset.nomeOriginal },
                { label: 'Tipo', value: asset.tipo },
                { label: 'Categoria', value: asset.categoria },
                ...(asset.tipoMidia
                  ? [{ label: 'Tipo de midia', value: asset.tipoMidia.nome }]
                  : []),
                { label: 'Visibilidade', value: asset.visibilidade },
                { label: 'MIME', value: asset.mime },
                { label: 'Tamanho', value: formatarBytes(asset.tamanhoBytes) },
                ...(asset.largura && asset.altura
                  ? [{ label: 'Dimensoes', value: `${asset.largura} × ${asset.altura} px` }]
                  : []),
                { label: 'Enviado em', value: dataCurta(asset.criadoEm) },
                ...(asset.altText ? [{ label: 'Alt text', value: asset.altText }] : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-32 shrink-0 font-semibold text-fg/60">{label}:</dt>
                  <dd className="break-all text-fg">{value}</dd>
                </div>
              ))}
            </dl>

            {/* URL publica */}
            {asset.urlPublica && (
              <div className="mt-3 rounded border border-border bg-muted p-2">
                <p className="mb-1 text-xs font-semibold text-fg/70">Caminho publico:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 break-all text-xs text-fg">{asset.urlPublica}</code>
                  <button
                    type="button"
                    onClick={copiarUrl}
                    className={ui.btnGhost}
                    aria-label="Copiar URL publica"
                  >
                    {copiado ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            {/* Acoes */}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className={ui.btnGhost}
                onClick={() => setAba('editar')}
              >
                Editar
              </button>
              {asset.mime === 'image/svg+xml' && (
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => onEditarCores(asset)}
                  aria-label={`Editar cores do SVG: ${asset.nomeOriginal}`}
                >
                  Editar cores
                </button>
              )}
              {confirmarExclusao ? (
                <>
                  <span className="flex items-center text-sm text-danger">
                    Confirmar exclusao?
                  </span>
                  <button
                    type="button"
                    className={ui.btnDanger}
                    disabled={excluindo}
                    aria-busy={excluindo}
                    onClick={excluir}
                  >
                    {excluindo ? 'Excluindo…' : 'Sim, excluir'}
                  </button>
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => setConfirmarExclusao(false)}
                  >
                    Cancelar
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className={ui.btnDanger}
                  onClick={() => setConfirmarExclusao(true)}
                >
                  Excluir
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {aba === 'editar' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            salvar();
          }}
          className="space-y-4"
          noValidate
        >
          <div>
            <label htmlFor="edit-alt" className={ui.label}>
              Texto alternativo (alt)
              {asset.tipo === 'imagem' && (
                <span aria-hidden="true" className="text-danger ml-1">*</span>
              )}
            </label>
            <input
              id="edit-alt"
              type="text"
              className={`mt-1 ${ui.input}`}
              value={altEdit}
              onChange={(e) => setAltEdit(e.target.value)}
              aria-required={asset.tipo === 'imagem'}
              placeholder="Descricao acessivel da imagem"
            />
          </div>

          <div>
            <label htmlFor="edit-cat" className={ui.label}>
              Categoria
            </label>
            <select
              id="edit-cat"
              className={`mt-1 ${ui.input}`}
              value={catEdit}
              onChange={(e) => setCatEdit(e.target.value)}
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          {tiposParaSelect.length > 0 && (
            <div>
              <label htmlFor="edit-tipo-midia" className={ui.label}>
                Tipo de midia <span className="text-fg/50">(opcional)</span>
              </label>
              <select
                id="edit-tipo-midia"
                className={`mt-1 ${ui.input}`}
                value={tipoEdit}
                onChange={(e) => setTipoEdit(e.target.value)}
              >
                <option value="">Sem tipo</option>
                {tiposParaSelect.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setAba('detalhe')}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={ui.btn}
              disabled={salvando}
              aria-busy={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar alteracoes'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

// ─── Modal de upload ──────────────────────────────────────────────────────────

interface ModalUploadProps {
  categorias: MediaCategoria[];
  tipos: MediaTipoMidia[];
  onClose: () => void;
  onSucesso: () => void;
}

function ModalUpload({ categorias, tipos, onClose, onSucesso }: ModalUploadProps) {
  return (
    <Modal open onClose={onClose} title="Enviar midia">
      <MediaUploadForm
        categorias={categorias}
        tipos={tipos}
        onSucesso={() => {
          onSucesso();
          onClose();
        }}
      />
    </Modal>
  );
}

// ─── Pagina principal ─────────────────────────────────────────────────────────

export default function BibliotecaMidiaPage() {
  const lib = useMediaLibrary();
  const [assetAberto, setAssetAberto] = useState<MediaAsset | null>(null);
  const [uploadAberto, setUploadAberto] = useState(false);
  const [svgEditorAsset, setSvgEditorAsset] = useState<MediaAsset | null>(null);
  const [tipos, setTipos] = useState<MediaTipoMidia[]>([]);

  // Tipos de mídia (rótulo opcional) para os seletores de upload/edição.
  useEffect(() => {
    listarTiposMidia()
      .then(setTipos)
      .catch(() => setTipos([]));
  }, []);

  const fecharDetalhe = useCallback(() => setAssetAberto(null), []);

  const abrirEditorCores = useCallback((asset: MediaAsset) => {
    // Fecha o modal de detalhe antes de abrir o editor de cores para evitar
    // sobreposicao de dialogos e problemas de gerenciamento de foco.
    setAssetAberto(null);
    setSvgEditorAsset(asset);
  }, []);

  const fecharEditorCores = useCallback(() => setSvgEditorAsset(null), []);

  const aoSalvarCoresSvg = useCallback(
    (_novoAsset: MediaAsset) => {
      fecharEditorCores();
      lib.recarregar();
    },
    [fecharEditorCores, lib],
  );

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Biblioteca de Midia"
        description="Gerencie imagens, documentos e arquivos do portal."
      >
        <button
          type="button"
          className={ui.btn}
          onClick={() => setUploadAberto(true)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
          </svg>
          Enviar midia
        </button>
      </AdminHeader>

      {/* Filtros */}
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

      {/* Erro */}
      {lib.erro && <Aviso tipo="erro">{lib.erro}</Aviso>}

      {/* Grid */}
      <MediaGrid
        items={lib.items}
        carregando={lib.carregando}
        onOpen={setAssetAberto}
      />

      {/* Paginacao */}
      <Paginacao
        page={lib.page}
        totalPaginas={lib.totalPaginas}
        total={lib.total}
        onPage={lib.setPage}
      />

      {/* Modal de detalhe */}
      {assetAberto && (
        <ModalDetalhe
          asset={assetAberto}
          categorias={lib.categorias}
          tipos={tipos}
          onClose={fecharDetalhe}
          onAtualizar={lib.atualizarMidia}
          onExcluir={lib.excluirMidia}
          onAlterado={lib.recarregar}
          onEditarCores={abrirEditorCores}
        />
      )}

      {/* Modal de upload */}
      {uploadAberto && (
        <ModalUpload
          categorias={lib.categorias}
          tipos={tipos}
          onClose={() => setUploadAberto(false)}
          onSucesso={lib.recarregar}
        />
      )}

      {/* Editor de cores SVG */}
      {svgEditorAsset && (
        <SvgEditorCores
          asset={svgEditorAsset}
          onClose={fecharEditorCores}
          onSalvo={aoSalvarCoresSvg}
        />
      )}
    </div>
  );
}
