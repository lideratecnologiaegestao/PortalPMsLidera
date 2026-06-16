import { Module } from '@nestjs/common';
import { EnquetesController, EnquetesAdminController } from './enquetes.controller';
import { EnquetesService } from './enquetes.service';

/** Enquetes (poll) — voto anônimo, resultado em %, shortcode no slider da home. */
@Module({
  controllers: [EnquetesController, EnquetesAdminController],
  providers: [EnquetesService],
  exports: [EnquetesService],
})
export class EnquetesModule {}
