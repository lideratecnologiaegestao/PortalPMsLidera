'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import { AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../../admin/_components/ui';
import {
  PAPEL_LABEL,
  PAPEIS_LIDERA,
  STATUS_COR,
  STATUS_LABEL,
  aprovarSolicitacaoPlataforma,
  listarSolicitacoesPlataforma,
  recusarSolicitacaoPlataforma,
  type SolicitacaoElevacao,
} from '../../../lib/elevacao';

// ─── Formatação ───────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

// ─── Modal de recusa ──────────────────────────────────────────────────────────

function ModalRecusar({
  open,
  solicitacao,
  onClose,
  onRecusada,
}: {
  open: boolean;
  solicitacao: SolicitacaoElevacao | null;
  onClose: () => void;
  onRecusada: () => void;
}) {
  const idBase = useId();
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Limpa ao fechar
  useEffect(() => {
    if (!open) {
      setMotivo('');
      setErro('');
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!solicitacao) return;
    if (!motivo.trim()) {
      setErro('Informe o motivo da recusa.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await recusarSolicitacaoPlataforma(solicitacao.id, motivo.trim());
      onRecusada();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao recusar solicitação.');
    } finally {
      setSalvando(false);
    }
  }

  if (!solicitacao) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Recusar — ${solicitacao.solicitante?.nome ?? 'Usuário'} (${solicitacao.tenant?.nome ?? 'Prefeitura desconhecida'})`}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <p className="text-sm text-fg/70">
          Papel solicitado:{' '}
          <strong>{PAPEL_LABEL[solicitacao.papelSolicitado] ?? solicitacao.papelSolicitado}</strong>
          {' '}&mdash; Prefeitura:{' '}
          <strong>{solicitacao.tenant?.nome ?? '—'}</strong>
        </p>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div>
          <label htmlFor={`${idBase}-motivo`} className={ui.label}>
            Motivo da recusa <span aria-hidden="true" className="text-danger">*</span>
          </label>
          <textarea
            id={`${idBase}-motivo`}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            required
            aria-required="true"
            rows={4}
            maxLength={1000}
            placeholder="Explique o motivo da recusa para o solicitante…"
            className={`${ui.input} mt-1 resize-y`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={salvando}
            className={ui.btnGhost}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className={ui.btnDanger}
          >
            {salvando ? 'Recusando…' : 'Confirmar recusa'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlataformaSolicitacoesPage() {
  const [lista, setLista] = useState<SolicitacaoElevacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('pendente');
  const [filtroPapel, setFiltroPapel] = useState('');

  // Modal de recusa
  const [solicitacaoRecusar, setSolicitacaoRecusar] = useState<SolicitacaoElevacao | null>(null);

  // Ids em operação
  const [aprovando, setAprovando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setMsgOk('');
    try {
      const data = await listarSolicitacoesPlataforma(filtroStatus || undefined);
      // Filtra por papel no cliente (se necessário — o endpoint pode não suportar esse param)
      const filtered = filtroPapel
        ? (Array.isArray(data) ? data : []).filter((s) => s.papelSolicitado === filtroPapel)
        : (Array.isArray(data) ? data : []);
      setLista(filtered);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar solicitações.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroPapel]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleAprovar(s: SolicitacaoElevacao) {
    setAprovando(s.id);
    setErro('');
    setMsgOk('');
    try {
      await aprovarSolicitacaoPlataforma(s.id);
      setMsgOk(
        `Solicitação de ${s.solicitante?.nome ?? 'usuário'} (${s.tenant?.nome ?? 'prefeitura'}) aprovada.`,
      );
      carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao aprovar solicitação.');
    } finally {
      setAprovando(null);
    }
  }

  return (
    <main className="space-y-6">
      <AdminHeader
        title="Solicitações de acesso (Plataforma)"
        description="Papéis de Ouvidor, Assistente de Ouvidoria e TI — aprovação exclusiva da equipe Lidera (cross-tenant)."
      />

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="plat-filtro-status" className={`${ui.label} text-xs`}>
            Status
          </label>
          <select
            id="plat-filtro-status"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className={`${ui.input} mt-1 w-44`}
          >
            <option value="">Todos</option>
            <option value="pendente">Pendentes</option>
            <option value="aprovada">Aprovadas</option>
            <option value="recusada">Recusadas</option>
            <option value="expirada">Expiradas</option>
          </select>
        </div>
        <div>
          <label htmlFor="plat-filtro-papel" className={`${ui.label} text-xs`}>
            Papel
          </label>
          <select
            id="plat-filtro-papel"
            value={filtroPapel}
            onChange={(e) => setFiltroPapel(e.target.value)}
            className={`${ui.input} mt-1 w-52`}
          >
            <option value="">Todos os papéis</option>
            {PAPEIS_LIDERA.map((p) => (
              <option key={p} value={p}>
                {PAPEL_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={carregar}
          disabled={carregando}
          className={ui.btnGhost}
          aria-label="Atualizar lista"
        >
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </section>

      {/* Avisos */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Solicitações de acesso cross-tenant"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            {filtroStatus === 'pendente'
              ? 'Nenhuma solicitação pendente de revisão Lidera.'
              : 'Nenhuma solicitação encontrada.'}
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[800px] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={ui.th}>Solicitante</th>
                  <th scope="col" className={ui.th}>Prefeitura (tenant)</th>
                  <th scope="col" className={ui.th}>Papel solicitado</th>
                  <th scope="col" className={ui.th}>Cargo / Justificativa</th>
                  <th scope="col" className={ui.th}>Data</th>
                  <th scope="col" className={ui.th}>Status</th>
                  <th scope="col" className={ui.th}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                    <td className={ui.td}>
                      <span className="font-semibold text-sm block">
                        {s.solicitante?.nome ?? '—'}
                      </span>
                      <span className="text-xs text-fg/50">
                        {s.solicitante?.email ?? ''}
                      </span>
                    </td>

                    <td className={ui.td}>
                      <span className="text-sm font-medium">
                        {s.tenant?.nome ?? '—'}
                      </span>
                      {s.tenant?.slug && (
                        <span className="text-xs text-fg/50 block">
                          {s.tenant.slug}
                        </span>
                      )}
                    </td>

                    <td className={ui.td}>
                      <span className="text-sm">
                        {PAPEL_LABEL[s.papelSolicitado] ?? s.papelSolicitado}
                      </span>
                    </td>

                    <td className={`${ui.td} max-w-[200px]`}>
                      {s.cargoDeclarado && (
                        <span className="text-xs block text-fg/70 mb-1">
                          <span className="font-medium">Cargo:</span> {s.cargoDeclarado}
                        </span>
                      )}
                      <p className="text-xs line-clamp-3 text-fg/60">
                        {s.justificativa ?? '—'}
                      </p>
                    </td>

                    <td className={ui.td}>
                      <time dateTime={s.criadoEm} className="text-xs text-fg/60">
                        {formatarData(s.criadoEm)}
                      </time>
                    </td>

                    <td className={ui.td}>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COR[s.status]}`}
                      >
                        {STATUS_LABEL[s.status]}
                      </span>
                      {s.status === 'recusada' && s.motivoRecusa && (
                        <p className="mt-1 text-xs text-danger line-clamp-2">
                          {s.motivoRecusa}
                        </p>
                      )}
                    </td>

                    <td className={`${ui.td} whitespace-nowrap`}>
                      {s.status === 'pendente' && (
                        <span className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => handleAprovar(s)}
                            disabled={aprovando === s.id}
                            aria-label={`Aprovar solicitação de ${s.solicitante?.nome ?? 'usuário'}`}
                            className={ui.btn}
                          >
                            {aprovando === s.id ? 'Aprovando…' : 'Aprovar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSolicitacaoRecusar(s)}
                            disabled={aprovando === s.id}
                            aria-label={`Recusar solicitação de ${s.solicitante?.nome ?? 'usuário'}`}
                            className={ui.btnDanger}
                          >
                            Recusar
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal recusa */}
      <ModalRecusar
        open={solicitacaoRecusar !== null}
        solicitacao={solicitacaoRecusar}
        onClose={() => setSolicitacaoRecusar(null)}
        onRecusada={carregar}
      />
    </main>
  );
}
