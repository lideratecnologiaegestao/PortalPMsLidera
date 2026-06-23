'use client';

/**
 * Seção de comentários de uma notícia.
 *
 * - Lista comentários aprovados (GET /api/noticias/:id/comentarios).
 * - Formulário de envio apenas para cidadão logado (POST /api/noticias/:id/comentarios).
 * - Detecta login via GET /api/auth/cidadao/me (cookie HttpOnly; não-logado → 401 → null).
 * - Inclui widget Turnstile antes do envio.
 * - WCAG 2.1 AA: labels, foco, aria-live nos avisos.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import Turnstile from '../../../components/ui/Turnstile';
import { apiBase } from '../../../lib/auth-shared';
import { getPerfilCidadao } from '../../../lib/cidadao-auth';

interface Comentario {
  id: string;
  autorNome: string;
  conteudo: string;
  criadoEm: string;
}

interface Cidadao {
  id: string;
}

/** Shape da resposta do POST /api/noticias/:id/comentarios após moderação automática. */
interface EnvioResposta {
  ok: boolean;
  status: 'pendente' | 'reprovado';
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function Comentarios({ noticiaId }: { noticiaId: string }) {
  const pathname = usePathname();
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [cidadao, setCidadao] = useState<Cidadao | null | 'carregando'>('carregando');

  // Formulário
  const [conteudo, setConteudo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'aviso' | 'erro'; msg: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileAtivo, setTurnstileAtivo] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  function handleTurnstileToken(token: string) {
    if (!turnstileAtivo) setTurnstileAtivo(true);
    setTurnstileToken(token);
  }

  const submitBloqueado = enviando || (turnstileAtivo && !turnstileToken) || !conteudo.trim();

  // Busca lista de comentários aprovados
  const carregarComentarios = useCallback(async () => {
    setCarregandoLista(true);
    try {
      const res = await fetch(`${apiBase}/api/noticias/${noticiaId}/comentarios`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data: Comentario[] = await res.json();
        setComentarios(data);
      }
    } catch {
      /* silencia: lista fica vazia */
    } finally {
      setCarregandoLista(false);
    }
  }, [noticiaId]);

  // Detecta se o cidadão está logado
  useEffect(() => {
    getPerfilCidadao()
      .then((p) => setCidadao(p))
      .catch(() => setCidadao(null));
  }, []);

  useEffect(() => {
    carregarComentarios();
  }, [carregarComentarios]);

  // Foca no aviso após envio para anunciar ao leitor de tela
  useEffect(() => {
    if (aviso) {
      avisoRef.current?.focus();
    }
  }, [aviso]);

  async function enviarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!conteudo.trim()) return;

