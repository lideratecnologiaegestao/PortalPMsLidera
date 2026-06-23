'use client';

/**
 * Admin — Moderação de Comentários de Notícias
 *
 * Endpoints:
 *   GET  /api/admin/comentarios?status=pendente|aprovado|reprovado
 *   POST /api/admin/comentarios/:id/aprovar
 *   POST /api/admin/comentarios/:id/reprovar
 *
 * Visível para: gestor, admin_prefeitura, servidor, ti, super_admin.
 * WCAG 2.1 AA: botões com aria-label descritivo, aria-live nos avisos,
 * foco gerenciado após ação, HTML semântico.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminGet, adminPost, type AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso } from '../_components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type StatusComentario = 'pendente' | 'aprovado' | 'reprovado';

type CategoriaModeracao =
  | 'ofensivo'
  | 'baixo_calao'
  | 'sem_nexo'
  | 'spam'
  | 'codigo_malicioso';

interface ComentarioAdmin {
  id: string;
  noticiaId: string;
  noticiaTitulo: string;
  autorNome: string;
  conteudo: string;
  criadoEm: string;
  status: StatusComentario;
  /** Preenchido quando a IA/regra automática avaliou este comentário. */
  moderadoPorIa?: boolean;
  /** Justificativa interna da moderação automática (visível só ao moderador). */
  moderacaoMotivo?: string | null;
  /** Categoria da violação detectada. */
  moderacaoCategoria?: CategoriaModeracao | string | null;
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

const STATUS_LABEL: Record<StatusComentario, string> = {
  pendente: 'Pendente',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
};

const STATUS_BADGE: Record<StatusComentario, string> = {
  pendente: 'bg-warning/20 text-fg',
  aprovado: 'bg-success/20 text-success',
  reprovado: 'bg-danger/20 text-danger',
};

