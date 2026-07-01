import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { MediaService } from './media.service';

/**
 * CRUD das taxonomias gerenciáveis da Biblioteca, consumido pelo hub
 * "Tipos e Taxonomias" (/admin/tipos):
 *   • Categorias de Mídia (media_categories) — agrupadas por Formato (enum).
 *   • Tipos de Mídia (media_tipos) — rótulo editável e opcional na mídia.
 *
 * Contrato espelha os demais cadastros do hub: list `/todas`, POST criar,
 * PUT/DELETE por id. Leitura para ADMIN/GESTOR/SERVIDOR; escrita ADMIN/GESTOR.
 * Rotas ficam sob /api/admin/midia (prefixo global 'api').
 */
@Controller('admin/midia')
@UseGuards(RolesGuard)
export class MediaTaxonomiasController {
  constructor(private readonly service: MediaService) {}

  // ---------------------------------------------------------- categorias
  @Get('categorias/todas')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  listarCategorias() {
    return this.service.listarCategoriasTodas();
  }

  @Post('categorias')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  criarCategoria(
    @Body() dto: { tipo: string; nome: string; descricao?: string; ativo?: boolean },
  ) {
    return this.service.criarCategoria(dto);
  }

  @Put('categorias/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  atualizarCategoria(
    @Param('id') id: string,
    @Body() dto: { nome?: string; tipo?: string; descricao?: string; ativo?: boolean },
  ) {
    return this.service.atualizarCategoria(id, dto);
  }

  @Delete('categorias/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  excluirCategoria(@Param('id') id: string) {
    return this.service.excluirCategoria(id);
  }

  // --------------------------------------------------------------- tipos
  @Get('tipos/todas')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  listarTipos() {
    return this.service.listarTiposTodas();
  }

  @Post('tipos')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  criarTipo(
    @Body()
    dto: { nome: string; descricao?: string; icone?: string; cor?: string; ordem?: number; ativo?: boolean },
  ) {
    return this.service.criarTipo(dto);
  }

  @Put('tipos/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  atualizarTipo(
    @Param('id') id: string,
    @Body()
    dto: {
      nome?: string;
      descricao?: string;
      icone?: string;
      cor?: string;
      ordem?: number;
      ativo?: boolean;
    },
  ) {
    return this.service.atualizarTipo(id, dto);
  }

  @Delete('tipos/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  excluirTipo(@Param('id') id: string) {
    return this.service.excluirTipo(id);
  }
}
