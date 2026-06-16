import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { LicitacoesService } from './licitacoes.service';
import { enviarExport } from '../../common/export/export.util';

const COLS = [
  { key: 'numero', label: 'Número' }, { key: 'ano', label: 'Ano' }, { key: 'modalidade', label: 'Modalidade' },
  { key: 'criterio', label: 'Critério' }, { key: 'objeto', label: 'Objeto' }, { key: 'situacao', label: 'Situação' },
  { key: 'orgao', label: 'Órgão' }, { key: 'abertura', label: 'Abertura' }, { key: 'valorEstimado', label: 'Valor estimado' }, { key: 'documentos', label: 'Documentos' },
];

/** Rotas públicas das licitações. Download conta + redireciona (nova aba no front). */
@Controller('licitacoes')
export class LicitacoesController {
  constructor(private readonly service: LicitacoesService) {}

  @Get('modalidades')
  modalidades() {
    return this.service.modalidadesEmUso();
  }

  @Get('baixar/:id')
  async baixar(@Param('id') id: string, @Res() res: Response) {
    const url = await this.service.registrarDownload(id);
    return res.redirect(302, url);
  }

  @Get()
  listar(
    @Query('modalidade') modalidade?: string,
    @Query('ano') ano?: string,
    @Query('situacao') situacao?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.service.listarPublico({
      modalidade, situacao, q,
      ano: ano ? Number(ano) : undefined,
      page: page ? Number(page) : undefined,
    });
  }

  @Get('export')
  async exportar(@Query('formato') formato: string | undefined, @Res() res: Response) {
    enviarExport(res, formato, 'licitacoes', await this.service.exportar(), COLS);
  }

  @Get(':slug')
  detalhe(@Param('slug') slug: string) {
    return this.service.porSlug(slug);
  }
}
