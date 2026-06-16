import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { DiarioService } from './diario.service';

/**
 * Download do PDF da edição. Controller separado (sem PublicCacheInterceptor)
 * por servir conteúdo binário via streaming.
 */
@Controller('diario')
export class DiarioPdfController {
  constructor(private readonly service: DiarioService) {}

  @Get(':numero/pdf')
  async pdf(@Param('numero') numero: string, @Res() res: Response) {
    const { buffer, filename } = await this.service.pdfDaEdicao(numero);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(buffer);
  }
}
