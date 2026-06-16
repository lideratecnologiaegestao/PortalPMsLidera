import { Module } from '@nestjs/common';
import { GruposController } from './grupos.controller';
import { GruposService } from './grupos.service';

/**
 * Módulo de gerenciamento de grupos de acesso granular.
 * PrismaService disponível via PrismaModule (@Global).
 * PermissionsGuard disponível via RbacModule (@Global).
 */
@Module({
  controllers: [GruposController],
  providers: [GruposService],
  exports: [GruposService],
})
export class GruposModule {}
