import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { ThemeService } from './theme.service';

@Controller('theme')
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  /** Público: o portal lê os tokens para renderizar (resolvido por tenant via RLS). */
  @Get()
  async get() {
    return this.theme.getTokens();
  }

  /** Admin do tenant: salva tema (bloqueia se reprovar no contraste WCAG). */
  @Put()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA)
  async save(@Body() body: unknown) {
    return this.theme.saveTokens(body);
  }

  /**
   * Preview: valida tokens (Zod + WCAG) SEM persistir.
   * Retorna { wcagOk, relatorio } para a UI mostrar feedback ao vivo.
   */
  @Post('preview')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA)
  async preview(@Body() body: unknown) {
    return this.theme.previewTokens(body);
  }

  /**
   * Lista os presets de tema disponíveis (resumo para preview na UI).
   * Restrito a ADMIN_PREFEITURA e GESTOR.
   */
  @Get('templates')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  listarTemplates() {
    return this.theme.listarTemplates();
  }

  /**
   * Aplica um preset ao tenant atual, preservando logo/favicon já configurados.
   * Valida WCAG (bloqueante). Audita TEMA_MODELO_APLICADO.
   */
  @Post('aplicar-modelo')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA)
  async aplicarModelo(
    @Body() body: { id: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.theme.aplicarModelo(body.id, user?.sub);
  }
}
