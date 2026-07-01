import { Module } from '@nestjs/common';
import { AgendaAdminController, AgendaPublicController } from './agenda.controller';
import { AgendaService } from './agenda.service';

/**
 * Agenda Administrativa — calendário unificado: itens próprios (eventos,
 * reuniões, feriados, pontos facultativos, datas comemorativas, programações,
 * prazos) com recorrência anual, sobrepondo os eventos das secretarias
 * (read-only). Feed .ics público. RLS via this.prisma.db.
 */
@Module({
  controllers: [AgendaPublicController, AgendaAdminController],
  providers: [AgendaService],
  exports: [AgendaService],
})
export class AgendaModule {}
