'use client';

/**
 * Efeito "aedes-overlay" — mosquitos voam pela tela; hover/toque elimina;
 * 1ª eliminação abre popup informativo sobre dengue.
 *
 * Portado de prompts/modulo-campanhas/overlay/reference/AedesCampaignOverlay.tsx.
 * Adapta para receber params da campanha (§3 CONTRATO-fase1.md) em vez de site_settings.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - Animação gerida por rAF (nunca re-render por frame).
 * - prefers-reduced-motion: exibe banner estático dispensável; sem animação.
 * - pointer-events:none no contêiner; apenas mosquitos capturam cliques.
 * - Popup: role="dialog", aria-modal, foco gerenciado, fecha com Esc.
 * - Splatters e mosquitos: aria-hidden.
 * - Limpeza total no unmount.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { EfeitoProps } from './registry';

// ─── SVGs inline ─────────────────────────────────────────────────────────────

const MOSQUITO_SVG = `
<svg viewBox="0 0 60 40" xmlns="http://www.w3.org/2000/svg" style="overflow:visible">
  <g class="ca-wing" opacity="0.45"><ellipse cx="26" cy="9" rx="13" ry="6" fill="#7fa6c4" transform="rotate(-22 26 9)"/></g>
  <g class="ca-wing" opacity="0.45"><ellipse cx="22" cy="11" rx="12" ry="5" fill="#7fa6c4" transform="rotate(-8 22 11)"/></g>
  <g stroke="#1c1c1c" stroke-width="1.4">
    <path d="M30 20 L40 32 M38 32 L42 31"/><path d="M28 21 L36 34 M34 34 L38 33.5"/>
    <path d="M26 21 L30 35 M28 35 L32 35"/><path d="M31 19 L41 12 M39 12 L43 13"/>
    <path d="M29 19 L35 9 M33 9 L37 10"/><path d="M27 19 L29 8 M27 8 L31 9"/>
  </g>
  <g stroke="#fff" stroke-width="1.4">
    <path d="M37 30 l1.6 2 M33 32 l1.6 2 M28.5 32.5 l1.4 2 M39 13 l1.6 -1.1 M33.5 10.5 l1.4 -2 M28 9.5 l1 -2"/>
  </g>
  <ellipse cx="20" cy="20" rx="13" ry="6" fill="#2b2b2b" transform="rotate(12 20 20)"/>
  <g stroke="#e8e8e8" stroke-width="1.1" opacity="0.85">
    <path d="M14 22 l3 -1.6 M18 24 l3 -1.6 M22 25.5 l3 -1.6"/>
  </g>
  <circle cx="44" cy="14" r="5" fill="#222"/>
  <circle cx="45.5" cy="12.5" r="1.4" fill="#c0392b"/>
  <line x1="48" y1="14" x2="59" y2="13" stroke="#1c1c1c" stroke-width="1.6"/>
  <path d="M46 10 L52 4 M47 12 L54 7" stroke="#1c1c1c" stroke-width="1"/>
</svg>`;

const SPLAT_SVG = `
<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 12 C40 10 50 18 48 28 C54 32 52 44 42 44 C40 52 26 54 22 46 C12 48 8 36 16 30 C10 22 18 12 30 12 Z" fill="#c0392b" opacity="0.92"/>
  <circle cx="14" cy="20" r="2.4" fill="#c0392b"/><circle cx="50" cy="46" r="2" fill="#c0392b"/><circle cx="46" cy="16" r="1.6" fill="#c0392b"/>
  <text x="30" y="35" font-family="sans-serif" font-size="13" fill="#fff" text-anchor="middle" font-weight="bold">+1</text>
</svg>`;

// ─── Tipos dos params (§3) ────────────────────────────────────────────────────

interface AedesParams {
  quantidadeMosquitos?: number;
  corPrimaria?: string;
  corDestaque?: string;
  zIndex?: number;
  titulo?: string;
  subtitulo?: string;
  descricao?: string;
  bullets?: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  reabrirAposDias?: number;
}

// ─── Helpers de localStorage ──────────────────────────────────────────────────

function chaveDispensa(tenantHost: string, campanhaId: string): string {
  return `campanha-aedes:${tenantHost}:${campanhaId}`;
}

function foiDispensada(tenantHost: string, campanhaId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = localStorage.getItem(chaveDispensa(tenantHost, campanhaId));
    if (!raw) return false;
    const expira = Number(raw);
    if (Number.isNaN(expira)) return false;
    if (Date.now() > expira) {
      localStorage.removeItem(chaveDispensa(tenantHost, campanhaId));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function marcarDispensada(tenantHost: string, campanhaId: string, dias: number) {
  try {
    localStorage.setItem(
      chaveDispensa(tenantHost, campanhaId),
      String(Date.now() + dias * 86_400_000),
    );
  } catch {
    /* localStorage indisponível — silencioso */
  }
}

/** "Parar efeito" do visitante — escopo de sessão (some até fechar o navegador). */
function chaveParado(tenantHost: string, campanhaId: string): string {
  return `campanha-efeito-parado:${tenantHost}:${campanhaId}`;
}

