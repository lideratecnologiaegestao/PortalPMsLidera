'use client';

/**
 * Admin — Escola Cidadã / Cursos (CRUD + drill-down de conteúdo).
 *
 * Endpoints (professor/gestor/admin):
 *   GET    /api/professor/escola/cursos?page=&pageSize=
 *   POST   /api/professor/escola/cursos
 *   PUT    /api/professor/escola/cursos/:id
 *   DELETE /api/professor/escola/cursos/:id
 *   GET    /api/admin/escola/templates              (para o seletor de template)
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
  type Pagina,
} from '../../../lib/admin-api';
import { Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import CursoGestao from './CursoGestao';
import {
  fmtData,
  rotuloStatusCurso,
  STATUS_CURSO,
  toDateInput,
  type CursoAdmin,
  type TemplateAdmin,
} from './tipos';

const PAGE_SIZE = 20;

interface FormCurso {
  titulo: string;
  slug: string;
  resumo: string;
  descricao: string;
  conteudoProgramatico: string;
  capaUrl: string;
  cargaHoraria: number | '';
  inicioEm: string;
  fimEm: string;
  certificacao: boolean;
  notaMinima: number;
  templateId: string;
  status: string;
  publicado: boolean;
  ordem: number;
}

function formVazio(): FormCurso {
  return {
    titulo: '',
    slug: '',
    resumo: '',
    descricao: '',
    conteudoProgramatico: '',
    capaUrl: '',
    cargaHoraria: '',
    inicioEm: '',
    fimEm: '',
    certificacao: true,
    notaMinima: 70,
    templateId: '',
    status: 'rascunho',
    publicado: false,
    ordem: 0,
  };
}

function ModalCurso({
  open,
  editando,
  templates,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: CursoAdmin | null;
  templates: TemplateAdmin[];
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<FormCurso>(formVazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setForm(
      editando
        ? {
            titulo: editando.titulo,
            slug: editando.slug ?? '',
            resumo: editando.resumo ?? '',
            descricao: editando.descricao ?? '',
            conteudoProgramatico: editando.conteudoProgramatico ?? '',
            capaUrl: editando.capaUrl ?? '',
            cargaHoraria: editando.cargaHoraria ?? '',
            inicioEm: toDateInput(editando.inicioEm),
            fimEm: toDateInput(editando.fimEm),
            certificacao: editando.certificacao,
            notaMinima: Number(editando.notaMinima ?? 70),
            templateId: editando.templateId ?? '',
            status: editando.status ?? 'rascunho',
            publicado: editando.publicado,
            ordem: editando.ordem,
          }
        : formVazio(),
    );
  }, [open, editando]);

  function s<K extends keyof FormCurso>(k: K, v: FormCurso[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const body = {
      titulo: form.titulo,
      slug: form.slug || undefined,
      resumo: form.resumo || undefined,
      descricao: form.descricao || undefined,
      conteudoProgramatico: form.conteudoProgramatico || undefined,
      capaUrl: form.capaUrl || undefined,
      cargaHoraria: form.cargaHoraria === '' ? undefined : Number(form.cargaHoraria),
      inicioEm: form.inicioEm || undefined,
      fimEm: form.fimEm || undefined,
      certificacao: form.certificacao,
      notaMinima: Number(form.notaMinima) || 0,
      templateId: form.templateId || undefined,
      status: form.status || undefined,
      publicado: form.publicado,
      ordem: Number(form.ordem) || 0,
    };
    try {
      if (editando) await adminPut(`/api/professor/escola/cursos/${editando.id}`, body);
      else await adminPost('/api/professor/escola/cursos', body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar o curso.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar curso' : 'Novo curso'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor="curso-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="curso-titulo"
            type="text"
            required
            className={ui.input}
            value={form.titulo}
            onChange={(e) => s('titulo', e.target.value)}
            placeholder="ex.: Cidadania e Serviços Públicos na Prática"
          />
        </div>

        <div>
          <label htmlFor="curso-slug" className={ui.label}>
            Slug <span className="text-fg/50">(opcional — gerado do título)</span>
          </label>
          <input
            id="curso-slug"
            type="text"
            className={ui.input}
            value={form.slug}
            onChange={(e) => s('slug', e.target.value)}
            placeholder="servicos-municipais-na-pratica"
          />
        </div>

        <div>
          <label htmlFor="curso-resumo" className={ui.label}>
            Resumo
          </label>
          <input
            id="curso-resumo"
            type="text"
            className={ui.input}
            value={form.resumo}
            onChange={(e) => s('resumo', e.target.value)}
            placeholder="Frase curta exibida no catálogo."
          />
        </div>

        <div>
          <label htmlFor="curso-descricao" className={ui.label}>
            Descrição <span className="text-fg/50">(aceita HTML)</span>
          </label>
          <textarea
            id="curso-descricao"
            rows={4}
            className={ui.input}
            value={form.descricao}
            onChange={(e) => s('descricao', e.target.value)}
            placeholder="<p>Ementa, público-alvo, objetivos…</p>"
          />
        </div>

        <div>
          <label htmlFor="curso-conteudo" className={ui.label}>
            Conteúdo programático <span className="text-fg/50">(sai no certificado via {'{{conteudo}}'})</span>
          </label>
          <textarea
            id="curso-conteudo"
            rows={4}
            className={ui.input}
            value={form.conteudoProgramatico}
            onChange={(e) => s('conteudoProgramatico', e.target.value)}
            placeholder="Tópicos/ementa do curso (uma linha por item)."
          />
        </div>

        {/* Capa */}
        <div>
          <label htmlFor="curso-capa" className={ui.label}>
            Capa
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="curso-capa"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={form.capaUrl}
              onChange={(e) => s('capaUrl', e.target.value)}
              placeholder="https://..."
            />
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setPicker(true)}
              aria-label="Escolher capa da biblioteca de mídia"
            >
              Escolher imagem
            </button>
          </div>
          {form.capaUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.capaUrl}
                alt={`Capa do curso ${form.titulo || ''}`}
                className="h-28 w-48 rounded border border-border object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="curso-carga" className={ui.label}>
              Carga horária (h)
            </label>
            <input
              id="curso-carga"
              type="number"
              min={0}
              className={ui.input}
              value={form.cargaHoraria}
              onChange={(e) => s('cargaHoraria', e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="curso-inicio" className={ui.label}>
              Início
            </label>
            <input
              id="curso-inicio"
              type="date"
              className={ui.input}
              value={form.inicioEm}
              onChange={(e) => s('inicioEm', e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="curso-fim" className={ui.label}>
              Término
            </label>
            <input
              id="curso-fim"
              type="date"
              className={ui.input}
              value={form.fimEm}
              onChange={(e) => s('fimEm', e.target.value)}
            />
          </div>
        </div>

        {/* Certificação */}
        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Certificação</legend>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={form.certificacao}
              onChange={(e) => s('certificacao', e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Emitir certificado automaticamente ao concluir e ser aprovado
          </label>
          {form.certificacao && (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="curso-nota" className={ui.label}>
                  Nota mínima para aprovação (%)
                </label>
                <input
                  id="curso-nota"
                  type="number"
                  min={0}
                  max={100}
                  className={ui.input}
                  value={form.notaMinima}
                  onChange={(e) => s('notaMinima', Number(e.target.value))}
                />
              </div>
              <div>
                <label htmlFor="curso-template" className={ui.label}>
                  Modelo de certificado
                </label>
                <select
                  id="curso-template"
                  className={ui.input}
                  value={form.templateId}
                  onChange={(e) => s('templateId', e.target.value)}
                >
                  <option value="">Modelo padrão</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                      {t.padrao ? ' (padrão)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="curso-status" className={ui.label}>
              Situação
            </label>
            <select
              id="curso-status"
              className={ui.input}
              value={form.status}
              onChange={(e) => s('status', e.target.value)}
            >
              {STATUS_CURSO.map((st) => (
                <option key={st.v} value={st.v}>
                  {st.l}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="curso-ordem" className={ui.label}>
              Ordem
            </label>
            <input
              id="curso-ordem"
              type="number"
              min={0}
              className={ui.input}
              value={form.ordem}
              onChange={(e) => s('ordem', Number(e.target.value))}
            />
          </div>
          <div className="flex items-end gap-2">
            <input
              id="curso-publicado"
              type="checkbox"
              checked={form.publicado}
              onChange={(e) => s('publicado', e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            <label htmlFor="curso-publicado" className="pb-2 text-sm font-semibold">
              Publicado (visível no portal)
            </label>
          </div>
        </div>

        <p className="rounded border border-dashed border-border bg-muted/20 p-2 text-xs text-fg/60">
          Após salvar, use <strong>Gerir conteúdo</strong> na lista para cadastrar módulos, aulas e
          provas.
        </p>

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
        open={picker}
        onClose={() => setPicker(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) s('capaUrl', asset.urlPublica);
          setPicker(false);
        }}
      />
    </Modal>
  );
}

// ─── Aba Cursos ──────────────────────────────────────────────────────────────

export default function Cursos() {
  const [cursos, setCursos] = useState<CursoAdmin[]>([]);
  const [templates, setTemplates] = useState<TemplateAdmin[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<CursoAdmin | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const [gestaoCurso, setGestaoCurso] = useState<CursoAdmin | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<Pagina<CursoAdmin>>(
        `/api/professor/escola/cursos${qs({ page, pageSize: PAGE_SIZE })}`,
      );
      setCursos(data.items);
      setTotal(data.total);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar cursos.');
    } finally {
      setCarregando(false);
    }
  }, [page]);

  // Templates p/ o seletor: tolerante a falha (admin-only; professor sem acesso
  // ainda consegue gerir cursos, apenas sem escolher modelo de certificado).
  const carregarTemplates = useCallback(async () => {
    try {
      const t = await adminGet<TemplateAdmin[]>('/api/admin/escola/templates');
      setTemplates(t);
    } catch {
      setTemplates([]);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEffect(() => {
    carregarTemplates();
  }, [carregarTemplates]);

  async function excluir(id: string) {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/professor/escola/cursos/${id}`);
      setMsgOk('Curso excluído com sucesso.');
      setConfirmandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir curso.');
    } finally {
      setExcluindo(false);
    }
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-fg/70">
          Cursos da Escola Cidadã: dados gerais, certificação automática e publicação. Use
          &ldquo;Gerir conteúdo&rdquo; para os módulos, aulas e provas.
        </p>
        <button
          type="button"
          className={ui.btn}
          onClick={() => {
            setEditando(null);
            setModalAberto(true);
          }}
        >
          + Novo curso
        </button>
      </div>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="py-12 text-center text-sm text-fg/60">
          Carregando cursos…
        </p>
      ) : cursos.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg/60">
          Nenhum curso cadastrado. Clique em &ldquo;Novo curso&rdquo; para começar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm" aria-label="Lista de cursos">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  Ordem
                </th>
                <th scope="col" className={ui.th}>
                  Título
                </th>
                <th scope="col" className={ui.th}>
                  Carga
                </th>
                <th scope="col" className={ui.th}>
                  Período
                </th>
                <th scope="col" className={ui.th}>
                  Certificação
                </th>
                <th scope="col" className={ui.th}>
                  Situação
                </th>
                <th scope="col" className={ui.th}>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {cursos.map((c) => (
                <tr key={c.id}>
                  <td className={ui.td}>{c.ordem}</td>
                  <td className={ui.td}>
                    <span className="font-medium">{c.titulo}</span>
                    {c.slug && (
                      <>
                        <br />
                        <span className="text-xs text-fg/55">/{c.slug}</span>
                      </>
                    )}
                  </td>
                  <td className={ui.td}>{c.cargaHoraria ? `${c.cargaHoraria}h` : '—'}</td>
                  <td className={ui.td}>
                    {c.inicioEm || c.fimEm ? (
                      <span className="text-xs">
                        {fmtData(c.inicioEm)} – {fmtData(c.fimEm)}
                      </span>
                    ) : (
                      <span className="text-fg/40">—</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    {c.certificacao ? (
                      <span className={`${ui.badge} bg-success/10 text-success`}>
                        Sim · {Number(c.notaMinima ?? 0)}%
                      </span>
                    ) : (
                      <span className={`${ui.badge} bg-muted text-fg/60`}>Não</span>
                    )}
                  </td>
                  <td className={ui.td}>
                    <span
                      className={`${ui.badge} ${
                        c.publicado ? 'bg-primary/10 text-primary' : 'bg-muted text-fg/60'
                      }`}
                    >
                      {rotuloStatusCurso(c.status)}
                    </span>
                  </td>
                  <td className={ui.td}>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => setGestaoCurso(c)}
                        aria-label={`Gerir conteúdo do curso "${c.titulo}"`}
                      >
                        Gerir conteúdo
                      </button>
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => {
                          setEditando(c);
                          setModalAberto(true);
                        }}
                        aria-label={`Editar curso "${c.titulo}"`}
                      >
                        Editar
                      </button>
                      {confirmandoId === c.id ? (
                        <>
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => excluir(c.id)}
                            disabled={excluindo}
                            aria-busy={excluindo}
                          >
                            {excluindo ? 'Excluindo…' : 'Confirmar'}
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
                          onClick={() => setConfirmandoId(c.id)}
                          aria-label={`Excluir curso "${c.titulo}"`}
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

      {totalPaginas > 1 && (
        <nav aria-label="Paginação de cursos" className="flex items-center gap-2 pt-2">
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

      <ModalCurso
        open={modalAberto}
        editando={editando}
        templates={templates}
        onClose={() => setModalAberto(false)}
        onSalvo={() => {
          setMsgOk(editando ? 'Curso atualizado com sucesso.' : 'Curso criado com sucesso.');
          carregar();
        }}
      />

      <CursoGestao
        open={!!gestaoCurso}
        curso={gestaoCurso}
        onClose={() => setGestaoCurso(null)}
      />
    </div>
  );
}
