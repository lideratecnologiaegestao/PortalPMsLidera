import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CampanhasService } from './campanhas.service';
import {
  AtualizarCampanhaDto,
  CriarCampanhaDto,
  InstalarPresetDto,
  SetStatusDto,
} from './campanhas.dto';

/** Extrai o userId do JWT injetado pelo JwtAuthGuard. */
function atorId(req: Request): string {
  return (req as unknown as { user?: { id?: string; sub?: string } }).user?.id ??
    (req as unknown as { user?: { id?: string; sub?: string } }).user?.sub ??
    'desconhecido';
}

/**
 * Painel admin de campanhas.
 * RBAC: GESTOR + ADMIN_PREFEITURA (SUPER_ADMIN sempre passa).
 * Rotas `_semear` restritas a SUPER_ADMIN.
 */
@Controller('admin/campanhas')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class CampanhasAdminController {
  constructor(private readonly service: CampanhasService) {}

  // ---------------------------------------------------------------------------
  // Biblioteca global (leitura)
  // ---------------------------------------------------------------------------

  /** GET /api/admin/campanhas/biblioteca — lista presets globais. */
  @Get('biblioteca')
  biblioteca() {
    return this.service.listarBiblioteca();
  }

  /** POST /api/admin/campanhas/instalar — instala preset no tenant. */
  @Post('instalar')
  instalar(@Body() dto: InstalarPresetDto, @Req() req: Request) {
    return this.service.instalarPreset(dto.templateKey, atorId(req));
  }

  // ---------------------------------------------------------------------------
  // Semeadura global (super_admin)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/admin/campanhas/_semear
   * Semeia / atualiza a biblioteca global de presets. Idempotente por key.
   * Restrito a SUPER_ADMIN.
   */
  @Post('_semear')
  @Roles(Role.SUPER_ADMIN)
  semear(@Req() req: Request) {
    return this.service.semearBiblioteca(atorId(req));
  }

  // ---------------------------------------------------------------------------
  // CRUD de campanhas do tenant
  // ---------------------------------------------------------------------------

  /** GET /api/admin/campanhas — lista campanhas do tenant. */
  @Get()
  listar() {
    return this.service.listar();
  }

  /** GET /api/admin/campanhas/:id */
  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.service.detalhe(id);
  }

  /** POST /api/admin/campanhas — cria campanha custom. */
  @Post()
  criar(@Body() dto: CriarCampanhaDto, @Req() req: Request) {
    return this.service.criar(dto, atorId(req));
  }

  /** PUT /api/admin/campanhas/:id — atualiza nome/datas/prioridade/config/recorrência. */
  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarCampanhaDto,
    @Req() req: Request,
  ) {
    return this.service.atualizar(id, dto, atorId(req));
  }

  /** PATCH /api/admin/campanhas/:id/status — liga/desliga campanha. */
  @Patch(':id/status')
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetStatusDto,
    @Req() req: Request,
  ) {
    return this.service.setStatus(id, dto.status, atorId(req));
  }

  /** DELETE /api/admin/campanhas/:id */
  @Delete(':id')
  excluir(@Param('id') id: string, @Req() req: Request) {
    return this.service.excluir(id, atorId(req));
  }
}
