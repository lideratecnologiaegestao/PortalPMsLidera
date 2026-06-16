import { Controller, Get, Header, NotFoundException, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PlatformSettingsService } from './platform-settings.service';
import { StorageService } from '../storage/storage.service';

/**
 * Branding PÚBLICO "Desenvolvido por" (Lidera) — usado no rodapé de qualquer
 * tenant. Sem auth, sem segredo. O crédito é o mesmo em toda a plataforma.
 */
@Controller('branding')
export class BrandingController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  get() {
    return this.settings.brandingPublico();
  }

  /** Serve a logomarca da empresa (imagem). Público, cacheável. */
  @Get('logo')
  @Header('Cache-Control', 'public, max-age=600')
  async logo(@Res() res: Response) {
    const info = await this.settings.getLogo();
    if (!info) throw new NotFoundException('Sem logomarca.');
    const { buffer, mime } = await this.storage.get(info.key);
    res.setHeader('Content-Type', info.mime || mime || 'image/png');
    res.send(buffer);
  }
}
