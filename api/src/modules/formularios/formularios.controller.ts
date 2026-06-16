/**
 * Controller público do formulário.
 * JwtAuthGuard é "soft" (não bloqueia anônimos) — estas rotas são acessíveis
 * sem autenticação. O formulário com login_obrigatorio é validado no service.
 */
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { FormulariosService } from './formularios.service';

@Controller('formularios')
export class FormulariosController {
  constructor(private readonly service: FormulariosService) {}

  /** Definição pública do formulário (somente publicados). */
  @Get(':slug')
  getPublico(@Param('slug') slug: string) {
    return this.service.getPublico(slug);
  }

  /** Gera desafio CAPTCHA stateless. */
  @Get(':slug/captcha')
  captcha() {
    return this.service.captcha();
  }

  /**
   * Envio do formulário.
   * AnyFilesInterceptor captura todos os arquivos (nomes dinâmicos do schema).
   * Campos de texto chegam em @Body(), arquivos em @UploadedFiles().
   */
  @Post(':slug/enviar')
  @UseInterceptors(AnyFilesInterceptor())
  async enviar(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req: Request,
  ) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      '';
    const userAgent = (req.headers['user-agent'] as string) ?? '';

    return this.service.enviar(slug, body, files as any[], ip, userAgent);
  }
}
