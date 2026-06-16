import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConcursosService } from './concursos.service';
import { enviarExport } from '../../common/export/export.util';

const COLS = [
  { key: 'tipo', label: 'Tipo' }, { key: 'numero', label: 'Número' }, { key: 'ano', label: 'Ano' }, { key: 'objeto', label: 'Objeto' },
  { key: 'situacao', label: 'Situação' }, { key: 'orgao', label: 'Órgão' }, { key: 'banca', label: 'Banca' }, { key: 'documentos', label: 'Documentos' },
];

/** Rotas públicas dos concursos. Download conta + redireciona (nova aba no front). */
@Controller('concursos')
export class ConcursosController {
  constructor(private readonly service: ConcursosService) {}

  @Get('tipos')
  tipos() {
    return this.service.tiposEmUso();
  }

  @Get('baixar/:id')
  async baixar(@Param('id') id: string, @Res() res: Response) {
    const url = await this.service.registrarDownload(id);
    return res.redirect(302, url);
  }

  @Get()
  listar(@Query('tipo') tipo?: string, @Query('situacao') situacao?: string, @Query('ano') ano?: string, @Query('q') q?: string) {
    return this.service.listarPublico({ tipo, situacao, q, ano: ano ? Number(ano) : undefined });
  }

  @Get('export')
  async exportar(@Query('formato') formato: string | undefined, @Res() res: Response) {
    enviarExport(res, formato, 'concursos', await this.service.exportar(), COLS);
  }

  @Get(':slug')
  detalhe(@Param('slug') slug: string) {
    return this.service.porSlug(slug);
  }
}
