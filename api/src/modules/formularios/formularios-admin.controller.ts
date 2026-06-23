/**
 * Controller administrativo do Construtor de Formulários.
 * RBAC: GESTOR | ADMIN_PREFEITURA + permissão formularios.gerenciar.
 * RLS automático via PrismaService (TenantContext).
 * ADR-0005 Fase 4: gestor/servidor só veem/editam formulários da SUA secretaria.
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { EscopoSecretariaService } from '../../common/escopo/escopo-secretaria.service';
import { CriarFormularioDto, AtualizarFormularioDto, PatchEnvioDto } from './formularios.dto';
import { FormulariosService } from './formularios.service';
import { exportarCsv, exportarXml, exportarXlsx } from './envios-export.util';
import { CampoSchema } from './formularios.types';

@Controller('admin/formularios')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
@RequirePermissions('formularios.gerenciar')
export class FormulariosAdminController {
  constructor(
    private readonly service: FormulariosService,
    private readonly escopoSvc: EscopoSecretariaService,
  ) {}

  // --------------------------------------------------------------------------
  // Formulários CRUD
  // --------------------------------------------------------------------------

  @Get()
  async listar(@CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.listar(escopo);
  }

  @Post()
  async criar(@Body() dto: CriarFormularioDto, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.criar(dto, escopo);
  }

  /**
   * Rota de download de anexo: literal ANTES de :id para não capturar 'anexo'.
   * GET /admin/formularios/anexo/:envioId/:idx
   */
  @Get('anexo/:envioId/:idx')
  async baixarAnexo(
    @Param('envioId') envioId: string,
    @Param('idx') idx: string,
    @Res() res: Response,
  ) {
    const { buffer, mime, nome } = await this.service.getAnexo(envioId, Number(idx));
    res.setHeader('Content-Type', mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(nome)}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(buffer);
  }

  @Get(':id')
  async obter(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.obterPorId(id, escopo);
  }

  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarFormularioDto,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.atualizar(id, dto, escopo);
  }

  @Delete(':id')
  async remover(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.remover(id, escopo);
  }

  // --------------------------------------------------------------------------
  // Export
  // --------------------------------------------------------------------------

  @Get(':id/export')
  async exportar(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('formato') formato?: string,
    @Query('q') q?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    const form = await this.service.obterPorId(id, escopo);
    const envios = await this.service.listarEnviosParaExport(id, { q, de, ate }, escopo);
    const schema = Array.isArray(form.schema)
      ? (form.schema as unknown as CampoSchema[])
      : [];
    const linhas = envios.map((e) => ({
      dados: (e.dados as Record<string, unknown>) ?? {},
      criadoEm: e.criadoEm,
    }));

    const fmt = (formato ?? 'csv').toLowerCase();
    if (fmt === 'xml') {
      return exportarXml(res, form.slug, schema, linhas);
    }
    if (fmt === 'xlsx') {
      return exportarXlsx(res, form.slug, schema, linhas);
    }
    return exportarCsv(res, form.slug, schema, linhas);
  }

  // --------------------------------------------------------------------------
  // Envios
  // --------------------------------------------------------------------------

  @Get(':id/envios')
  async listarEnvios(
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.listarEnvios(
      id,
      {
        q,
        de,
        ate,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      escopo,
    );
  }

  @Get(':id/envios/:envioId')
  async obterEnvio(
    @Param('id') id: string,
    @Param('envioId') envioId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.obterEnvio(id, envioId, escopo);
  }

  @Patch(':id/envios/:envioId')
  async atualizarEnvio(
    @Param('id') id: string,
    @Param('envioId') envioId: string,
    @Body() dto: PatchEnvioDto,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.atualizarEnvio(id, envioId, dto, escopo);
  }

  @Delete(':id/envios/:envioId')
  async removerEnvio(
    @Param('id') id: string,
    @Param('envioId') envioId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.removerEnvio(id, envioId, escopo);
  }
}
