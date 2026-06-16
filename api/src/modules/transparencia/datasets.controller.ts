import {
  Controller,
  Get,
  Header,
  Param,
  Query,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { PublicCacheInterceptor } from '../../common/http/public-cache.interceptor';
import { DatasetsService, ConsultaDataset } from './datasets.service';
import { toCsv } from './csv.util';

/**
 * Endpoints genéricos dos datasets PNTP (diárias, obras, dívida ativa,
 * terceirizados, convênios, licitações, contratos, documentos). Cada um expõe
 * os 5 itens de verificação: listagem (disponibilidade), filtro, série
 * histórica (exercício), download CSV/JSON (dados abertos) e atualidade
 * (última sincronização). Tudo público, isolado por RLS pelo Host.
 */
@Controller('transparencia/dataset')
@UseInterceptors(PublicCacheInterceptor)
export class DatasetsController {
  constructor(private readonly service: DatasetsService) {}

  private parse(q: Record<string, string>): ConsultaDataset {
    return {
      ano: q.ano ? Number(q.ano) : undefined,
      categoria: q.categoria,
      situacao: q.situacao,
      vinculo: q.vinculo,
      tipo: q.tipo,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
  }

  @Get(':key')
  listar(@Param('key') key: string, @Query() q: Record<string, string>) {
    return this.service.listar(key, this.parse(q));
  }

  @Get(':key/json')
  json(@Param('key') key: string, @Query() q: Record<string, string>) {
    return this.service.exportar(key, this.parse(q));
  }

  @Get(':key/csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async csv(
    @Param('key') key: string,
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.service.exportar(key, this.parse(q));
    res.setHeader('Content-Disposition', `attachment; filename="${key}.csv"`);
    res.send(toCsv(rows as unknown as Record<string, unknown>[]));
  }
}
