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

const r$ = (n: number) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataHora = (iso: string) => { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return iso; } };

export default function AplicPage() {
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
      const [r, c] = await Promise.all([
        adminGet<Resumo>('/api/admin/aplic/resumo'),
        adminGet<Carga[]>('/api/admin/aplic/cargas'),
      ]);
      setResumo(r);
      setCargas(c);
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
        description="Importe a carga contábil gerada para o TCE-MT (módulo CT: empenhos, liquidações, pagamentos e credores). Os dados alimentam a Transparência pública e o assistente de IA, com CPF de pessoa física mascarado."
      />

      {/* Upload */}
      <section aria-labelledby="up-tit" className={`${ui.card} p-5 space-y-3`}>
        <h2 id="up-tit" className="font-heading text-base font-bold">Importar carga</h2>
        <p className="text-sm text-fg/70">
          Envie o arquivo <strong>.zip</strong> da carga do módulo <strong>CT</strong>
          {' '}(ex.: <code className="rounded bg-muted px-1">1113190CT202601.ZIP</code>). Reimportar a
          mesma competência substitui os dados (idempotente).
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

      {resumo && resumo.empenhos > 0 && (
        <p className="text-sm">
          Vitrine pública:{' '}
          <a href="/transparencia/execucao" target="_blank" rel="noopener noreferrer" className="underline">
            /transparencia/execucao
          </a>
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
