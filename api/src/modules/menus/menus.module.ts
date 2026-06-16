import { Module } from '@nestjs/common';
import { MenusController, MenusAdminController } from './menus.controller';
import { MenusService } from './menus.service';

/**
 * Menus dinâmicos por tenant.
 * - Leitura pública: GET /menus?local=cabecalho|rodape (árvore de ativos).
 * - Gestão admin: /admin/menus (RBAC: GESTOR, ADMIN_PREFEITURA).
 * - MenusService exportado para hooks em SecretariasModule, CmsModule e
 *   TenantProvisioningService.
 */
@Module({
  controllers: [MenusController, MenusAdminController],
  providers: [MenusService],
  exports: [MenusService],
})
export class MenusModule {}
