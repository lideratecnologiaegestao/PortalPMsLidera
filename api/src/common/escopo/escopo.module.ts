import { Global, Module } from '@nestjs/common';
import { EscopoSecretariaService } from './escopo-secretaria.service';

/**
 * Módulo global de escopo de secretaria (ADR-0005 Fase 4).
 * Disponibiliza EscopoSecretariaService em qualquer módulo sem importação explícita.
 * PrismaService já é global via PrismaModule.
 */
@Global()
@Module({
  providers: [EscopoSecretariaService],
  exports: [EscopoSecretariaService],
})
export class EscopoModule {}
