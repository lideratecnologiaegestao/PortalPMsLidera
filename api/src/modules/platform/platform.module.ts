import { Module } from '@nestjs/common';
import { PlatformAuthController } from './platform-auth.controller';
import { PlatformTenantsController } from './platform-tenants.controller';
import { PlatformTenantConfigController } from './platform-tenant-config.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { ThemeModule } from '../theme/theme.module';
import { MenusModule } from '../menus/menus.module';
import { CloudflareModule } from '../cloudflare/cloudflare.module';
import { DocumentosModule } from '../documentos/documentos.module';
import { LicitacoesModule } from '../licitacoes/licitacoes.module';
import { ConselhosModule } from '../conselhos/conselhos.module';
import { ConcursosModule } from '../concursos/concursos.module';
import { ContratosModule } from '../contratos/contratos.module';
import { ConveniosModule } from '../convenios/convenios.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { IaModule } from '../ia/ia.module';
import { LgpdModule } from '../lgpd/lgpd.module';

/**
 * Módulo de plataforma (super_admin).
 * Disponível somente quando a requisição chega pelo PLATFORM_HOST ou pelo
 * path /_platform — o TenantMiddleware seta isPlatform=true nesses casos.
 *
 * Não importa PrismaModule/CacheModule pois ambos são globais (APP_MODULE).
 */
@Module({
  imports: [
    ThemeModule, MenusModule, CloudflareModule,
    DocumentosModule, LicitacoesModule, ConselhosModule, ConcursosModule, ContratosModule, ConveniosModule,
    WhatsappModule, IaModule, LgpdModule,
  ],
  controllers: [PlatformAuthController, PlatformTenantsController, PlatformTenantConfigController],
  providers: [TenantProvisioningService],
  exports: [TenantProvisioningService],
})
export class PlatformModule {}
