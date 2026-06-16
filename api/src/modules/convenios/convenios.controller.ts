import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ConveniosService } from './convenios.service';
import { enviarExport } from '../../common/export/export.util';

const COLS = [
  { key: 'numero', label: 'Número' }, { key: 'ano', label: 'Ano' }, { key: 'objeto', label: 'Objeto' },
  { key: 'concedente', label: 'Concedente' }, { key: 'convenente', label: 'Convenente' }, { key: 'valorRepasse', label: 'Repasse' },
  { key: 'contrapartida', label: 'Contrapartida' }, { key: 'situacao', label: 'Situação' }, { key: 'vigenciaInicio', label: 'Vig. início' },
  { key: 'vigenciaFim', label: 'Vig. fim' }, { key: 'orgao', label: 'Órgão' }, { key: 'documentos', label: 'Documentos' },
];

@Controller('convenios')
export class ConveniosController {
  constructor(private readonly service: ConveniosService) {}

  @Get('export')
  async exportar(@Query('formato') formato: string | undefined, @Res() res: Response) {
    enviarExport(res, formato, 'convenios', await this.service.exportar(), COLS);
  }

  @Get('baixar/:id')
  async baixar(@Param('id') id: string, @Res() res: Response) {
    return res.redirect(302, await this.service.registrarDownload(id));
  }
  @Get()
  listar(@Query('ano') ano?: string, @Query('situacao') situacao?: string, @Query('q') q?: string) {
    return this.service.listarPublico({ situacao, q, ano: ano ? Number(ano) : undefined });
  }
  @Get(':slug')
  detalhe(@Param('slug') slug: string) {
    return this.service.porSlug(slug);
  }
}
