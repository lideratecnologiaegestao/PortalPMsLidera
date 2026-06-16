import {
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
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import {
  CriarNoticiaDto,
  AtualizarNoticiaDto,
  ListarNoticiasQuery,
  ListarNoticiasAdminQuery,
} from './noticias.dto';
import { NoticiasService } from './noticias.service';

/** Leitura pública de notícias publicadas. */
@Controller('noticias')
export class NoticiasController {
  constructor(private readonly service: NoticiasService) {}

  @Get()
  listar(@Query() q: ListarNoticiasQuery) {
    return this.service.listarPublicas({
      categoria: q.categoria,
      q: q.q,
      page: Math.max(1, Number(q.page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(q.pageSize ?? 10))),
    });
  }

  @Get(':slug')
  porSlug(@Param('slug') slug: string) {
    return this.service.porSlugPublico(slug);
  }
}

/**
 * Gestão admin de notícias.
 * RBAC: GESTOR e ADMIN_PREFEITURA passam pelo papel.
 * SERVIDOR passa se um grupo conceder 'noticias.gerenciar'.
 */
@Controller('admin/noticias')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR)
@RequirePermissions('noticias.gerenciar')
export class NoticiasAdminController {
  constructor(private readonly service: NoticiasService) {}

  @Get()
  listarAdmin(@Query() q: ListarNoticiasAdminQuery) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const publicado =
      q.publicado === 'true' ? true : q.publicado === 'false' ? false : undefined;
    return this.service.listarAdmin({
      categoria: q.categoria,
      publicado,
      q: q.q,
      page,
      pageSize,
    });
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscarAdmin(id);
  }

  @Post()
  criar(@Body() dto: CriarNoticiaDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarNoticiaDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
