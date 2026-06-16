'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  baixarMeusDados,
  criarSolicitacao,
  getEncarregado,
  listarSolicitacoes,
  TIPO_LABEL,
  STATUS_LABEL,
  STATUS_COR,
  type Encarregado,
  type SolicitacaoResumo,
  type SolicitacaoTipo,
} from '../../../lib/lgpd';

// ─── Helpers ────────────────────────────────────────────────────────────────

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

// ─── UI inline (sem importar do admin para manter fronteira de camadas) ─────

const ui = {
  btn: 'inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  btnGhost:
    'inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
  input:
    'w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary',
  label: 'block text-sm font-semibold mb-1',
  badge: 'inline-block rounded px-2 py-0.5 text-xs font-semibold',
  card: 'rounded border border-border bg-bg',
};

// ─── Modal acessível (replicado do padrão admin, sem depender do admin/ui) ──

function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/40 p-4">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="my-8 w-full max-w-xl rounded border border-border bg-bg p-5 shadow-lg focus:outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            className="rounded p-1 text-fg/60 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Modal: Nova solicitação ──────────────────────────────────────────────────

const TIPOS_SOLICITACAO = Object.entries(TIPO_LABEL) as [SolicitacaoTipo, string][];

function ModalNovaSolicitacao({
  open,
  onClose,
  onCriada,
}: {
  open: boolean;
  onClose: () => void;
  onCriada: () => void;
}) {
  const idBase = useId();
  const [tipo, setTipo] = useState<SolicitacaoTipo | ''>('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) {
      setTipo('');
      setDescricao('');
      setErro('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tipo) {
      setErro('Selecione o tipo de solicitação.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await criarSolicitacao(tipo, descricao || undefined);
      onCriada();
      onClose();
    } catch (err: unknown) {
      const e = err as Error & { status?: number };
      if (e.status === 429) {
        setErro(
          'Você já possui 5 solicitações abertas. Aguarde a conclusão de alguma delas antes de abrir uma nova.',
        );
      } else if (e.status === 422) {
        setErro('Tipo de solicitação inválido. Por favor, selecione uma opção válida.');
      } else {
        setErro(e.message || 'Erro ao registrar a solicitação.');
      }
    } finally {
      setSalvando(false);
    }
  }

  const tipoSelecionado = tipo as SolicitacaoTipo | '';
  const ehEliminacao = tipoSelecionado === 'eliminacao';

  return (
    <Modal open={open} onClose={onClose} title="Nova solicitação de direito (LGPD)">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {erro && (
          <p role="alert" aria-live="assertive" className="rounded border border-danger p-2 text-sm text-danger">
            {erro}
          </p>
        )}

        {/* Tipo */}
        <div>
          <label htmlFor={`${idBase}-tipo`} className={ui.label}>
            Tipo de solicitação <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${idBase}-tipo`}
            className={ui.input}
            value={tipo}
            onChange={(e) => setTipo(e.target.value as SolicitacaoTipo | '')}
            required
            aria-required="true"
          >
            <option value="">Selecione…</option>
            {TIPOS_SOLICITACAO.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* Aviso especial para eliminação */}
        {ehEliminacao && (
          <div
            role="note"
            aria-label="Aviso sobre solicitação de eliminação"
            className="rounded border border-warning bg-warning/10 p-3 text-sm space-y-1"
          >
            <p className="font-semibold">Atenção — Eliminação de dados</p>
            <p className="text-fg/80">
              A exclusão imediata de conta é legalmente vedada neste contexto (LGPD, art. 16).
              Registros de processos administrativos (manifestações, pedidos e-SIC) têm guarda
              obrigatória de até 10 anos por legislação vigente.
            </p>
            <p className="text-fg/80">
              Ao registrar esta solicitação, o Encarregado (DPO) analisará quais dados podem ser
              removidos. A operação realizada é a <strong>anonimização</strong> dos seus dados de
              identificação: nome, e-mail e demais dados pessoais são substituídos; registros legais
              são mantidos em forma anonimizada pelo prazo legal, sem possibilidade de vinculação à
              sua identidade.
            </p>
            <p className="text-fg/80 text-xs">
              Base legal: LGPD art. 7º, II; art. 16; Portaria CGU (guarda de manifestações — 10 anos).
            </p>
          </div>
        )}

        {/* Descrição opcional */}
        <div>
          <label htmlFor={`${idBase}-descricao`} className={ui.label}>
            Descrição (opcional)
          </label>
          <textarea
            id={`${idBase}-descricao`}
            className={`${ui.input} min-h-[88px] resize-y`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            maxLength={2000}
            placeholder="Forneça detalhes adicionais sobre sua solicitação, se necessário…"
            aria-describedby={`${idBase}-desc-contador`}
          />
          <p id={`${idBase}-desc-contador`} className="mt-1 text-right text-xs text-fg/50">
            {descricao.length}/2000
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando || !tipo}>
            {salvando ? 'Registrando…' : 'Registrar solicitação'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function MeusDadosClient() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoResumo[] | null>(null);
  const [encarregado, setEncarregado] = useState<Encarregado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');
  const [baixando, setBaixando] = useState(false);
  const [erroBaixar, setErroBaixar] = useState('');
  const [msgOkBaixar, setMsgOkBaixar] = useState('');
  const [modalAberto, setModalAberto] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregar('');
    try {
      const [lista, enc] = await Promise.all([
        listarSolicitacoes(),
        getEncarregado(),
      ]);
      setSolicitacoes(lista);
      setEncarregado(enc);
    } catch (err: unknown) {
      const e = err as Error;
      setErroCarregar(e.message || 'Erro ao carregar dados.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleBaixarDados() {
    setBaixando(true);
    setErroBaixar('');
    setMsgOkBaixar('');
    try {
      await baixarMeusDados();
      setMsgOkBaixar('Arquivo gerado e enviado para download.');
    } catch (err: unknown) {
      const e = err as Error;
      setErroBaixar(e.message || 'Erro ao gerar exportação.');
    } finally {
      setBaixando(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Portabilidade / Download ─────────────────────────────────────── */}
      <section aria-labelledby="secao-portabilidade">
        <h2 id="secao-portabilidade" className="font-heading text-lg font-bold mb-3">
          Exportar meus dados
        </h2>
        <p className="text-sm text-fg/70 mb-3">
          Baixe uma cópia completa dos dados pessoais que a prefeitura possui sobre você
          em formato JSON interoperável (LGPD, art. 18, V).
        </p>

        {erroBaixar && (
          <p role="alert" aria-live="assertive" className="mb-3 rounded border border-danger p-2 text-sm text-danger">
            {erroBaixar}
          </p>
        )}
        {msgOkBaixar && (
          <p role="status" aria-live="polite" className="mb-3 rounded border border-success p-2 text-sm text-success">
            {msgOkBaixar}
          </p>
        )}

        <button
          type="button"
          onClick={handleBaixarDados}
          disabled={baixando}
          className={ui.btn}
          aria-busy={baixando}
        >
          {baixando ? 'Gerando arquivo…' : 'Baixar meus dados (JSON)'}
        </button>
      </section>

      {/* ── Minhas solicitações ──────────────────────────────────────────── */}
      <section aria-labelledby="secao-solicitacoes">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 id="secao-solicitacoes" className="font-heading text-lg font-bold">
            Minhas solicitações
          </h2>
          <button
            type="button"
            onClick={() => setModalAberto(true)}
            className={ui.btn}
          >
            + Nova solicitação
          </button>
        </div>

        {erroCarregar && (
          <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
            {erroCarregar}
          </p>
        )}

        {carregando ? (
          <p className="text-sm text-fg/60 py-4" role="status">
            Carregando…
          </p>
        ) : !solicitacoes || solicitacoes.length === 0 ? (
          <div className="rounded border border-border p-4 text-sm text-fg/60">
            Você ainda não possui solicitações. Clique em{' '}
            <strong>&quot;+ Nova solicitação&quot;</strong> para exercer um direito.
          </div>
        ) : (
          <ul
            className="space-y-3"
            aria-label="Lista de solicitações"
            aria-live="polite"
            aria-busy={carregando}
          >
            {solicitacoes.map((s) => {
              const concluida = s.status === 'concluida' || s.status === 'indeferida';
              return (
                <li
                  key={s.id}
                  className="rounded border border-border p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-sm">
                        {TIPO_LABEL[s.tipo] ?? s.tipo}
                      </p>
                      <p className="text-xs text-fg/60 mt-0.5">
                        Aberta em {formatarData(s.criadoEm)} · Prazo:{' '}
                        {formatarData(s.prazoEm)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`${ui.badge} ${STATUS_COR[s.status]}`}>
                        {STATUS_LABEL[s.status]}
                      </span>
                      {s.atrasada && (
                        <span
                          className={`${ui.badge} bg-danger/10 text-danger`}
                          role="status"
                          aria-label="Solicitação com prazo atrasado"
                        >
                          Atrasada
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Resposta do órgão (quando concluída ou indeferida) */}
                  {concluida && s.resposta && (
                    <div className="rounded bg-muted/40 p-3 text-sm space-y-1">
                      <p className="font-semibold text-xs uppercase tracking-wide text-fg/50">
                        Resposta do órgão
                      </p>
                      <p className="text-fg/80">{s.resposta}</p>
                    </div>
                  )}
                  {s.status === 'indeferida' && s.indeferimentoMotivo && (
                    <div className="rounded border border-danger/30 bg-danger/5 p-3 text-sm space-y-1">
                      <p className="font-semibold text-xs uppercase tracking-wide text-danger/70">
                        Motivo do indeferimento
                      </p>
                      <p className="text-fg/80">{s.indeferimentoMotivo}</p>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Contato do Encarregado (DPO) ────────────────────────────────── */}
      <footer className="rounded border border-border bg-muted/30 p-4 text-sm space-y-1">
        <p className="font-semibold text-xs uppercase tracking-wide text-fg/50 mb-1">
          Encarregado pelo Tratamento de Dados (DPO) — LGPD, art. 41
        </p>
        {encarregado && (encarregado.dpoNome || encarregado.dpoEmail) ? (
          <>
            {encarregado.dpoNome && (
              <p>
                <span className="text-fg/60">Responsável:</span>{' '}
                <strong>{encarregado.dpoNome}</strong>
              </p>
            )}
            {encarregado.dpoEmail && (
              <p>
                <span className="text-fg/60">E-mail:</span>{' '}
                <a
                  href={`mailto:${encarregado.dpoEmail}`}
                  className="text-primary underline hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {encarregado.dpoEmail}
                </a>
              </p>
            )}
          </>
        ) : (
          <p className="text-fg/70">
            Em caso de dúvidas sobre seus dados pessoais, entre em contato pela{' '}
            <a href="/ouvidoria" className="text-primary underline hover:opacity-80">
              Ouvidoria
            </a>
            .
          </p>
        )}
      </footer>

      {/* ── Modal nova solicitação ─────────────────────────────────────── */}
      <ModalNovaSolicitacao
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        onCriada={carregar}
      />
    </div>
  );
}
