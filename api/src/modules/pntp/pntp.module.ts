import { Module } from '@nestjs/common';
import { PntpController } from './pntp.controller';
import { PntpService } from './pntp.service';

/** Conformidade PNTP/Atricon: índice por tenant, selo e bloqueantes. */
@Module({
  controllers: [PntpController],
  providers: [PntpService],
  exports: [PntpService],
})
export class PntpModule {}
