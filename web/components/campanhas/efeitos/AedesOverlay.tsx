'use client';

/**
 * Efeito "aedes-overlay" — versão "raquete" (porte fiel de
 * prompts/modulo-campanhas/overlay/campanha dengue example.html).
 *
 * UX: um overlay de viewport inteiro com um banner (olho-mágico + título +
 * CONTADOR de eliminações), cursor em forma de RAQUETE, pernilongos (sprite real)
 * voando; ao clicar/tocar/Enter elimina (faísca + flash + animação "die"). Ao
 * atingir a meta (kills) ou clicar em "Pular", o banner vira mensagem final
 * (com a dica e, se houver, um CTA) e o overlay some.
 *
 * Integração com o módulo de Campanhas:
 * - params (§3): titulo, subtitulo→eyebrow, descricao→dica, corPrimaria/corDestaque→accent,
 *   quantidadeMosquitos→count, ctaLabel/ctaUrl, reabrirAposDias, + novos: kills, sprite, lockScroll.
 * - controles de efeito: permitirParar (mostra "Pular"; Esc SEMPRE encerra), duracaoSegundos (auto-encerra).
 * - paginaAlvo é tratado pelo CampanhaRenderer.
 *
 * Acessibilidade (WCAG 2.1 AA):
 * - "Pular" + Esc sempre encerram (nunca prende o usuário); foco visível; mosquitos
 *   focáveis (Tab + Enter/Espaço); aria-live no contador.
 * - prefers-reduced-motion: sem buzz/flash, velocidade reduzida e SEM travar a página.
 * - Ao encerrar, grava dispensa (localStorage, reabrirAposDias) → "uma vez por período".
 */

import { useEffect, useState } from 'react';
import type { EfeitoProps } from './registry';

const SPRITE_PADRAO = '/campanhas/aedes-mosquito.png';

interface AedesParams {
  quantidadeMosquitos?: number; // total de mosquitos na tela (count)
  kills?: number; // meta de eliminações
  corPrimaria?: string;
  corDestaque?: string;
  titulo?: string;
  subtitulo?: string; // → eyebrow
  descricao?: string; // → dica (mostrada no fim)
  ctaLabel?: string;
  ctaUrl?: string;
  reabrirAposDias?: number;
  sprite?: string; // URL do sprite do mosquito (default embutido)
  lockScroll?: boolean; // trava a navegação enquanto ativa (default true)
}

