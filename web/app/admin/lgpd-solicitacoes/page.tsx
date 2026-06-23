'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type SolicitacaoTipo =
  | 'confirmacao_existencia'
  | 'acesso'
  | 'correcao'
  | 'anonimizacao'
  | 'bloqueio'
  | 'eliminacao'
  | 'portabilidade'
  | 'info_compartilhamento'
  | 'revogacao_consentimento'
  | 'oposicao'
  | 'revisao_decisao_automatizada';

type SolicitacaoStatus =
  | 'aberta'
  | 'em_andamento'
  | 'encaminhada'
  | 'concluida'
  | 'indeferida';

interface Titular {
  id: string;
  nome: string;
  email: string;
}

interface SolicitacaoResumo {
  id: string;
  tipo: SolicitacaoTipo;
  status: SolicitacaoStatus;
  prazoEm: string;
  atrasada: boolean;
  criadoEm: string;
  titular: Titular;
}

interface SolicitacaoDetalhe extends SolicitacaoResumo {
  descricao: string | null;
  resposta: string | null;
  indeferimentoMotivo: string | null;
  tratadoEm: string | null;
}

interface Encarregado {
  dpoNome: string | null;
  dpoEmail: string | null;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const TIPO_LABEL: Record<SolicitacaoTipo, string> = {
  confirmacao_existencia: 'Confirmação de existência',
  acesso: 'Acesso aos dados',
  correcao: 'Correção de dados',
  anonimizacao: 'Anonimização',
  bloqueio: 'Bloqueio de uso',
  eliminacao: 'Eliminação/Exclusão',
  portabilidade: 'Portabilidade',
  info_compartilhamento: 'Compartilhamento de dados',
  revogacao_consentimento: 'Revogar consentimento',
  oposicao: 'Oposição ao tratamento',
  revisao_decisao_automatizada: 'Revisão de decisão automatizada',
};

const STATUS_LABEL: Record<SolicitacaoStatus, string> = {
  aberta: 'Aberta',
  em_andamento: 'Em andamento',
  encaminhada: 'Encaminhada',
  concluida: 'Concluída',
  indeferida: 'Indeferida',
};

const STATUS_COR: Record<SolicitacaoStatus, string> = {
  aberta: 'bg-primary/10 text-primary',
  em_andamento: 'bg-warning/20 text-warning',
  encaminhada: 'bg-secondary/10 text-secondary',
  concluida: 'bg-success/20 text-success',
  indeferida: 'bg-danger/10 text-danger',
};

/** Retorna as transições válidas a partir de um dado status. */
function transicoesValidas(status: SolicitacaoStatus): SolicitacaoStatus[] {
  switch (status) {
    case 'aberta':
      return ['em_andamento', 'encaminhada'];
    case 'em_andamento':
      return ['concluida', 'indeferida', 'encaminhada'];
    case 'encaminhada':
      return ['em_andamento', 'concluida', 'indeferida'];
    default:
      return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
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

// ─── Modal de detalhe / ação ──────────────────────────────────────────────────

function ModalDetalhe({
  open,
  detalhe,
  onClose,
  onAtualizado,
}: {
  open: boolean;
  detalhe: SolicitacaoDetalhe | null;
  onClose: () => void;
  onAtualizado: () => void;
}) {
  const idBase = useId();
  const [novoStatus, setNovoStatus] = useState<SolicitacaoStatus | ''>('');
  const [resposta, setResposta] = useState('');
  const [indeferimentoMotivo, setIndeferimentoMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  // Confirmação forte para anonimização
  const [confirmAnonimizar, setConfirmAnonimizar] = useState(false);
  const [anonimizando, setAnonimizando] = useState(false);
  const [erroAnonimizar, setErroAnonimizar] = useState('');

  useEffect(() => {
    if (!open || !detalhe) {
      setNovoStatus('');
      setResposta(detalhe?.resposta ?? '');
      setIndeferimentoMotivo(detalhe?.indeferimentoMotivo ?? '');
      setErro('');
      setMsgOk('');
      setConfirmAnonimizar(false);
      setErroAnonimizar('');
      return;
    }
    setNovoStatus('');
    setResposta(detalhe.resposta ?? '');
    setIndeferimentoMotivo(detalhe.indeferimentoMotivo ?? '');
    setErro('');
    setMsgOk('');
    setConfirmAnonimizar(false);
    setErroAnonimizar('');
  }, [open, detalhe]);

  if (!detalhe) return null;

  const transicoes = transicoesValidas(detalhe.status);
  const ehFinal = transicoes.length === 0;
  const exigeMotivo = novoStatus === 'indeferida';
  const podeAnonimizar =
    detalhe.tipo === 'eliminacao' && !ehFinal;

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!detalhe) return;
    if (!novoStatus) {
      setErro('Selecione o novo status.');
      return;
    }
    if (exigeMotivo && !indeferimentoMotivo.trim()) {
      setErro('O motivo do indeferimento é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      await adminPatch(`/api/lgpd/admin/solicitacoes/${detalhe.id}`, {
        status: novoStatus,
        resposta: resposta.trim() || undefined,
        indeferimentoMotivo: exigeMotivo ? indeferimentoMotivo.trim() : undefined,
      });
      setMsgOk('Solicitação atualizada com sucesso.');
      onAtualizado();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) {
        setErro('Transição de status inválida ou dados insuficientes.');
      } else {
        setErro(err instanceof AdminApiError ? err.message : 'Erro ao atualizar.');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleAnonimizar() {
    if (!detalhe) return;
    setAnonimizando(true);
    setErroAnonimizar('');
    try {
      await adminPost(`/api/lgpd/admin/solicitacoes/${detalhe.id}/anonimizar`);
      onAtualizado();
      onClose();
    } catch (err) {
      setErroAnonimizar(err instanceof AdminApiError ? err.message : 'Erro ao anonimizar.');
    } finally {
      setAnonimizando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Solicitação — ${TIPO_LABEL[detalhe.tipo] ?? detalhe.tipo}`}>
      <div className="space-y-5">
        {/* Dados do titular */}
        <section aria-label="Dados do titular" className="rounded border border-border p-3 text-sm space-y-1">
          <p className="font-semibold text-xs uppercase tracking-wide text-fg/50 mb-1">Titular</p>
          <p><span className="text-fg/60">Nome:</span> <strong>{detalhe.titular.nome}</strong></p>
          <p><span className="text-fg/60">E-mail:</span> {detalhe.titular.email}</p>
          <p><span className="text-fg/60">Criada em:</span> {formatarData(detalhe.criadoEm)}</p>
          <p><span className="text-fg/60">Prazo:</span> {formatarData(detalhe.prazoEm)}</p>
          {detalhe.atrasada && (
            <span className={`${ui.badge} bg-danger/10 text-danger`} role="status">
              Atrasada
            </span>
          )}
        </section>

        {/* Descrição fornecida pelo titular */}
        {detalhe.descricao && (
          <section aria-label="Descrição do titular" className="text-sm space-y-1">
            <p className="font-semibold text-xs uppercase tracking-wide text-fg/50">Descrição</p>
            <p className="rounded bg-muted/30 p-3 text-fg/80">{detalhe.descricao}</p>
          </section>
        )}

        {/* Status atual */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-fg/60">Status atual:</span>
          <span className={`${ui.badge} ${STATUS_COR[detalhe.status]}`}>
            {STATUS_LABEL[detalhe.status]}
          </span>
        </div>

        {/* Ações de atualização (só se não for estado final) */}
        {!ehFinal && (
          <form onSubmit={handleSalvar} noValidate className="space-y-4 border-t border-border pt-4">
            <p className="font-semibold text-sm">Atualizar solicitação</p>

            {erro && <Aviso tipo="erro">{erro}</Aviso>}
            {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

            {/* Novo status */}
            <div>
              <label htmlFor={`${idBase}-status`} className={ui.label}>
                Novo status <span aria-hidden="true">*</span>
              </label>
              <select
                id={`${idBase}-status`}
                className={ui.input}
                value={novoStatus}
                onChange={(e) => setNovoStatus(e.target.value as SolicitacaoStatus | '')}
                required
                aria-required="true"
              >
                <option value="">Selecione…</option>
                {transicoes.map((t) => (
                  <option key={t} value={t}>
                    {STATUS_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>

            {/* Resposta */}
            <div>
              <label htmlFor={`${idBase}-resposta`} className={ui.label}>
                Resposta ao titular
              </label>
              <textarea
                id={`${idBase}-resposta`}
                className={`${ui.input} min-h-[80px] resize-y`}
                value={resposta}
                onChange={(e) => setResposta(e.target.value)}
                placeholder="Forneça a resposta formal ao titular…"
                maxLength={5000}
              />
            </div>

            {/* Motivo de indeferimento (obrigatório quando indeferida) */}
            {exigeMotivo && (
              <div>
                <label htmlFor={`${idBase}-motivo`} className={ui.label}>
                  Motivo do indeferimento <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id={`${idBase}-motivo`}
                  className={`${ui.input} min-h-[72px] resize-y`}
                  value={indeferimentoMotivo}
                  onChange={(e) => setIndeferimentoMotivo(e.target.value)}
                  required
                  aria-required="true"
                  placeholder="Explique o motivo do indeferimento…"
                  maxLength={2000}
                />
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className={ui.btnGhost} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className={ui.btn} disabled={salvando || !novoStatus}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}

        {ehFinal && (
          <p className="text-sm text-fg/60 italic">
            Esta solicitação está em estado final e não pode ser alterada.
          </p>
        )}

        {/* Bloco de anonimização (apenas para tipo 'eliminacao' e status não-final) */}
        {podeAnonimizar && (
          <section
            aria-labelledby={`${idBase}-anonimizar-titulo`}
            className="border-t border-border pt-4 space-y-3"
          >
            <h3 id={`${idBase}-anonimizar-titulo`} className="font-semibold text-sm text-danger">
              Anonimizar titular (ação irreversível)
            </h3>

            {erroAnonimizar && <Aviso tipo="erro">{erroAnonimizar}</Aviso>}

            {!confirmAnonimizar ? (
              <>
                <p className="text-sm text-fg/70">
                  Esta ação remove definitivamente os dados de identificação do titular
                  (nome, e-mail, telefone, CPF, gov.br) e desativa a conta.
                  Os registros legais (manifestações, chamados, audit_log) são mantidos
                  de forma anonimizada pelo prazo obrigatório, sem vínculo à identidade.
                  <strong className="block mt-1 text-danger">Esta operação não pode ser desfeita.</strong>
                </p>
                <button
                  type="button"
                  onClick={() => setConfirmAnonimizar(true)}
                  className={ui.btnDanger}
                >
                  Executar anonimização do titular
                </button>
              </>
            ) : (
              <div className="rounded border border-danger bg-danger/5 p-4 space-y-3">
                <p className="font-semibold text-sm text-danger">
                  Confirme: você está prestes a anonimizar de forma permanente o titular{' '}
                  <strong>{detalhe.titular.nome}</strong> ({detalhe.titular.email}).
                  Esta ação é IRREVERSÍVEL.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmAnonimizar(false)}
                    className={ui.btnGhost}
                    disabled={anonimizando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleAnonimizar}
                    disabled={anonimizando}
                    className={ui.btnDanger}
                    aria-busy={anonimizando}
                  >
                    {anonimizando ? 'Anonimizando…' : 'Confirmar anonimização'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

// ─── Formulário de Encarregado (DPO) ─────────────────────────────────────────

function FormEncarregado() {
  const idBase = useId();
  const [dpoNome, setDpoNome] = useState('');
  const [dpoEmail, setDpoEmail] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  useEffect(() => {
    adminGet<{ dpoNome: string | null; dpoEmail: string | null }>('/api/lgpd/encarregado')
      .then((d) => {
        setDpoNome(d.dpoNome ?? '');
        setDpoEmail(d.dpoEmail ?? '');
      })
      .catch(() => {
        /* silencia — campos ficam vazios */
      })
      .finally(() => setCarregando(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      await adminPut('/api/lgpd/admin/encarregado', {
        dpoNome: dpoNome.trim() || null,
        dpoEmail: dpoEmail.trim() || null,
      });
      setMsgOk('Dados do Encarregado atualizados.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section aria-labelledby="secao-dpo" className={`${ui.card} p-4 space-y-4`}>
      <h2 id="secao-dpo" className="font-heading text-base font-bold">
        Encarregado (DPO) — LGPD, art. 41
      </h2>
      <p className="text-sm text-fg/70">
        Dados exibidos publicamente no portal e no rodapé das solicitações de titulares.
      </p>

      {carregando ? (
        <p className="text-sm text-fg/60" role="status">Carregando…</p>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-dpo-nome`} className={ui.label}>
                Nome do Encarregado
              </label>
              <input
                id={`${idBase}-dpo-nome`}
                className={`${ui.input} mt-1`}
                value={dpoNome}
                onChange={(e) => setDpoNome(e.target.value)}
                placeholder="Ex.: Maria da Silva"
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-dpo-email`} className={ui.label}>
                E-mail do Encarregado
              </label>
              <input
                id={`${idBase}-dpo-email`}
                type="email"
                className={`${ui.input} mt-1`}
                value={dpoEmail}
                onChange={(e) => setDpoEmail(e.target.value)}
                placeholder="dpo@municipio.gov.br"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button type="submit" className={ui.btn} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LgpdSolicitacoesPage() {
  const [lista, setLista] = useState<SolicitacaoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');

  // Modal
  const [detalhe, setDetalhe] = useState<SolicitacaoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<{ items: SolicitacaoResumo[]; total: number } | SolicitacaoResumo[]>(
        `/api/lgpd/admin/solicitacoes${qs({ status: filtroStatus, tipo: filtroTipo })}`,
      );
      // O backend devolve { items, total, page, pageSize } (paginado); tolera array por segurança.
      setLista(Array.isArray(data) ? data : data.items ?? []);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar solicitações.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroTipo]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirDetalhe(id: string) {
    setCarregandoDetalhe(true);
    try {
      const d = await adminGet<SolicitacaoDetalhe>(`/api/lgpd/admin/solicitacoes/${id}`);
      setDetalhe(d);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar detalhe.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <AdminHeader
        title="Solicitações do Titular (LGPD)"
        description="Gerencie as solicitações de direitos de titulares de dados conforme a LGPD, art. 18."
      />

      {/* Formulário DPO */}
      <FormEncarregado />

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="filtro-status" className={`${ui.label} text-xs`}>
            Status
          </label>
          <select
            id="filtro-status"
            className={`${ui.input} mt-1 w-40`}
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as SolicitacaoStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-tipo" className={`${ui.label} text-xs`}>
            Tipo
          </label>
          <select
            id="filtro-tipo"
            className={`${ui.input} mt-1 w-56`}
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
          >
            <option value="">Todos</option>
            {(Object.keys(TIPO_LABEL) as SolicitacaoTipo[]).map((t) => (
              <option key={t} value={t}>{TIPO_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <button onClick={carregar} disabled={carregando} className={ui.btnGhost}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </section>

      {/* Feedbacks */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de solicitações"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhuma solicitação encontrada.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Titular</th>
                  <th className={ui.th} scope="col">Tipo</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Prazo</th>
                  <th className={ui.th} scope="col">Criada em</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className={ui.td}>
                      <div>
                        <span className="font-semibold">{s.titular.nome}</span>
                        <br />
                        <span className="text-xs text-fg/60">{s.titular.email}</span>
                      </div>
                    </td>
                    <td className={ui.td}>
                      <span className="text-xs">{TIPO_LABEL[s.tipo] ?? s.tipo}</span>
                    </td>
                    <td className={ui.td}>
                      <div className="flex flex-wrap gap-1">
                        <span className={`${ui.badge} ${STATUS_COR[s.status]}`}>
                          {STATUS_LABEL[s.status]}
                        </span>
                        {s.atrasada && (
                          <span className={`${ui.badge} bg-danger/10 text-danger`} role="status">
                            Atrasada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={ui.td}>
                      <time dateTime={s.prazoEm} className="text-sm">
                        {formatarData(s.prazoEm)}
                      </time>
                    </td>
                    <td className={ui.td}>
                      <time dateTime={s.criadoEm} className="text-xs text-fg/60">
                        {formatarData(s.criadoEm)}
                      </time>
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => abrirDetalhe(s.id)}
                        disabled={carregandoDetalhe}
                        className={ui.btnGhost}
                        aria-label={`Abrir solicitação de ${s.titular.nome}`}
                      >
                        Ver / Atuar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal de detalhe */}
      <ModalDetalhe
        open={detalhe !== null}
        detalhe={detalhe}
        onClose={() => setDetalhe(null)}
        onAtualizado={() => {
          setDetalhe(null);
          carregar();
        }}
      />
    </main>
  );
}
