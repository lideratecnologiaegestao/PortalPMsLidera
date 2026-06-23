import { Module } from '@nestjs/common';
import { PwaController } from './pwa.controller';
import { PwaService } from './pwa.service';
import { StorageService } from '../storage/storage.service';
import { ThemeModule } from '../theme/theme.module';

/**
 * Módulo de geração de ícone PWA por tenant.
 *
 * Endpoint público: GET /api/pwa/icon?size=192&maskable=0
 *
 * Dependências:
 *  - PrismaService  → global (PrismaModule no AppModule)
 *  - StorageService → fornecido localmente (igual ao AppConfigModule)
 *  - ThemeService   → importado via ThemeModule (já exporta ThemeService)
 */
@Module({
  imports: [ThemeModule],
  controllers: [PwaController],
  providers: [PwaService, StorageService],
})
export class PwaModule {}
