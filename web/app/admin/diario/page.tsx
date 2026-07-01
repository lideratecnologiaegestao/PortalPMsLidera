'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  Pagina,
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type StatusDiario = 'rascunho' | 'publicado' | 'revogado';

const TIPOS_MATERIA: { slug: string; nome: string }[] = [
  { slug: 'lei', nome: 'Lei' },
  { slug: 'decreto', nome: 'Decreto' },
  { slug: 'portaria', nome: 'Portaria' },
  { slug: 'resolucao', nome: 'Resolução' },
  { slug: 'edital', nome: 'Edital' },
  { slug: 'licitacao', nome: 'Licitação' },
  { slug: 'extrato_contrato', nome: 'Extrato de Contrato/Convênio' },
  { slug: 'ato_pessoal', nome: 'Ato de Pessoal' },
  { slug: 'aviso', nome: 'Aviso/Comunicado' },
  { slug: 'outro', nome: 'Outro' },
];

interface EdicaoDiario {
  id: string;
  numero: string;
  dataEdicao: string;
  titulo: string;
  status: StatusDiario;
  publicadoEm: string | null;
  criadoEm: string;
}

interface EdicaoDiarioCompleta extends EdicaoDiario {
  conteudo: string;
  tipoEdicao?: string;
}

interface Materia {
  id: string;
  tipo: string;
  numeroAto: string | null;
  titulo: string;
  ementa: string | null;
  conteudo: string;
  orgaoNome: string | null;
  secretariaId: string | null;
  ordem: number;
}

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
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatarDataHora(iso: string | null | undefined): string {
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
    return iso ?? '—';
  }
}

function badgeStatus(status: StatusDiario): string {
  if (status === 'publicado') return 'bg-success/20 text-success';
  if (status === 'revogado') return 'bg-danger/20 text-danger';
  return 'bg-muted text-fg/60';
}

function rotuloStatus(status: StatusDiario): string {
  if (status === 'publicado') return 'Publicado';
  if (status === 'revogado') return 'Revogado';
  return 'Rascunho';
}

/** Converte "2024-03-15" (yyyy-MM-dd, vindos do backend) para o formato
 *  compatível com <input type="date"> que é sempre yyyy-MM-dd. */
