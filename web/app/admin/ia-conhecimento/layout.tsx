'use client';

/**
 * Layout compartilhado do módulo "IA — Base de Conhecimento".
 *
 * Renderiza o cabeçalho com abas de navegação:
 *   - Perguntas e Respostas  (/admin/ia-conhecimento/perguntas)
 *   - Artigos e Materiais    (/admin/ia-conhecimento/artigos)
 *
 * O PainelIndiceVetorial (reindexar / status) é exibido em ambas as abas,
 * pois indexa fontes de dados independentes do tipo de conteúdo.
 *
 * WCAG 2.1 AA: role="tablist", aria-selected, foco visível, navegação por teclado.
 */

import { usePathname } from 'next/navigation';
import Link from 'next/link';

const ABAS = [
  {
    href: '/admin/ia-conhecimento/perguntas',
    label: 'Perguntas e Respostas',
    descricao: 'Pares de pergunta e resposta para o bot priorizar',
  },
  {
    href: '/admin/ia-conhecimento/artigos',
    label: 'Artigos e Materiais',
    descricao: 'Textos livres que alimentam o RAG do assistente',
  },
] as const;

export default function IaConhecimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      {/* Cabeçalho do módulo */}
      <header>
        <h1 className="font-heading text-2xl font-bold">
          Assistente de IA — Base de Conhecimento
        </h1>
        <p className="mt-1 text-sm text-fg/70">
          Gerencie o conhecimento do assistente virtual. As duas fontes se complementam:
          pares de pergunta/resposta para respostas exatas e artigos livres para contexto
          amplo via busca semântica.
        </p>
      </header>

      {/* Abas de navegação */}
      <nav aria-label="Seções da base de conhecimento">
        <div
          role="tablist"
          aria-label="Tipo de conteúdo do conhecimento"
          className="flex gap-1 border-b border-border"
        >
          {ABAS.map((aba) => {
            const ativa =
              pathname === aba.href || pathname.startsWith(aba.href + '/');
            return (
              <Link
                key={aba.href}
                href={aba.href}
                role="tab"
                aria-selected={ativa}
                aria-label={aba.descricao}
                className={[
                  'inline-flex items-center gap-2 rounded-t px-4 py-2.5 text-sm font-semibold',
                  'transition-colors focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                  ativa
                    ? 'border-b-2 border-primary bg-primary/5 text-primary'
                    : 'text-fg/60 hover:bg-muted hover:text-fg',
                ].join(' ')}
              >
                {aba.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Conteúdo da aba ativa */}
      {children}
    </div>
  );
}
