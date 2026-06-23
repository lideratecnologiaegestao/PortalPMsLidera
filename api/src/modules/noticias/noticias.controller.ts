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
import { EscopoSecretariaService } from '../../common/escopo/escopo-secretaria.service';
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
 * ADR-0005 Fase 4: gestor/servidor só veem/editam notícias da SUA secretaria.
 */
@Controller('admin/noticias')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR)
@RequirePermissions('noticias.gerenciar')
export class NoticiasAdminController {
  constructor(
    private readonly service: NoticiasService,
    private readonly escopoSvc: EscopoSecretariaService,
  ) {}

  @Get()
  async listarAdmin(@Query() q: ListarNoticiasAdminQuery, @CurrentUser() user?: AuthUser) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const publicado =
      q.publicado === 'true' ? true : q.publicado === 'false' ? false : undefined;
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.listarAdmin({
      categoria: q.categoria,
      publicado,
      q: q.q,
      page,
      pageSize,
      escopoSecretariaId: escopo,
    });
  }

  @Get(':id')
  async buscar(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.buscarAdmin(id, escopo);
  }

  @Post()
  async criar(@Body() dto: CriarNoticiaDto, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.criar(dto, user?.sub, escopo);
  }

  @Put(':id')
  async atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarNoticiaDto,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.atualizar(id, dto, user?.sub, escopo);
  }

  @Delete(':id')
  async excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.excluir(id, user?.sub, escopo);
  }
}
