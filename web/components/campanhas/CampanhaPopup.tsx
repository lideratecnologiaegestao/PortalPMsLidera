'use client';

/**
 * Popup de campanha — modal acessível com frequência controlada.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - role="dialog" aria-modal aria-labelledby.
 * - Foco gerenciado ao abrir (dialog recebe foco).
 * - Fecha com Esc / clique no backdrop / botão ×.
 * - Frequência: "sempre" | "dia" | "sessao" via localStorage escopado
 *   por tenant+campaignId.
 * - paginaAlvo: se definida, só exibe na URL correspondente.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { CampanhaPopup as CampanhaPopupType } from '../../lib/campanhas';

interface Props {
  popup: CampanhaPopupType;
  tenantHost: string;
}

function chaveFrequencia(tenantHost: string, campaignId: string): string {
  return `campanha-popup:${tenantHost}:${campaignId}`;
}

function deveExibir(popup: CampanhaPopupType, tenantHost: string): boolean {
  if (typeof window === 'undefined') return false;
  const freq = popup.frequencia ?? 'dia';

  try {
    if (freq === 'sempre') return true;

    if (freq === 'sessao') {
      // sessionStorage é limpado quando a aba fecha
      return !sessionStorage.getItem(chaveFrequencia(tenantHost, popup.campaignId));
    }

    // 'dia' — verifica se já foi mostrado nas últimas X horas/dias
    const raw = localStorage.getItem(chaveFrequencia(tenantHost, popup.campaignId));
    if (!raw) return true;
    const expira = Number(raw);
    if (Number.isNaN(expira)) return true;
    return Date.now() > expira;
  } catch {
    return true;
  }
}

function registrarExibicao(popup: CampanhaPopupType, tenantHost: string): void {
  const freq = popup.frequencia ?? 'dia';
  try {
    if (freq === 'sessao') {
      sessionStorage.setItem(chaveFrequencia(tenantHost, popup.campaignId), '1');
    } else if (freq !== 'sempre') {
      const dias = popup.reabrirAposDias ?? 7;
      localStorage.setItem(
        chaveFrequencia(tenantHost, popup.campaignId),
        String(Date.now() + dias * 86_400_000),
      );
    }
  } catch {
    /* silencioso */
  }
}

export default function CampanhaPopup({ popup, tenantHost }: Props) {
  const [aberto, setAberto] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const pathname = usePathname();

  // Abre o popup no client após verificar frequência e paginaAlvo
  useEffect(() => {
    // Verifica se a paginaAlvo bate com o pathname atual
    if (popup.paginaAlvo && pathname !== popup.paginaAlvo) return;

    if (deveExibir(popup, tenantHost)) {
      setAberto(true);
      registrarExibicao(popup, tenantHost);
    }
  }, [popup, tenantHost, pathname]);

  // Fecha com Esc
  useEffect(() => {
    if (!aberto) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto]);

  if (!aberto) return null;

  const bullets = Array.isArray(popup.bullets) ? popup.bullets : [];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) setAberto(false); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 8000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth: 420,
          background: '#fff',
          color: '#1c1c1c',
          borderRadius: 12,
          overflow: 'hidden',
          outline: 'none',
          boxShadow: '0 8px 40px rgba(0,0,0,0.25)',
        }}
      >
        {/* Cabeçalho */}
        <div
          style={{
            background: 'var(--color-primary)',
            padding: '16px 18px',
            position: 'relative',
          }}
        >
          {popup.subtitulo && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--color-accent)',
                fontWeight: 600,
                letterSpacing: 0.6,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              {popup.subtitulo}
            </div>
          )}
          <div
            id={tituloId}
            style={{
              fontSize: 18,
              color: 'var(--color-primary-fg)',
              fontWeight: 600,
              lineHeight: 1.3,
            }}
          >
            {popup.titulo}
          </div>
          <button
            onClick={() => setAberto(false)}
            aria-label="Fechar"
            style={{
              position: 'absolute',
              top: 12,
              right: 12,
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)',
              border: 'none',
              color: 'var(--color-primary-fg)',
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        {/* Imagem opcional */}
        {popup.imagemUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={popup.imagemUrl}
            alt={popup.titulo}
            style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 220, objectFit: 'cover' }}
          />
        )}

        {/* Corpo */}
        <div style={{ padding: '16px 18px 18px' }}>
          {popup.descricao && (
            <p style={{ margin: '0 0 12px', fontSize: 14, color: '#444', lineHeight: 1.6 }}>
              {popup.descricao}
            </p>
          )}

          {bullets.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                margin: '0 0 12px',
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {bullets.slice(0, 6).map((b, i) => (
                <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: '#444' }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--color-primary)',
                      marginTop: 5,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}

          {popup.ctaUrl && popup.ctaLabel && (
            <a
              href={popup.ctaUrl}
              target={popup.ctaUrl.startsWith('http') ? '_blank' : undefined}
              rel={popup.ctaUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
              style={{
                display: 'block',
                width: '100%',
                marginTop: 4,
                background: 'var(--color-primary)',
                color: 'var(--color-primary-fg)',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                textAlign: 'center',
                textDecoration: 'none',
                boxSizing: 'border-box',
              }}
              onClick={() => setAberto(false)}
            >
              {popup.ctaLabel}
            </a>
          )}

          <button
            onClick={() => setAberto(false)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 8,
              background: 'transparent',
              border: 'none',
              color: '#888',
              fontSize: 12,
              padding: '6px 0',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
