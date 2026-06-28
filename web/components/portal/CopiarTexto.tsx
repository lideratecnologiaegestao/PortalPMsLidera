'use client';

import { useState } from 'react';

/**
 * Botão que copia um texto para a área de transferência (ex.: endereço de uma
 * unidade pública). Dá feedback visual curto. Client component — usado dentro de
 * páginas server (Server Components) sem quebrar o SSR.
 */
export default function CopiarTexto({ texto, rotulo = 'Copiar', className = '' }: { texto: string; rotulo?: string; className?: string }) {
  const [ok, setOk] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setOk(true);
      setTimeout(() => setOk(false), 1800);
    } catch {
      // Sem permissão de clipboard: ignora silenciosamente (o texto segue visível na tela).
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className={className || 'rounded bg-muted px-2 py-1 text-xs font-semibold text-fg/80 hover:bg-muted/70'}
      aria-label={`${rotulo}: ${texto}`}
    >
      {ok ? '✓ Copiado' : `📋 ${rotulo}`}
    </button>
  );
}
