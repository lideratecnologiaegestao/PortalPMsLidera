import { Global, Module } from '@nestjs/common';
import { SessionsService } from './sessions.service';
import { SessionsController } from './sessions.controller';
import { MinhasSesoesController } from './minhas-sessoes.controller';

/**
 * Modulo de sessoes stateful.
 *
 * Marcado como @Global para que o SessionsService seja injetavel em qualquer
 * modulo sem necessidade de importacao — em especial no JwtAuthGuard (que e
 * registrado como APP_GUARD no AppModule) e nos servicos de login.
 *
 * Dependencias externas: PrismaModule (@Global) e Redis (redisConnection
 * singleton importado diretamente em sessions.service.ts — mesma instancia
 * usada pelo BullMQ/CacheModule).
 *
 * NAO importa AuthModule para evitar dependencia circular:
 *   AppModule → JwtAuthGuard → SessionsService (SessionsModule)
 *   AuthModule → AuthService (nao depende de SessionsService no modulo)
 *   LoginController injeta SessionsService via construtor apos sessionsModule exportar o service.
 */
@Global()
@Module({
  controllers: [SessionsController, MinhasSesoesController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
