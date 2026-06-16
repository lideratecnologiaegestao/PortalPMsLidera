'use client';

/**
 * Admin — Banners da Home
 * Endpoints:
 *   GET  /api/admin/banners?page=&pageSize=
 *   POST /api/admin/banners
 *   PUT  /api/admin/banners/:id
 *   DELETE /api/admin/banners/:id
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
  type Pagina,
  AdminApiError,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

// ─── Tipo ────────────────────────────────────────────────────────────────────

interface Banner {
  id: string;
  titulo: string;
  subtitulo?: string;
  imagemUrl?: string;
  linkUrl?: string;
  ctaLabel?: string;
  conteudoHtml?: string;
  inicioEm?: string;
  fimEm?: string;
  ordem: number;
  ativo: boolean;
}

// ─── Formulário vazio ────────────────────────────────────────────────────────

function bannerVazio(): Omit<Banner, 'id'> {
  return {
    titulo: '',
    subtitulo: '',
    imagemUrl: '',
    linkUrl: '',
    ctaLabel: '',
    conteudoHtml: '',
    inicioEm: '',
    fimEm: '',
    ordem: 0,
    ativo: true,
  };
}

// ─── Modal de criar / editar ─────────────────────────────────────────────────

function ModalBanner({
  open,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: Banner | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Omit<Banner, 'id'>>(bannerVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [pickerAberto, setPickerAberto] = useState(false);

  // Preenche form ao abrir em modo edição
  useEffect(() => {
    if (open) {
      setErro('');
      setForm(
        editando
          ? {
              titulo: editando.titulo,
              subtitulo: editando.subtitulo ?? '',
              imagemUrl: editando.imagemUrl ?? '',
              linkUrl: editando.linkUrl ?? '',
              ctaLabel: editando.ctaLabel ?? '',
              conteudoHtml: editando.conteudoHtml ?? '',
              inicioEm: editando.inicioEm ? String(editando.inicioEm).slice(0, 16) : '',
              fimEm: editando.fimEm ? String(editando.fimEm).slice(0, 16) : '',
              ordem: editando.ordem,
              ativo: editando.ativo,
            }
          : bannerVazio(),
      );
    }
  }, [open, editando]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await adminPut(`/api/admin/banners/${editando.id}`, form);
      } else {
        await adminPost('/api/admin/banners', form);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar banner.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar banner' : 'Novo banner'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Título */}
        <div>
          <label htmlFor="ban-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="ban-titulo"
            type="text"
            required
            className={ui.input}
            value={form.titulo}
            onChange={(e) => set('titulo', e.target.value)}
          />
        </div>

        {/* Subtítulo */}
        <div>
          <label htmlFor="ban-subtitulo" className={ui.label}>
            Subtítulo
          </label>
          <input
            id="ban-subtitulo"
            type="text"
            className={ui.input}
            value={form.subtitulo}
            onChange={(e) => set('subtitulo', e.target.value)}
          />
        </div>

        {/* Imagem */}
        <div>
          <label htmlFor="ban-imagemUrl" className={ui.label}>
            Imagem do banner
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="ban-imagemUrl"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={form.imagemUrl}
              onChange={(e) => set('imagemUrl', e.target.value)}
              placeholder="https://..."
              aria-describedby="ban-img-hint"
            />
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setPickerAberto(true)}
              aria-label="Escolher imagem da biblioteca de mídia"
            >
              Escolher imagem
            </button>
          </div>
          <p id="ban-img-hint" className="mt-1 text-xs text-fg/60">
            Informe uma URL ou selecione da Biblioteca de Mídia. Tamanho ideal:{' '}
            <strong>1920 × 600 px</strong> (paisagem, até ~500 KB). A imagem é exibida
            inteira, sem corte — mantenha o foco no centro e evite texto colado nas bordas.
          </p>
          {/* Preview */}
          {form.imagemUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.imagemUrl}
                alt="Pré-visualização do banner"
                className="max-h-32 rounded border border-border object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Link URL */}
        <div>
          <label htmlFor="ban-linkUrl" className={ui.label}>
            URL de destino (link)
          </label>
          <input
            id="ban-linkUrl"
            type="url"
            className={ui.input}
            value={form.linkUrl}
            onChange={(e) => set('linkUrl', e.target.value)}
            placeholder="https://..."
          />
        </div>

        {/* CTA Label */}
        <div>
          <label htmlFor="ban-ctaLabel" className={ui.label}>
            Rótulo do botão (CTA)
          </label>
          <input
            id="ban-ctaLabel"
            type="text"
            className={ui.input}
            value={form.ctaLabel}
            onChange={(e) => set('ctaLabel', e.target.value)}
            placeholder="ex.: Saiba mais"
          />
        </div>

        {/* Datas de exibição */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.label}>Exibir a partir de</label>
            <input type="datetime-local" className={ui.input} value={form.inicioEm} onChange={(e) => set('inicioEm', e.target.value)} />
          </div>
          <div>
            <label className={ui.label}>Exibir até</label>
            <input type="datetime-local" className={ui.input} value={form.fimEm} onChange={(e) => set('fimEm', e.target.value)} />
          </div>
        </div>

        {/* Conteúdo HTML (opcional, no lugar do texto) */}
        <div>
          <label className={ui.label}>Conteúdo HTML (opcional)</label>
          <textarea className={`${ui.input} min-h-[80px]`} value={form.conteudoHtml} onChange={(e) => set('conteudoHtml', e.target.value)} placeholder="HTML livre exibido sobre o banner" />
        </div>

        {/* Ordem */}
        <div>
          <label htmlFor="ban-ordem" className={ui.label}>
            Ordem de exibição
          </label>
          <input
            id="ban-ordem"
            type="number"
            min={0}
            className={ui.input}
            value={form.ordem}
            onChange={(e) => set('ordem', Number(e.target.value))}
          />
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input
            id="ban-ativo"
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set('ativo', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="ban-ativo" className="text-sm font-semibold">
            Banner ativo
          </label>
        </div>

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      {/* MediaPicker */}
      <MediaPicker
        open={pickerAberto}
        onClose={() => setPickerAberto(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) set('imagemUrl', asset.urlPublica);
          setPickerAberto(false);
        }}
      />
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function BannersAdminPage() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Banner | null>(null);

  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<Pagina<Banner>>(
        `/api/admin/banners${qs({ page, pageSize: PAGE_SIZE })}`,
      );
      setBanners(data.items);
      setTotal(data.total);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar banners.');
    } finally {
      setCarregando(false);
    }
  }, [page]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEditar(b: Banner) {
    setEditando(b);
    setModalAberto(true);
  }

  async function excluir(id: string) {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/banners/${id}`);
      setMsgOk('Banner excluído com sucesso.');
      setConfirmandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir banner.');
    } finally {
      setExcluindo(false);
    }
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <AdminHeader
        title="Banners da Home"
        description="Gerencie os banners exibidos no carrossel da página inicial."
      >
        <button type="button" className={ui.btn} onClick={abrirNovo}>
          + Novo banner
        </button>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="py-12 text-center text-sm text-fg/60">
          Carregando banners…
        </p>
      ) : banners.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg/60">
          Nenhum banner cadastrado. Clique em &ldquo;Novo banner&rdquo; para começar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Lista de banners">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  Ordem
                </th>
                <th scope="col" className={ui.th}>
                  Título
                </th>
                <th scope="col" className={ui.th}>
                  Status
                </th>
                <th scope="col" className={ui.th}>
                  Imagem
                </th>
                <th scope="col" className={ui.th}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {banners.map((b) => (
                <tr key={b.id}>
                  <td className={ui.td}>{b.ordem}</td>
                  <td className={ui.td}>
                    <span className="font-medium">{b.titulo}</span>
                    {b.subtitulo && (
                      <span className="block text-xs text-fg/60">{b.subtitulo}</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    <span
                      className={`${ui.badge} ${
                        b.ativo
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-fg/60'
                      }`}
                    >
                      {b.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className={ui.td}>
                    {b.imagemUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={b.imagemUrl}
                        alt={`Miniatura do banner "${b.titulo}"`}
                        className="h-10 w-16 rounded border border-border object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="text-xs text-fg/40">—</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => abrirEditar(b)}
                        aria-label={`Editar banner "${b.titulo}"`}
                      >
                        Editar
                      </button>
                      {confirmandoId === b.id ? (
                        <>
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => excluir(b.id)}
                            disabled={excluindo}
                            aria-busy={excluindo}
                          >
                            {excluindo ? 'Excluindo…' : 'Confirmar exclusão'}
                          </button>
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => setConfirmandoId(null)}
                            disabled={excluindo}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={ui.btnDanger}
                          onClick={() => setConfirmandoId(b.id)}
                          aria-label={`Excluir banner "${b.titulo}"`}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <nav aria-label="Paginação de banners" className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className={ui.btnGhost}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Página anterior"
          >
            ← Anterior
          </button>
          <span className="text-sm text-fg/70">
            Página {page} de {totalPaginas} ({total} registros)
          </span>
          <button
            type="button"
            className={ui.btnGhost}
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Próxima página"
          >
            Próxima →
          </button>
        </nav>
      )}

      {/* Modal criar / editar */}
      <ModalBanner
        open={modalAberto}
        editando={editando}
        onClose={() => setModalAberto(false)}
        onSalvo={() => {
          setMsgOk(editando ? 'Banner atualizado com sucesso.' : 'Banner criado com sucesso.');
          carregar();
        }}
      />
    </div>
  );
}
