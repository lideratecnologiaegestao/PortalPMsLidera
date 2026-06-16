import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { DocumentosService } from './documentos.service';
import { enviarExport } from '../../common/export/export.util';

const COLS_DOC = [
  { key: 'tipo', label: 'Tipo' }, { key: 'numero', label: 'Número' }, { key: 'ano', label: 'Ano' },
  { key: 'data', label: 'Data' }, { key: 'titulo', label: 'Título' }, { key: 'ementa', label: 'Ementa' },
  { key: 'orgao', label: 'Órgão' }, { key: 'situacao', label: 'Situação' }, { key: 'downloads', label: 'Downloads' },
];

/**
 * Rotas públicas dos cadastros de documentos. O download passa por
 * `/documentos/baixar/:id` que INCREMENTA o contador e redireciona (302) para o
 * arquivo na biblioteca de mídia — o link no front usa target=_blank (nova aba).
 */
@Controller('documentos')
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @Get('cadastros')
  cadastros() {
    return this.service.listarCadastros();
  }

  @Get('baixar/:id')
  async baixar(@Param('id') id: string, @Res() res: Response) {
    const url = await this.service.registrarDownload(id);
    return res.redirect(302, url);
  }

  /** Documento por id (público) — usado pela página de detalhe / buscador. */
  @Get('item/:id')
  item(@Param('id') id: string) {
    return this.service.obterDocumentoPublico(id);
  }

  @Get(':cadastroSlug/export')
  async exportar(@Param('cadastroSlug') s: string, @Query('formato') formato: string | undefined, @Res() res: Response) {
    const rows = await this.service.exportarPublico(s);
    enviarExport(res, formato, `documentos-${s}`, rows, COLS_DOC);
  }

  @Get(':cadastroSlug')
  async cadastro(
    @Param('cadastroSlug') cadastroSlug: string,
    @Query('tipo') tipo?: string,
    @Query('ano') ano?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    const cadastro = await this.service.cadastroPorSlug(cadastroSlug);
    const documentos = await this.service.listarPublico(cadastroSlug, {
      tipoSlug: tipo,
      ano: ano ? Number(ano) : undefined,
      q,
      page: page ? Number(page) : undefined,
    });
    return { cadastro, documentos };
  }
}
