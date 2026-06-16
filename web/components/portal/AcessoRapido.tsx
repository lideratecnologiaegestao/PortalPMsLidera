/**
 * Acesso Rápido — configurável pelo /admin/home:
 *  - 1 ou 2 colunas;
 *  - em 1 coluna: 4 a 6 cards por linha;
 *  - em 2 colunas: cards de um lado, slider (imagem/HTML/vídeo/YouTube/enquete)
 *    do lado oposto.
 * Cards no estilo institucional (ícone que preenche no hover, card elevando),
 * dirigidos por tokens do tema + ajustes (forma do ícone, cor de destaque).
 * Server Component — recebe config + atalhos do SSR (lib/portal-api getHome).
 */

import type { HomeAtalho, HomeConfig } from '../../lib/portal-types';
import AtalhoIcone from './AtalhoIcone';
import AcessoRapidoSlider from './AcessoRapidoSlider';
import SecaoTitulo, { VerTodos } from './SecaoTitulo';

const ATALHOS_PADRAO: HomeAtalho[] = [
  { id: 'd1', label: 'Portal da Transparência', descricao: 'Despesas, receitas e folha', href: '/transparencia', icone: 'transparencia', ordem: 0, ativo: true },
  { id: 'd2', label: 'Carta de Serviços', descricao: 'Todos os serviços disponíveis', href: '/servicos', icone: 'servicos', ordem: 1, ativo: true },
  { id: 'd3', label: 'e-SIC', descricao: 'Acesso à informação — Lei 12.527', href: '/esic', icone: 'esic', ordem: 2, ativo: true },
  { id: 'd4', label: 'Ouvidoria', descricao: 'Reclamações, sugestões e denúncias', href: '/ouvidoria', icone: 'ouvidoria', ordem: 3, ativo: true },
  { id: 'd5', label: 'Diário Oficial', descricao: 'Publicações e atos oficiais', href: '/diario', icone: 'diario', ordem: 4, ativo: true },
  { id: 'd6', label: 'Dados Abertos', descricao: 'Conjuntos de dados para reúso', href: '/transparencia/dados-abertos', icone: 'dados', ordem: 5, ativo: true },
];

const COLS: Record<number, string> = { 4: 'lg:grid-cols-4', 5: 'lg:grid-cols-5', 6: 'lg:grid-cols-6' };

export default function AcessoRapido({
  config,
  atalhos,
}: {
  config?: HomeConfig | null;
  atalhos?: HomeAtalho[];
}) {
  const itens = atalhos && atalhos.length > 0 ? atalhos : ATALHOS_PADRAO;
  const cor = config?.cardCorDestaque || null;
  const formaCirculo = (config?.cardIconeForma ?? 'circulo') !== 'quadrado';
  const duasColunas = config?.arColunas === 2;
  const cardsLinha = Math.min(6, Math.max(4, config?.arCardsLinha ?? 4));
  const cardsEsquerda = (config?.arLadoCards ?? 'esquerda') !== 'direita';

  function Card({ a }: { a: HomeAtalho }) {
    const formaCls = formaCirculo ? 'rounded-full' : 'rounded-lg';
    return (
      <a
        href={a.href}
        aria-label={a.descricao ? `${a.label} — ${a.descricao}` : a.label}
        className="group flex flex-col items-center gap-3 rounded-xl border border-border bg-bg p-6 text-center shadow-sm transition-all duration-300 hover:-translate-y-2 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span
          aria-hidden="true"
          className={`flex h-16 w-16 items-center justify-center ${formaCls} transition-colors duration-300 ${
            cor ? 'group-hover:!bg-primary group-hover:!text-primary-fg' : 'bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-fg'
          }`}
          style={cor ? { backgroundColor: `${cor}1A`, color: cor } : undefined}
        >
          <AtalhoIcone nome={a.icone} />
        </span>
        <span className="font-heading text-base font-bold leading-tight" style={cor ? { color: cor } : undefined}>
          <span className={cor ? '' : 'text-primary'}>{a.label}</span>
        </span>
        {a.descricao && <span className="text-xs leading-relaxed text-fg/60">{a.descricao}</span>}
      </a>
    );
  }

  return (
    <section aria-labelledby="acesso-rapido-titulo" className="bg-muted/30 py-14">
      <div className="mx-auto max-w-7xl px-4">
        <SecaoTitulo id="acesso-rapido-titulo">Serviços e Acesso Rápido</SecaoTitulo>

        {duasColunas ? (
          <div className="grid items-stretch gap-6 lg:grid-cols-2">
            <div className={`grid grid-cols-2 gap-4 ${cardsEsquerda ? 'lg:order-1' : 'lg:order-2'}`}>
              {itens.map((a) => <Card key={a.id} a={a} />)}
            </div>
            <div className={cardsEsquerda ? 'lg:order-2' : 'lg:order-1'}>
              {config && <AcessoRapidoSlider config={config} />}
            </div>
          </div>
        ) : (
          <div className={`grid grid-cols-2 gap-5 sm:grid-cols-3 ${COLS[cardsLinha] ?? 'lg:grid-cols-4'}`}>
            {itens.map((a) => <Card key={a.id} a={a} />)}
          </div>
        )}

        <VerTodos href="/servicos">Ver todos os serviços →</VerTodos>
      </div>
    </section>
  );
}
