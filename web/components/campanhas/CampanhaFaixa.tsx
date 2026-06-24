'use client';

/**
 * Faixa de campanha — barra superior dismissível.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - role="region" com aria-label descritivo.
 * - Botão × acessível via teclado; Esc também dispensa.
 * - Dispensa persiste em localStorage escopada por tenant+campaignId.
 * - Contraste: corBg/corTexto vêm do backend (backend já garante AA no salvar).
 */

import { useEffect, useState } from 'react';
import type { CampanhaFaixaItem } from '../../lib/campanhas';

interface Props {
  faixa: CampanhaFaixaItem;
  tenantHost: string;
}

function chaveDispensa(tenantHost: string, campaignId: string): string {
  return `campanha-faixa:${tenantHost}:${campaignId}`;
}

function jaDismissed(tenantHost: string, campaignId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(chaveDispensa(tenantHost, campaignId)) === '1';
  } catch {
    return false;
  }
}

function marcarDismissed(tenantHost: string, campaignId: string): void {
  try {
    localStorage.setItem(chaveDispensa(tenantHost, campaignId), '1');
  } catch {
    /* silencioso */
  }
}

export default function CampanhaFaixa({ faixa, tenantHost }: Props) {
  const [visivel, setVisivel] = useState(false);

  // Verifica no client-side (evita hydration mismatch com SSR)
  useEffect(() => {
    if (!jaDismissed(tenantHost, faixa.campaignId)) {
      setVisivel(true);
    }
  }, [tenantHost, faixa.campaignId]);

  // Esc dispensa
  useEffect(() => {
    if (!visivel || !faixa.dismissivel) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dispensar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visivel]);

  function dispensar() {
    marcarDismissed(tenantHost, faixa.campaignId);
    setVisivel(false);
  }

  if (!visivel) return null;

  const conteudo = faixa.link ? (
    <a
      href={faixa.link}
      style={{ color: faixa.corTexto, textDecoration: 'underline', fontWeight: 500 }}
    >
      {faixa.mensagem}
    </a>
  ) : (
    <span>{faixa.mensagem}</span>
  );

  return (
    <div
      role="region"
      aria-label={`Aviso de campanha: ${faixa.mensagem}`}
      style={{
        background: faixa.corBg,
        color: faixa.corTexto,
        width: '100%',
        padding: '8px 48px 8px 16px',
        fontSize: 14,
        lineHeight: 1.4,
        textAlign: 'center',
        position: 'relative',
      }}
    >
      {conteudo}
      {faixa.dismissivel && (
        <button
          onClick={dispensar}
          aria-label="Fechar aviso"
          style={{
            position: 'absolute',
            right: 10,
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'transparent',
            border: 'none',
            color: faixa.corTexto,
            cursor: 'pointer',
            fontSize: 20,
            lineHeight: 1,
            padding: '4px 6px',
            borderRadius: 4,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
