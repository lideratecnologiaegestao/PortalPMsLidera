import { SetMetadata } from '@nestjs/common';
import { Role } from './roles.enum';

export const ROLES_KEY = 'roles';

/** Restringe um endpoint às roles informadas. Ex.: @Roles(Role.OUVIDOR, Role.ADMIN_PREFEITURA) */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
