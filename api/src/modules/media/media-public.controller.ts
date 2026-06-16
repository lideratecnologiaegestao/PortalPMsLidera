import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { aplicarHeadersSvgSeguro } from './media.types';
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
    const mime = contentType ?? (asset as any).mime;
    res.setHeader('Content-Type', mime);
    // hash imutável → cache forte; trocar o arquivo gera novo hash/URL
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

    // Controles de segurança para SVG (defesa em profundidade).
    // Mesmo que a sanitização tenha falhado em remover algum payload, o CSP
    // com sandbox e o Content-Disposition: attachment neutralizam a execução.
    // Ver media.types.ts → aplicarHeadersSvgSeguro para detalhes dos controles.
    if (mime === 'image/svg+xml') {
      const nomeBase = ((asset as any).nomeOriginal as string)
        .replace(/\.svg$/i, '')
        .replace(/["\r\n]/g, '');
      aplicarHeadersSvgSeguro(res, nomeBase);
    }

    stream.pipe(res);
  }
}
