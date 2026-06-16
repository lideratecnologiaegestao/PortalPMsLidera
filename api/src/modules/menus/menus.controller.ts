import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { MenuLocal } from '@prisma/client';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarMenuItemDto, AtualizarMenuItemDto } from './menus.dto';
import { MenusService } from './menus.service';

const LOCAIS_VALIDOS: MenuLocal[] = ['cabecalho', 'rodape'];

function validarLocal(local?: string): MenuLocal {
  if (!local || !LOCAIS_VALIDOS.includes(local as MenuLocal)) {
    throw new BadRequestException(
      'Parâmetro "local" inválido. Use: cabecalho | rodape',
    );
  }
  return local as MenuLocal;
}

/** Leitura pública da árvore de menus ativos (portal). */
@Controller('menus')
export class MenusController {
  constructor(private readonly service: MenusService) {}

  /**
   * GET /api/menus?local=cabecalho|rodape
   * Retorna árvore de itens ATIVOS ordenada por `ordem`.
   */
  @Get()
  arvore(@Query('local') local?: string) {
    return this.service.arvorePublica(validarLocal(local));
  }
}

/** Gestão admin de menus. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/menus')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class MenusAdminController {
  constructor(private readonly service: MenusService) {}

  /**
   * GET /api/admin/menus/rotas
   * Rotas internas disponíveis para seleção no seletor de menu.
   * Deve vir ANTES de :id para não ser capturado pelo @Get(':id').
   */
  @Get('rotas')
  rotasInternas() {
    return this.service.rotasInternas();
  }

  /**
   * GET /api/admin/menus?local=cabecalho|rodape
   * Árvore completa (inclui inativos) para gerência.
   */
  @Get()
  arvoreAdmin(@Query('local') local?: string) {
    return this.service.arvoreAdmin(validarLocal(local));
  }

  /**
   * POST /api/admin/menus
   */
  @Post()
  criar(@Body() dto: CriarMenuItemDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  /**
   * PUT /api/admin/menus/:id
   */
  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarMenuItemDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  /**
   * DELETE /api/admin/menus/:id
   * Exclui o item; filhos caem por cascade FK no banco.
   */
  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
