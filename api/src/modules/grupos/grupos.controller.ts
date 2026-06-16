import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarGrupoDto, AtualizarGrupoDto, AdicionarMembroDto } from './grupos.dto';
import { GruposService } from './grupos.service';

/**
 * CRUD de grupos de acesso (permissões granulares por tenant).
 * RBAC: restrito a ADMIN_PREFEITURA.
 * PermissionsGuard + @RequirePermissions define o padrão para futura delegação.
 *
 * RLS garante isolamento: o admin só vê/edita grupos do seu próprio tenant.
 */
@Controller('admin/grupos')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.ADMIN_PREFEITURA)
@RequirePermissions('grupos.gerenciar')
export class GruposController {
  constructor(private readonly service: GruposService) {}

  /** GET /admin/grupos — lista grupos do tenant com contagem de membros. */
  @Get()
  listar() {
    return this.service.listar();
  }

  /**
   * GET /admin/grupos/catalogo — catálogo de permissões agrupado por módulo.
   * Rota literal declarada ANTES de :id para evitar conflito de roteamento.
   */
  @Get('catalogo')
  catalogo() {
    return this.service.catalogo();
  }

  /** GET /admin/grupos/:id — grupo com lista de membros. */
  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  /** POST /admin/grupos — cria grupo. */
  @Post()
  criar(@Body() dto: CriarGrupoDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  /** PUT /admin/grupos/:id — atualiza grupo. */
  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarGrupoDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  /** DELETE /admin/grupos/:id — exclui grupo (cascade remove membros). */
  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }

  /** POST /admin/grupos/:id/membros — adiciona membro ao grupo. Idempotente. */
  @Post(':id/membros')
  adicionarMembro(
    @Param('id') id: string,
    @Body() dto: AdicionarMembroDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.adicionarMembro(id, dto.userId, user?.sub);
  }

  /** DELETE /admin/grupos/:id/membros/:userId — remove membro do grupo. */
  @Delete(':id/membros/:userId')
  removerMembro(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.removerMembro(id, userId, user?.sub);
  }
}
