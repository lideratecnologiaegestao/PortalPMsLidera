'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  adminPatch,
  adminPost,
  Pagina,
  qs,
} from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso, Modal, ui } from './ui';
import TramitacaoAdmin from './TramitacaoAdmin';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type Canal = 'esic' | 'ouvidoria';

type Status =
  | 'registrada'
  | 'em_analise'
  | 'em_tratamento'
  | 'aguardando_cidadao'
  | 'prorrogada'
  | 'respondida'
  | 'indeferida'
  | 'parcialmente_atendida'
  | 'recurso_1a_instancia'
  | 'recurso_2a_instancia'
  | 'concluida'
  | 'arquivada';

type Tipo =
  | 'acesso_informacao'
  | 'denuncia'
  | 'reclamacao'
  | 'sugestao'
  | 'elogio'
  | 'solicitacao';

type Evento =
  | 'iniciar_analise'
  | 'encaminhar_area'
  | 'solicitar_complemento'
  | 'retomar'
  | 'prorrogar'
  | 'responder'
  | 'indeferir'
  | 'atender_parcial'
  | 'abrir_recurso_1a'
  | 'abrir_recurso_2a'
  | 'concluir'
  | 'arquivar';

interface Manifestacao {
  id: string;
  protocolo: string;
  canal: Canal;
  tipo: Tipo;
  status: Status;
  assunto: string;
  prazoEm: string | null;
  prorrogado: boolean;
  anonima: boolean;
  solicitanteNome: string | null;
  responsavelId: string | null;
  secretariaId: string | null;
  criadoEm: string;
}

interface ManifestacaoDetalhe extends Manifestacao {
  descricao: string;
  resposta: string | null;
  eventos: Array<{
    id: string;
    evento: string;
    deStatus: string | null;
    paraStatus: string;
    observacao: string | null;
    atorId: string | null;
    criadoEm: string;
  }>;
}

// ─── Helpers visuais ────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Status, string> = {
  registrada: 'Registrada',
  em_analise: 'Em análise',
  em_tratamento: 'Em tratamento',
  aguardando_cidadao: 'Aguardando cidadão',
  prorrogada: 'Prorrogada',
  respondida: 'Respondida',
  indeferida: 'Indeferida',
  parcialmente_atendida: 'Parcialmente atendida',
  recurso_1a_instancia: 'Recurso 1ª inst.',
  recurso_2a_instancia: 'Recurso 2ª inst.',
  concluida: 'Concluída',
  arquivada: 'Arquivada',
};

const STATUS_CORES: Record<Status, string> = {
  registrada: 'bg-muted text-fg',
  em_analise: 'bg-primary text-primary-fg',
  em_tratamento: 'bg-secondary text-secondary-fg',
  aguardando_cidadao: 'bg-warning text-secondary-fg',
  prorrogada: 'bg-warning text-secondary-fg',
  respondida: 'bg-success text-primary-fg',
  indeferida: 'bg-danger text-primary-fg',
  parcialmente_atendida: 'bg-accent text-primary-fg',
  recurso_1a_instancia: 'bg-danger text-primary-fg',
  recurso_2a_instancia: 'bg-danger text-primary-fg',
  concluida: 'bg-success text-primary-fg',
  arquivada: 'bg-muted text-fg',
};

const EVENTO_LABELS: Record<Evento, string> = {
  iniciar_analise: 'Iniciar análise',
  encaminhar_area: 'Encaminhar à área',
  solicitar_complemento: 'Solicitar complemento',
  retomar: 'Retomar (cidadão respondeu)',
  prorrogar: 'Prorrogar prazo',
  responder: 'Responder',
  indeferir: 'Indeferir',
  atender_parcial: 'Atender parcialmente',
  abrir_recurso_1a: 'Abrir recurso 1ª instância',
  abrir_recurso_2a: 'Abrir recurso 2ª instância',
  concluir: 'Concluir',
  arquivar: 'Arquivar',
};

const TIPOS_ESIC: { value: Tipo | ''; label: string }[] = [
  { value: '', label: 'Todos os tipos' },
  { value: 'acesso_informacao', label: 'Acesso à informação' },
];

