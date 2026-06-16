import type { ReactNode } from 'react';

/**
 * PADRÃO de espaçamento das páginas internas do portal.
 *
 * Toda página de conteúdo deve envolver seu conteúdo neste container (ou aplicar
 * as mesmas classes no elemento de topo): garante margem lateral consistente e
 * largura máxima centralizada, igual à página /secretarias.
 *
 *   default → conteúdo amplo (listas, tabelas, hubs)        max-w-7xl
 *   medio   → painéis / leitura média                        max-w-5xl
 *   estreito→ artigos / formulários largos                   max-w-3xl
 *   form    → formulários de login/cadastro/verificação      max-w-md
 *
 * Exceção: a HOME (`app/page.tsx`) é full-bleed (hero edge-to-edge) e NÃO usa
 * este container — suas seções têm o próprio `max-w-7xl px-4`.
 *
 * Uso: <PageContainer> … </PageContainer>  ou  <PageContainer largura="form"> … </PageContainer>
 */
const LARGURAS = {
  default: 'max-w-7xl',
  medio: 'max-w-5xl',
  estreito: 'max-w-3xl',
  form: 'max-w-md',
} as const;

export default function PageContainer({
  children,
  largura = 'default',
  className = '',
}: {
  children: ReactNode;
  largura?: keyof typeof LARGURAS;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full ${LARGURAS[largura]} px-4 py-8 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}
