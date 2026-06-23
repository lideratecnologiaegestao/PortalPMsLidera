import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PntpModule } from '../pntp/pntp.module';

/**
 * Painel BI administrativo — agrega KPIs de todos os módulos em tempo real.
 * Importa PntpModule para reutilizar PntpService (índice de conformidade PNTP/Atricon).
 */
@Module({
  imports: [PntpModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