// ─── Dispensa (localStorage, "uma vez por período") + parada (sessão) ──────────
function chaveDispensa(host: string, id: string) {
  return `campanha-aedes:${host}:${id}`;
}
function foiDispensada(host: string, id: string): boolean {
  try {
    const raw = localStorage.getItem(chaveDispensa(host, id));
    if (!raw) return false;
    const exp = Number(raw);
    if (Number.isNaN(exp)) return false;
    if (Date.now() > exp) {
      localStorage.removeItem(chaveDispensa(host, id));
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function marcarDispensada(host: string, id: string, dias: number) {
  try {
    localStorage.setItem(chaveDispensa(host, id), String(Date.now() + dias * 86_400_000));
  } catch {
    /* silencioso */
  }
}

// ─── SVGs (cursor raquete + faísca), parametrizados por accent ──────────────────
function racketCursor(accent: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="46" height="46" viewBox="0 0 46 46"><g transform="rotate(28 23 18)">` +
    `<circle cx="23" cy="14" r="11" fill="${accent}" fill-opacity=".18" stroke="${accent}" stroke-width="2.5"/>` +
    `<g stroke="${accent}" stroke-width="1" opacity=".9"><path d="M16 14h14M23 7v14M18 9l10 10M28 9L18 19"/></g>` +
    `<rect x="21" y="24" width="4" height="15" rx="2" fill="#243640"/>` +
    `<path d="M19 12l3-3 2 2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round"/></g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 23 14, crosshair`;
}
function sparkSVG(accent: string): string {
  return (
    `<svg viewBox="0 0 52 52" width="52" height="52" aria-hidden="true" style="position:absolute;left:0;top:0;margin:-26px 0 0 -26px;pointer-events:none;animation:dgc-spark-go .4s ease-out forwards">` +
    `<circle cx="26" cy="26" r="10" fill="${accent}" fill-opacity=".35"/>` +
    `<g stroke="${accent}" stroke-width="2.5" stroke-linecap="round"><path d="M26 4v9M26 39v9M4 26h9M39 26h9M11 11l6 6M35 35l6 6M41 11l-6 6M11 41l6-6"/></g></svg>`
  );
}
function esc(s: string): string {
  return String(s).replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c,
  );
}

const CSS = `
#dgc-root{ position:fixed; inset:0; z-index:2147483000; }
.dgc-overlay{ position:absolute; inset:0; overflow:hidden; touch-action:none; animation:dgc-fade .25s ease both; }
.dgc-overlay.dgc-block{ background:radial-gradient(120% 90% at 50% -10%, rgba(11,31,42,.10), rgba(11,31,42,.34) 70%); }
.dgc-banner{ position:absolute; left:50%; top:18px; transform:translateX(-50%); width:min(560px,92vw);
  background:#0B1F2A; color:#EAF6F6; border:1px solid #1d3b46; border-radius:14px;
  box-shadow:0 18px 50px rgba(0,0,0,.35); padding:14px 16px; display:flex; align-items:center; gap:14px; pointer-events:auto;
  font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; }
.dgc-icon{ flex:0 0 auto; width:46px;height:46px;border-radius:10px; overflow:hidden; display:grid; place-items:center; font-size:26px; }
.dgc-icon img{ width:40px;height:40px;object-fit:contain; transform:scaleX(-1); filter:drop-shadow(0 1px 1px #0006); }
.dgc-eyebrow{ font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:700; }
.dgc-title{ font-size:15px; font-weight:700; line-height:1.25; margin:2px 0 0; }
.dgc-count{ margin-left:auto; text-align:right; line-height:1; flex:0 0 auto; }
.dgc-count b{ font-size:24px; font-variant-numeric:tabular-nums; }
.dgc-count small{ display:block; font-size:10px; letter-spacing:.1em; text-transform:uppercase; color:#9fb6bd; margin-top:3px; }
.dgc-skip{ position:absolute; right:16px; top:16px; appearance:none; border:1px solid #ffffff55; background:#ffffff14;
  color:#fff; font:inherit; font-size:13px; font-weight:600; padding:8px 14px; border-radius:999px; cursor:pointer; pointer-events:auto;
  font-family:system-ui,sans-serif; }
.dgc-skip:hover{ background:#ffffff2a; }
.dgc-skip:focus-visible, .dgc-skitter:focus-visible{ outline:3px solid #16B6C4; outline-offset:3px; border-radius:6px; }
.dgc-skitter{ position:absolute; left:0; top:0; width:50px; height:46px; margin:-23px 0 0 -25px; will-change:transform; cursor:inherit; pointer-events:auto; }
.dgc-mq{ width:50px; height:auto; display:block; pointer-events:none; filter:drop-shadow(0 3px 4px rgba(0,0,0,.45)); animation:dgc-buzz .12s linear infinite; }
.dgc-mq.dgc-die{ animation:dgc-die .42s cubic-bezier(.3,.7,.3,1) forwards !important; }
.dgc-flash{ position:absolute; inset:0; background:#EAFBFF; opacity:0; pointer-events:none; animation:dgc-flash .18s ease-out; mix-blend-mode:screen; }
.dgc-tip{ font-size:13px; color:#bfe9ed; margin:6px 0 0; }
.dgc-cta{ display:inline-block; margin-top:8px; color:#08323a; font-weight:700; text-decoration:none; padding:7px 12px; border-radius:8px; font-size:13px; pointer-events:auto; }
@keyframes dgc-fade{ from{opacity:0} to{opacity:1} }
@keyframes dgc-fadeout{ to{opacity:0} }
@keyframes dgc-buzz{ 0%,100%{ transform:translateY(0) rotate(-1deg) scale(1) } 50%{ transform:translateY(-.5px) rotate(1.3deg) scale(1.025) } }
@keyframes dgc-flash{ from{opacity:.5} to{opacity:0} }
@keyframes dgc-die{ 40%{ transform:scale(1.18) rotate(10deg) } 100%{ transform:scale(0) rotate(150deg); opacity:0 } }
@keyframes dgc-spark-go{ from{ transform:scale(.3); opacity:1 } to{ transform:scale(1.25); opacity:0 } }
@media (prefers-reduced-motion: reduce){ .dgc-mq{ animation:none; } .dgc-overlay{ animation:none; } }
`;

export default function AedesOverlay({ efeito, tenantHost }: EfeitoProps) {
  const params = (efeito.params ?? {}) as AedesParams;
  const campanhaId = efeito.campaignId;
  const permitirParar = efeito.permitirParar !== false; // default true
  const duracaoSegundos =
    typeof efeito.duracaoSegundos === 'number' && efeito.duracaoSegundos > 0
      ? efeito.duracaoSegundos
      : 0;

  const [ativo, setAtivo] = useState(false);

  // Decide ativação no client (evita mismatch de hidratação).
  useEffect(() => {
    if (foiDispensada(tenantHost, campanhaId)) return;
    setAtivo(true);
  }, [tenantHost, campanhaId]);

  useEffect(() => {
    if (!ativo) return;

    const REDUCED =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const accent = params.corDestaque || params.corPrimaria || '#16B6C4';
    const eyebrow = params.subtitulo || 'Campanha contra a dengue';
    const titulo = params.titulo || 'Pegue a raquete e elimine os pernilongos';
    const dica =
      params.descricao ||
      '10 minutos por semana contra o Aedes aegypti: elimine água parada em pneus, vasos, calhas e caixas d’água.';
    const sprite = params.sprite || SPRITE_PADRAO;
    const reabrirDias = params.reabrirAposDias ?? 7;
    const ctaLabel = params.ctaLabel || '';
    const ctaUrl = params.ctaUrl && params.ctaUrl !== '#' ? params.ctaUrl : '';

    const kills = Math.max(1, Math.min(params.kills ?? 3, 30));
    const count = Math.max(kills, Math.min(params.quantidadeMosquitos ?? 6, 12));

    // "Pular" disponível por padrão; Esc sempre encerra.
    const showSkip = permitirParar;
    // Só TRAVA a página quando há como sair (skip) e não há reduced-motion.
    const blocking = showSkip && !REDUCED && params.lockScroll !== false;
    const maxSpeed = REDUCED ? 0.7 : 2.1;

    // ── Monta o DOM (fora do React, em document.body) ────────────────────────
    const root = document.createElement('div');
    root.id = 'dgc-root';

    const overlay = document.createElement('div');
    overlay.className = 'dgc-overlay' + (blocking ? ' dgc-block' : '');
    overlay.style.cursor = racketCursor(accent);
    overlay.style.pointerEvents = blocking ? 'auto' : 'none';
    root.appendChild(overlay);

    const banner = document.createElement('div');
    banner.className = 'dgc-banner';
    banner.innerHTML =
      `<span class="dgc-icon" style="background:radial-gradient(circle at 50% 40%, ${accent}, #0E7C86)"><img src="${sprite}" alt=""></span>` +
      `<div><div class="dgc-eyebrow" style="color:${accent}">${esc(eyebrow)}</div><p class="dgc-title">${esc(titulo)}</p></div>` +
      `<div class="dgc-count" aria-live="polite"><b id="dgc-n">0</b><small>de ${kills}</small></div>`;
    overlay.appendChild(banner);

    if (showSkip) {
      const skip = document.createElement('button');
      skip.type = 'button';
      skip.className = 'dgc-skip';
      skip.textContent = 'Pular';
      skip.setAttribute('aria-label', 'Pular a campanha e continuar navegando');
      skip.addEventListener('click', () => finish(true));
      overlay.appendChild(skip);
    }

    const prevOverflow = document.body.style.overflow;
    if (blocking) document.body.style.overflow = 'hidden';

    document.body.appendChild(root);

    // ── Estado do jogo ───────────────────────────────────────────────────────
    type Bug = {
      node: HTMLDivElement;
      img: HTMLImageElement;
      x: number;
      y: number;
      vx: number;
      vy: number;
      alive: boolean;
    };
    const bugs: Bug[] = [];
    let killed = 0;
    let done = false;
    let raf = 0;
    const timers: number[] = [];

    const W = () => overlay.clientWidth || window.innerWidth;
    const H = () => overlay.clientHeight || window.innerHeight;

    function spark(x: number, y: number, cor: string, opacity = 1) {
      const wrap = document.createElement('div');
      wrap.innerHTML = sparkSVG(cor);
      const sp = wrap.firstChild as HTMLElement;
      if (!sp) return;
      sp.style.transform = `translate(${x}px,${y}px)`;
      sp.style.position = 'absolute';
      sp.style.left = '0';
      sp.style.top = '0';
      sp.style.opacity = String(opacity);
      overlay.appendChild(sp);
      timers.push(window.setTimeout(() => sp.remove(), 420));
    }

    function kill(bug: Bug, x: number, y: number) {
      if (done || !bug.alive) return;
      bug.alive = false;
      bug.img.classList.add('dgc-die');
      bug.node.style.pointerEvents = 'none';
      bug.node.setAttribute('tabindex', '-1');
      spark(x, y, accent);
      if (!REDUCED) {
        const flash = document.createElement('div');
        flash.className = 'dgc-flash';
        overlay.appendChild(flash);
        timers.push(window.setTimeout(() => flash.remove(), 180));
      }
      timers.push(window.setTimeout(() => bug.node.remove(), 440));
      killed++;
      const n = root.querySelector('#dgc-n');
      if (n) n.textContent = String(killed);
      if (killed >= kills) finish(false);
    }

    function miss(x: number, y: number) {
      if (done || REDUCED) return;
      spark(x, y, '#9fb6bd', 0.6);
    }

    function finish(skipped: boolean) {
      if (done) return;
      done = true;
      // Encerrar grava dispensa → "uma vez por período".
      marcarDispensada(tenantHost, campanhaId, reabrirDias);
      bugs.forEach((b) => {
        if (b.alive) {
          b.alive = false;
          b.node.style.transition = 'transform .6s ease, opacity .6s';
          b.node.style.opacity = '0';
        }
      });
      const ctaHtml =
        ctaUrl && ctaLabel
          ? `<a class="dgc-cta" style="background:${accent}" href="${esc(ctaUrl)}">${esc(ctaLabel)}</a>`
          : '';
      banner.innerHTML =
        `<span class="dgc-icon" style="background:#10333a">✅</span>` +
        `<div style="text-align:left"><div class="dgc-eyebrow" style="color:${accent}">${esc(eyebrow)}</div>` +
        `<p class="dgc-title">${skipped ? 'Combata a dengue o ano todo' : 'Pronto! Continue navegando'}</p>` +
        `<p class="dgc-tip">${esc(dica)}</p>${ctaHtml}</div>`;
      const skip = overlay.querySelector('.dgc-skip');
      if (skip) skip.remove();
      // libera a navegação imediatamente
      document.body.style.overflow = prevOverflow || '';
      overlay.style.pointerEvents = 'none';
      const hold = skipped ? 1200 : 1900;
      timers.push(
        window.setTimeout(() => {
          overlay.style.animation = 'dgc-fadeout .35s ease forwards';
          timers.push(window.setTimeout(() => setAtivo(false), 360));
        }, hold),
      );
    }

    // ── Mosquitos ────────────────────────────────────────────────────────────
    for (let i = 0; i < count; i++) {
      const node = document.createElement('div');
      node.className = 'dgc-skitter';
      node.setAttribute('role', 'button');
      node.setAttribute('tabindex', '0');
      node.setAttribute('aria-label', 'Pernilongo. Ative para eliminar.');
      const img = document.createElement('img');
      img.className = 'dgc-mq';
      img.src = sprite;
      img.alt = '';
      node.appendChild(img);
      const bug: Bug = {
        node,
        img,
        x: Math.random() * W(),
        y: 60 + Math.random() * Math.max(120, H() - 120),
        vx: (Math.random() * 2 - 1) * maxSpeed,
        vy: (Math.random() * 2 - 1) * maxSpeed,
        alive: true,
      };
      const hit = (ev: Event) => {
        ev.preventDefault();
        kill(bug, bug.x, bug.y);
      };
      node.addEventListener('pointerdown', hit);
      node.addEventListener('keydown', (ev: KeyboardEvent) => {
        if (ev.key === 'Enter' || ev.key === ' ') {
          ev.preventDefault();
          kill(bug, bug.x, bug.y);
        }
      });
      overlay.appendChild(node);
      bugs.push(bug);
    }

    const onOverlayDown = (ev: PointerEvent) => {
      if (ev.target === overlay) {
        const r = overlay.getBoundingClientRect();
        miss(ev.clientX - r.left, ev.clientY - r.top);
      }
    };
    overlay.addEventListener('pointerdown', onOverlayDown);

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') finish(true);
    };
    document.addEventListener('keydown', onKey);

    // Duração automática (encerra como "pular").
    let duracaoTimer = 0;
    if (duracaoSegundos > 0) {
      duracaoTimer = window.setTimeout(() => finish(true), duracaoSegundos * 1000);
    }

    // ── Loop ─────────────────────────────────────────────────────────────────
    let last = performance.now();
    function tick(now: number) {
      const dt = Math.min(40, now - last);
      last = now;
      const w = W();
      const h = H();
      const f = dt / 16.67;
      for (const bug of bugs) {
        if (!bug.alive) continue;
        if (!REDUCED) {
          bug.vx += (Math.random() * 2 - 1) * 0.25;
          bug.vy += (Math.random() * 2 - 1) * 0.25;
          const sp = Math.hypot(bug.vx, bug.vy) || 1;
          if (sp > maxSpeed) {
            bug.vx = (bug.vx / sp) * maxSpeed;
            bug.vy = (bug.vy / sp) * maxSpeed;
          }
        }
        bug.x += bug.vx * f;
        bug.y += bug.vy * f;
        if (bug.x < 16) { bug.x = 16; bug.vx = Math.abs(bug.vx); }
        if (bug.x > w - 16) { bug.x = w - 16; bug.vx = -Math.abs(bug.vx); }
        if (bug.y < 70) { bug.y = 70; bug.vy = Math.abs(bug.vy); }
        if (bug.y > h - 18) { bug.y = h - 18; bug.vy = -Math.abs(bug.vy); }
        const face = bug.vx > 0 ? -1 : 1; // sprite olha p/ esquerda
        const tilt = Math.max(-16, Math.min(16, bug.vy * 5));
        bug.node.style.transform = `translate(${bug.x}px,${bug.y}px) rotate(${tilt.toFixed(1)}deg) scaleX(${face})`;
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      if (duracaoTimer) clearTimeout(duracaoTimer);
      timers.forEach(clearTimeout);
      document.removeEventListener('keydown', onKey);
      overlay.removeEventListener('pointerdown', onOverlayDown);
      document.body.style.overflow = prevOverflow || '';
      root.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo]);

  if (!ativo) return null;
  return <style dangerouslySetInnerHTML={{ __html: CSS }} />;
}