    setEnviando(true);
    setAviso(null);
    try {
      const res = await fetch(`${apiBase}/api/noticias/${noticiaId}/comentarios`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo: conteudo.trim(),
          ...(turnstileToken ? { turnstileToken } : {}),
        }),
      });

      if (res.status === 401) {
        setAviso({ tipo: 'erro', msg: 'Sua sessão expirou. Faça login novamente para comentar.' });
        setCidadao(null);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = (body as any)?.message;
        throw new Error(Array.isArray(msg) ? msg.join('; ') : String(msg ?? `Erro ${res.status}`));
      }

      const data: EnvioResposta = await res.json().catch(() => ({ ok: true, status: 'pendente' as const }));

      if (data.status === 'reprovado') {
        // Mantém o texto para o cidadão revisar. Não revela a regra (anti-probing).
        setTurnstileToken('');
        setTurnstileKey((k) => k + 1);
        setAviso({
          tipo: 'aviso',
          msg: 'Seu comentário não pôde ser publicado por não atender às diretrizes de convivência do portal. Revise o conteúdo e tente novamente.',
        });
      } else {
        // pendente → aguarda moderação humana; limpa o textarea
        setConteudo('');
        setTurnstileToken('');
        setTurnstileKey((k) => k + 1);
        setAviso({
          tipo: 'ok',
          msg: 'Comentário enviado! Ele aparecerá após a moderação.',
        });
      }
    } catch (err) {
      setAviso({
        tipo: 'erro',
        msg: err instanceof Error ? err.message : 'Erro ao enviar comentário.',
      });
      // Reseta o Turnstile em caso de erro
      setTurnstileToken('');
      setTurnstileKey((k) => k + 1);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-labelledby="comentarios-titulo" className="mt-10 border-t border-border pt-8">
      <h2 id="comentarios-titulo" className="font-heading text-xl font-bold text-fg mb-6">
        Comentários
      </h2>

      {/* Lista de comentários */}
      {carregandoLista ? (
        <p className="text-sm text-fg/60" aria-live="polite">
          Carregando comentários…
        </p>
      ) : comentarios.length === 0 ? (
        <p className="text-sm text-fg/60 mb-6">
          Seja o primeiro a comentar.
        </p>
      ) : (
        <ol aria-label="Lista de comentários" className="space-y-6 mb-8">
          {comentarios.map((c) => (
            <li
              key={c.id}
              className="rounded border border-border bg-muted/30 p-4"
            >
              <div className="flex flex-wrap items-baseline gap-2 mb-2">
                <span className="font-semibold text-sm text-fg">{c.autorNome}</span>
                <time
                  dateTime={c.criadoEm}
                  className="text-xs text-fg/50"
                >
                  {formatarData(c.criadoEm)}
                </time>
              </div>
              <p className="text-sm text-fg leading-relaxed whitespace-pre-wrap">
                {c.conteudo}
              </p>
            </li>
          ))}
        </ol>
      )}

      {/* Aviso acessível (aria-live) — focável para anunciar ao leitor de tela */}
      <div
        ref={avisoRef}
        tabIndex={-1}
        aria-live="polite"
        aria-atomic="true"
        className="outline-none"
      >
        {aviso && (
          <p
            role={aviso.tipo === 'erro' ? 'alert' : aviso.tipo === 'aviso' ? 'alert' : 'status'}
            className={[
              'mb-4 rounded border p-3 text-sm',
              aviso.tipo === 'ok'
                ? 'border-success/40 bg-success/5 text-success'
                : aviso.tipo === 'aviso'
                  ? 'border-warning/60 bg-warning/10 text-fg'
                  : 'border-danger/40 bg-danger/5 text-danger',
            ].join(' ')}
          >
            {aviso.msg}
          </p>
        )}
      </div>

      {/* Formulário ou prompt de login */}
      {cidadao === 'carregando' ? null : cidadao === null ? (
        <p className="text-sm text-fg/70 rounded border border-border bg-muted/30 p-4">
          <a
            href={`/entrar?redirect=${encodeURIComponent(pathname ?? '/')}`}
            className="text-primary underline font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary rounded"
          >
            Entre na sua conta
          </a>{' '}
          para comentar.
        </p>
      ) : (
        <form
          onSubmit={enviarComentario}
          className="space-y-3"
          noValidate
          aria-label="Formulário de comentário"
        >
          <div>
            <label htmlFor="comentario-texto" className="text-sm font-medium text-fg block mb-1">
              Seu comentário{' '}
              <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <textarea
              id="comentario-texto"
              ref={textareaRef}
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
              maxLength={2000}
              required
              aria-required="true"
              aria-describedby="comentario-contador"
              rows={4}
              placeholder="Escreva seu comentário…"
              className="w-full rounded border border-border bg-bg px-3 py-2 text-sm text-fg resize-y focus:outline-none focus:ring-2 focus:ring-primary placeholder:text-fg/40"
            />
            <p
              id="comentario-contador"
              className="mt-0.5 text-xs text-fg/50 text-right"
              aria-live="polite"
            >
              {conteudo.length}/2000 caracteres
            </p>
          </div>

          <Turnstile key={turnstileKey} onToken={handleTurnstileToken} />

          <button
            type="submit"
            disabled={submitBloqueado}
            aria-busy={enviando}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-opacity"
          >
            {enviando ? 'Enviando…' : 'Enviar comentário'}
          </button>
        </form>
      )}
    </section>
  );
}
