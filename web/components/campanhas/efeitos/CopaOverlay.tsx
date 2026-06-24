'use client';

/**
 * Efeito "copa-overlay" — overlay decorativo verde-amarelo com bola, bandeirinhas,
 * confete e fitas caindo. Portado de prompts/modulo-campanhas/overlay/efeito-copa.html.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - aria-hidden no contêiner (puramente decorativo).
 * - pointer-events:none em tudo — nunca captura cliques nem bloqueia a navegação.
 * - prefers-reduced-motion: não anima (canvas limpo + sem faixa animada).
 * - Limpeza total (canvas + faixa) no unmount.
 *
 * Sem dependências novas — usa Canvas 2D API nativa.
 */

import { useEffect, useRef, useState } from 'react';
import type { EfeitoProps } from './registry';

/** Chave de "efeito parado" na sessão — escopada por tenant + campanha. */
function chaveParado(tenantHost: string, campanhaId: string): string {
  return `campanha-efeito-parado:${tenantHost}:${campanhaId}`;
}

// ─── Tipos dos params (§3) ────────────────────────────────────────────────────

interface CopaParams {
  /** "leve" | "media" | "forte" — default "media" */
  intensidade?: string;
  /** Exibir faixa inferior com mensagem — default true */
  faixa?: boolean;
  /** Texto da faixa — default "Vai, Brasil! 🇧🇷" */
  mensagem?: string;
  bolas?: boolean;
  bandeiras?: boolean;
  confete?: boolean;
  fitas?: boolean;
  /** URL de imagem da bola (tenant personalizado) */
  ball?: string | null;
  /** URL de imagem da bandeira (tenant personalizado) */
  flag?: string | null;
}

// ─── Paleta e constantes ──────────────────────────────────────────────────────

const GREEN = '#0A8F3C';
const YELLOW = '#FFD400';
const BLUE = '#1f6fd6';
const WHITE = '#FFFFFF';
const PALETTE = [GREEN, YELLOW, YELLOW, GREEN, BLUE, WHITE];

// SVG inline da bola do Brasil (fallback quando ball não vem como URL)
const BALL_SVG_DATA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='48' fill='%230A8F3C' stroke='%23fff' stroke-width='2'/%3E%3Cellipse cx='50' cy='50' rx='26' ry='18' fill='%23FFD400' transform='rotate(-15 50 50)'/%3E%3Ccircle cx='50' cy='50' r='14' fill='%231f6fd6'/%3E%3Ctext x='50' y='56' text-anchor='middle' font-size='14' font-weight='bold' fill='%23fff' font-family='sans-serif'%3EBR%3C/text%3E%3C/svg%3E";

// SVG inline da bandeirinha verde-amarela (fallback)
const FLAG_SVG_DATA =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 40'%3E%3Crect width='60' height='40' fill='%230A8F3C'/%3E%3Cpolygon points='30,4 56,20 30,36 4,20' fill='%23FFD400'/%3E%3Ccircle cx='30' cy='20' r='9' fill='%231f6fd6'/%3E%3C/svg%3E";

