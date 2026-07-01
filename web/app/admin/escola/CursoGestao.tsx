'use client';

/**
 * Painel de gestão interna de um curso (drill-down a partir da aba Cursos).
 *
 * Endpoints (professor/gestor/admin):
 *   GET    /api/professor/escola/cursos/:id                  (detalhe c/ módulos+aulas+provas)
 *   POST   /api/professor/escola/cursos/:id/modulos
 *   PUT    /api/professor/escola/modulos/:mid
 *   DELETE /api/professor/escola/modulos/:mid
 *   POST   /api/professor/escola/cursos/:id/aulas            (body: { moduloId, ... })
 *   PUT    /api/professor/escola/aulas/:aid
 *   DELETE /api/professor/escola/aulas/:aid
 *   POST   /api/professor/escola/cursos/:id/provas           (com questões/opções aninhadas)
 *   PUT    /api/professor/escola/provas/:pid
 *   DELETE /api/professor/escola/provas/:pid
 *
 * Mostrado dentro de um Modal grande aberto pela tabela de cursos.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
} from '../../../lib/admin-api';
import { Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import type {
  AulaAdmin,
  CursoAdmin,
  CursoDetalheAdmin,
  ModuloAdmin,
  ProvaAdmin,
  QuestaoAdmin,
} from './tipos';

// ─── Sub-modal: Módulo ───────────────────────────────────────────────────────

function ModalModulo({
  open,
  cursoId,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  cursoId: string;
  editando: ModuloAdmin | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [ordem, setOrdem] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    setTitulo(editando?.titulo ?? '');
    setDescricao(editando?.descricao ?? '');
    setOrdem(editando?.ordem ?? 0);
  }, [open, editando]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const body = { titulo, descricao: descricao || undefined, ordem: Number(ordem) || 0 };
    try {
      if (editando) await adminPut(`/api/professor/escola/modulos/${editando.id}`, body);
      else await adminPost(`/api/professor/escola/cursos/${cursoId}/modulos`, body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar o módulo.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar módulo' : 'Novo módulo'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div>
          <label htmlFor="mod-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="mod-titulo"
            type="text"
            required
            className={ui.input}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="ex.: Introdução aos serviços públicos municipais"
          />
        </div>
        <div>
          <label htmlFor="mod-desc" className={ui.label}>
            Descrição
          </label>
          <textarea
            id="mod-desc"
            rows={3}
            className={ui.input}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="sm:w-40">
          <label htmlFor="mod-ordem" className={ui.label}>
            Ordem
          </label>
          <input
            id="mod-ordem"
            type="number"
            min={0}
            className={ui.input}
            value={ordem}
            onChange={(e) => setOrdem(Number(e.target.value))}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Sub-modal: Aula ─────────────────────────────────────────────────────────

function ModalAula({
  open,
  cursoId,
  moduloId,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  cursoId: string;
  moduloId: string;
  editando: AulaAdmin | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [texto, setTexto] = useState('');
  const [duracaoMin, setDuracaoMin] = useState<number | ''>('');
  const [ordem, setOrdem] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setTitulo(editando?.titulo ?? '');
    setVideoUrl(editando?.videoUrl ?? '');
    // conteudo é um objeto EditorJS; expomos um texto simples em `conteudo.texto`.
    const c = editando?.conteudo as { texto?: string } | undefined;
    setTexto(typeof c?.texto === 'string' ? c.texto : '');
    setDuracaoMin(editando?.duracaoMin ?? '');
    setOrdem(editando?.ordem ?? 0);
  }, [open, editando]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const body = {
      moduloId,
      titulo,
      videoUrl: videoUrl || undefined,
      conteudo: texto ? { texto } : {},
      duracaoMin: duracaoMin === '' ? undefined : Number(duracaoMin),
      ordem: Number(ordem) || 0,
    };
    try {
      if (editando) await adminPut(`/api/professor/escola/aulas/${editando.id}`, body);
      else await adminPost(`/api/professor/escola/cursos/${cursoId}/aulas`, body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar a aula.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar aula' : 'Nova aula'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div>
          <label htmlFor="aula-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="aula-titulo"
            type="text"
            required
            className={ui.input}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="ex.: O que é uma emenda?"
          />
        </div>

        <div>
          <label htmlFor="aula-video" className={ui.label}>
            Vídeo ou mídia
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="aula-video"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={videoUrl}
              onChange={(e) => setVideoUrl(e.target.value)}
              placeholder="https://... (YouTube, Vimeo ou arquivo)"
            />
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setPicker(true)}
              aria-label="Escolher vídeo da biblioteca de mídia"
            >
              Escolher mídia
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="aula-texto" className={ui.label}>
            Conteúdo da aula <span className="text-fg/50">(texto/HTML)</span>
          </label>
          <textarea
            id="aula-texto"
            rows={6}
            className={ui.input}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Material de leitura, transcrição ou roteiro da aula."
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="aula-duracao" className={ui.label}>
              Duração (min)
            </label>
            <input
              id="aula-duracao"
              type="number"
              min={0}
              className={ui.input}
              value={duracaoMin}
              onChange={(e) => setDuracaoMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="aula-ordem" className={ui.label}>
              Ordem
            </label>
            <input
              id="aula-ordem"
              type="number"
              min={0}
              className={ui.input}
              value={ordem}
              onChange={(e) => setOrdem(Number(e.target.value))}
            />
          </div>
        </div>

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
        tipo="video"
        onSelect={(asset) => {
          if (asset.urlPublica) setVideoUrl(asset.urlPublica);
          setPicker(false);
        }}
      />
    </Modal>
  );
}

// ─── Sub-modal: Prova (com questões e opções) ────────────────────────────────

interface FormOpcao {
  texto: string;
  correta: boolean;
}
interface FormQuestao {
  enunciado: string;
  tipo: string; // objetiva | dissertativa
  peso: number;
  opcoes: FormOpcao[];
}

function opcaoVazia(): FormOpcao {
  return { texto: '', correta: false };
}
function questaoVazia(): FormQuestao {
  return { enunciado: '', tipo: 'objetiva', peso: 1, opcoes: [opcaoVazia(), opcaoVazia()] };
}

function ModalProva({
  open,
  cursoId,
  modulos,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  cursoId: string;
  modulos: ModuloAdmin[];
  editando: ProvaAdmin | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [moduloId, setModuloId] = useState('');
  const [notaMinima, setNotaMinima] = useState(70);
  const [tempoLimiteMin, setTempoLimiteMin] = useState<number | ''>('');
  const [maxTentativas, setMaxTentativas] = useState(1);
  const [embaralhar, setEmbaralhar] = useState(false);
  const [ativa, setAtiva] = useState(true);
  const [ordem, setOrdem] = useState(0);
  const [questoes, setQuestoes] = useState<FormQuestao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    setTitulo(editando?.titulo ?? '');
    setDescricao(editando?.descricao ?? '');
    setModuloId(editando?.moduloId ?? '');
    setNotaMinima(Number(editando?.notaMinima ?? 70));
    setTempoLimiteMin(editando?.tempoLimiteMin ?? '');
    setMaxTentativas(editando?.maxTentativas ?? 1);
    setEmbaralhar(editando?.embaralhar ?? false);
    setAtiva(editando?.ativa ?? true);
    setOrdem(editando?.ordem ?? 0);
    // As questões existentes vêm no detalhe; convertemos para o form editável.
    setQuestoes(
      (editando?.questoes ?? []).map((q) => ({
        enunciado: q.enunciado,
        tipo: q.tipo,
        peso: Number(q.peso ?? 1),
        opcoes: (q.opcoes ?? []).map((o) => ({ texto: o.texto, correta: o.correta })),
      })),
    );
  }, [open, editando]);

  function addQuestao() {
    setQuestoes((qs) => [...qs, questaoVazia()]);
  }
  function delQuestao(i: number) {
    setQuestoes((qs) => qs.filter((_, idx) => idx !== i));
  }
  function setQ(i: number, patch: Partial<FormQuestao>) {
    setQuestoes((qs) => qs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function addOpcao(qi: number) {
    setQuestoes((qs) =>
      qs.map((q, idx) => (idx === qi ? { ...q, opcoes: [...q.opcoes, opcaoVazia()] } : q)),
    );
  }
  function delOpcao(qi: number, oi: number) {
    setQuestoes((qs) =>
      qs.map((q, idx) =>
        idx === qi ? { ...q, opcoes: q.opcoes.filter((_, j) => j !== oi) } : q,
      ),
    );
  }
  function setOpcao(qi: number, oi: number, patch: Partial<FormOpcao>) {
    setQuestoes((qs) =>
      qs.map((q, idx) =>
        idx === qi
          ? { ...q, opcoes: q.opcoes.map((o, j) => (j === oi ? { ...o, ...patch } : o)) }
          : q,
      ),
    );
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const questoesBody = questoes.map((q, i) => ({
      enunciado: q.enunciado,
      tipo: q.tipo,
      peso: Number(q.peso) || 1,
      ordem: i,
      opcoes:
        q.tipo === 'objetiva'
          ? q.opcoes
              .filter((o) => o.texto.trim())
              .map((o, j) => ({ texto: o.texto, correta: o.correta, ordem: j }))
          : undefined,
    }));
    const body = {
      titulo,
      descricao: descricao || undefined,
      moduloId: moduloId || undefined,
      notaMinima: Number(notaMinima) || 0,
      tempoLimiteMin: tempoLimiteMin === '' ? undefined : Number(tempoLimiteMin),
      maxTentativas: Number(maxTentativas) || 1,
      embaralhar,
      ativa,
      ordem: Number(ordem) || 0,
      // Em edição, a recriação de questões depende do backend; enviamos sempre o
      // array para a criação. Na atualização o backend ignora questoes (PUT só
      // atualiza metadados da prova) — ver escola.service.atualizarProva.
      questoes: questoesBody,
    };
    try {
      if (editando) await adminPut(`/api/professor/escola/provas/${editando.id}`, body);
      else await adminPost(`/api/professor/escola/cursos/${cursoId}/provas`, body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar a prova.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar prova' : 'Nova prova'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor="prova-titulo" className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id="prova-titulo"
            type="text"
            required
            className={ui.input}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="ex.: Avaliação final"
          />
        </div>

        <div>
          <label htmlFor="prova-desc" className={ui.label}>
            Descrição
          </label>
          <textarea
            id="prova-desc"
            rows={2}
            className={ui.input}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="prova-modulo" className={ui.label}>
              Vínculo
            </label>
            <select
              id="prova-modulo"
              className={ui.input}
              value={moduloId}
              onChange={(e) => setModuloId(e.target.value)}
            >
              <option value="">Prova final do curso</option>
              {modulos.map((m) => (
                <option key={m.id} value={m.id}>
                  Módulo: {m.titulo}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="prova-nota" className={ui.label}>
              Nota mínima (%)
            </label>
            <input
              id="prova-nota"
              type="number"
              min={0}
              max={100}
              className={ui.input}
              value={notaMinima}
              onChange={(e) => setNotaMinima(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="prova-tempo" className={ui.label}>
              Tempo limite (min)
            </label>
            <input
              id="prova-tempo"
              type="number"
              min={0}
              className={ui.input}
              value={tempoLimiteMin}
              onChange={(e) => setTempoLimiteMin(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="prova-max" className={ui.label}>
              Máx. tentativas
            </label>
            <input
              id="prova-max"
              type="number"
              min={1}
              className={ui.input}
              value={maxTentativas}
              onChange={(e) => setMaxTentativas(Number(e.target.value))}
            />
          </div>
          <div>
            <label htmlFor="prova-ordem" className={ui.label}>
              Ordem
            </label>
            <input
              id="prova-ordem"
              type="number"
              min={0}
              className={ui.input}
              value={ordem}
              onChange={(e) => setOrdem(Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={embaralhar}
              onChange={(e) => setEmbaralhar(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Embaralhar questões
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={ativa}
              onChange={(e) => setAtiva(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-primary"
            />
            Prova ativa
          </label>
        </div>

        {/* Questões */}
        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Questões</legend>

          {editando && (
            <p className="mb-3 rounded border border-dashed border-border bg-muted/20 p-2 text-xs text-fg/60">
              Ao editar uma prova já criada, os metadados (título, nota, tempo…) são
              atualizados. A reescrita do banco de questões deve ser feita recriando a prova,
              conforme o comportamento atual da API.
            </p>
          )}

          {questoes.length === 0 ? (
            <p className="mb-3 text-sm text-fg/60">Nenhuma questão adicionada.</p>
          ) : (
            <ol className="mb-3 space-y-3">
              {questoes.map((q, qi) => (
                <li key={qi} className="rounded border border-border/70 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <span className="text-xs font-semibold text-fg/60">Questão {qi + 1}</span>
                    <button
                      type="button"
                      className="text-xs text-danger hover:underline"
                      onClick={() => delQuestao(qi)}
                    >
                      remover questão
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    className={`${ui.input} mb-2`}
                    value={q.enunciado}
                    onChange={(e) => setQ(qi, { enunciado: e.target.value })}
                    placeholder="Enunciado da questão"
                    aria-label={`Enunciado da questão ${qi + 1}`}
                  />
                  <div className="mb-2 grid grid-cols-2 gap-2">
                    <div>
                      <label className={ui.label}>Tipo</label>
                      <select
                        className={ui.input}
                        value={q.tipo}
                        onChange={(e) => setQ(qi, { tipo: e.target.value })}
                      >
                        <option value="objetiva">Objetiva (múltipla escolha)</option>
                        <option value="dissertativa">Dissertativa</option>
                      </select>
                    </div>
                    <div>
                      <label className={ui.label}>Peso</label>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        className={ui.input}
                        value={q.peso}
                        onChange={(e) => setQ(qi, { peso: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  {q.tipo === 'objetiva' && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-fg/60">
                        Opções (marque a correta)
                      </span>
                      {q.opcoes.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correta-${qi}`}
                            checked={o.correta}
                            onChange={() =>
                              setQuestoes((qs) =>
                                qs.map((qq, idx) =>
                                  idx === qi
                                    ? {
                                        ...qq,
                                        opcoes: qq.opcoes.map((oo, j) => ({
                                          ...oo,
                                          correta: j === oi,
                                        })),
                                      }
                                    : qq,
                                ),
                              )
                            }
                            className="h-4 w-4 accent-primary"
                            aria-label={`Marcar opção ${oi + 1} como correta`}
                          />
                          <input
                            type="text"
                            className={`flex-1 ${ui.input}`}
                            value={o.texto}
                            onChange={(e) => setOpcao(qi, oi, { texto: e.target.value })}
                            placeholder={`Opção ${oi + 1}`}
                            aria-label={`Texto da opção ${oi + 1}`}
                          />
                          <button
                            type="button"
                            className="text-xs text-danger hover:underline"
                            onClick={() => delOpcao(qi, oi)}
                            aria-label={`Remover opção ${oi + 1}`}
                          >
                            remover
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="text-xs font-semibold text-primary hover:underline"
                        onClick={() => addOpcao(qi)}
                      >
                        + adicionar opção
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}

          <button type="button" className={ui.btnGhost} onClick={addQuestao}>
            + Adicionar questão
          </button>
        </fieldset>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Painel principal de gestão do curso ─────────────────────────────────────

export default function CursoGestao({
  open,
  curso,
  onClose,
}: {
  open: boolean;
  curso: CursoAdmin | null;
  onClose: () => void;
}) {
  const [detalhe, setDetalhe] = useState<CursoDetalheAdmin | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  // Estados dos sub-modais
  const [modalModulo, setModalModulo] = useState(false);
  const [moduloEdit, setModuloEdit] = useState<ModuloAdmin | null>(null);

  const [modalAula, setModalAula] = useState(false);
  const [aulaCtx, setAulaCtx] = useState<{ moduloId: string; aula: AulaAdmin | null }>({
    moduloId: '',
    aula: null,
  });

  const [modalProva, setModalProva] = useState(false);
  const [provaEdit, setProvaEdit] = useState<ProvaAdmin | null>(null);

  const [confirm, setConfirm] = useState<{ tipo: string; id: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!curso) return;
    setCarregando(true);
    setErro('');
    try {
      const d = await adminGet<CursoDetalheAdmin>(`/api/professor/escola/cursos/${curso.id}`);
      setDetalhe(d);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar o curso.');
    } finally {
      setCarregando(false);
    }
  }, [curso]);

  useEffect(() => {
    if (!open) return;
    setMsgOk('');
    setConfirm(null);
    carregar();
  }, [open, carregar]);

  async function excluir(tipo: 'modulo' | 'aula' | 'prova', id: string) {
    setErro('');
    const rota =
      tipo === 'modulo'
        ? `/api/professor/escola/modulos/${id}`
        : tipo === 'aula'
          ? `/api/professor/escola/aulas/${id}`
          : `/api/professor/escola/provas/${id}`;
    try {
      await adminDelete(rota);
      setConfirm(null);
      setMsgOk('Item excluído.');
      await carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir.');
    }
  }

  if (!curso) return null;

  const modulos = detalhe?.modulos ?? [];
  const provas = detalhe?.provas ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Gerir conteúdo — ${curso.titulo}`}>
      <div className="space-y-5">
        {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {carregando ? (
          <p aria-live="polite" aria-busy="true" className="py-8 text-center text-sm text-fg/60">
            Carregando conteúdo do curso…
          </p>
        ) : (
          <>
            {/* Módulos + aulas */}
            <section aria-labelledby="sec-modulos">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="sec-modulos" className="font-heading text-base font-bold">
                  Módulos e aulas
                </h3>
                <button
                  type="button"
                  className={ui.btn}
                  onClick={() => {
                    setModuloEdit(null);
                    setModalModulo(true);
                  }}
                >
                  + Novo módulo
                </button>
              </div>

              {modulos.length === 0 ? (
                <p className="rounded border border-dashed border-border bg-muted/20 p-3 text-sm text-fg/60">
                  Nenhum módulo. Crie um módulo para depois adicionar aulas.
                </p>
              ) : (
                <ul className="space-y-3">
                  {modulos.map((m) => (
                    <li key={m.id} className="rounded border border-border p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-semibold">
                            {m.ordem}
                          </span>{' '}
                          <span className="font-semibold">{m.titulo}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => {
                              setAulaCtx({ moduloId: m.id, aula: null });
                              setModalAula(true);
                            }}
                          >
                            + Aula
                          </button>
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => {
                              setModuloEdit(m);
                              setModalModulo(true);
                            }}
                          >
                            Editar
                          </button>
                          {confirm?.tipo === 'modulo' && confirm.id === m.id ? (
                            <>
                              <button
                                type="button"
                                className={ui.btnDanger}
                                onClick={() => excluir('modulo', m.id)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className={ui.btnGhost}
                                onClick={() => setConfirm(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={ui.btnDanger}
                              onClick={() => setConfirm({ tipo: 'modulo', id: m.id })}
                              aria-label={`Excluir módulo "${m.titulo}"`}
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </div>

                      {m.aulas.length === 0 ? (
                        <p className="pl-2 text-xs text-fg/50">Sem aulas neste módulo.</p>
                      ) : (
                        <ul className="space-y-1">
                          {m.aulas.map((a) => (
                            <li
                              key={a.id}
                              className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm"
                            >
                              <span>
                                <span className="text-fg/50">{a.ordem}.</span>{' '}
                                <span className="font-medium">{a.titulo}</span>
                                {a.duracaoMin ? (
                                  <span className="text-fg/55"> · {a.duracaoMin} min</span>
                                ) : null}
                              </span>
                              <span className="flex gap-2">
                                <button
                                  type="button"
                                  className="text-primary hover:underline"
                                  onClick={() => {
                                    setAulaCtx({ moduloId: m.id, aula: a });
                                    setModalAula(true);
                                  }}
                                >
                                  editar
                                </button>
                                {confirm?.tipo === 'aula' && confirm.id === a.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="text-danger hover:underline"
                                      onClick={() => excluir('aula', a.id)}
                                    >
                                      confirmar
                                    </button>
                                    <button
                                      type="button"
                                      className="text-fg/60 hover:underline"
                                      onClick={() => setConfirm(null)}
                                    >
                                      cancelar
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-danger hover:underline"
                                    onClick={() => setConfirm({ tipo: 'aula', id: a.id })}
                                  >
                                    excluir
                                  </button>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Provas */}
            <section aria-labelledby="sec-provas">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id="sec-provas" className="font-heading text-base font-bold">
                  Provas
                </h3>
                <button
                  type="button"
                  className={ui.btn}
                  onClick={() => {
                    setProvaEdit(null);
                    setModalProva(true);
                  }}
                >
                  + Nova prova
                </button>
              </div>

              {provas.length === 0 ? (
                <p className="rounded border border-dashed border-border bg-muted/20 p-3 text-sm text-fg/60">
                  Nenhuma prova cadastrada.
                </p>
              ) : (
                <ul className="space-y-2">
                  {provas.map((p) => {
                    const mod = modulos.find((m) => m.id === p.moduloId);
                    return (
                      <li
                        key={p.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border border-border px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-semibold">{p.titulo}</span>
                          <span className="text-fg/55">
                            {' '}
                            · {mod ? `Módulo: ${mod.titulo}` : 'Prova final'} ·{' '}
                            {p.questoes?.length ?? 0} questão(ões) · nota mín.{' '}
                            {Number(p.notaMinima ?? 0)}%
                          </span>
                          {!p.ativa && (
                            <span className={`${ui.badge} ml-2 bg-muted text-fg/60`}>inativa</span>
                          )}
                        </span>
                        <span className="flex gap-2">
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => {
                              setProvaEdit(p);
                              setModalProva(true);
                            }}
                          >
                            Editar
                          </button>
                          {confirm?.tipo === 'prova' && confirm.id === p.id ? (
                            <>
                              <button
                                type="button"
                                className={ui.btnDanger}
                                onClick={() => excluir('prova', p.id)}
                              >
                                Confirmar
                              </button>
                              <button
                                type="button"
                                className={ui.btnGhost}
                                onClick={() => setConfirm(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className={ui.btnDanger}
                              onClick={() => setConfirm({ tipo: 'prova', id: p.id })}
                              aria-label={`Excluir prova "${p.titulo}"`}
                            >
                              Excluir
                            </button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <div className="flex justify-end border-t border-border pt-3">
          <button type="button" className={ui.btnGhost} onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>

      {/* Sub-modais */}
      <ModalModulo
        open={modalModulo}
        cursoId={curso.id}
        editando={moduloEdit}
        onClose={() => setModalModulo(false)}
        onSalvo={() => {
          setMsgOk('Módulo salvo.');
          carregar();
        }}
      />
      <ModalAula
        open={modalAula}
        cursoId={curso.id}
        moduloId={aulaCtx.moduloId}
        editando={aulaCtx.aula}
        onClose={() => setModalAula(false)}
        onSalvo={() => {
          setMsgOk('Aula salva.');
          carregar();
        }}
      />
      <ModalProva
        open={modalProva}
        cursoId={curso.id}
        modulos={modulos}
        editando={provaEdit}
        onClose={() => setModalProva(false)}
        onSalvo={() => {
          setMsgOk('Prova salva.');
          carregar();
        }}
      />
    </Modal>
  );
}
