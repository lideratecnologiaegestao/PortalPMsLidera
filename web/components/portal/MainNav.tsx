'use client';

/**
 * Navegação principal: mega-menu desktop + hambúrguer/acordeão mobile.
 * Totalmente acessível por teclado (aria-expanded, Escape, Tab).
 *
 * Tokens: bg-primary, text-primary-fg, bg-bg, text-fg, border-border,
 *   bg-muted, hover:bg-primary/10.
 *
 * Recebe `items: MenuItem[]` da API via prop — zero dados hardcoded.
 * Fallback mínimo quando `items` está vazio.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import type { MenuItem } from '../../lib/portal-types';
import MenuIcon from './MenuIcon';

// ── Fallback mínimo quando a API retorna lista vazia ─────────────────────────

const FALLBACK_ITEMS: MenuItem[] = [
  { id: 'fb-transparencia', label: 'Transparência', tipo: 'interno', href: '/transparencia', icone: null, ordem: 1, children: [] },
  { id: 'fb-servicos', label: 'Serviços', tipo: 'interno', href: '/servicos', icone: null, ordem: 2, children: [] },
  { id: 'fb-ouvidoria', label: 'Ouvidoria', tipo: 'interno', href: '/ouvidoria', icone: null, ordem: 3, children: [] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function linkProps(item: MenuItem) {
  if (item.tipo === 'externo') {
    return { target: '_blank', rel: 'noopener noreferrer' };
  }
  return {};
}

interface Props {
  items: MenuItem[];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MainNav({ items }: Props) {
  const navItems = items.length > 0 ? items : FALLBACK_ITEMS;

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileAccordion, setMobileAccordion] = useState<number | null>(null);
  const navRef = useRef<HTMLElement>(null);

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Fecha dropdown no Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpenIndex(null);
        setMobileOpen(false);
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  // Bloqueia scroll do body quando mobile menu está aberto
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const toggleDropdown = useCallback((idx: number) => {
    setOpenIndex((prev) => (prev === idx ? null : idx));
  }, []);

  return (
    <nav
      id="nav-principal"
      ref={navRef}
      aria-label="Menu principal"
      className="relative bg-primary text-primary-fg"
    >
      <div className="mx-auto max-w-7xl px-4">
        {/* Desktop nav */}
        <ul className="hidden lg:flex items-stretch" role="menubar">
          {navItems.map((item, idx) => (
            <li key={item.id} role="none" className="relative">
              {item.children && item.children.length > 0 ? (
                <>
                  {/* Item com filhos: botão que abre dropdown */}
                  <button
                    role="menuitem"
                    aria-haspopup="true"
                    aria-expanded={openIndex === idx}
                    onClick={() => toggleDropdown(idx)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleDropdown(idx);
                      }
                    }}
                    className="flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium hover:bg-primary-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg focus-visible:ring-inset transition-colors"
                  >
                    {item.icone && (
                      <MenuIcon name={item.icone} size={14} />
                    )}
                    {item.label}
                    <svg
                      aria-hidden="true"
                      width="12"
                      height="12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      viewBox="0 0 24 24"
                      className={`transition-transform duration-200 ${openIndex === idx ? 'rotate-180' : ''}`}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                    </svg>
                  </button>
                  {openIndex === idx && (
                    <div
                      role="menu"
                      aria-label={`Submenu ${item.label}`}
                      className="absolute left-0 top-full z-50 min-w-[220px] rounded-b border border-border bg-bg py-1 shadow-lg"
                    >
                      {item.children.map((child) => (
                        <a
                          key={child.id}
                          href={child.href ?? '#'}
                          role="menuitem"
                          className="flex items-center gap-2 px-4 py-2.5 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                          onClick={() => setOpenIndex(null)}
                          {...linkProps(child)}
                        >
                          {child.icone && (
                            <MenuIcon name={child.icone} size={14} className="shrink-0 text-fg/60" />
                          )}
                          <span className="text-sm font-medium text-fg">{child.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </>
              ) : item.tipo === 'grupo' ? (
                /* Grupo sem filhos: apenas rótulo não clicável */
                <span
                  role="menuitem"
                  aria-disabled="true"
                  className="flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium opacity-70 cursor-default"
                >
                  {item.icone && <MenuIcon name={item.icone} size={14} />}
                  {item.label}
                </span>
              ) : (
                /* Link simples */
                <a
                  href={item.href ?? '#'}
                  role="menuitem"
                  className="flex items-center gap-1.5 px-3 py-3.5 text-sm font-medium hover:bg-primary-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg focus-visible:ring-inset transition-colors"
                  {...linkProps(item)}
                >
                  {item.icone && <MenuIcon name={item.icone} size={14} />}
                  {item.label}
                </a>
              )}
            </li>
          ))}
        </ul>

        {/* Mobile: hambúrguer */}
        <div className="flex lg:hidden items-center justify-between py-2">
          <span className="text-sm font-medium text-primary-fg">Menu</span>
          <button
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded p-2 hover:bg-primary-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
          >
            {mobileOpen ? (
              <svg aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          id="mobile-menu"
          className="lg:hidden fixed inset-0 top-0 z-50 flex flex-col bg-bg"
          role="dialog"
          aria-modal="true"
          aria-label="Menu de navegação"
        >
          {/* Header do drawer */}
          <div className="flex items-center justify-between bg-primary px-4 py-3 text-primary-fg">
            <span className="font-heading font-bold text-base">Navegação</span>
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setMobileOpen(false)}
              className="rounded p-2 hover:bg-primary-fg/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-fg"
            >
              <svg aria-hidden="true" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Lista de itens em acordeão */}
          <ul className="flex-1 overflow-y-auto divide-y divide-border" role="list">
            {navItems.map((item, idx) => (
              <li key={item.id}>
                {item.children && item.children.length > 0 ? (
                  <>
                    <button
                      type="button"
                      aria-expanded={mobileAccordion === idx}
                      onClick={() => setMobileAccordion((prev) => (prev === idx ? null : idx))}
                      className="flex w-full items-center justify-between gap-2 px-4 py-3.5 text-sm font-medium text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    >
                      <span className="flex items-center gap-2">
                        {item.icone && <MenuIcon name={item.icone} size={15} className="text-fg/60" />}
                        {item.label}
                      </span>
                      <svg
                        aria-hidden="true"
                        width="14"
                        height="14"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                        className={`transition-transform ${mobileAccordion === idx ? 'rotate-180' : ''}`}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </button>
                    {mobileAccordion === idx && (
                      <ul className="bg-muted/50 pl-4" role="list">
                        {item.children.map((child) => (
                          <li key={child.id}>
                            <a
                              href={child.href ?? '#'}
                              className="flex items-center gap-2 px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                              onClick={() => setMobileOpen(false)}
                              {...linkProps(child)}
                            >
                              {child.icone && <MenuIcon name={child.icone} size={14} className="shrink-0 text-fg/60" />}
                              <span className="text-sm font-medium text-fg">{child.label}</span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : item.tipo === 'grupo' ? (
                  <span className="flex items-center gap-2 px-4 py-3.5 text-sm font-semibold text-fg/50 uppercase tracking-wide">
                    {item.icone && <MenuIcon name={item.icone} size={14} />}
                    {item.label}
                  </span>
                ) : (
                  <a
                    href={item.href ?? '#'}
                    className="flex items-center gap-2 px-4 py-3.5 text-sm font-medium text-fg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onClick={() => setMobileOpen(false)}
                    {...linkProps(item)}
                  >
                    {item.icone && <MenuIcon name={item.icone} size={15} className="text-fg/60" />}
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>

          {/* Ouvidoria no rodapé do drawer */}
          <div className="border-t border-border p-4">
            <a
              href="/ouvidoria"
              className="flex w-full items-center justify-center gap-2 rounded bg-danger px-4 py-3 text-sm font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              onClick={() => setMobileOpen(false)}
            >
              Ouvidoria Municipal
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}
