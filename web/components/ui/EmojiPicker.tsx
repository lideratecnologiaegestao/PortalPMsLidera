'use client';

/**
 * Seletor de emojis — popover acessível com conjunto curado (~50 emojis).
 * Sem dependência externa: lista estática.
 * WCAG 2.1 AA: botão com aria-label, popover role="dialog", ESC fecha,
 * navegação por teclado (setas + Home/End no grid), foco gerenciado.
 *
 * Props:
 *   onSelect(emoji: string) — chamado ao clicar num emoji
 *   disabled? — desabilita o botão trigger
 */

import { useEffect, useId, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Conjunto curado de emojis em categorias
// ---------------------------------------------------------------------------

const EMOJI_GRUPOS: { label: string; emojis: string[] }[] = [
  {
    label: 'Rostos',
    emojis: [
      '😀', '😊', '😄', '😁', '😅', '😂', '🤣',
      '😍', '🥰', '😎', '😐', '😕', '😢', '😭',
      '😡', '😤', '🤔', '🙄', '😴', '🥳',
    ],
  },
  {
    label: 'Gestos',
    emojis: [
      '👍', '👎', '👏', '🙏', '🤝', '✌️', '👋',
      '🤙', '💪', '🙌', '👌', '🤞',
    ],
  },
  {
    label: 'Símbolos',
    emojis: [
      '✅', '❌', '⚠️', '❗', '❓', '💡', '🔔',
      '📌', '📎', '🔗', '📋', '🗒️',
    ],
  },
  {
    label: 'Objetos',
    emojis: [
      '📞', '📧', '📅', '🏠', '🚗', '🏥', '🏫',
      '💳', '📄', '🔑', '⏰', '📍',
    ],
  },
];

const TODOS = EMOJI_GRUPOS.flatMap((g) => g.emojis);

// ---------------------------------------------------------------------------

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export default function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const dialogId = `emoji-dialog-${id}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  // índice focado dentro do grid plano
  const [focusIdx, setFocusIdx] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);

  // Posição do popover (renderizado em portal no body para escapar do
  // `overflow-hidden`/empilhamento do painel do chat, que antes o recortava).
  const [pos, setPos] = useState<{ bottom: number; right: number } | null>(null);

  // Calcula a posição a partir do trigger ao abrir (e em resize/scroll).
  useEffect(() => {
    if (!aberto) return;
    function recalcular() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      // Abre ACIMA do botão, alinhado à direita do trigger.
      setPos({
        bottom: window.innerHeight - r.top + 8,
        right: Math.max(8, window.innerWidth - r.right),
      });
    }
    recalcular();
    window.addEventListener('resize', recalcular);
    window.addEventListener('scroll', recalcular, true);
    return () => {
      window.removeEventListener('resize', recalcular);
      window.removeEventListener('scroll', recalcular, true);
    };
  }, [aberto]);

  // Fecha ao clicar fora (considera o popover em portal, fora do container).
  useEffect(() => {
    if (!aberto) return;
    function handler(e: MouseEvent) {
      const alvo = e.target as Node;
      if (
        !containerRef.current?.contains(alvo) &&
        !popoverRef.current?.contains(alvo)
      ) {
        setAberto(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [aberto]);

  // ESC fecha e devolve foco ao trigger
  useEffect(() => {
    if (!aberto) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAberto(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [aberto]);

  // Foca o botão do grid quando abre
  useEffect(() => {
    if (!aberto) return;
    setFocusIdx(0);
    // Aguarda render do popover
    requestAnimationFrame(() => {
      const first = gridRef.current?.querySelector<HTMLButtonElement>('[data-emoji-btn]');
      first?.focus();
    });
  }, [aberto]);

  function handleKeyDownGrid(e: React.KeyboardEvent<HTMLDivElement>) {
    const COLS = 8; // colunas no grid
    const total = TODOS.length;
    let next = focusIdx;

    if (e.key === 'ArrowRight') { e.preventDefault(); next = (focusIdx + 1) % total; }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); next = (focusIdx - 1 + total) % total; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); next = Math.min(focusIdx + COLS, total - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); next = Math.max(focusIdx - COLS, 0); }
    else if (e.key === 'Home') { e.preventDefault(); next = 0; }
    else if (e.key === 'End') { e.preventDefault(); next = total - 1; }
    else return;

    setFocusIdx(next);
    const btns = gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-emoji-btn]');
    btns?.[next]?.focus();
  }

  function handleSelect(emoji: string) {
    onSelect(emoji);
    setAberto(false);
    triggerRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Botão trigger */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label="Inserir emoji"
        aria-expanded={aberto}
        aria-controls={dialogId}
        onClick={() => setAberto((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded text-lg leading-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 transition-colors"
      >
        <span aria-hidden="true">😊</span>
      </button>

      {/* Popover — posição FIXA (relativa à viewport) para não ser recortado
          pelo `overflow-hidden` do painel do chat nem ficar atrás das mensagens.
          Um filho `position: fixed` escapa do overflow do ancestral (que não tem
          transform), dispensando portal/@types/react-dom. */}
      {aberto && pos && (
        <div
          ref={popoverRef}
          id={dialogId}
          role="dialog"
          aria-label="Seletor de emojis"
          aria-modal="true"
          style={{ position: 'fixed', bottom: pos.bottom, right: pos.right, zIndex: 60 }}
          className="w-72 rounded-lg border border-border bg-bg p-3 shadow-xl"
        >
          {/* Grid por categoria */}
          <div
            ref={gridRef}
            onKeyDown={handleKeyDownGrid}
            className="space-y-2"
          >
            {(() => {
              let globalIdx = 0;
              return EMOJI_GRUPOS.map((grupo) => (
                <div key={grupo.label}>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-fg/50">
                    {grupo.label}
                  </p>
                  <div className="flex flex-wrap gap-0.5">
                    {grupo.emojis.map((emoji) => {
                      const idx = globalIdx++;
                      return (
                        <button
                          key={emoji}
                          type="button"
                          data-emoji-btn
                          tabIndex={focusIdx === idx ? 0 : -1}
                          aria-label={emoji}
                          onClick={() => handleSelect(emoji)}
                          className="flex h-8 w-8 items-center justify-center rounded text-lg leading-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary transition-colors"
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