/** Tradução das categorias de moderação automática para exibição ao moderador. */
const CATEGORIA_LABEL: Record<string, string> = {
  ofensivo: 'Ofensivo',
  baixo_calao: 'Baixo calão',
  sem_nexo: 'Sem nexo',
  spam: 'Spam',
  codigo_malicioso: 'Código malicioso',
};

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ComentariosAdminPage() {
  const [status, setStatus] = useState<StatusComentario>('pendente');
  const [comentarios, setComentarios] = useState<ComentarioAdmin[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);
  const [processando, setProcessando] = useState<string | null>(null);

  // Ref para refocar no primeiro item após ação (acessibilidade)
  const primeiroItemRef = useRef<HTMLElement | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setAviso(null);
    try {
      const dados = await adminGet<ComentarioAdmin[]>(
        `/api/admin/comentarios?status=${status}`,
      );
      setComentarios(dados ?? []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao carregar comentários.';
      setAviso({ tipo: 'erro', msg });
    } finally {
      setCarregando(false);
    }
  }, [status]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function moderar(id: string, acao: 'aprovar' | 'reprovar') {
    setProcessando(id);
    setAviso(null);
    try {
      await adminPost(`/api/admin/comentarios/${id}/${acao}`);
      // Remove da lista (o status atual pode não incluir mais este item)
      setComentarios((prev) => prev.filter((c) => c.id !== id));
      setAviso({
        tipo: 'ok',
        msg: `Comentário ${acao === 'aprovar' ? 'aprovado' : 'reprovado'} com sucesso.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Erro ao ${acao} comentário.`;
      setAviso({ tipo: 'erro', msg });
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Moderação de Comentários"
        description="Aprove ou reprove comentários enviados pelos cidadãos nas notícias."
      />

      {/* Filtro de status */}
      <div
        role="group"
        aria-label="Filtrar comentários por status"
        className="flex flex-wrap gap-2"
      >
        {(['pendente', 'aprovado', 'reprovado'] as StatusComentario[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={[
              'rounded border px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              status === s
                ? 'border-primary bg-primary text-primary-fg'
                : 'border-border bg-bg text-fg hover:bg-muted',
            ].join(' ')}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {/* Aviso */}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.msg}</Aviso>}

      {/* Lista */}
      {carregando ? (
        <p aria-live="polite" className="text-sm text-fg/60">
          Carregando comentários…
        </p>
      ) : comentarios.length === 0 ? (
        <p aria-live="polite" className="text-sm text-fg/60">
          Nenhum comentário com status "{STATUS_LABEL[status]}".
        </p>
      ) : (
        <section aria-label={`Comentários ${STATUS_LABEL[status].toLowerCase()}`}>
          <ul className="space-y-4" role="list">
            {comentarios.map((c, idx) => (
              <li
                key={c.id}
                ref={idx === 0 ? (el) => { primeiroItemRef.current = el; } : undefined}
                className="rounded border border-border bg-bg p-4 shadow-sm"
              >
                {/* Cabeçalho do card */}
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold text-fg">
                      {c.autorNome}
                    </p>
                    <p className="text-xs text-fg/60">
                      <time dateTime={c.criadoEm}>{formatarData(c.criadoEm)}</time>
                      {' · '}
                      <span>
                        Notícia:{' '}
                        <a
                          href={`/admin/noticias`}
                          className="text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
                          title={`Ir para notícias (ID: ${c.noticiaId})`}
                        >
                          {c.noticiaTitulo}
                        </a>
                      </span>
                    </p>
                  </div>
                  <span
                    className={[
                      'inline-block rounded px-2 py-0.5 text-xs font-semibold',
                      STATUS_BADGE[c.status],
                    ].join(' ')}
                    aria-label={`Status: ${STATUS_LABEL[c.status]}`}
                  >
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>

                {/* Conteúdo do comentário */}
                <blockquote className="mb-4 border-l-4 border-border pl-3 text-sm text-fg/80 whitespace-pre-wrap leading-relaxed">
                  {c.conteudo}
                </blockquote>

                {/* Selo de moderação automática — só exibido quando a IA/regra avaliou */}
                {(c.moderadoPorIa || c.moderacaoCategoria) && (
                  <div
                    role="note"
                    aria-label="Informações da moderação automática"
                    className="mb-4 rounded border border-warning/50 bg-warning/10 px-3 py-2 text-sm"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-fg">
                      {/* Ícone robô — aria-hidden pois o texto já descreve */}
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                        focusable="false"
                        className="shrink-0"
                      >
                        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.38-1 1.73V7h3a3 3 0 0 1 3 3v1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1v1a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1H3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1v-1a3 3 0 0 1 3-3h3V5.73A2 2 0 0 1 10 4a2 2 0 0 1 2-2zm-3 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-3 4c-1.1 0-2 .4-2.68 1H14.68A3.49 3.49 0 0 0 12 15z"/>
                      </svg>
                      <span>Moderação automática</span>
                      {c.moderacaoCategoria && (
                        <span className="ml-1 rounded bg-warning/30 px-1.5 py-0.5 text-xs font-semibold text-fg">
                          {CATEGORIA_LABEL[c.moderacaoCategoria] ?? c.moderacaoCategoria}
                        </span>
                      )}
                    </p>
                    {c.moderacaoMotivo && (
                      <p className="mt-1 text-xs text-fg/70 leading-relaxed">
                        {c.moderacaoMotivo}
                      </p>
                    )}
                    {c.status === 'reprovado' && (
                      <p className="mt-1.5 text-xs text-fg/60 italic">
                        Reprovado automaticamente. Você pode aprovar manualmente se considerar adequado.
                      </p>
                    )}
                  </div>
                )}

                {/* Ações */}
                <div className="flex flex-wrap gap-2">
                  {c.status !== 'aprovado' && (
                    <button
                      type="button"
                      disabled={processando === c.id}
                      aria-busy={processando === c.id}
                      aria-label={`Aprovar comentário de ${c.autorNome}`}
                      onClick={() => moderar(c.id, 'aprovar')}
                      className="inline-flex items-center gap-1.5 rounded border border-success px-3 py-1.5 text-sm font-semibold text-success hover:bg-success hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-success transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                      {processando === c.id ? 'Processando…' : 'Aprovar'}
                    </button>
                  )}
                  {c.status !== 'reprovado' && (
                    <button
                      type="button"
                      disabled={processando === c.id}
                      aria-busy={processando === c.id}
                      aria-label={`Reprovar comentário de ${c.autorNome}`}
                      onClick={() => moderar(c.id, 'reprovar')}
                      className="inline-flex items-center gap-1.5 rounded border border-danger px-3 py-1.5 text-sm font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger transition-colors"
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                      {processando === c.id ? 'Processando…' : 'Reprovar'}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
