import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MediaService } from './media.service';

/**
 * Rota pública MASCARADA. Fica FORA do prefixo /api (ver exclude em main.ts):
 *   GET /midia/:tipo/:categoria/:arquivo
 *   ex.: /midia/imagem/logos/09h7789ahhdiochdpaueh.svg
 *
 * O backend resolve (tenant pelo Host + tipo + categoria + hash), confere que
 * a visibilidade é 'publico' e faz stream do objeto — o storage_key real nunca
 * é exposto. Só serve escopo 'publico'; restrito retorna 404.
 */
@Controller('midia')
export class MediaPublicController {
  constructor(private readonly service: MediaService) {}

  @Get(':tipo/:categoria/:arquivo')
  async servir(
    @Param('tipo') tipo: string,
    @Param('categoria') categoria: string,
    @Param('arquivo') arquivo: string,
    @Res() res: Response,
  ) {
    const { stream, contentType, asset } = await this.service.resolvePublico(
      tipo,
      categoria,
      arquivo,
    );
    res.setHeader('Content-Type', contentType ?? (asset as any).mime);
    // hash imutável → cache forte; trocar o arquivo gera novo hash/URL
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    stream.pipe(res);
  }
}
