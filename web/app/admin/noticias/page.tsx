'use client';

/**
 * Admin — Notícias
 * Endpoints:
 *   GET  /api/admin/noticias?q=&categoria=&publicado=&page=&pageSize=
 *   POST /api/admin/noticias
 *   PUT  /api/admin/noticias/:id
 *   DELETE /api/admin/noticias/:id
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

interface Noticia {
  id: string;
  slug: string;
  titulo: string;
  resumo?: string;
  conteudo?: string;
  imagemUrl?: string;
  categoria?: string;
  autor?: string;
  fonte?: string;
  legenda?: string;
  credito?: string;
  secretariaId?: string;
  publicado: boolean;
  publicadoEm?: string;
  visualizacoes?: number;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function slugificar(texto: string): string {
  // Normaliza NFD e remove combinações de diacríticos (U+0300–U+036F)
  const semAcento = texto.normalize('NFD').replace(/\p{Mn}/gu, '');
  return semAcento
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function noticiaVazia(): Omit<Noticia, 'id' | 'visualizacoes'> {
  return {
    titulo: '',
    slug: '',
    resumo: '',
    conteudo: '',
    imagemUrl: '',
    categoria: '',
    autor: '',
    fonte: '',
    legenda: '',
    credito: '',
    secretariaId: '',
    publicado: false,
    publicadoEm: '',
  };
}

function formatarData(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR');
  } catch {
    return iso;
  }
}

// ─── Modal criar / editar ─────────────────────────────────────────────────────

function ModalNoticia({
  open,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: Noticia | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Omit<Noticia, 'id' | 'visualizacoes'>>(noticiaVazia());
  const [slugManual, setSlugManual] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [pickerAberto, setPickerAberto] = useState(false);
  const [secretarias, setSecretarias] = useState<{ id: string; nome: string }[]>([]);

  useEffect(() => {
    if (open) adminGet<{ id: string; nome: string }[]>('/api/admin/secretarias?pageSize=200').then((r: any) => setSecretarias(r.items ?? r)).catch(() => setSecretarias([]));
  }, [open]);

  useEffect(() => {
    if (open) {
      setErro('');
      setSlugManual(false);
      setForm(
        editando
          ? {
              titulo: editando.titulo,
              slug: editando.slug,
              resumo: editando.resumo ?? '',
              conteudo: editando.conteudo ?? '',
              imagemUrl: editando.imagemUrl ?? '',
              categoria: editando.categoria ?? '',
              autor: editando.autor ?? '',
              fonte: editando.fonte ?? '',
              legenda: editando.legenda ?? '',
              credito: editando.credito ?? '',
              secretariaId: editando.secretariaId ?? '',
              publicado: editando.publicado,
              publicadoEm: editando.publicadoEm ?? '',
            }
          : noticiaVazia(),
      );
    }
  }, [open, editando]);

  function setField<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function handleTitulo(v: string) {
    setField('titulo', v);
    if (!slugManual) {
      setField('slug', slugificar(v));
    }
  }

  function handleSlug(v: string) {
    setSlugManual(true);
    setField('slug', slugificar(v));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await adminPut(`/api/admin/noticias/${editando.id}`, form);
      } else {
        await adminPost('/api/admin/noticias', form);
      }
      onSalvo();
      onClose();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setErro('Slug já está em uso. Escolha um diferente.');
      } else {
        setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar notícia.');
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar notícia' : 'Nova notícia'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Título */}
        <div>
          <label htmlFor="not-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="not-titulo"
            type="text"
            required
            className={ui.input}
            value={form.titulo}
            onChange={(e) => handleTitulo(e.target.value)}
          />
        </div>

        {/* Slug */}
        <div>
          <label htmlFor="not-slug" className={ui.label}>
            Slug (URL amigável) <span aria-hidden="true">*</span>
          </label>
          <input
            id="not-slug"
            type="text"
            required
            className={ui.input}
            value={form.slug}
            onChange={(e) => handleSlug(e.target.value)}
            aria-describedby="not-slug-hint"
          />
          <p id="not-slug-hint" className="mt-1 text-xs text-fg/60">
            Sugerido automaticamente a partir do título. Use apenas letras, números e hífens.
          </p>
        </div>

        {/* Resumo */}
        <div>
          <label htmlFor="not-resumo" className={ui.label}>
            Resumo
          </label>
          <textarea
            id="not-resumo"
            rows={2}
            className={ui.input}
            value={form.resumo}
            onChange={(e) => setField('resumo', e.target.value)}
            placeholder="Breve descrição para listagens e compartilhamentos…"
          />
        </div>

        {/* Conteúdo */}
        <div>
          <label htmlFor="not-conteudo" className={ui.label}>
            Conteúdo
          </label>
          <textarea
            id="not-conteudo"
            rows={8}
            className={ui.input}
            value={form.conteudo}
            onChange={(e) => setField('conteudo', e.target.value)}
            placeholder="Texto completo da notícia…"
          />
        </div>

        {/* Imagem */}
        <div>
          <label htmlFor="not-imagemUrl" className={ui.label}>
            Imagem de capa
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="not-imagemUrl"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={form.imagemUrl}
              onChange={(e) => setField('imagemUrl', e.target.value)}
              placeholder="https://..."
              aria-describedby="not-img-hint"
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
          <p id="not-img-hint" className="mt-1 text-xs text-fg/60">
            Informe uma URL ou selecione da Biblioteca de Mídia.
          </p>
          {form.imagemUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.imagemUrl}
                alt="Pré-visualização da imagem de capa"
                className="max-h-32 rounded border border-border object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Categoria / Autor */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="not-categoria" className={ui.label}>
              Categoria
            </label>
            <input
              id="not-categoria"
              type="text"
              className={ui.input}
              value={form.categoria}
              onChange={(e) => setField('categoria', e.target.value)}
              placeholder="ex.: Saúde"
            />
          </div>
          <div>
            <label htmlFor="not-autor" className={ui.label}>
              Autor
            </label>
            <input
              id="not-autor"
              type="text"
              className={ui.input}
              value={form.autor}
              onChange={(e) => setField('autor', e.target.value)}
              placeholder="Assessoria de Comunicação"
            />
          </div>
          <div>
            <label className={ui.label}>Fonte</label>
            <input type="text" className={ui.input} value={form.fonte} onChange={(e) => setField('fonte', e.target.value)} placeholder="Origem da informação" />
          </div>
          <div>
            <label className={ui.label}>Legenda da foto</label>
            <input type="text" className={ui.input} value={form.legenda} onChange={(e) => setField('legenda', e.target.value)} />
          </div>
          <div>
            <label className={ui.label}>Crédito da foto</label>
            <input type="text" className={ui.input} value={form.credito} onChange={(e) => setField('credito', e.target.value)} placeholder="Foto: Nome do fotógrafo" />
          </div>
        </div>

        <div>
          <label htmlFor="not-secretaria" className={ui.label}>Secretaria (opcional)</label>
          <select id="not-secretaria" className={ui.input} value={form.secretariaId} onChange={(e) => setField('secretariaId', e.target.value)}>
            <option value="">— nenhuma —</option>
            {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <p className="mt-1 text-xs text-fg/60">Se vinculada, a notícia aparece também na página da secretaria.</p>
        </div>

        {/* Publicado */}
        <div className="flex items-center gap-2">
          <input
            id="not-publicado"
            type="checkbox"
            checked={form.publicado}
            onChange={(e) => setField('publicado', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="not-publicado" className="text-sm font-semibold">
            Publicar imediatamente
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

      <MediaPicker
        open={pickerAberto}
        onClose={() => setPickerAberto(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) setField('imagemUrl', asset.urlPublica);
          setPickerAberto(false);
        }}
      />
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function NoticiasAdminPage() {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  // Filtros
  const [q, setQ] = useState('');
  const [categoria, setCategoria] = useState('');
  const [publicado, setPublicado] = useState<'' | 'true' | 'false'>('');

  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Noticia | null>(null);

  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<Pagina<Noticia>>(
        `/api/admin/noticias${qs({ q, categoria, publicado, page, pageSize: PAGE_SIZE })}`,
      );
      setNoticias(data.items);
      setTotal(data.total);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar notícias.');
    } finally {
      setCarregando(false);
    }
  }, [q, categoria, publicado, page]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Ao mudar filtros, volta para página 1
  function buscar(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    carregar();
  }

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEditar(n: Noticia) {
    setEditando(n);
    setModalAberto(true);
  }

  async function excluir(id: string) {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/noticias/${id}`);
      setMsgOk('Notícia excluída com sucesso.');
      setConfirmandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir notícia.');
    } finally {
      setExcluindo(false);
    }
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <AdminHeader
        title="Notícias"
        description="Gerencie as notícias publicadas no portal municipal."
      >
        <button type="button" className={ui.btn} onClick={abrirNovo}>
          + Nova notícia
        </button>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Filtros */}
      <form
        onSubmit={buscar}
        className="flex flex-wrap gap-3"
        role="search"
        aria-label="Filtros de notícias"
      >
        <input
          type="search"
          placeholder="Buscar notícias…"
          className={`${ui.input} max-w-xs`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Buscar por título"
        />
        <input
          type="text"
          placeholder="Categoria"
          className={`${ui.input} max-w-[160px]`}
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          aria-label="Filtrar por categoria"
        />
        <select
          className={`${ui.input} max-w-[160px]`}
          value={publicado}
          onChange={(e) => setPublicado(e.target.value as '' | 'true' | 'false')}
          aria-label="Filtrar por status de publicação"
        >
          <option value="">Todos</option>
          <option value="true">Publicados</option>
          <option value="false">Rascunhos</option>
        </select>
        <button type="submit" className={ui.btnGhost}>
          Buscar
        </button>
      </form>

      {/* Tabela */}
      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="py-12 text-center text-sm text-fg/60">
          Carregando notícias…
        </p>
      ) : noticias.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg/60">
          Nenhuma notícia encontrada.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Lista de notícias">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  Título
                </th>
                <th scope="col" className={ui.th}>
                  Categoria
                </th>
                <th scope="col" className={ui.th}>
                  Status
                </th>
                <th scope="col" className={ui.th}>
                  Publicação
                </th>
                <th scope="col" className={`${ui.th} text-right`}>
                  Views
                </th>
                <th scope="col" className={ui.th}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {noticias.map((n) => (
                <tr key={n.id}>
                  <td className={ui.td}>
                    <span className="font-medium">{n.titulo}</span>
                    <span className="block text-xs text-fg/50">{n.slug}</span>
                  </td>
                  <td className={ui.td}>
                    {n.categoria ? (
                      <span className={`${ui.badge} bg-primary/10 text-primary`}>
                        {n.categoria}
                      </span>
                    ) : (
                      <span className="text-xs text-fg/40">—</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    <span
                      className={`${ui.badge} ${
                        n.publicado
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-fg/60'
                      }`}
                    >
                      {n.publicado ? 'Publicado' : 'Rascunho'}
                    </span>
                  </td>
                  <td className={ui.td}>{formatarData(n.publicadoEm)}</td>
                  <td className={`${ui.td} text-right tabular-nums`}>
                    {n.visualizacoes ?? 0}
                  </td>
                  <td className={ui.td}>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => abrirEditar(n)}
                        aria-label={`Editar notícia "${n.titulo}"`}
                      >
                        Editar
                      </button>
                      {confirmandoId === n.id ? (
                        <>
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => excluir(n.id)}
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
                          onClick={() => setConfirmandoId(n.id)}
                          aria-label={`Excluir notícia "${n.titulo}"`}
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
        <nav aria-label="Paginação de notícias" className="flex items-center gap-2 pt-2">
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
      <ModalNoticia
        open={modalAberto}
        editando={editando}
        onClose={() => setModalAberto(false)}
        onSalvo={() => {
          setMsgOk(editando ? 'Notícia atualizada com sucesso.' : 'Notícia criada com sucesso.');
          carregar();
        }}
      />
    </div>
  );
}
