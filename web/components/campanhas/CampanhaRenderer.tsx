'use client';

/**
 * CampanhaRenderer — monta todas as capacidades ativas da campanha no portal público.
 *
 * Ordem de renderização (§4 CONTRATO-fase1.md):
 *   1. Override de tema (CSS vars) — injetado no <head> via <style> escopado
 *   2. Faixas (ribbon empilháveis, max 2) — topo da página
 *   3. Banners — renderizados nas posições home_topo / home_secao
 *      (responsabilidade das páginas filhas; CampanhaRenderer disponibiliza
 *       mas não os posiciona — o posicionamento é por posição declarada).
 *      EXCEÇÃO: banners home_topo aparecem fixos como blocos acima do <main>
 *      via portal; o componente da home já lida com eles via contexto.
 *      Aqui renderizamos apenas como fallback visual (oculto se home já exibe).
 *   4. Popup (1 por vez, maior prioridade)
 *   5. Efeito (max 1, dinâmico pelo registry)
 *   6. Selos (não posicionados — exibidos como badges flutuantes)
 *
 * Tolerante: capacidade ausente/malformada é ignorada silenciosamente.
 * Nunca quebra o SSR — retorna null no server (todos os efeitos ativam em useEffect).
 *
 * z-index:
 * - Faixas: 7800 (abaixo do cookie consent z-50 = 3200; abaixo do modal campanha)
 * - Popup campanha: 8000
 * - Efeito aedes: 9000 (próprio dos mosquitos)
 * - Efeito copa: 2147481000 (próprio do canvas)
 * - Cookie consent (CookieConsent.tsx): z-50 (Tailwind = 50)
 * - VLibras: respeita z-index próprio
 * - Banner LGPD / cookie = z-50 → campanhas ficam abaixo (z-[7800..9000])
 *   exceto efeitos visuais que são decorativos (pointer-events:none).
 */

import { useId } from 'react';
import { usePathname } from 'next/navigation';
import type { CampanhasContexto } from '../../lib/campanhas';
import CampanhaFaixa from './CampanhaFaixa';
import CampanhaPopup from './CampanhaPopup';
import { EFEITOS_REGISTRY } from './efeitos/registry';

/**
 * Decide se o efeito deve aparecer na rota atual conforme `paginaAlvo`:
 *  - ausente/vazio  → todas as páginas
 *  - "/"            → somente a home (match exato)
 *  - "/rota"        → a própria rota e suas sub-rotas (prefixo)
 */
function efeitoNaPagina(paginaAlvo: string | null | undefined, pathname: string): boolean {
  const alvo = (paginaAlvo ?? '').trim();
  if (!alvo) return true;
  if (alvo === '/') return pathname === '/';
  return pathname === alvo || pathname.startsWith(alvo.endsWith('/') ? alvo : alvo + '/');
}

interface Props {
  contexto: CampanhasContexto;
  /** Host do tenant — usado para escopar localStorage das dispensas. */
  tenantHost: string;
}

export default function CampanhaRenderer({ contexto, tenantHost }: Props) {
  const styleId = useId();
  const pathname = usePathname();

  // Nada a renderizar
  const vazio =
    !contexto.tema &&
    contexto.faixas.length === 0 &&
    !contexto.popup &&
    contexto.efeitos.length === 0 &&
    contexto.selos.length === 0;

  if (vazio) return null;

  // ── 1. Override de tema (CSS vars) ─────────────────────────────────────────
  let temaCss = '';
  if (contexto.tema) {
    const t = contexto.tema;
    const vars: string[] = [];
    if (t.corPrimaria) vars.push(`--color-primary:${t.corPrimaria}`);
    if (t.corPrimariaFg) vars.push(`--color-primary-fg:${t.corPrimariaFg}`);
    if (t.corDestaque) vars.push(`--color-accent:${t.corDestaque}`);
    if (t.corSecundaria) vars.push(`--color-secondary:${t.corSecundaria}`);
    if (vars.length > 0) {
      // Escopa: "todo" sobrescreve :root; "home" seria mais específico,
      // mas como o renderer é global e CSS vars herdam, ":root" é suficiente.
      // O admin já garante contraste AA antes de salvar.
      temaCss = `:root{${vars.join(';')}}`;
    }
  }

  // ── 5. Efeito (max 1, dinâmico pelo registry) ──────────────────────────────
  // Monta apenas o primeiro efeito (backend já garante teto 1, mas defensivo).
  // Respeita o escopo de página (paginaAlvo): ex.: "somente na home".
  const efeitoItem = contexto.efeitos[0];
  const efeitoVisivelNaPagina = efeitoItem
    ? efeitoNaPagina(efeitoItem.paginaAlvo, pathname)
    : false;
  const EfeitoComponent =
    efeitoItem && efeitoVisivelNaPagina ? EFEITOS_REGISTRY[efeitoItem.nome] : null;

  return (
    <>
      {/* 1. Override de tema (injeta após o tema base do tenant) */}
      {temaCss && (
        <style
          id={styleId}
          dangerouslySetInnerHTML={{ __html: temaCss }}
        />
      )}

      {/* 2. Faixas — empilháveis (max 2), no topo da viewport */}
      {contexto.faixas.map((faixa) => (
        <CampanhaFaixa
          key={faixa.campaignId}
          faixa={faixa}
          tenantHost={tenantHost}
        />
      ))}

      {/* 4. Popup (1 por vez) */}
      {contexto.popup && (
        <CampanhaPopup
          popup={contexto.popup}
          tenantHost={tenantHost}
        />
      )}

      {/* 5. Efeito visual (max 1, plugável pelo registry) */}
      {EfeitoComponent && efeitoItem && (
        <EfeitoComponent efeito={efeitoItem} tenantHost={tenantHost} />
      )}

      {/* 6. Selos — badges flutuantes no canto inferior esquerdo */}
      {contexto.selos.length > 0 && (
        <div
          aria-label="Selos de campanha"
          style={{
            position: 'fixed',
            bottom: 16,
            left: 16,
            zIndex: 7900,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            pointerEvents: 'none',
          }}
        >
          {contexto.selos.map((selo) => {
            const inner = (
              <span
                key={selo.campaignId}
                style={{
                  display: 'inline-block',
                  background: selo.cor ?? 'var(--color-primary)',
                  color: '#fff',
                  padding: '6px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                  pointerEvents: 'auto',
                }}
              >
                {selo.texto}
              </span>
            );
            return selo.link ? (
              <a
                key={selo.campaignId}
                href={selo.link}
                style={{ textDecoration: 'none', pointerEvents: 'auto' }}
              >
                {inner}
              </a>
            ) : (
              inner
            );
          })}
        </div>
      )}
    </>
  );
}
