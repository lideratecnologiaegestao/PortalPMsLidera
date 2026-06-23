'use client';

/**
 * Gate de EULA (Termo de Sigilo e Responsabilidade) — ADR-0005 Fase 3 (B).
 *
 * Quando `aberto=true`, exibe um diálogo modal bloqueante:
 *  - Título + texto do termo (GET /api/auth/eula)
 *  - Checkbox "Li e aceito o termo de sigilo"
 *  - Botão Aceitar → POST /api/auth/eula/aceitar → onAceitou()
 *  - Botão Recusar e sair → logout → redirect /admin
 *
 * Conformidade WCAG 2.1 AA:
 *  - aria-modal="true", role="dialog", aria-labelledby, aria-describedby
 *  - ESC NÃO fecha (o aceite é obrigatório — não pode ser pulado)
 *  - Foco preso no diálogo (focus trap manual)
 *  - Scroll interno com tabIndex para foco por teclado
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminGet, adminPost, AdminApiError } from '../../lib/admin-api';
import { apiBase } from '../../lib/auth-shared';
import type { EulaData } from '../../lib/ouvidor-dashboard';

const SELETORES_FOCAVEIS =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

interface Props {
  aberto: boolean;
  onAceitou: () => void;
}

export default function EulaGate({ aberto, onAceitou }: Props) {
  const [eula, setEula] = useState<EulaData | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [aceitando, setAceitando] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const textoRef = useRef<HTMLDivElement>(null);
  const primeiroFocoRef = useRef<HTMLElement | null>(null);

  // ── Busca o termo quando abre ──────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    setCarregando(true);
    setErro('');
    setAceite(false);
    adminGet<EulaData>('/api/auth/eula')
      .then(setEula)
      .catch((e) => {
        setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar o termo.');
      })
      .finally(() => setCarregando(false));
  }, [aberto]);

  // ── Focus trap — mantém foco dentro do diálogo ────────────────────────────
  useEffect(() => {
    if (!aberto) return;

    // Foca o primeiro elemento focável após montar
    const timer = setTimeout(() => {
      const el = dialogRef.current?.querySelector<HTMLElement>(SELETORES_FOCAVEIS);
      if (el) {
        primeiroFocoRef.current = el;
        el.focus();
      }
    }, 50);

    function trapFoco(e: KeyboardEvent) {
      if (!dialogRef.current) return;

      // ESC deliberadamente bloqueado — o termo é obrigatório
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key !== 'Tab') return;

      const focaveis = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(SELETORES_FOCAVEIS),
      ).filter((el) => !el.closest('[disabled]'));

      if (focaveis.length === 0) return;

      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      const ativo = document.activeElement as HTMLElement;

      if (e.shiftKey) {
        if (ativo === primeiro) {
          e.preventDefault();
          ultimo.focus();
        }
      } else {
        if (ativo === ultimo) {
          e.preventDefault();
          primeiro.focus();
        }
      }
    }

    document.addEventListener('keydown', trapFoco, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', trapFoco, true);
    };
  }, [aberto]);

  // ── Trava scroll do fundo ──────────────────────────────────────────────────
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  // ── Ações ──────────────────────────────────────────────────────────────────

  const aceitar = useCallback(async () => {
    if (!aceite) return;
    setAceitando(true);
    setErro('');
    try {
      await adminPost('/api/auth/eula/aceitar');
      onAceitou();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao registrar aceite.');
    } finally {
      setAceitando(false);
    }
  }, [aceite, onAceitou]);

  const recusar = useCallback(async () => {
    setSaindo(true);
    await fetch(`${apiBase}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    window.location.href = '/admin';
  }, []);

  if (!aberto) return null;

  const tituloId = 'eula-titulo';
  const descId = 'eula-desc';

  return (
    /* Fundo escuro — não fecha ao clicar (obrigatório) */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      aria-hidden="false"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={descId}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded border border-border bg-bg shadow-2xl"
      >
        {/* Cabeçalho */}
        <div className="shrink-0 border-b border-border bg-primary px-6 py-4">
          <h1
            id={tituloId}
            className="font-heading text-xl font-bold text-primary-fg"
          >
            {carregando ? 'Carregando termo…' : (eula?.titulo ?? 'Termo de Sigilo e Responsabilidade')}
          </h1>
          <p className="mt-1 text-sm text-primary-fg/80">
            É necessário aceitar o termo para acessar o painel da Ouvidoria.
          </p>
        </div>

        {/* Corpo rolável */}
        <div
          ref={textoRef}
          id={descId}
          tabIndex={0}
          className="flex-1 overflow-y-auto px-6 py-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
          aria-label="Texto do termo de sigilo"
        >
          {carregando && (
            <p className="text-sm text-fg/60" aria-live="polite" aria-busy="true">
              Carregando o termo…
            </p>
          )}

          {!carregando && erro && (
            <p role="alert" className="rounded border border-danger bg-danger/10 p-3 text-sm text-danger">
              {erro}
            </p>
          )}

          {!carregando && !erro && eula && (
            <div className="space-y-3 text-sm text-fg leading-relaxed">
              {eula.texto.split('\n').map((linha, i) =>
                linha.trim() === '' ? (
                  <br key={i} />
                ) : (
                  <p key={i}>{linha}</p>
                ),
              )}
            </div>
          )}
        </div>

        {/* Rodapé com ações */}
        <div className="shrink-0 border-t border-border px-6 py-4 space-y-4">
          {/* Checkbox de aceite */}
          <div className="flex items-start gap-3">
            <input
              id="eula-aceite-check"
              type="checkbox"
              checked={aceite}
              onChange={(e) => setAceite(e.target.checked)}
              disabled={carregando || aceitando || saindo || !!erro}
              className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-required="true"
            />
            <label htmlFor="eula-aceite-check" className="cursor-pointer text-sm font-medium text-fg">
              Li e aceito o termo de sigilo e responsabilidade acima.
              {!aceite && (
                <span className="ml-1 text-danger" aria-hidden="true">*</span>
              )}
            </label>
          </div>

          {/* Erro de ação */}
          {erro && !carregando && (
            <p role="alert" aria-live="assertive" className="text-sm text-danger">
              {erro}
            </p>
          )}

          {/* Botões */}
          <div className="flex flex-wrap gap-3 justify-end">
            <button
              type="button"
              onClick={recusar}
              disabled={aceitando || saindo}
              className="inline-flex items-center gap-2 rounded border border-danger px-4 py-2 text-sm font-semibold text-danger hover:bg-danger hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger disabled:opacity-50 transition-colors"
            >
              {saindo ? 'Saindo…' : 'Recusar e sair'}
            </button>

            <button
              type="button"
              onClick={aceitar}
              disabled={!aceite || aceitando || saindo || carregando || !!erro}
              className="inline-flex items-center gap-2 rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 transition-opacity"
              aria-disabled={!aceite}
            >
              {aceitando ? 'Registrando aceite…' : 'Aceitar e continuar'}
            </button>
          </div>

          <p className="text-xs text-fg/50 text-right">
            Versão do termo: {eula?.versao ?? '—'}
          </p>
        </div>
      </div>
    </div>
  );
}
