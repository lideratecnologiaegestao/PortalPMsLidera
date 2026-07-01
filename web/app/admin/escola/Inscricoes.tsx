'use client';

/**
 * Admin — Escola Cidadã / Inscrições e acompanhamento.
 *
 * O backend atual NÃO expõe um endpoint de listagem de inscrições por curso para
 * gestão (apenas o aluno vê as próprias, em /api/aluno/escola/cursos). O que está
 * disponível para o gestor/professor e é operacionalmente relevante aqui é a fila
 * de provas dissertativas aguardando correção:
 *
 *   GET  /api/professor/escola/correcoes
 *   POST /api/professor/escola/correcoes/:tentativaId/corrigir
 *
 * Esta aba lista essa fila (cada item representa a tentativa de um aluno inscrito)
 * e permite lançar as notas das questões dissertativas. Quando um endpoint de
 * listagem de inscrições for adicionado, o bloco "Inscrições por curso" abaixo já
 * tem o ponto de integração marcado.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  adminPost,
} from '../../../lib/admin-api';
import { Aviso, Modal, ui } from '../_components/ui';
import { fmtData } from './tipos';

interface CorrecaoQuestao {
  id: string; // id da tentativa_questao
  questaoId: string;
  respostaTexto?: string | null;
  correta?: boolean | null;
  nota?: string | number | null;
  feedback?: string | null;
}

interface CorrecaoPendente {
  id: string; // id da tentativa
  provaId: string;
  cursoId: string;
  userId: string;
  numero: number;
  status: string;
  notaObjetiva?: string | number | null;
  finalizadaEm?: string | null;
  prova?: { id: string; titulo: string; notaMinima?: string | number | null } | null;
  questoes: CorrecaoQuestao[];
}

// ─── Modal de correção de uma tentativa ──────────────────────────────────────

function ModalCorrecao({
  open,
  tentativa,
  onClose,
  onSalvo,
}: {
  open: boolean;
  tentativa: CorrecaoPendente | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  // Mapa id-da-tentativa_questao → { nota, feedback }
  const [notas, setNotas] = useState<Record<string, { nota: number; feedback: string }>>({});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open || !tentativa) return;
    setErro('');
    const inicial: Record<string, { nota: number; feedback: string }> = {};
    for (const q of tentativa.questoes) {
      // Só dissertativas precisam de correção manual (sem opção escolhida).
      inicial[q.id] = { nota: Number(q.nota ?? 0), feedback: q.feedback ?? '' };
    }
    setNotas(inicial);
  }, [open, tentativa]);

  if (!tentativa) return null;

  // Dissertativas = questões sem correção automática: ao submeter, o backend grava
  // `correta = null` nas dissertativas (e true/false nas objetivas). A resposta
  // pode ser nula (em branco), então o discriminador é `correta == null`.
  const dissertativas = tentativa.questoes.filter(
    (q) => q.correta === null || q.correta === undefined,
  );

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    const correcoes = dissertativas.map((q) => ({
      tentativaQuestaoId: q.id,
      nota: Number(notas[q.id]?.nota ?? 0),
      feedback: notas[q.id]?.feedback || undefined,
    }));
    try {
      await adminPost(`/api/professor/escola/correcoes/${tentativa!.id}/corrigir`, { correcoes });
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao lançar a correção.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Corrigir — ${tentativa.prova?.titulo ?? 'prova'}`}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <p className="text-sm text-fg/70">
          Tentativa nº {tentativa.numero} · nota objetiva já apurada:{' '}
          <strong>{Number(tentativa.notaObjetiva ?? 0)}%</strong>. Lance a nota de cada questão
          dissertativa (de 0 até o peso da questão); a nota final é recalculada automaticamente.
        </p>

        {dissertativas.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-muted/20 p-3 text-sm text-fg/60">
            Esta tentativa não tem questões dissertativas para corrigir.
          </p>
        ) : (
          <ol className="space-y-3">
            {dissertativas.map((q, i) => (
              <li key={q.id} className="rounded border border-border p-3">
                <span className="text-xs font-semibold text-fg/60">Questão dissertativa {i + 1}</span>
                <p className="mt-1 whitespace-pre-wrap rounded bg-muted/40 p-2 text-sm">
                  {q.respostaTexto || <span className="text-fg/50">— (em branco)</span>}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
                  <div>
                    <label className={ui.label}>Nota</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      className={ui.input}
                      value={notas[q.id]?.nota ?? 0}
                      onChange={(e) =>
                        setNotas((n) => ({
                          ...n,
                          [q.id]: { ...n[q.id], nota: Number(e.target.value) },
                        }))
                      }
                      aria-label={`Nota da questão dissertativa ${i + 1}`}
                    />
                  </div>
                  <div>
                    <label className={ui.label}>Feedback (opcional)</label>
                    <input
                      type="text"
                      className={ui.input}
                      value={notas[q.id]?.feedback ?? ''}
                      onChange={(e) =>
                        setNotas((n) => ({
                          ...n,
                          [q.id]: { ...n[q.id], feedback: e.target.value },
                        }))
                      }
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="submit"
            className={ui.btn}
            disabled={salvando || dissertativas.length === 0}
            aria-busy={salvando}
          >
            {salvando ? 'Lançando…' : 'Lançar correção'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Aba Inscrições / acompanhamento ─────────────────────────────────────────

export default function Inscricoes() {
  const [pendentes, setPendentes] = useState<CorrecaoPendente[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [corrigindo, setCorrigindo] = useState<CorrecaoPendente | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<CorrecaoPendente[]>('/api/professor/escola/correcoes');
      setPendentes(data);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar a fila de correção.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg/70">
        Acompanhamento das avaliações dos alunos inscritos. Abaixo, as provas com questões
        dissertativas que aguardam correção manual — corrigir libera o cálculo da nota final e a
        emissão do certificado quando aprovado.
      </p>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <section aria-labelledby="sec-correcoes">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 id="sec-correcoes" className="font-heading text-base font-bold">
            Provas aguardando correção
          </h3>
          <button type="button" className={ui.btnGhost} onClick={carregar}>
            Atualizar
          </button>
        </div>

        {carregando ? (
          <p aria-live="polite" aria-busy="true" className="py-10 text-center text-sm text-fg/60">
            Carregando fila de correção…
          </p>
        ) : pendentes.length === 0 ? (
          <p className="rounded border border-dashed border-border bg-muted/20 p-4 text-center text-sm text-fg/60">
            Nenhuma prova aguardando correção no momento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full min-w-[640px] border-collapse text-sm"
              aria-label="Provas aguardando correção"
            >
              <thead>
                <tr>
                  <th scope="col" className={ui.th}>
                    Prova
                  </th>
                  <th scope="col" className={ui.th}>
                    Tentativa
                  </th>
                  <th scope="col" className={ui.th}>
                    Nota objetiva
                  </th>
                  <th scope="col" className={ui.th}>
                    Finalizada em
                  </th>
                  <th scope="col" className={ui.th}>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pendentes.map((t) => (
                  <tr key={t.id}>
                    <td className={ui.td}>
                      <span className="font-medium">{t.prova?.titulo ?? '—'}</span>
                    </td>
                    <td className={ui.td}>nº {t.numero}</td>
                    <td className={ui.td}>{Number(t.notaObjetiva ?? 0)}%</td>
                    <td className={ui.td}>{fmtData(t.finalizadaEm)}</td>
                    <td className={ui.td}>
                      <button
                        type="button"
                        className={ui.btn}
                        onClick={() => setCorrigindo(t)}
                        aria-label={`Corrigir tentativa da prova "${t.prova?.titulo ?? ''}"`}
                      >
                        Corrigir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Ponto de integração futuro: listagem de inscrições por curso.
          Quando a API expuser GET de inscrições para gestão, plugar a tabela aqui. */}
      <section
        aria-labelledby="sec-inscricoes"
        className="rounded border border-dashed border-border bg-muted/20 p-4"
      >
        <h3 id="sec-inscricoes" className="mb-1 font-heading text-base font-bold">
          Inscrições por curso
        </h3>
        <p className="text-sm text-fg/60">
          A listagem detalhada de alunos inscritos por curso depende de um endpoint de gestão de
          inscrições ainda não exposto pela API. O cálculo de progresso, conclusão e aprovação já é
          mantido pelo backend a cada conclusão de aula e correção de prova.
        </p>
      </section>

      <ModalCorrecao
        open={!!corrigindo}
        tentativa={corrigindo}
        onClose={() => setCorrigindo(null)}
        onSalvo={() => {
          setMsgOk('Correção lançada com sucesso.');
          carregar();
        }}
      />
    </div>
  );
}
