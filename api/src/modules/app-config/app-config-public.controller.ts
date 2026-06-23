import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppConfigService } from './app-config.service';

/**
 * Endpoint PÚBLICO de configuração do App do Cidadão.
 *
 * Resolvido pelo Host da requisição (igual ao tema): o TenantMiddleware seta
 * o contexto RLS antes desta rota ser executada, portanto a query já fica
 * isolada ao tenant correto sem qualquer autenticação extra.
 *
 * Não expõe campos build-time/sigilosos: bundleId, easProjectId, easOwner,
 * apiUrl ficam SOMENTE no endpoint admin.
 */
@Controller('app-config')
export class AppConfigPublicController {
  constructor(private readonly service: AppConfigService) {}

  /**
   * GET /api/app-config
   * Cache curto (igual ao tema — ADR-0001, 600 s).
   * Sem autenticação: o cidadão/app lê na inicialização.
   */
  @Get()
  @Header('Cache-Control', 'public, max-age=600, s-maxage=600')
  getPublico() {
    return this.service.getPublico();
  }

  /**
   * GET /api/app-config/asset?key=app-config/icon/<uuid>/<hash>.png
   *
   * Proxy de assets de app (ícone/splash). Só aceita chaves do prefixo
   * "app-config/" — evita traversal para outros objetos do bucket.
   * Sem autenticação: o ícone/splash é intencionalmente público para o
   * pipeline de build EAS e para o app fazer download.
   *
   * Cache de longa duração (hash muda quando sobrescreve).
   */
  @Get('asset')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async asset(@Query('key') key: string | undefined, @Res() res: Response) {
    if (!key) throw new BadRequestException('Parâmetro "key" é obrigatório.');
    const { buffer, mime } = await this.service.getAsset(key);
    res.setHeader('Content-Type', mime || 'image/png');
    res.send(buffer);
  }
}
