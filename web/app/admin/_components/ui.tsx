'use client';

import { useEffect, useRef } from 'react';

/* Classes utilitarias compartilhadas (tokens de tema gov.br — sem cor fixa). */
export const ui = {
  btn: 'inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50',
  btnGhost:
    'inline-flex items-center gap-2 rounded border border-border px-3 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50',
  btnDanger:
    'inline-flex items-center gap-2 rounded border border-danger px-3 py-2 text-sm font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-50',
  input:
    'w-full rounded border border-border bg-bg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary',
  label: 'block text-sm font-semibold',
  card: 'rounded border border-border bg-bg',
  th: 'border-b border-border p-2 text-left text-sm font-semibold',
  td: 'border-b border-border/50 p-2 text-sm align-top',
  badge: 'inline-block rounded px-2 py-0.5 text-xs font-semibold',
};

/** Cabecalho de pagina do admin: titulo + descricao + acoes a direita. */
export function AdminHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-fg/70">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}

/** Mensagem acessivel (aria-live) para sucesso/erro. */
export function Aviso({ tipo, children }: { tipo: 'ok' | 'erro'; children: React.ReactNode }) {
  if (!children) return null;
  const cls = tipo === 'ok' ? 'border-success text-success' : 'border-danger text-danger';
  return (
    <p role={tipo === 'erro' ? 'alert' : 'status'} aria-live="polite" className={`rounded border ${cls} p-2 text-sm`}>
      {children}
    </p>
  );
}

/**
 * Modal acessivel (dialog). Fecha SOMENTE por ação deliberada (✕, Cancelar ou
 * Esc) — NÃO fecha ao clicar fora nem ao rolar, evitando perda do que foi
 * digitado. O foco vai ao diálogo apenas na abertura (não a cada render), para
 * não roubar o foco dos campos enquanto se digita.
 */
export function Modal({
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
  // mantém sempre o onClose mais recente sem virar dependência do efeito
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Esc fecha + foca o diálogo UMA vez ao abrir. Depende só de `open` — assim o
  // efeito NÃO re-roda a cada tecla (o que roubava o foco do input).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    ref.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Trava o scroll do fundo enquanto o modal está aberto.
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
        className="my-8 w-full max-w-2xl rounded border border-border bg-bg p-5 shadow-lg focus:outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold">{title}</h2>
          <button onClick={() => onCloseRef.current()} className="rounded p-1 text-fg/60 hover:bg-muted" aria-label="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
