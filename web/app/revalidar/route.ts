import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * POST /revalidar?tag=<tag>
 *
 * Invalida sob demanda o cache ISR de um conteúdo administrável do tenant atual,
 * para que a próxima renderização SSR já mostre o dado recém-salvo — sem esperar
 * o revalidate por tempo (120 s).
 *
 * Invalida tanto a tag global quanto a versão por host (`<tag>:<host>`), cobrindo
 * os fetchers que usam uma ou ambas. Só purga cache (nada é lido/escrito no
 * banco), por isso não exige autenticação própria; a lista de tags é restrita.
 *
 * IMPORTANTE: caminho fora de `/api/` de propósito — o Nginx roteia `/api/` para
 * o backend (3001); sob `/revalidar` o Nginx encaminha para o web (3000).
 *
 * Chamado pelo admin após salvar/excluir. Para adicionar um módulo, basta
 * incluir a tag em PERMITIDAS e usar a mesma tag no fetcher (lib/portal-api.ts).
 */
const PERMITIDAS = new Set([
  'prefeitos', 'secretarias', 'estrutura', 'noticias', 'banners',
  'cms-paginas', 'home', 'menus', 'galeria', 'servicos',
]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  const host = headers().get('host') ?? '';
  const tag = new URL(req.url).searchParams.get('tag') ?? '';
  if (!PERMITIDAS.has(tag)) {
    return NextResponse.json({ ok: false, erro: 'tag não permitida' }, { status: 400 });
  }
  revalidateTag(tag);
  revalidateTag(`${tag}:${host}`);
  return NextResponse.json({ ok: true, tag, host });
}
