/**
 * Seção Notícias da Home: 1 destaque + grade das últimas.
 * Server Component. Se API falhar: seção oculta (retorna null).
 * Tokens: bg-bg, text-fg, bg-muted/30, border-border.
 */

import type { Noticia } from '../../lib/portal-types';
import NoticiaCard from './NoticiaCard';
import SecaoTitulo, { VerTodos } from './SecaoTitulo';

interface Props {
  noticias: Noticia[];
}

export default function SecaoNoticias({ noticias }: Props) {
  if (noticias.length === 0) return null;

  const [destaque, ...demais] = noticias;

  return (
    <section aria-labelledby="noticias-titulo" className="bg-muted/30 py-14">
      <div className="mx-auto max-w-7xl px-4">
        <SecaoTitulo id="noticias-titulo">Últimas Notícias</SecaoTitulo>

        <div className="grid gap-5 lg:grid-cols-3">
          {/* Destaque — ocupa 1 coluna inteira no desktop */}
          <div className="lg:col-span-1">
            <NoticiaCard noticia={destaque} variant="destaque" />
          </div>

          {/* Grade das demais */}
          <div className="lg:col-span-2">
            <ul className="flex flex-col gap-3" aria-label="Mais notícias">
              {demais.slice(0, 5).map((n) => (
                <li key={n.id}>
                  <NoticiaCard noticia={n} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <VerTodos href="/noticias">Ver todas as notícias →</VerTodos>
      </div>
    </section>
  );
}
