import { Global, Module } from '@nestjs/common';
import { TurnstileService } from './turnstile.service';
import { TurnstileController } from './turnstile.controller';

/**
 * Módulo global de validação Cloudflare Turnstile.
 *
 * @Global → TurnstileService fica disponível para injeção em qualquer módulo
 * sem import explícito (LoginController, CidadaoAuthController, ComentariosModule…).
 */
@Global()
@Module({
  controllers: [TurnstileController],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class TurnstileModule {}
