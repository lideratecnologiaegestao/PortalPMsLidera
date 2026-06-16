import {
  BadRequestException, Body, Controller, Get, Post, Put,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { PlatformSettingsService } from './platform-settings.service';
import { SalvarPlatformGlobalDto } from './platform-settings.dto';
import { LGPD_PLACEHOLDERS } from '../lgpd/doc/lgpd-template.const';

/**
 * Configurações GLOBAIS da plataforma (Console Lidera) — só super_admin.
 * GET devolve mascarado (sem segredo em claro); PUT cifra a senha SMTP.
 */
@Controller('_platform/config')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlatformConfigController {
  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly storage: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /** Upload da logomarca da empresa (super_admin). Aparece no rodapé dos portais. */
  @Post('logo')
  @UseInterceptors(FileInterceptor('file'))
  async uploadLogo(@UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Envie a imagem no campo "file".');
    const mime = file.mimetype ?? '';
    if (!/^image\/(png|jpe?g|webp|svg\+xml)$/.test(mime)) {
      throw new BadRequestException('A logo deve ser PNG, JPG, WEBP ou SVG.');
    }
    if (file.buffer.length > 2 * 1024 * 1024) throw new BadRequestException('Logo muito grande (máx. 2 MB).');
    const key = await this.storage.put('branding', file.buffer, mime);
    await this.settings.setLogo(key, mime);
    return { logoUrl: '/api/branding/logo' };
  }

  @Get()
  get() {
    return this.settings.mascarada();
  }

  // ─── Template global da documentação LGPD ────────────────────────────────────
  /** Template + lista de placeholders (para a aba LGPD do Console). */
  @Get('lgpd-template')
  async getLgpdTemplate() {
    const t = await this.settings.getLgpdTemplate();
    return { ...t, placeholders: LGPD_PLACEHOLDERS };
  }

  /** Salva o template global (vazio volta ao padrão de código). */
  @Put('lgpd-template')
  async putLgpdTemplate(
    @Body() body: { template?: string | null },
    @CurrentUser() user: AuthUser,
  ) {
    await this.settings.setLgpdTemplate(body?.template ?? null, user?.id);
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: user?.id ?? null,
        acao: 'PLATFORM_LGPD_TEMPLATE',
        entidade: 'platform_settings',
        entidadeId: null,
        dados: { personalizado: !!(body?.template && body.template.trim()) },
      },
    });
    return this.settings.getLgpdTemplate();
  }

  @Put()
  async put(@Body() dto: SalvarPlatformGlobalDto, @CurrentUser() user: AuthUser) {
    const res = await this.settings.salvar(dto, user?.id);
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: user?.id ?? null,
        acao: 'PLATFORM_CONFIG_GLOBAL',
        entidade: 'platform_settings',
        entidadeId: null,
        dados: { camposAlterados: Object.keys(dto) },
      },
    });
    return res;
  }
}
