import { ThemeTokens } from '../lib/theme';

/**
 * Rodapé institucional. Reúne os links obrigatórios de transparência ativa
 * e acesso à informação (LAI) e o selo de acessibilidade.
 */
export default function SiteFooter({ tokens }: { tokens: ThemeTokens }) {
  return (
    <footer id="rodape" className="mt-12 border-t border-border bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <nav aria-label="Links institucionais" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <a href="/acesso-a-informacao" className="hover:underline">
            Acesso à Informação
          </a>
          <a href="/transparencia" className="hover:underline">
            Portal da Transparência
          </a>
          <a href="/ouvidoria" className="hover:underline">
            Ouvidoria
          </a>
          <a href="/acessibilidade" className="hover:underline">
            Acessibilidade
          </a>
        </nav>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-fg/70">
          <span>{tokens.logo.alt} — todos os direitos reservados.</span>
          <span aria-label="Conformidade de acessibilidade">
            Acessível conforme WCAG 2.1 AA · e-MAG
          </span>
        </div>
      </div>
    </footer>
  );
}