function dataParaInput(iso: string | null | undefined): string {
  if (!iso) return '';
  // Se vier como ISO datetime completo, pega só os 10 primeiros caracteres
  return iso.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Modal: Criar / Editar rascunho
// ---------------------------------------------------------------------------

interface FormEdicao {
  numero: string;
  dataEdicao: string;
  titulo: string;
  conteudo: string;
  tipoEdicao: string;
}

function formVazio(): FormEdicao {
  return { numero: '', dataEdicao: '', titulo: '', conteudo: '', tipoEdicao: 'ordinaria' };
}

function edicaoParaForm(edicao: EdicaoDiarioCompleta): FormEdicao {
  return {
    numero: String(edicao.numero ?? ''),
    dataEdicao: dataParaInput(edicao.dataEdicao),
    titulo: edicao.titulo,
    conteudo: edicao.conteudo,
    tipoEdicao: edicao.tipoEdicao ?? 'ordinaria',
  };
}

function ModalEdicao({
  open,
  editandoId,
  onClose,
  onSalvo,
  onCriada,
}: {
  open: boolean;
  editandoId: string | null;
  onClose: () => void;
  onSalvo: () => void;
  onCriada: (id: string) => void;
}) {
  const idBase = useId();
  const [form, setForm] = useState<FormEdicao>(formVazio());
  const [statusAtual, setStatusAtual] = useState<StatusDiario | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setErro('');
    setStatusAtual(null);

    if (editandoId) {
      // Carrega dados completos (inclui conteúdo)
      setCarregando(true);
      adminGet<EdicaoDiarioCompleta>(`/api/admin/diario/${editandoId}`)
        .then((dados) => { setForm(edicaoParaForm(dados)); setStatusAtual(dados.status); })
        .catch((err) =>
          setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar edição.'),
        )
        .finally(() => setCarregando(false));
    } else {
      setForm(formVazio());
    }
  }, [open, editandoId]);

  function campo<K extends keyof FormEdicao>(k: K, v: FormEdicao[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.dataEdicao || !form.titulo.trim()) {
      setErro('Data e título são obrigatórios.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const body: Record<string, unknown> = {
        dataEdicao: form.dataEdicao,
        titulo: form.titulo.trim(),
        conteudo: form.conteudo,
        tipoEdicao: form.tipoEdicao,
      };
      if (form.numero.trim()) body.numero = form.numero.trim();
      if (editandoId) {
        await adminPut(`/api/diario/${editandoId}`, body);
        onSalvo();
      } else {
        const nova = await adminPost<EdicaoDiarioCompleta>('/api/diario', body);
        onSalvo();
        // Mantém o modal aberto em modo edição para cadastrar as matérias.
        if (nova?.id) { onCriada(nova.id); return; }
        onClose();
        return;
      }
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro inesperado.');
    } finally {
      setSalvando(false);
    }
  }

  const tituloModal = editandoId ? 'Editar rascunho' : 'Nova edição do Diário';

  return (
    <Modal open={open} onClose={onClose} title={tituloModal}>
      {carregando ? (
        <p className="py-8 text-center text-sm text-fg/60" role="status">
          Carregando…
        </p>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}

          {/* Número + Data + Tipo */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${idBase}-numero`} className={ui.label}>
                Número
              </label>
              <input
                id={`${idBase}-numero`}
                type="text"
                className={`${ui.input} mt-1`}
                value={form.numero}
                onChange={(e) => campo('numero', e.target.value)}
                placeholder="(automático)"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-data`} className={ui.label}>
                Data da edição <span aria-hidden="true">*</span>
              </label>
              <input
                id={`${idBase}-data`}
                type="date"
                className={`${ui.input} mt-1`}
                value={form.dataEdicao}
                onChange={(e) => campo('dataEdicao', e.target.value)}
                required
                aria-required="true"
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-tipo`} className={ui.label}>Tipo</label>
              <select
                id={`${idBase}-tipo`}
                className={`${ui.input} mt-1`}
                value={form.tipoEdicao}
                onChange={(e) => campo('tipoEdicao', e.target.value)}
              >
                <option value="ordinaria">Ordinária</option>
                <option value="extra">Extra</option>
                <option value="suplementar">Suplementar</option>
              </select>
            </div>
          </div>

          {/* Título */}
          <div>
            <label htmlFor={`${idBase}-titulo`} className={ui.label}>
              Título <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-titulo`}
              className={`${ui.input} mt-1`}
              value={form.titulo}
              onChange={(e) => campo('titulo', e.target.value)}
              required
              aria-required="true"
            />
          </div>

          {/* Conteúdo introdutório (opcional — o corpo vem das matérias) */}
          <div>
            <label htmlFor={`${idBase}-conteudo`} className={ui.label}>
              Texto de abertura (opcional)
            </label>
            <textarea
              id={`${idBase}-conteudo`}
              className={`${ui.input} mt-1 min-h-[100px] resize-y`}
              value={form.conteudo}
              onChange={(e) => campo('conteudo', e.target.value)}
              aria-describedby={`${idBase}-conteudo-hint`}
            />
            <p id={`${idBase}-conteudo-hint`} className="mt-1 text-xs text-fg/60">
              Expediente/cabeçalho da edição. O conteúdo oficial é cadastrado como
              <strong> matérias</strong> abaixo (uma por ato: lei, decreto, portaria…).
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              {editandoId ? 'Fechar' : 'Cancelar'}
            </button>
            <button type="submit" disabled={salvando} className={ui.btn}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar rascunho' : 'Criar e adicionar matérias'}
            </button>
          </div>
          </form>

          {/* Gestor de matérias — só em rascunho já criado */}
          {editandoId && statusAtual === 'rascunho' && (
            <MateriasManager edicaoId={editandoId} />
          )}
          {editandoId && statusAtual && statusAtual !== 'rascunho' && (
            <p className="mt-4 rounded border border-border bg-muted/30 p-3 text-sm text-fg/60">
              Esta edição está <strong>{rotuloStatus(statusAtual)}</strong> e é imutável — as matérias não podem mais ser alteradas.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Gestor de matérias da edição (atos individuais)
// ---------------------------------------------------------------------------

interface FormMateria {
  id: string | null;
  tipo: string;
  numeroAto: string;
  titulo: string;
  ementa: string;
  conteudo: string;
  secretariaId: string;
  orgaoNome: string;
  ordem: string;
}

function materiaVazia(): FormMateria {
  return { id: null, tipo: 'lei', numeroAto: '', titulo: '', ementa: '', conteudo: '', secretariaId: '', orgaoNome: '', ordem: '0' };
}

function MateriasManager({ edicaoId }: { edicaoId: string }) {
  const [lista, setLista] = useState<Materia[]>([]);
  const [secretarias, setSecretarias] = useState<{ id: string; nome: string }[]>([]);
  const [form, setForm] = useState<FormMateria>(materiaVazia());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(() => {
    adminGet<Materia[]>(`/api/admin/diario/${edicaoId}/materias`).then(setLista).catch(() => setLista([]));
  }, [edicaoId]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => {
    adminGet<any>('/api/admin/secretarias?pageSize=200').then((r) => setSecretarias(r.items ?? r)).catch(() => setSecretarias([]));
  }, []);

  function set<K extends keyof FormMateria>(k: K, v: FormMateria[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function editar(m: Materia) {
    setForm({
      id: m.id, tipo: m.tipo, numeroAto: m.numeroAto ?? '', titulo: m.titulo,
      ementa: m.ementa ?? '', conteudo: m.conteudo ?? '', secretariaId: m.secretariaId ?? '',
      orgaoNome: m.orgaoNome ?? '', ordem: String(m.ordem ?? 0),
    });
  }

  async function salvar() {
    if (!form.titulo.trim()) { setErro('Informe o título da matéria.'); return; }
    setSalvando(true); setErro('');
    const body = {
      tipo: form.tipo,
      numeroAto: form.numeroAto || undefined,
      titulo: form.titulo.trim(),
      ementa: form.ementa || undefined,
      conteudo: form.conteudo,
      secretariaId: form.secretariaId || null,
      orgaoNome: form.secretariaId ? null : (form.orgaoNome || null),
      ordem: Number(form.ordem) || 0,
    };
    try {
      if (form.id) await adminPut(`/api/admin/diario/materias/${form.id}`, body);
      else await adminPost(`/api/admin/diario/${edicaoId}/materias`, body);
      setForm(materiaVazia());
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar matéria.');
    } finally {
      setSalvando(false);
    }
  }

  async function remover(id: string) {
    if (!window.confirm('Excluir esta matéria?')) return;
    try { await adminDelete(`/api/admin/diario/materias/${id}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  return (
    <div className="mt-5 border-t border-border pt-4">
      <h3 className="font-heading text-base font-bold">Matérias da edição</h3>
      <p className="mb-3 text-xs text-fg/60">Cada ato (lei, decreto, portaria, edital…) é uma matéria — fica indexado na busca e ganha link próprio.</p>

      {lista.length > 0 && (
        <ul className="mb-4 divide-y divide-border rounded border border-border">
          {lista.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <div className="min-w-0">
                <span className="mr-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  {TIPOS_MATERIA.find((t) => t.slug === m.tipo)?.nome ?? m.tipo}
                </span>
                <span className="font-medium">{m.numeroAto ? `${m.numeroAto} — ` : ''}{m.titulo}</span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" className="text-xs text-primary hover:underline" onClick={() => editar(m)}>editar</button>
                <button type="button" className="text-xs text-danger hover:underline" onClick={() => remover(m.id)}>excluir</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="space-y-2 rounded border border-border bg-muted/20 p-3">
        <p className="text-sm font-semibold">{form.id ? 'Editar matéria' : 'Nova matéria'}</p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select className={ui.input} value={form.tipo} onChange={(e) => set('tipo', e.target.value)} aria-label="Tipo do ato">
            {TIPOS_MATERIA.map((t) => <option key={t.slug} value={t.slug}>{t.nome}</option>)}
          </select>
          <input className={ui.input} value={form.numeroAto} onChange={(e) => set('numeroAto', e.target.value)} placeholder="Nº do ato (ex.: Lei 1.234/2026)" />
          <input className={ui.input} type="number" value={form.ordem} onChange={(e) => set('ordem', e.target.value)} placeholder="Ordem" aria-label="Ordem" />
        </div>
        <input className={ui.input} value={form.titulo} onChange={(e) => set('titulo', e.target.value)} placeholder="Título da matéria *" />
        <input className={ui.input} value={form.ementa} onChange={(e) => set('ementa', e.target.value)} placeholder="Ementa (resumo)" />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <select className={ui.input} value={form.secretariaId} onChange={(e) => set('secretariaId', e.target.value)} aria-label="Órgão (secretaria)">
            <option value="">Órgão: secretaria…</option>
            {secretarias.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <input className={ui.input} value={form.orgaoNome} onChange={(e) => set('orgaoNome', e.target.value)} placeholder="…ou órgão (texto livre)" disabled={!!form.secretariaId} />
        </div>
        <textarea className={`${ui.input} min-h-[140px] resize-y`} value={form.conteudo} onChange={(e) => set('conteudo', e.target.value)} placeholder="Conteúdo do ato (texto ou HTML)" />
        <div className="flex justify-end gap-2">
          {form.id && <button type="button" className={ui.btnGhost} onClick={() => setForm(materiaVazia())}>Cancelar edição</button>}
          <button type="button" className={ui.btn} disabled={salvando} onClick={salvar}>
            {salvando ? 'Salvando…' : form.id ? 'Salvar matéria' : 'Adicionar matéria'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Página principal
// ---------------------------------------------------------------------------

export default function DiarioAdminPage() {
  const [pagina, setPagina] = useState<Pagina<EdicaoDiario> | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');

  const [filtroStatus, setFiltroStatus] = useState<StatusDiario | ''>('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [modalEdicao, setModalEdicao] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Pagina<EdicaoDiario>>(
        `/api/admin/diario${qs({ status: filtroStatus, page, pageSize: PAGE_SIZE })}`,
      );
      setPagina(dados);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar edições.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, page]);

  useEffect(() => {
    buscar();
  }, [buscar]);

  function abrirNova() {
    setEditandoId(null);
    setModalEdicao(true);
  }

  function abrirEditar(id: string) {
    setEditandoId(id);
    setModalEdicao(true);
  }

  async function publicar(edicao: EdicaoDiario) {
    if (
      !window.confirm(
        `Publicar a edição Nº ${edicao.numero} — "${edicao.titulo}"?\n\nApós publicada, a edição ficará disponível ao público. Esta ação exige nível PRATA+ gov.br e MFA configurado.`,
      )
    )
      return;
    setErro('');
    setAviso('');
    try {
      await adminPost(`/api/diario/${edicao.id}/publicar`);
      setAviso(`Edição Nº ${edicao.numero} publicada com sucesso.`);
      buscar();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 503) {
        setErro(
          `${err.message} — importe o certificado digital do órgão em Administração → Certificado Digital.`,
        );
      } else {
        setErro(err instanceof AdminApiError ? err.message : 'Erro ao publicar edição.');
      }
    }
  }

  async function revogar(edicao: EdicaoDiario) {
    if (
      !window.confirm(
        `Revogar a edição Nº ${edicao.numero} — "${edicao.titulo}"?\n\nA edição deixará de ser exibida ao público. Esta ação é registrada em auditoria.`,
      )
    )
      return;
    setErro('');
    setAviso('');
    try {
      await adminPost(`/api/diario/${edicao.id}/revogar`);
      setAviso(`Edição Nº ${edicao.numero} revogada.`);
      buscar();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 403) {
        setErro(`Revogação não autorizada: ${err.message}.`);
      } else {
        setErro(err instanceof AdminApiError ? err.message : 'Erro ao revogar edição.');
      }
    }
  }

  async function excluir(edicao: EdicaoDiario) {
    if (
      !window.confirm(
        `Excluir o rascunho Nº ${edicao.numero} — "${edicao.titulo}"? Esta ação é irreversível.`,
      )
    )
      return;
    setErro('');
    setAviso('');
    try {
      await adminDelete(`/api/diario/${edicao.id}`);
      setAviso('Rascunho excluído.');
      buscar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir rascunho.');
    }
  }

  const totalPaginas = pagina ? Math.ceil(pagina.total / PAGE_SIZE) : 1;

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Diário Oficial"
        description="Publique e gerencie as edições do Diário Oficial eletrônico do município."
      >
        <button onClick={abrirNova} className={ui.btn}>
          + Nova edição
        </button>
      </AdminHeader>

      {/* Filtro por status */}
      <section aria-label="Filtros de edições" className={`${ui.card} p-4`}>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-48">
            <label htmlFor="filtro-status-diario" className={ui.label}>
              Status
            </label>
            <select
              id="filtro-status-diario"
              className={`${ui.input} mt-1`}
              value={filtroStatus}
              onChange={(e) => { setFiltroStatus(e.target.value as StatusDiario | ''); setPage(1); }}
            >
              <option value="">Todos</option>
              <option value="rascunho">Rascunho</option>
              <option value="publicado">Publicado</option>
              <option value="revogado">Revogado</option>
            </select>
          </div>
        </div>
      </section>

      {/* Avisos globais */}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Nota sobre requisitos de publicação */}
      <p className="rounded border border-border bg-bg px-3 py-2 text-xs text-fg/60" role="note">
        A publicação assina a edição com o <strong>certificado digital ICP-Brasil do órgão</strong>.
        Importe-o em <strong>Administração → Certificado Digital</strong> antes de publicar.
      </p>

      {/* Tabela */}
      <section
        aria-label="Lista de edições do Diário Oficial"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhuma edição encontrada para os filtros selecionados.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[720px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Número</th>
                  <th className={ui.th} scope="col">Data da edição</th>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Publicado em</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((edicao) => (
                  <tr key={edicao.id}>
                    <td className={`${ui.td} tabular-nums font-semibold`}>
                      {edicao.numero}
                    </td>
                    <td className={ui.td}>
                      <time dateTime={edicao.dataEdicao}>
                        {formatarData(edicao.dataEdicao)}
                      </time>
                    </td>
                    <td className={ui.td}>{edicao.titulo}</td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} ${badgeStatus(edicao.status)}`}>
                        {rotuloStatus(edicao.status)}
                      </span>
                    </td>
                    <td className={ui.td}>
                      {edicao.publicadoEm ? (
                        <time dateTime={edicao.publicadoEm}>
                          {formatarDataHora(edicao.publicadoEm)}
                        </time>
                      ) : (
                        <span className="text-fg/40">—</span>
                      )}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex flex-wrap gap-2">
                        {edicao.status === 'rascunho' && (
                          <>
                            <button
                              onClick={() => abrirEditar(edicao.id)}
                              className={ui.btnGhost}
                              aria-label={`Editar rascunho Nº ${edicao.numero}`}
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => publicar(edicao)}
                              className={ui.btn}
                              aria-label={`Publicar edição Nº ${edicao.numero}`}
                            >
                              Publicar
                            </button>
                            <button
                              onClick={() => excluir(edicao)}
                              className={ui.btnDanger}
                              aria-label={`Excluir rascunho Nº ${edicao.numero}`}
                            >
                              Excluir
                            </button>
                          </>
                        )}
                        {edicao.status === 'publicado' && (
                          <button
                            onClick={() => revogar(edicao)}
                            className={ui.btnDanger}
                            aria-label={`Revogar edição Nº ${edicao.numero}`}
                          >
                            Revogar
                          </button>
                        )}
                        {edicao.status === 'revogado' && (
                          <span className="text-xs text-fg/40 py-2">Sem ações disponíveis</span>
                        )}
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
          aria-label="Paginação das edições"
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="text-fg/60">
            Página {page} de {totalPaginas} — {pagina.total} edição(ões)
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

      {/* Modal criar/editar */}
      <ModalEdicao
        open={modalEdicao}
        editandoId={editandoId}
        onClose={() => setModalEdicao(false)}
        onSalvo={buscar}
        onCriada={(id) => setEditandoId(id)}
      />
    </main>
  );
}