function foiParado(tenantHost: string, campanhaId: string): boolean {
  try {
    return !!sessionStorage.getItem(chaveParado(tenantHost, campanhaId));
  } catch {
    return false;
  }
}

function marcarParado(tenantHost: string, campanhaId: string) {
  try {
    sessionStorage.setItem(chaveParado(tenantHost, campanhaId), '1');
  } catch {
    /* silencioso */
  }
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AedesOverlay({ efeito, tenantHost }: EfeitoProps) {
  const params = (efeito.params ?? {}) as AedesParams;
  const campanhaId = efeito.campaignId;
  // Controles de comportamento (vindos do painel / resolver).
  const permitirParar = efeito.permitirParar !== false; // default true (acessibilidade)
  const duracaoSegundos =
    typeof efeito.duracaoSegundos === 'number' && efeito.duracaoSegundos > 0
      ? efeito.duracaoSegundos
      : 0;

  const [ativo, setAtivo] = useState(false);
  const [reduzido, setReduzido] = useState(false);
  const [popupAberto, setPopupAberto] = useState(false);

  const jaMostrouRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  // Ativa apenas no client, após verificar reduced-motion, dispensa e parada.
  useEffect(() => {
    if (foiDispensada(tenantHost, campanhaId)) return;
    if (foiParado(tenantHost, campanhaId)) return;
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    setReduzido(!!mq?.matches);
    setAtivo(true);
  }, [tenantHost, campanhaId]);

  // Motor de animação imperativo (sem re-render por frame).
  useEffect(() => {
    if (!ativo || reduzido) return;

    // Duração automática: encerra o efeito após N segundos.
    let duracaoTimer = 0;
    if (duracaoSegundos > 0) {
      duracaoTimer = window.setTimeout(() => setAtivo(false), duracaoSegundos * 1000);
    }

    const z = params.zIndex ?? 9000;
    const touch = window.matchMedia?.('(pointer: coarse)').matches ?? false;

    type M = {
      el: HTMLDivElement;
      dead: boolean;
      x: number;
      y: number;
      vx: number;
      vy: number;
      wob: number;
    };
    const lista: M[] = [];
    const timers: number[] = [];
    let raf = 0;

    const bounds = () => ({ w: window.innerWidth, h: window.innerHeight });

    function kill(m: M) {
      if (m.dead) return;
      m.dead = true;

      const splat = document.createElement('div');
      splat.setAttribute('aria-hidden', 'true');
      splat.style.cssText = `position:fixed;width:60px;height:60px;pointer-events:none;z-index:${z + 1};left:${m.x - 4}px;top:${m.y - 12}px`;
      splat.innerHTML = SPLAT_SVG;
      document.body.appendChild(splat);

      m.el.remove();
      const i = lista.indexOf(m);
      if (i >= 0) lista.splice(i, 1);

      timers.push(window.setTimeout(() => splat.remove(), 650));
      timers.push(window.setTimeout(spawn, 900 + Math.random() * 700));

      if (!jaMostrouRef.current) {
        jaMostrouRef.current = true;
        setPopupAberto(true);
      }
    }

    function spawn() {
      const b = bounds();
      const el = document.createElement('div');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = `position:fixed;width:52px;height:36px;pointer-events:auto;cursor:pointer;will-change:transform;z-index:${z}`;
      el.innerHTML = MOSQUITO_SVG;
      const m: M = {
        el,
        dead: false,
        x: 40 + Math.random() * (b.w - 120),
        y: 80 + Math.random() * Math.max(120, b.h - 200),
        vx: (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 1.3),
        vy: (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 1.1),
        wob: Math.random() * Math.PI * 2,
      };
      const matar = () => kill(m);
      el.addEventListener(touch ? 'click' : 'mouseenter', matar);
      el.addEventListener('click', matar);
      document.body.appendChild(el);
      lista.push(m);
    }

    function loop() {
      const b = bounds();
      for (const m of lista) {
        m.wob += 0.18;
        m.x += m.vx + Math.cos(m.wob) * 0.4;
        m.y += m.vy + Math.sin(m.wob * 1.3) * 0.4;
        if (m.x < 4) { m.x = 4; m.vx = Math.abs(m.vx); }
        if (m.x > b.w - 56) { m.x = b.w - 56; m.vx = -Math.abs(m.vx); }
        if (m.y < 60) { m.y = 60; m.vy = Math.abs(m.vy); }
        if (m.y > b.h - 50) { m.y = b.h - 50; m.vy = -Math.abs(m.vy); }
        const ang = (Math.atan2(m.vy, m.vx) * 180) / Math.PI;
        const flip = m.vx < 0 ? ' scale(-1,1)' : '';
        m.el.style.transform = `translate(${m.x}px,${m.y}px) rotate(${flip ? -ang : ang}deg)${flip}`;
      }
      raf = requestAnimationFrame(loop);
    }

    const qtd = Math.max(1, Math.min(params.quantidadeMosquitos ?? 5, touch ? 4 : 8));
    for (let i = 0; i < qtd; i++) spawn();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      if (duracaoTimer) clearTimeout(duracaoTimer);
      timers.forEach(clearTimeout);
      lista.forEach((m) => m.el.remove());
      // Remove splatters órfãos (segurança de limpeza)
      document.querySelectorAll('[data-ca-splat]').forEach((n) => n.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, reduzido, duracaoSegundos]);

  // Esc fecha o popup; foca o diálogo ao abrir.
  useEffect(() => {
    if (!popupAberto) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPopupAberto(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popupAberto]);

  if (!ativo) return null;

  const cor = params.corPrimaria ?? '#294961';
  const destaque = params.corDestaque ?? '#f0a830';
  const z = params.zIndex ?? 9000;
  const titulo = params.titulo ?? 'Combate ao Aedes aegypti';
  const subtitulo = params.subtitulo ?? '10 minutos contra a dengue';
  const descricao = params.descricao ?? '';
  const bullets = Array.isArray(params.bullets) ? params.bullets : [];
  const ctaLabel = params.ctaLabel ?? 'Saiba mais';
  const ctaUrl = params.ctaUrl ?? '#';
  const diasReabrir = params.reabrirAposDias ?? 7;

  const dispensar = () => {
    marcarDispensada(tenantHost, campanhaId, diasReabrir);
    setPopupAberto(false);
    setAtivo(false);
  };

  // Parar o efeito (botão do visitante / acessibilidade) — escopo de sessão.
  const pararEfeito = () => {
    marcarParado(tenantHost, campanhaId);
    setPopupAberto(false);
    setAtivo(false);
  };

  return (
    <>
      <style>{`
        @keyframes caFlutter { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.25); } }
        .ca-wing { transform-origin: center; animation: caFlutter 0.09s infinite linear; }
        @media (prefers-reduced-motion: reduce) { .ca-wing { animation: none; } }
      `}</style>

      {/* Botão para o visitante parar o efeito (não some os mosquitos só com reduced-motion). */}
      {permitirParar && !reduzido && !popupAberto && (
        <button
          type="button"
          onClick={pararEfeito}
          aria-label="Parar efeito visual da campanha"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: z + 3,
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(28,28,28,.92)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.18)',
            padding: '8px 12px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 6px 20px rgba(0,0,0,.3)',
            fontFamily: 'system-ui,sans-serif',
          }}
        >
          <span aria-hidden="true">✕</span> Parar efeito
        </button>
      )}

      {/* Banner estático para prefers-reduced-motion */}
      {reduzido && !popupAberto && (
        <div
          style={{
            position: 'fixed',
            right: 16,
            bottom: 16,
            zIndex: z,
            background: cor,
            color: '#fff',
            borderRadius: 10,
            padding: '12px 14px',
            maxWidth: 280,
            boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          }}
          role="region"
          aria-label="Campanha contra a dengue"
        >
          <div style={{ fontSize: 12, color: destaque, fontWeight: 500 }}>{subtitulo}</div>
          <div style={{ fontSize: 15, fontWeight: 500, margin: '2px 0 8px' }}>{titulo}</div>
          <button
            onClick={() => setPopupAberto(true)}
            style={{
              background: '#fff',
              color: cor,
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Saiba mais
          </button>
          <button
            onClick={dispensar}
            aria-label="Dispensar campanha"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              background: 'transparent',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Popup da campanha */}
      {popupAberto && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPopupAberto(false); }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: z + 2,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            pointerEvents: 'auto',
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
              maxWidth: 380,
              background: '#fff',
              color: '#1c1c1c',
              borderRadius: 12,
              overflow: 'hidden',
              outline: 'none',
            }}
          >
            <div style={{ background: cor, padding: '16px 18px', position: 'relative' }}>
              <div
                style={{
                  fontSize: 12,
                  color: destaque,
                  fontWeight: 500,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                }}
              >
                {subtitulo}
              </div>
              <div
                id={tituloId}
                style={{ fontSize: 18, color: '#fff', fontWeight: 500, marginTop: 2 }}
              >
                {titulo}
              </div>
              <button
                onClick={() => setPopupAberto(false)}
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
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: 16,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: '16px 18px' }}>
              {descricao && (
                <p style={{ margin: '0 0 12px', fontSize: 14, color: '#555', lineHeight: 1.6 }}>
                  {descricao}
                </p>
              )}
              {bullets.length > 0 && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: 0,
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}
                >
                  {bullets.map((b, i) => (
                    <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: cor,
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

              {ctaUrl && ctaUrl !== '#' ? (
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'block',
                    width: '100%',
                    marginTop: 16,
                    background: cor,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'center',
                    textDecoration: 'none',
                  }}
                >
                  {ctaLabel}
                </a>
              ) : (
                <button
                  style={{
                    width: '100%',
                    marginTop: 16,
                    background: cor,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onClick={() => setPopupAberto(false)}
                >
                  {ctaLabel}
                </button>
              )}

              <button
                onClick={dispensar}
                style={{
                  width: '100%',
                  marginTop: 8,
                  background: 'transparent',
                  color: '#777',
                  border: 'none',
                  padding: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Não mostrar novamente
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
