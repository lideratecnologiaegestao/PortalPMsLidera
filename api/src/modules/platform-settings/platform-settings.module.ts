import { Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';
import { PlatformConfigController } from './platform-config.controller';
import { BrandingController } from './branding.controller';
import { StorageService } from '../storage/storage.service';

/**
 * Config GLOBAL da plataforma (singleton): identidade "Desenvolvido por" (Lidera),
 * SMTP global de fallback e config de backups. PrismaService é global.
 * Exporta o service para o EmailService (fallback SMTP) e outros consumidores.
 */
@Module({
  controllers: [PlatformConfigController, BrandingController],
  providers: [PlatformSettingsService, StorageService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