const TIPOS_OUVIDORIA: { value: Tipo | ''; label: string }[] = [
  { value: '', label: 'Todos os tipos' },
  { value: 'denuncia', label: 'Denúncia' },
  { value: 'reclamacao', label: 'Reclamação' },
  { value: 'sugestao', label: 'Sugestão' },
  { value: 'elogio', label: 'Elogio' },
  { value: 'solicitacao', label: 'Solicitação' },
];

const STATUS_OPCOES: { value: Status | ''; label: string }[] = [
  { value: '', label: 'Todos os status' },
  { value: 'registrada', label: 'Registrada' },
  { value: 'em_analise', label: 'Em análise' },
  { value: 'em_tratamento', label: 'Em tratamento' },
  { value: 'aguardando_cidadao', label: 'Aguardando cidadão' },
  { value: 'prorrogada', label: 'Prorrogada' },
  { value: 'respondida', label: 'Respondida' },
  { value: 'indeferida', label: 'Indeferida' },
  { value: 'parcialmente_atendida', label: 'Parcialmente atendida' },
  { value: 'recurso_1a_instancia', label: 'Recurso 1ª inst.' },
  { value: 'recurso_2a_instancia', label: 'Recurso 2ª inst.' },
  { value: 'concluida', label: 'Concluída' },
  { value: 'arquivada', label: 'Arquivada' },
];

function prazoVencido(prazoEm: string | null): boolean {
  if (!prazoEm) return false;
  return new Date(prazoEm) < new Date();
}

function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

// ─── Sub-componente: detalhe no modal ────────────────────────────────────────

