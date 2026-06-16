import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NOTIFICACOES } from '../queue/queue.constants';
import { StorageService } from '../storage/storage.service';
import { FormulariosController } from './formularios.controller';
import { FormulariosAdminController } from './formularios-admin.controller';
import { FormulariosService } from './formularios.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NOTIFICACOES }),
  ],
  controllers: [FormulariosController, FormulariosAdminController],
  providers: [FormulariosService, StorageService],
  exports: [FormulariosService],
})
export class FormulariosModule {}
