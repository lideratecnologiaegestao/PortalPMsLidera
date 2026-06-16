'use client';

/**
 * Banner de consentimento de cookies (LGPD).
 * Persistido em localStorage. Acessível (foco gerenciado, ARIA live region).
 * Tokens: bg-bg, text-fg, border-border, bg-primary, text-primary-fg, bg-muted.
 */

import { useState, useEffect, useRef } from 'react';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const acceptBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const consent = localStorage.getItem('cookie-consent');
    if (!consent) setVisible(true);
  }, []);

  // Move o foco para o botão de aceitar quando o banner aparecer
  useEffect(() => {
    if (visible) acceptBtnRef.current?.focus();
  }, [visible]);

  function accept() {
    localStorage.setItem('cookie-consent', 'all');
    setVisible(false);
  }

  function acceptNecessary() {
    localStorage.setItem('cookie-consent', 'necessary');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Aviso de cookies"
      aria-live="polite"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-bg shadow-lg"
    >
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 text-sm text-fg">
            <p className="font-semibold mb-1">Este portal usa cookies</p>
            <p className="opacity-80">
              Usamos cookies essenciais para o funcionamento do portal e cookies opcionais
              para melhorar a sua experiência. Consulte nossa{' '}
              <a href="/privacidade" className="underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded">
                Política de Privacidade (LGPD)
              </a>.
            </p>

            {showDetails && (
              <div className="mt-2 rounded border border-border bg-muted/50 p-3 text-xs space-y-1">
                <p><strong>Necessários:</strong> sessão, preferências de acessibilidade (sem rastreamento).</p>
                <p><strong>Estatísticas (opcionais):</strong> análise anônima de uso para melhorar o portal.</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowDetails((v) => !v)}
              className="mt-1 text-xs underline hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
              aria-expanded={showDetails}
            >
              {showDetails ? 'Ocultar detalhes' : 'Personalizar'}
            </button>
          </div>

          <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
            <button
              ref={acceptBtnRef}
              type="button"
              onClick={accept}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Aceitar todos
            </button>
            <button
              type="button"
              onClick={acceptNecessary}
              className="rounded border border-border px-4 py-2 text-sm text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
            >
              Somente necessários
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
