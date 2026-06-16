import { SetMetadata } from '@nestjs/common';
import { PermissionKey } from './permissions.catalog';

export const PERMISSIONS_KEY = 'require_permissions';

/**
 * Declara quais permissões granulares são necessárias para acessar o endpoint.
 * Use em conjunto com PermissionsGuard (APÓS RolesGuard).
 *
 * Ex.: @RequirePermissions('noticias.gerenciar')
 */
export const RequirePermissions = (...keys: PermissionKey[]) =>
  SetMetadata(PERMISSIONS_KEY, keys);
