/**
 * Controller administrativo do Construtor de Formulários.
 * RBAC: GESTOR | ADMIN_PREFEITURA + permissão formularios.gerenciar.
 * RLS automático via PrismaService (TenantContext).
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
import { CriarFormularioDto, AtualizarFormularioDto, PatchEnvioDto } from './formularios.dto';
import { FormulariosService } from './formularios.service';
import { exportarCsv, exportarXml, exportarXlsx } from './envios-export.util';
import { CampoSchema } from './formularios.types';

@Controller('admin/formularios')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
@RequirePermissions('formularios.gerenciar')
export class FormulariosAdminController {
  constructor(private readonly service: FormulariosService) {}

  // --------------------------------------------------------------------------
  // Formulários CRUD
  // --------------------------------------------------------------------------

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@Body() dto: CriarFormularioDto) {
    return this.service.criar(dto);
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
  obter(@Param('id') id: string) {
    return this.service.obterPorId(id);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarFormularioDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete(':id')
  remover(@Param('id') id: string) {
    return this.service.remover(id);
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
  ) {
    const form = await this.service.obterPorId(id);
    const envios = await this.service.listarEnviosParaExport(id, { q, de, ate });
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
  listarEnvios(
    @Param('id') id: string,
    @Query('q') q?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarEnvios(id, {
      q,
      de,
      ate,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id/envios/:envioId')
  obterEnvio(@Param('id') id: string, @Param('envioId') envioId: string) {
    return this.service.obterEnvio(id, envioId);
  }

  @Patch(':id/envios/:envioId')
  atualizarEnvio(
    @Param('id') id: string,
    @Param('envioId') envioId: string,
    @Body() dto: PatchEnvioDto,
  ) {
    return this.service.atualizarEnvio(id, envioId, dto);
  }

  @Delete(':id/envios/:envioId')
  removerEnvio(@Param('id') id: string, @Param('envioId') envioId: string) {
    return this.service.removerEnvio(id, envioId);
  }
}
