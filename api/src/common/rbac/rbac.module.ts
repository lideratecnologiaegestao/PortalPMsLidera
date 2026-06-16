import { Global, Module } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { PermissionsGuard } from './permissions.guard';

/**
 * Módulo global de RBAC granular.
 * Exporta PermissionsService e PermissionsGuard para uso em qualquer módulo.
 * PrismaService é disponível globalmente via PrismaModule (@Global).
 */
@Global()
@Module({
  providers: [PermissionsService, PermissionsGuard],
  exports: [PermissionsService, PermissionsGuard],
})
export class RbacModule {}
