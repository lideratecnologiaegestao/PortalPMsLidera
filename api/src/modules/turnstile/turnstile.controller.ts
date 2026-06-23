import { Controller, Get } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';

/**
 * Endpoints públicos do Turnstile.
 * O frontend usa GET /api/turnstile/config para decidir se renderiza o widget.
 * Sem @Roles → rota pública (JwtAuthGuard é soft e não bloqueia rotas sem RBAC).
 */
@Controller('turnstile')
export class TurnstileController {
  constructor(private readonly turnstile: TurnstileService) {}

  /** Retorna {enabled, siteKey} — consumido pelo frontend para inicializar o widget. */
  @Get('config')
  config() {
    return this.turnstile.getConfig();
  }
}
