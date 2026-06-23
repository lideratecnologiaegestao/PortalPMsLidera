'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  PAPEL_LABEL,
  PAPEIS_ADMIN_PREFEITURA,
  STATUS_COR,
  STATUS_LABEL,
  getSecretariasCidadao,
  minhasSolicitacoes,
  solicitarElevacao,
  type PapelSolicitado,
  type SecretariaOpcao,
  type SolicitacaoElevacao,
} from '../../lib/elevacao';

// ─── Formatação de data ───────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

// ─── Componente de histórico ──────────────────────────────────────────────────

function MinhasSolicitacoes({ lista }: { lista: SolicitacaoElevacao[] }) {
  if (lista.length === 0) {
    return (
      <p className="text-sm text-fg/60 py-2">
        Nenhuma solicitação enviada ainda.
      </p>
    );
  }

  return (
    <ul className="space-y-3" aria-label="Histórico de solicitações">
      {lista.map((s) => (
        <li
          key={s.id}
          className="rounded border border-border bg-bg p-4 space-y-1.5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-sm">
              {PAPEL_LABEL[s.papelSolicitado] ?? s.papelSolicitado}
            </span>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_COR[s.status]}`}
              aria-label={`Status: ${STATUS_LABEL[s.status]}`}
            >
              {STATUS_LABEL[s.status]}
            </span>
          </div>

          {s.cargoDeclarado && (
            <p className="text-xs text-fg/70">
              <span className="font-medium">Cargo declarado:</span> {s.cargoDeclarado}
            </p>
          )}

          {s.lotacaoSecretaria && (
            <p className="text-xs text-fg/70">
              <span className="font-medium">Secretaria:</span> {s.lotacaoSecretaria.nome}
            </p>
          )}

          {s.justificativa && (
            <p className="text-xs text-fg/70">
              <span className="font-medium">Justificativa:</span> {s.justificativa}
            </p>
          )}

          {s.status === 'recusada' && s.motivoRecusa && (
            <p className="text-xs text-danger">
              <span className="font-medium">Motivo da recusa:</span> {s.motivoRecusa}
            </p>
          )}

          <p className="text-xs text-fg/50">
            Enviada em {formatarData(s.criadoEm)}
          </p>
        </li>
      ))}
    </ul>
  );
}

// ─── Formulário principal ─────────────────────────────────────────────────────

export default function SolicitarAcessoClient() {
  const idBase = useId();

  // Formulário
  const [papel, setPapel] = useState<PapelSolicitado | ''>('');
  const [cargo, setCargo] = useState('');
  const [secretariaId, setSecretariaId] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  // Dados auxiliares
  const [secretarias, setSecretarias] = useState<SecretariaOpcao[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoElevacao[]>([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [secs, sols] = await Promise.all([
        getSecretariasCidadao(),
        minhasSolicitacoes(),
      ]);
      setSecretarias(secs);
      setSolicitacoes(sols);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Papéis que precisam secretaria: servidor e gestor (aprovados pelo admin_prefeitura)
  const precisaSecretaria = papel && PAPEIS_ADMIN_PREFEITURA.includes(papel as PapelSolicitado);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setMsgOk('');

    if (!papel) {
      setErro('Selecione o papel desejado.');
      return;
    }

    if (!justificativa.trim()) {
      setErro('Preencha a justificativa.');
      return;
    }

    setEnviando(true);
    try {
      await solicitarElevacao({
        papelSolicitado: papel as PapelSolicitado,
        cargoDeclarado: cargo.trim() || undefined,
        lotacaoSecretariaId: secretariaId || undefined,
        justificativa: justificativa.trim(),
      });
      setMsgOk('Solicitação enviada com sucesso. Aguarde a análise.');
      // Limpa o formulário
      setPapel('');
      setCargo('');
      setSecretariaId('');
      setJustificativa('');
      // Recarrega histórico
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao enviar solicitação.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Formulário */}
      <section aria-labelledby="form-titulo">
        <h2
          id="form-titulo"
          className="font-heading text-lg font-bold mb-4"
        >
          Nova solicitação
        </h2>

        {erro && (
          <p role="alert" className="mb-3 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger">
            {erro}
          </p>
        )}
        {msgOk && (
          <p role="status" aria-live="polite" className="mb-3 rounded border border-success/40 bg-success/5 p-3 text-sm text-success">
            {msgOk}
          </p>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Papel desejado */}
          <div>
            <label htmlFor={`${idBase}-papel`} className="block text-sm font-semibold">
              Papel desejado <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <select
              id={`${idBase}-papel`}
              value={papel}
              onChange={(e) => { setPapel(e.target.value as PapelSolicitado | ''); setSecretariaId(''); }}
              required
              aria-required="true"
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecione…</option>
              <optgroup label="Aprovados pela prefeitura">
                <option value="servidor">{PAPEL_LABEL.servidor}</option>
                <option value="gestor">{PAPEL_LABEL.gestor}</option>
              </optgroup>
              <optgroup label="Aprovados pela equipe Lidera">
                <option value="ouvidor">{PAPEL_LABEL.ouvidor}</option>
                <option value="assistente_ouvidoria">{PAPEL_LABEL.assistente_ouvidoria}</option>
                <option value="ti">{PAPEL_LABEL.ti}</option>
              </optgroup>
            </select>
          </div>

          {/* Cargo declarado */}
          <div>
            <label htmlFor={`${idBase}-cargo`} className="block text-sm font-semibold">
              Cargo / função
            </label>
            <input
              id={`${idBase}-cargo`}
              type="text"
              value={cargo}
              onChange={(e) => setCargo(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Assistente administrativo"
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Secretaria de lotação — apenas para papéis de servidor/gestor */}
          {precisaSecretaria && (
            <div>
              <label htmlFor={`${idBase}-secretaria`} className="block text-sm font-semibold">
                Secretaria de lotação
              </label>
              <select
                id={`${idBase}-secretaria`}
                value={secretariaId}
                onChange={(e) => setSecretariaId(e.target.value)}
                className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Nenhuma / não se aplica</option>
                {secretarias.map((s) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          {/* Justificativa */}
          <div>
            <label htmlFor={`${idBase}-justificativa`} className="block text-sm font-semibold">
              Justificativa <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <textarea
              id={`${idBase}-justificativa`}
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
              required
              aria-required="true"
              rows={4}
              maxLength={2000}
              placeholder="Descreva por que você precisa deste acesso e como ele será utilizado…"
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-y"
            />
            <p className="mt-0.5 text-xs text-fg/50">
              {justificativa.length}/2000 caracteres
            </p>
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {enviando ? 'Enviando…' : 'Enviar solicitação'}
          </button>
        </form>
      </section>

      {/* Histórico */}
      <section aria-labelledby="historico-titulo">
        <h2 id="historico-titulo" className="font-heading text-lg font-bold mb-4">
          Minhas solicitações
        </h2>

        {carregando ? (
          <p className="text-sm text-fg/60" role="status">Carregando…</p>
        ) : (
          <MinhasSolicitacoes lista={solicitacoes} />
        )}
      </section>
    </div>
  );
}