function rint(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

function densidade(intensidade: string, reduced: boolean): number {
  const m: Record<string, number> = { leve: 0.5, media: 1, forte: 1.9 };
  const base = m[intensidade] ?? 1;
  return reduced ? base * 0.25 : base;
}

// ─── Tipos de partícula ───────────────────────────────────────────────────────

interface Particle {
  kind: 'ball' | 'flag' | 'confetti' | 'ribbon';
  x: number;
  y: number;
  rot: number;
  vy: number;
  vx: number;
  vr: number;
  // ball
  size?: number;
  // flag
  w?: number;
  h?: number;
  sway?: number;
  swayP?: number;
  // confetti
  color?: string;
  // ribbon
  len?: number;
  amp?: number;
  phase?: number;
  freq?: number;
}

function makeParticle(kind: Particle['kind'], W: number, reduced: boolean): Particle {
  const p: Particle = {
    kind,
    x: rint(0, W),
    y: rint(-50, -10),
    rot: rint(0, 6.2832),
    vy: 0,
    vx: 0,
    vr: 0,
  };
  if (kind === 'ball') {
    p.size = rint(22, 42);
    p.vy = rint(1.4, 2.6);
    p.vx = rint(-0.4, 0.4);
    p.vr = rint(-0.08, 0.08);
  } else if (kind === 'flag') {
    p.w = rint(24, 42);
    p.h = p.w * 0.62;
    p.vy = rint(1.3, 2.5);
    p.vx = rint(-0.5, 0.5);
    p.vr = rint(-0.05, 0.05);
    p.sway = rint(0.5, 1.4);
    p.swayP = Math.random() * 6.28;
  } else if (kind === 'confetti') {
    const s = rint(6, 11);
    p.w = s;
    p.h = s * rint(0.5, 0.9);
    p.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    p.vy = rint(1.4, 3.2);
    p.vx = rint(-1.1, 1.1);
    p.vr = rint(-0.3, 0.3);
    p.sway = rint(0.5, 1.4);
    p.swayP = Math.random() * 6.28;
  } else {
    // ribbon
    p.color = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    p.len = rint(40, 90);
    p.amp = rint(8, 20);
    p.w = rint(4, 7);
    p.vy = rint(1.0, 2.2);
    p.vx = rint(-0.5, 0.5);
    p.phase = Math.random() * 6.28;
    p.freq = rint(0.06, 0.14);
  }
  if (reduced) {
    p.vy *= 0.5;
    p.vx *= 0.3;
  }
  return p;
}

function drawImg(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  p: Particle,
  w: number,
  h: number,
) {
  if (!img.complete || !img.naturalWidth) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
}

function drawRect(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = p.color ?? GREEN;
  ctx.fillRect(-(p.w ?? 8) / 2, -(p.h ?? 6) / 2, p.w ?? 8, p.h ?? 6);
  ctx.restore();
}

function drawRibbon(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.strokeStyle = p.color ?? GREEN;
  ctx.lineWidth = p.w ?? 4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  const len = p.len ?? 60;
  const amp = p.amp ?? 14;
  const phase = p.phase ?? 0;
  for (let s = 0; s <= len; s += 6) {
    const o = Math.sin(phase + s * 0.12) * amp * (s / len);
    if (s === 0) ctx.moveTo(o, 0);
    else ctx.lineTo(o, s);
  }
  ctx.stroke();
  ctx.restore();
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CopaOverlay({ efeito, tenantHost }: EfeitoProps) {
  const params = (efeito.params ?? {}) as CopaParams;
  const campanhaId = efeito.campaignId;
  // Controles de comportamento (vindos do painel / resolver).
  const permitirParar = efeito.permitirParar !== false; // default true (acessibilidade)
  const duracaoSegundos =
    typeof efeito.duracaoSegundos === 'number' && efeito.duracaoSegundos > 0
      ? efeito.duracaoSegundos
      : 0;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const faixaRef = useRef<HTMLDivElement | null>(null);

  // Estado de "parado": pelo botão do visitante ou pela duração configurada.
  const [parado, setParado] = useState(false);

  // Restaura "parado" se o visitante já tinha parado nesta sessão (persiste
  // entre navegações no mesmo tenant/campanha).
  useEffect(() => {
    try {
      if (sessionStorage.getItem(chaveParado(tenantHost, campanhaId))) setParado(true);
    } catch {
      /* sessionStorage indisponível — silencioso */
    }
  }, [tenantHost, campanhaId]);

  function parar() {
    try {
      sessionStorage.setItem(chaveParado(tenantHost, campanhaId), '1');
    } catch {
      /* silencioso */
    }
    setParado(true);
  }

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // prefers-reduced-motion ou efeito parado: não anima.
    if (reduced || parado) return;

    // Duração automática: encerra o efeito após N segundos.
    let duracaoTimer = 0;
    if (duracaoSegundos > 0) {
      duracaoTimer = window.setTimeout(() => setParado(true), duracaoSegundos * 1000);
    }

    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const intensidade = params.intensidade ?? 'media';
    const dens = densidade(intensidade, false);

    // Carrega imagens (ball e flag) — fallback SVG inline
    const ballImg = new Image();
    ballImg.src = params.ball ?? BALL_SVG_DATA;
    const flagImg = new Image();
    flagImg.src = params.flag ?? FLAG_SVG_DATA;

    // DPR para nitidez em telas Retina
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    let W = 0;
    let H = 0;

    function resize() {
      W = root!.clientWidth;
      H = root!.clientHeight;
      canvas!.width = W * DPR;
      canvas!.height = H * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    // Quantidade de partículas por tipo
    const tBall = params.bolas !== false ? Math.round(5 * dens) : 0;
    const tFlag = params.bandeiras !== false ? Math.round(6 * dens) : 0;
    const tConf = params.confete !== false ? Math.round(60 * dens) : 0;
    const tRib = params.fitas !== false ? Math.round(9 * dens) : 0;

    // Faixa inferior (mensagem)
    if (params.faixa !== false) {
      const faixaEl = document.createElement('div');
      faixaEl.setAttribute('aria-hidden', 'true');
      faixaEl.setAttribute('data-copa-faixa', '1');
      faixaEl.style.cssText = [
        'position:fixed',
        'left:50%',
        'bottom:18px',
        'transform:translateX(-50%)',
        'pointer-events:none',
        'display:flex',
        'align-items:center',
        'gap:10px',
        'background:rgba(11,31,42,.86)',
        'color:#fff',
        'border:1px solid rgba(255,255,255,0.13)',
        'padding:8px 16px',
        'border-radius:999px',
        'font-weight:700',
        'font-size:14px',
        'box-shadow:0 10px 30px rgba(0,0,0,.3)',
        'z-index:2147481999',
        'font-family:system-ui,sans-serif',
      ].join(';');
      // Bandeirinha pintada via spans (CSS)
      const pinHtml =
        '<span style="width:18px;height:12px;border-radius:2px;overflow:hidden;display:inline-flex;box-shadow:0 0 0 1px rgba(0,0,0,.2);flex-shrink:0">' +
        '<i style="flex:1;background:#0A8F3C;display:block"></i>' +
        '<i style="flex:1;background:#FFD400;display:block"></i>' +
        '<i style="flex:1;background:#1f6fd6;display:block"></i>' +
        '</span>';
      const mensagem = params.mensagem ?? 'Vai, Brasil! 🇧🇷';
      // Escapa HTML básico
      const safe = mensagem.replace(/[&<>"]/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
      );
      faixaEl.innerHTML = pinHtml + safe;
      document.body.appendChild(faixaEl);
      faixaRef.current = faixaEl;
    }

    // Inicializa partículas
    const parts: Particle[] = [];

    function ensure(kind: Particle['kind'], n: number) {
      for (let i = 0; i < n; i++) parts.push(makeParticle(kind, W, false));
    }
    ensure('ball', tBall);
    ensure('flag', tFlag);
    ensure('confetti', tConf);
    ensure('ribbon', tRib);

    let rafId = 0;
    let last = performance.now();

    function frame(now: number) {
      const dt = Math.min(40, now - last);
      last = now;
      const f = dt / 16.67;

      ctx!.clearRect(0, 0, W, H);

      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        p.y += p.vy * f;
        p.x += p.vx * f;

        if (p.kind === 'ball') {
          p.rot += p.vr * f;
          drawImg(ctx!, ballImg, p, p.size!, p.size!);
        } else if (p.kind === 'flag') {
          p.rot += p.vr * f;
          p.x += Math.sin(p.y * 0.03 + (p.swayP ?? 0)) * (p.sway ?? 1) * 0.5 * f;
          drawImg(ctx!, flagImg, p, p.w!, p.h!);
        } else if (p.kind === 'confetti') {
          p.rot += p.vr * f;
          p.x += Math.sin(p.y * 0.04 + (p.swayP ?? 0)) * (p.sway ?? 1) * 0.6 * f;
          drawRect(ctx!, p);
        } else {
          p.phase = (p.phase ?? 0) + (p.freq ?? 0.1) * f;
          drawRibbon(ctx!, p);
        }

        // Respawn quando sai pela base
        const off =
          p.kind === 'ball'
            ? p.size!
            : p.kind === 'flag'
            ? Math.max(p.w!, p.h!)
            : p.kind === 'ribbon'
            ? p.len!
            : 14;
        if (p.y - off > H) {
          const np = makeParticle(p.kind, W, false);
          np.y = rint(-50, -12);
          parts[i] = np;
        }
      }

      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      if (duracaoTimer) clearTimeout(duracaoTimer);
      window.removeEventListener('resize', resize);
      // Remove faixa injetada no body
      const faixaEl = faixaRef.current;
      if (faixaEl && faixaEl.parentNode) faixaEl.remove();
      faixaRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parado, duracaoSegundos]);

  // Efeito parado (pelo visitante ou pela duração) → nada a renderizar.
  if (parado) return null;

  return (
    <>
      <div
        ref={rootRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2147481000,
          pointerEvents: 'none',
          overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
        />
      </div>

      {/* Botão para o visitante parar o efeito (acessibilidade / preferência). */}
      {permitirParar && (
        <button
          type="button"
          onClick={parar}
          aria-label="Parar efeito visual da campanha"
          style={{
            position: 'fixed',
            right: 16,
            bottom: 64,
            zIndex: 2147482000,
            pointerEvents: 'auto',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(11,31,42,.92)',
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
    </>
  );
}
