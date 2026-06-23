import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { AppConfigService } from './app-config.service';
import { AtualizarAppConfigDto } from './app-config.dto';

/**
 * Painel admin da config do App do Cidadão.
 *
 * Acesso: ADMIN_PREFEITURA (config runtime) + SUPER_ADMIN (config completa
 * incluindo bundleId / EAS / apiUrl). O bloqueio de campos restritos ao
 * super_admin é feito no service, não aqui.
 */
@Controller('admin/app-config')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class AppConfigAdminController {
  constructor(private readonly service: AppConfigService) {}

  /**
   * GET /api/admin/app-config
   * Config COMPLETA do tenant (inclui bundleId, easProjectId, easOwner, apiUrl)
   * mais iconUrl/splashUrl resolvidas via proxy.
   */
  @Get()
  getAdmin(@CurrentUser() _user: AuthUser) {
    return this.service.getAdmin();
  }

  /**
   * PATCH /api/admin/app-config
   * Atualiza campos enviados (ausentes mantêm o valor atual).
   * Campos exclusivos do super_admin (bundleId, apiUrl, easProjectId, easOwner)
   * lançam 403 se um admin_prefeitura tentar enviá-los.
   */
  @Patch()
  async patch(
    @Body() dto: AtualizarAppConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.atualizar(dto, user?.role ?? '');
    return this.service.getAdmin();
  }

  /**
   * POST /api/admin/app-config/icon
   * Upload do ícone do app (campo multipart: "file").
   * Requisitos: PNG exato 1024×1024 px. Rejeita com 400 mensagem clara.
   */
  @Post('icon')
  @UseInterceptors(FileInterceptor('file'))
  async uploadIcone(@UploadedFile() file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie a imagem no campo "file".');
    }
    const url = await this.service.uploadIcone({
      buffer: file.buffer,
      mimetype: file.mimetype ?? '',
      size: file.size ?? file.buffer.length,
    });
    return { url };
  }

  /**
   * POST /api/admin/app-config/splash
   * Upload da imagem de splash (campo multipart: "file").
   * Requisito: PNG. Dimensões livres (splash pode variar por plataforma).
   */
  @Post('splash')
  @UseInterceptors(FileInterceptor('file'))
  async uploadSplash(@UploadedFile() file: { buffer?: Buffer; mimetype?: string; size?: number } | undefined) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie a imagem no campo "file".');
    }
    const url = await this.service.uploadSplash({
      buffer: file.buffer,
      mimetype: file.mimetype ?? '',
      size: file.size ?? file.buffer.length,
    });
    return { url };
  }
}