function DetalheModal({
  id,
  canal,
  onFechar,
  onAtualizar,
}: {
  id: string;
  canal: Canal;
  onFechar: () => void;
  onAtualizar: () => void;
}) {
  const [detalhe, setDetalhe] = useState<ManifestacaoDetalhe | null>(null);
  const [acoes, setAcoes] = useState<Evento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  // Formulário de transição
  const [eventoSel, setEventoSel] = useState<Evento | ''>('');
  const [observacao, setObservacao] = useState('');
  const [salvandoEvento, setSalvandoEvento] = useState(false);

  // Formulário de atribuição
  const [responsavelId, setResponsavelId] = useState('');
  const [secretariaId, setSecretariaId] = useState('');
  const [salvandoAtrib, setSalvandoAtrib] = useState(false);

  const carregarDetalhe = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const [det, acoesResp] = await Promise.all([
        adminGet<ManifestacaoDetalhe>(`/api/admin/manifestacoes/${id}`),
        adminGet<Evento[]>(`/api/manifestacoes/${id}/acoes`),
      ]);
      setDetalhe(det);
      setAcoes(acoesResp);
      setResponsavelId(det.responsavelId ?? '');
      setSecretariaId(det.secretariaId ?? '');
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar detalhe.');
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useEffect(() => {
    carregarDetalhe();
  }, [carregarDetalhe]);

  async function aplicarEvento() {
    if (!eventoSel) return;
    setSalvandoEvento(true);
    setErro('');
    setMsgOk('');
    try {
      await adminPost(`/api/manifestacoes/${id}/eventos/${eventoSel}`, {
        observacao: observacao || undefined,
      });
      setMsgOk('Transição aplicada com sucesso.');
      setEventoSel('');
      setObservacao('');
      await carregarDetalhe();
      onAtualizar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao aplicar evento.');
    } finally {
      setSalvandoEvento(false);
    }
  }

  async function salvarAtribuicao() {
    setSalvandoAtrib(true);
    setErro('');
    setMsgOk('');
    try {
      await adminPatch(`/api/admin/manifestacoes/${id}`, {
        responsavelId: responsavelId || undefined,
        secretariaId: secretariaId || undefined,
      });
      setMsgOk('Atribuição salva com sucesso.');
      onAtualizar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar atribuição.');
    } finally {
      setSalvandoAtrib(false);
    }
  }

  const titulo =
    canal === 'esic'
      ? 'e-SIC — Detalhe do Pedido'
      : 'Ouvidoria — Detalhe da Manifestação';

  return (
    <Modal open onClose={onFechar} title={titulo}>
      {carregando && (
        <p aria-live="polite" className="py-8 text-center text-sm text-fg/60">
          Carregando...
        </p>
      )}

      {!carregando && erro && !detalhe && (
        <Aviso tipo="erro">{erro}</Aviso>
      )}

      {!carregando && detalhe && (
        <div className="space-y-5">
          {/* Avisos de feedback */}
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

          {/* Dados gerais */}
          <section aria-label="Dados da manifestação">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div>
                <dt className="font-semibold">Protocolo</dt>
                <dd className="font-mono">{detalhe.protocolo}</dd>
              </div>
              <div>
                <dt className="font-semibold">Status</dt>
                <dd>
                  <span className={`${ui.badge} ${STATUS_CORES[detalhe.status]}`}>
                    {STATUS_LABELS[detalhe.status]}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Tipo</dt>
                <dd className="capitalize">{detalhe.tipo.replace(/_/g, ' ')}</dd>
              </div>
              <div>
                <dt className="font-semibold">Canal</dt>
                <dd className="uppercase">{detalhe.canal}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold">Assunto</dt>
                <dd>{detalhe.assunto}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold">Descrição</dt>
                <dd className="whitespace-pre-wrap text-fg/80">{detalhe.descricao}</dd>
              </div>
              {!detalhe.anonima && detalhe.solicitanteNome && (
                <div>
                  <dt className="font-semibold">Solicitante</dt>
                  <dd>{detalhe.solicitanteNome}</dd>
                </div>
              )}
              {detalhe.anonima && (
                <div>
                  <dt className="font-semibold">Solicitante</dt>
                  <dd className="italic text-fg/60">[identidade protegida — manifestação anônima]</dd>
                </div>
              )}
              <div>
                <dt className="font-semibold">Criado em</dt>
                <dd>{formatarData(detalhe.criadoEm)}</dd>
              </div>
              {detalhe.prazoEm && (
                <div>
                  <dt className="font-semibold">Prazo legal</dt>
                  <dd
                    className={
                      prazoVencido(detalhe.prazoEm) ? 'font-semibold text-danger' : ''
                    }
                  >
                    {formatarData(detalhe.prazoEm)}
                    {prazoVencido(detalhe.prazoEm) && (
                      <span className="ml-1 text-xs">(VENCIDO)</span>
                    )}
                    {detalhe.prorrogado && (
                      <span className="ml-1 text-xs text-fg/60">(prorrogado)</span>
                    )}
                  </dd>
                </div>
              )}
              {detalhe.resposta && (
                <div className="col-span-2">
                  <dt className="font-semibold">Resposta</dt>
                  <dd className="whitespace-pre-wrap text-fg/80">{detalhe.resposta}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* Tramitação: chat (cidadão + interno), responder, encaminhar */}
          <TramitacaoAdmin
            id={id}
            onAtualizar={() => {
              carregarDetalhe();
              onAtualizar();
            }}
          />

          {/* Timeline de eventos */}
          <section aria-label="Histórico de eventos">
            <h3 className="mb-2 font-semibold">Histórico</h3>
            {detalhe.eventos.length === 0 ? (
              <p className="text-sm text-fg/60">Nenhum evento registrado.</p>
            ) : (
              <ol className="space-y-2">
                {detalhe.eventos.map((ev) => (
                  <li
                    key={ev.id}
                    className="flex gap-3 rounded border border-border bg-muted/40 p-2 text-sm"
                  >
                    <div className="flex-1">
                      <span className="font-semibold capitalize">
                        {ev.evento.replace(/_/g, ' ')}
                      </span>
                      {ev.deStatus && (
                        <span className="text-fg/60">
                          {' '}
                          — {ev.deStatus.replace(/_/g, ' ')} → {ev.paraStatus.replace(/_/g, ' ')}
                        </span>
                      )}
                      {ev.observacao && (
                        <p className="mt-1 text-fg/70 italic">{ev.observacao}</p>
                      )}
                    </div>
                    <time
                      dateTime={ev.criadoEm}
                      className="shrink-0 text-xs text-fg/50"
                    >
                      {formatarData(ev.criadoEm)}
                    </time>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Aplicar transição */}
          {acoes.length > 0 && (
            <section aria-label="Aplicar transição de estado">
              <h3 className="mb-2 font-semibold">Aplicar ação</h3>
              <div className="space-y-2">
                <div>
                  <label htmlFor="sel-evento" className={ui.label}>
                    Evento / transição
                  </label>
                  <select
                    id="sel-evento"
                    className={ui.input}
                    value={eventoSel}
                    onChange={(e) => setEventoSel(e.target.value as Evento)}
                  >
                    <option value="">Selecione…</option>
                    {acoes.map((ev) => (
                      <option key={ev} value={ev}>
                        {EVENTO_LABELS[ev] ?? ev}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="txt-observacao" className={ui.label}>
                    Observação (opcional)
                  </label>
                  <textarea
                    id="txt-observacao"
                    className={`${ui.input} min-h-[80px] resize-y`}
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Descreva detalhes da ação…"
                  />
                </div>
                <button
                  type="button"
                  className={ui.btn}
                  disabled={!eventoSel || salvandoEvento}
                  onClick={aplicarEvento}
                >
                  {salvandoEvento ? 'Aplicando…' : 'Aplicar'}
                </button>
              </div>
            </section>
          )}

          {/* Atribuição administrativa */}
          <section aria-label="Atribuição administrativa">
            <h3 className="mb-2 font-semibold">Atribuição</h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="inp-responsavel" className={ui.label}>
                  ID do responsável
                </label>
                <input
                  id="inp-responsavel"
                  type="text"
                  className={ui.input}
                  value={responsavelId}
                  onChange={(e) => setResponsavelId(e.target.value)}
                  placeholder="UUID do servidor"
                />
              </div>
              <div>
                <label htmlFor="inp-secretaria" className={ui.label}>
                  ID da secretaria
                </label>
                <input
                  id="inp-secretaria"
                  type="text"
                  className={ui.input}
                  value={secretariaId}
                  onChange={(e) => setSecretariaId(e.target.value)}
                  placeholder="UUID da secretaria"
                />
              </div>
            </div>
            <button
              type="button"
              className={`${ui.btnGhost} mt-2`}
              disabled={salvandoAtrib}
              onClick={salvarAtribuicao}
            >
              {salvandoAtrib ? 'Salvando…' : 'Salvar atribuição'}
            </button>
          </section>
        </div>
      )}
    </Modal>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ManifestacoesAdmin({
  canal,
  minhas = false,
}: {
  canal?: Canal;
  minhas?: boolean;
}) {
  const titulo = minhas
    ? 'Minhas atribuições'
    : canal === 'esic'
    ? 'e-SIC — Pedidos de Acesso à Informação'
    : canal === 'ouvidoria'
    ? 'Ouvidoria — Manifestações'
    : 'Painel do Ouvidor — Ouvidoria e e-SIC';
  const descricao = minhas
    ? 'Manifestações e pedidos encaminhados a você. Responda à ouvidoria pela tramitação interna.'
    : canal === 'esic'
    ? 'Gerencie pedidos de acesso à informação (LAI 12.527/2011). Prazo legal: 20+10 dias.'
    : canal === 'ouvidoria'
    ? 'Gerencie manifestações dos cidadãos (Lei 13.460/2017). Prazo legal: 30+30 dias.'
    : 'Caixa única dos dois canais. Triagem, encaminhamento à área e resposta ao cidadão.';

  const tiposOpcoes =
    canal === 'esic' ? TIPOS_ESIC : canal === 'ouvidoria' ? TIPOS_OUVIDORIA : [...TIPOS_ESIC, ...TIPOS_OUVIDORIA];

  // Filtros
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [dataDe, setDataDe] = useState('');
  const [dataAte, setDataAte] = useState('');
  const [page, setPage] = useState(1);

  function urlRelatorio(rota: 'export' | 'relatorio', formato: string): string {
    const p = new URLSearchParams({ formato });
    if (canal) p.set('canal', canal);
    if (status) p.set('status', status);
    if (tipo) p.set('tipo', tipo);
    if (dataDe) p.set('dataDe', dataDe);
    if (dataAte) p.set('dataAte', dataAte);
    return `${apiBase}/api/admin/manifestacoes/${rota}?${p.toString()}`;
  }

  // Dados
  const [pagina, setPagina] = useState<Pagina<Manifestacao> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // Modal de detalhe
  const [idSelecionado, setIdSelecionado] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);

  const carregar = useCallback(
    async (pg: number) => {
      controllerRef.current?.abort();
      const ctrl = new AbortController();
      controllerRef.current = ctrl;

      setCarregando(true);
      setErro('');
      try {
        const params = qs({
          canal,
          status,
          tipo,
          q,
          dataDe: dataDe || undefined,
          dataAte: dataAte || undefined,
          minhas: minhas ? 'true' : undefined,
          page: pg,
          pageSize: 20,
        });
        const data = await adminGet<Pagina<Manifestacao>>(`/api/admin/manifestacoes${params}`);
        if (!ctrl.signal.aborted) {
          setPagina(data);
          setPage(pg);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) {
          setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar manifestações.');
        }
      } finally {
        if (!ctrl.signal.aborted) setCarregando(false);
      }
    },
    [canal, status, tipo, q, dataDe, dataAte, minhas],
  );

  // Carrega ao montar e quando filtros mudam
  useEffect(() => {
    carregar(1);
    return () => controllerRef.current?.abort();
  }, [carregar]);

  const totalPaginas = pagina ? Math.ceil(pagina.total / pagina.pageSize) : 0;

  return (
    <div className="space-y-4">
      <AdminHeader title={titulo} description={descricao} />

      {/* Relatório e exportação (gráficos/TCE-MT) */}
      <section className={`${ui.card} flex flex-wrap items-end gap-3 p-3`} aria-label="Relatório e exportação">
        <div>
          <label className={ui.label}>De</label>
          <input type="date" className={ui.input} value={dataDe} onChange={(e) => setDataDe(e.target.value)} />
        </div>
        <div>
          <label className={ui.label}>Até</label>
          <input type="date" className={ui.input} value={dataAte} onChange={(e) => setDataAte(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={urlRelatorio('export', 'csv')} className={ui.btnGhost}>Exportar lista (CSV)</a>
          <a href={urlRelatorio('relatorio', 'csv')} className={ui.btnGhost}>Relatório (CSV)</a>
          <a href={urlRelatorio('relatorio', 'pdf')} className={ui.btn}>Relatório (PDF)</a>
          <a href={urlRelatorio('relatorio', 'xlsx')} className={ui.btnGhost}>Relatório (Excel)</a>
          <a href={urlRelatorio('relatorio', 'doc')} className={ui.btnGhost}>Relatório (DOC)</a>
        </div>
      </section>

      {/* Filtros */}
      <form
        role="search"
        aria-label="Filtros de manifestações"
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          carregar(1);
        }}
      >
        <div className="flex-1 min-w-[200px]">
          <label htmlFor="inp-busca" className={`${ui.label} sr-only`}>
            Buscar por protocolo ou assunto
          </label>
          <input
            id="inp-busca"
            type="search"
            className={ui.input}
            placeholder="Buscar protocolo ou assunto…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="sel-status" className={`${ui.label} sr-only`}>
            Filtrar por status
          </label>
          <select
            id="sel-status"
            className={ui.input}
            value={status}
            onChange={(e) => setStatus(e.target.value as Status | '')}
          >
            {STATUS_OPCOES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="sel-tipo" className={`${ui.label} sr-only`}>
            Filtrar por tipo
          </label>
          <select
            id="sel-tipo"
            className={ui.input}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo | '')}
          >
            {tiposOpcoes.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className={ui.btn} disabled={carregando}>
          {carregando ? 'Buscando…' : 'Filtrar'}
        </button>
      </form>

      {/* Feedback de erro */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Estado de carregamento */}
      {carregando && (
        <p aria-live="polite" className="py-6 text-center text-sm text-fg/60">
          Carregando manifestações…
        </p>
      )}

      {/* Tabela */}
      {!carregando && pagina && (
        <>
          {pagina.items.length === 0 ? (
            <p className="py-8 text-center text-sm text-fg/60" aria-live="polite">
              Nenhuma manifestação encontrada com os filtros atuais.
            </p>
          ) : (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full border-collapse text-sm">
                <caption className="sr-only">
                  Lista de {canal === 'esic' ? 'pedidos de acesso à informação' : 'manifestações'} —{' '}
                  {pagina.total} no total
                </caption>
                <thead className="bg-muted">
                  <tr>
                    <th scope="col" className={ui.th}>Protocolo</th>
                    <th scope="col" className={ui.th}>Tipo</th>
                    <th scope="col" className={ui.th}>Assunto</th>
                    <th scope="col" className={ui.th}>Status</th>
                    <th scope="col" className={ui.th}>Prazo</th>
                    <th scope="col" className={ui.th}>Data</th>
                    <th scope="col" className={`${ui.th} sr-only`}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pagina.items.map((m) => {
                    const vencido = prazoVencido(m.prazoEm);
                    return (
                      <tr
                        key={m.id}
                        className="hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setIdSelecionado(m.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setIdSelecionado(m.id);
                        }}
                        tabIndex={0}
                        role="button"
                        aria-label={`Abrir detalhe do protocolo ${m.protocolo}`}
                      >
                        <td className={`${ui.td} font-mono`}>{m.protocolo}</td>
                        <td className={ui.td}>{m.tipo.replace(/_/g, ' ')}</td>
                        <td className={ui.td}>
                          <span className="line-clamp-2 max-w-[200px]">{m.assunto}</span>
                          {m.anonima && (
                            <span className="ml-1 text-xs text-fg/50">[anônima]</span>
                          )}
                        </td>
                        <td className={ui.td}>
                          <span className={`${ui.badge} ${STATUS_CORES[m.status]}`}>
                            {STATUS_LABELS[m.status]}
                          </span>
                        </td>
                        <td className={`${ui.td} ${vencido ? 'text-danger font-semibold' : ''}`}>
                          {m.prazoEm ? (
                            <>
                              {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                                new Date(m.prazoEm),
                              )}
                              {vencido && (
                                <span className="ml-1 text-xs" aria-label="prazo vencido">
                                  ⚠
                                </span>
                              )}
                              {m.prorrogado && (
                                <span className="ml-1 text-xs text-fg/50">(P)</span>
                              )}
                            </>
                          ) : (
                            <span className="text-fg/40">—</span>
                          )}
                        </td>
                        <td className={ui.td}>
                          {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
                            new Date(m.criadoEm),
                          )}
                        </td>
                        <td className={ui.td}>
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={(e) => {
                              e.stopPropagation();
                              setIdSelecionado(m.id);
                            }}
                            aria-label={`Ver detalhe do protocolo ${m.protocolo}`}
                          >
                            Detalhar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Paginação */}
          {totalPaginas > 1 && (
            <nav aria-label="Paginação" className="flex items-center justify-between gap-2">
              <p className="text-sm text-fg/60">
                Página {page} de {totalPaginas} — {pagina.total} resultado(s)
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={page <= 1}
                  onClick={() => carregar(page - 1)}
                  aria-label="Página anterior"
                >
                  ← Anterior
                </button>
                <button
                  type="button"
                  className={ui.btnGhost}
                  disabled={page >= totalPaginas}
                  onClick={() => carregar(page + 1)}
                  aria-label="Próxima página"
                >
                  Próxima →
                </button>
              </div>
            </nav>
          )}
        </>
      )}

      {/* Modal de detalhe */}
      {idSelecionado && (
        <DetalheModal
          id={idSelecionado}
          canal={canal ?? 'ouvidoria'}
          onFechar={() => setIdSelecionado(null)}
          onAtualizar={() => carregar(page)}
        />
      )}
    </div>
  );
}
