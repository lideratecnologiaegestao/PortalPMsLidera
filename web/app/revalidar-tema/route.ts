import { revalidateTag } from 'next/cache';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

/**
 * POST /revalidar-tema
 *
 * Invalida sob demanda o cache ISR do tema do tenant atual.
 * A tag usada aqui é exatamente a mesma gravada por getThemeData em
 * web/lib/theme.ts: `theme:<host>`.
 *
 * IMPORTANTE: o caminho NÃO é `/api/...` de propósito — o Nginx roteia `/api/`
 * para o backend NestJS (3001), então um handler Next sob `/api/` ficaria
 * inacessível. Sob `/revalidar-tema` o Nginx encaminha para o web (3000).
 *
 * Chamado pelo admin de tema após salvar com sucesso, garantindo que a
 * próxima renderização SSR do portal já veja o tema atualizado — sem
 * esperar o revalidate por tempo.
 *
 * Não requer autenticação própria porque só purga cache (nada é lido/escrito
 * no banco) e o efeito é antecipar uma revalidação que ocorreria em ≤30 s.
 */
export async function POST(): Promise<NextResponse> {
  const host = headers().get('host') ?? '';
  revalidateTag(`theme:${host}`);
  return NextResponse.json({ ok: true });
}
