import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConselhosService } from './conselhos.service';
import { enviarExport } from '../../common/export/export.util';

const COLS = [
  { key: 'tipo', label: 'Tipo' }, { key: 'nome', label: 'Nome' }, { key: 'sigla', label: 'Sigla' },
  { key: 'leiCriacao', label: 'Lei de criação' }, { key: 'mandatoInicio', label: 'Mandato início' }, { key: 'mandatoFim', label: 'Mandato fim' },
  { key: 'email', label: 'E-mail' }, { key: 'membros', label: 'Membros' }, { key: 'documentos', label: 'Documentos' },
];

/** Rotas públicas dos conselhos. Download conta + redireciona (nova aba no front). */
@Controller('conselhos')
export class ConselhosController {
  constructor(private readonly service: ConselhosService) {}

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
  listar(@Query('tipo') tipo?: string, @Query('q') q?: string) {
    return this.service.listarPublico({ tipo, q });
  }

  @Get('export')
  async exportar(@Query('formato') formato: string | undefined, @Res() res: Response) {
    enviarExport(res, formato, 'conselhos', await this.service.exportar(), COLS);
  }

  @Get(':slug')
  detalhe(@Param('slug') slug: string) {
    return this.service.porSlug(slug);
  }
}
