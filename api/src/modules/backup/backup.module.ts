import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_BACKUP } from '../queue/queue.constants';
import { BackupService } from './backup.service';
import { BackupScheduler } from './backup.scheduler';
import { BackupWorker } from './backup.worker';
import { BackupController } from './backup.controller';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';

/**
 * Backups automáticos (banco + storage) para o bucket MinIO `portal-backups`.
 * Agendamento por tique horário (frequência configurável no painel).
 */
@Module({
  imports: [PlatformSettingsModule, BullModule.registerQueue({ name: QUEUE_BACKUP })],
  controllers: [BackupController],
  providers: [BackupService, BackupScheduler, BackupWorker],
  exports: [BackupService],
})
export class BackupModule {}
