'use client';

/**
 * Importação da carga contábil APLIC (TCE-MT) — módulo CT (execução da despesa).
 * Upload do .zip da carga → grava nas tabelas aplic_* (RLS). Mostra resumo e
 * histórico de cargas. Roles: GESTOR / ADMIN_PREFEITURA (validado no backend).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdminApiError, adminGet } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface Resumo {
  exercicio: number | null;
  empenhado: number; liquidado: number; pago: number;
  empenhos: number; liquidacoes: number; pagamentos: number; credores: number;
}
interface Carga {
  id: string; modulo: string; ug: string | null; exercicio: number; competencia: string | null;
  arquivoNome: string | null; status: string; totalRegistros: number;
  porTabela: Record<string, number> | null; criadoEm: string;
}
interface PntpBloqueante { id: string; dimensao: string; desc: string }
interface PntpResumo { indice: number; selo: string; essenciaisOk: boolean; bloqueantes: PntpBloqueante[] }
interface AplicStatus { habilitado: boolean; ug: string | null; pntp?: PntpResumo | null }

const r$ = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; } };

export default function AplicPage() {
  const [status, setStatus] = useState<AplicStatus | null>(null);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [cargas, setCargas] = useState<Carga[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const st = await adminGet<AplicStatus>('/api/admin/aplic/status');
      setStatus(st);
      if (st.habilitado) {
        const [r, c] = await Promise.all([
          adminGet<Resumo>('/api/admin/aplic/resumo'),
          adminGet<Carga[]>('/api/admin/aplic/cargas'),
        ]);
        setResumo(r);
        setCargas(c);
      } else {
        setResumo(null);
        setCargas([]);
      }
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar os dados do APLIC.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!arquivo) { setFeedback({ tipo: 'erro', msg: 'Selecione o arquivo .zip da carga.' }); return; }
    setEnviando(true);
    setFeedback(null);
    try {
      const form = new FormData();
      form.append('file', arquivo);
      const res = await fetch(`${apiBase}/api/admin/aplic/importar`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? 'Falha ao importar a carga.');
      const tabelas = data.porTabela
        ? Object.entries(data.porTabela).map(([k, v]) => `${k}: ${v}`).join(' · ')
        : '';
      setFeedback({
        tipo: 'ok',
        msg: `Carga ${data.modulo} ${data.exercicio}/${data.competencia ?? '-'} importada: ${data.total} registros (${tabelas}).`,
      });
      setArquivo(null);
      if (inputRef.current) inputRef.current.value = '';
      carregar();
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof Error ? err.message : 'Falha ao importar a carga.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Contas — APLIC (TCE-MT)"
        description="Importe as cargas geradas para o TCE-MT. Suportados: CT (despesa — empenhos/liquidações/pagamentos), CC (contratos e convênios), PL (licitações) e 00 (orçamento/receita). Os dados alimentam o Portal da Transparência e o assistente de IA, com CPF de pessoa física mascarado."
      />

      {/* Fonte desabilitada: orienta a ativar no Gerenciador */}
      {status && !status.habilitado && !carregando && (
        <Aviso tipo="erro">
          A fonte de dados APLIC está <strong>desabilitada</strong> para esta entidade. A importação
          de cargas e a vitrine pública de execução da despesa só funcionam após a ativação no{' '}
          <strong>Gerenciador</strong> (Configurações da Entidade → aba “Transparência (APLIC)”),
          onde também se define o código da UG (7 dígitos) no TCE-MT.
        </Aviso>
      )}

      {/* Avaliação PNTP (feedback automático com a fonte ligada) */}
      {status?.habilitado && status.pntp && (
        <section aria-labelledby="pntp-tit" className={`${ui.card} p-5 space-y-2`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="pntp-tit" className="font-heading text-base font-bold">Conformidade PNTP</h2>
            <span className="text-sm">
              Selo <strong className="text-primary">{status.pntp.selo}</strong> · índice{' '}
              <strong>{status.pntp.indice.toFixed(1)}%</strong>
            </span>
          </div>
          {status.pntp.essenciaisOk ? (
            <p className="text-sm text-success">Todos os critérios essenciais atendidos.</p>
          ) : (
            <div className="text-sm">
              <p className="text-fg/80">
                Faltam {status.pntp.bloqueantes.length} critério(s) essencial(is) para o selo Diamante:
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg/70">
                {status.pntp.bloqueantes.map((b) => (
                  <li key={b.id}><span className="font-medium">{b.dimensao}</span> — {b.desc} <span className="text-fg/40">({b.id})</span></li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-fg/50">
            Detalhes em <a href="/admin/conformidade" className="underline">Conformidade PNTP</a>. O APLIC cobre
            despesa, contratos, licitações e convênios; os demais itens vêm de outros módulos/uploads.
          </p>
        </section>
      )}

      {/* Upload */}
      {status?.habilitado && (
      <section aria-labelledby="up-tit" className={`${ui.card} p-5 space-y-3`}>
        <h2 id="up-tit" className="font-heading text-base font-bold">Importar carga</h2>
        <p className="text-sm text-fg/70">
          Envie o arquivo <strong>.zip</strong> da carga (módulos <strong>CT</strong>, <strong>CC</strong>,
          {' '}<strong>PL</strong> ou <strong>00</strong> — ex.:{' '}
          <code className="rounded bg-muted px-1">1113190CT202601.ZIP</code>). O nome deve
          seguir a nomenclatura padrão do TCE
          {status?.ug ? <> e começar pela UG <code className="rounded bg-muted px-1">{status.ug}</code></> : null}.
          Reimportar substitui os dados (idempotente, sem duplicar).
        </p>
        <form onSubmit={enviar} className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".zip,application/zip,application/x-zip-compressed"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
            aria-label="Arquivo .zip da carga APLIC"
            className="text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-fg"
          />
          <button type="submit" disabled={enviando || !arquivo} className={ui.btn}>
            {enviando ? 'Importando…' : 'Importar carga'}
          </button>
        </form>
        <div aria-live="polite" aria-atomic="true">
          {feedback && (
            <p
              role={feedback.tipo === 'erro' ? 'alert' : 'status'}
              className={`rounded border p-2 text-sm ${feedback.tipo === 'ok' ? 'border-success text-success' : 'border-danger text-danger'}`}
            >
              {feedback.msg}
            </p>
          )}
        </div>
      </section>
      )}

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Resumo */}
      {resumo && resumo.empenhos > 0 && (
        <section aria-label="Resumo da execução da despesa" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { t: 'Empenhado', v: resumo.empenhado, n: resumo.empenhos },
            { t: 'Liquidado', v: resumo.liquidado, n: resumo.liquidacoes },
            { t: 'Pago', v: resumo.pago, n: resumo.pagamentos },
          ].map((c) => (
            <div key={c.t} className={`${ui.card} p-4`}>
              <p className="text-sm font-medium text-fg/60">{c.t}</p>
              <p className="mt-1 text-xl font-bold text-primary">{r$(c.v)}</p>
              <p className="text-xs text-fg/50">{c.n.toLocaleString('pt-BR')} registros</p>
            </div>
          ))}
        </section>
      )}

      {status?.habilitado && (
        <p className="text-sm">
          Vitrine pública:{' '}
          <a href="/transparencia/execucao" target="_blank" rel="noopener noreferrer" className="underline">execução da despesa</a>
          {' · '}
          <a href="/transparencia/licitacoes" target="_blank" rel="noopener noreferrer" className="underline">licitações</a>
          {' · '}
          <a href="/transparencia/contratos" target="_blank" rel="noopener noreferrer" className="underline">contratos</a>
          {' · '}
          <a href="/transparencia/convenios" target="_blank" rel="noopener noreferrer" className="underline">convênios</a>
        </p>
      )}

      {/* Histórico de cargas */}
      <section aria-label="Histórico de cargas" aria-busy={carregando}>
        <h2 className="mb-2 font-heading text-base font-bold">Cargas importadas</h2>
        {carregando ? (
          <p className="py-6 text-center text-sm text-fg/60" role="status">Carregando…</p>
        ) : cargas.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg/60">Nenhuma carga importada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="p-2">Arquivo</th>
                  <th scope="col" className="p-2">UG</th>
                  <th scope="col" className="p-2">Módulo</th>
                  <th scope="col" className="p-2">Exercício/Comp.</th>
                  <th scope="col" className="p-2">Status</th>
                  <th scope="col" className="p-2 text-right">Registros</th>
                  <th scope="col" className="p-2">Importada em</th>
                </tr>
              </thead>
              <tbody>
                {cargas.map((c) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="p-2">{c.arquivoNome ?? '—'}</td>
                    <td className="p-2 whitespace-nowrap">{c.ug ?? '—'}</td>
                    <td className="p-2">{c.modulo}</td>
                    <td className="p-2 whitespace-nowrap">{c.exercicio}/{c.competencia ?? '-'}</td>
                    <td className="p-2">
                      <span className={c.status === 'concluida' ? 'text-success' : c.status === 'erro' ? 'text-danger' : 'text-fg/60'}>
                        {c.status}
                      </span>
                    </td>
                    <td className="p-2 text-right tabular-nums">{c.totalRegistros.toLocaleString('pt-BR')}</td>
                    <td className="p-2 whitespace-nowrap">{dataHora(c.criadoEm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
