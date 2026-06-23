import {
  Controller,
  Get,
  Header,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PwaService } from './pwa.service';

/** Mínimo e máximo aceitos para o parâmetro `size`. */
const SIZE_MIN = 48;
const SIZE_MAX = 1024;
const SIZE_DEFAULT = 192;

/**
 * Endpoint PÚBLICO de geração de ícone PWA por tenant.
 *
 * O tenant é resolvido automaticamente pelo Host da requisição via
 * TenantMiddleware (igual ao ThemeController).  Nenhum guard de auth
 * é aplicado — o browser precisa do ícone para instalar o PWA sem login.
 *
 * GET /api/pwa/icon?size=192&maskable=0
 */
@Controller('pwa')
export class PwaController {
  constructor(private readonly pwa: PwaService) {}

  @Get('icon')
  @Header('Content-Type', 'image/png')
  @Header('Cache-Control', 'public, max-age=3600')
  async icon(
    @Query('size') sizeRaw: string | undefined,
    @Query('maskable') maskableRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const size = this.clampSize(sizeRaw);
    const maskable = maskableRaw === '1';

    // Nunca lança 500 — PwaService.gerarIcone absorve todos os erros
    const buffer = await this.pwa.gerarIcone(size, maskable);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------

  /** Converte a query string para inteiro e aplica clamp [SIZE_MIN, SIZE_MAX]. */
  private clampSize(raw: string | undefined): number {
    const parsed = parseInt(raw ?? String(SIZE_DEFAULT), 10);
    if (!Number.isFinite(parsed)) return SIZE_DEFAULT;
    return Math.max(SIZE_MIN, Math.min(SIZE_MAX, parsed));
  }
}
