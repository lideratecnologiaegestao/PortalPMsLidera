import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Cache-Control para conteúdo público que muda pouco (dados abertos,
 * transparência, edições do Diário). Permite que a CDN (Cloudflare) e o
 * browser cacheiem na borda. Só aplica em GET — POST/PUT nunca são cacheados.
 * Ver ADR-0001 (camada D — CDN).
 */
@Injectable()
export class PublicCacheInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    if (req.method === 'GET') {
      const res = context.switchToHttp().getResponse();
      res.setHeader(
        'Cache-Control',
        'public, max-age=3600, stale-while-revalidate=86400',
      );
      // multi-tenant: a CDN deve variar o cache por Host (cada prefeitura é um
      // domínio) — sem isso, risco de servir dados do tenant A para o B.
      res.setHeader('Vary', 'Host');
    }
    return next.handle();
  }
}
