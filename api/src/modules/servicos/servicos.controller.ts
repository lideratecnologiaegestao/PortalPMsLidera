import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Ip,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  AtualizarServicoDto,
  CriarServicoDto,
  ListarServicosAdminQuery,
} from './servicos.dto';
import { ServicosService } from './servicos.service';

/** IP real do cliente: 1º item do X-Forwarded-For (nginx/Cloudflare) ou socket. */
function clientIp(xff: string | undefined, ip: string): string {
  return xff?.split(',')[0]?.trim() || ip || '';
}

/**
 * Rotas públicas de serviços municipais. Isolamento por RLS (tenant via Host).
 * Apenas serviços `publicado=true` são expostos.
 */
@Controller('servicos')
export class ServicosController {
  constructor(private readonly service: ServicosService) {}

  @Get()
  listarPublicos(
    @Query('categoria') categoria?: string,
    @Query('destaque') destaque?: string,
    @Query('publicoAlvo') publicoAlvo?: string,
  ) {
    return this.service.listarPublicos(categoria, destaque === 'true', publicoAlvo);
  }

  /** Serviços mais avaliados (literal antes de :slug). */
  @Get('mais-avaliados')
  maisAvaliados() {
    return this.service.maisAvaliados();
  }

  @Get(':slug')
  porSlug(@Param('slug') slug: string) {
    return this.service.porSlugPublico(slug);
  }

  /** Estado da avaliação por estrelas (anônimo). */
  @Get(':slug/avaliacao')
  getAvaliacao(
    @Param('slug') slug: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.service.getAvaliacao(slug, clientIp(xff, ip), ua ?? '');
  }

  /** Avalia o serviço (1–5 estrelas), 1 voto por visitante. */
  @Post(':slug/avaliar')
  avaliar(
    @Param('slug') slug: string,
    @Body() body: { nota: number; comentario?: string },
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.service.avaliar(slug, body?.nota, clientIp(xff, ip), ua ?? '', body?.comentario);
  }
}

/**
 * Gestão admin de serviços. RBAC: GESTOR, ADMIN_PREFEITURA.
 * Segunda camada (RLS) isola dados por tenant automaticamente.
 */
@Controller('admin/servicos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ServicosAdminController {
  constructor(private readonly service: ServicosService) {}

  @Get()
  listarAdmin(@Query() q: ListarServicosAdminQuery) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const publicado =
      q.publicado === 'true' ? true : q.publicado === 'false' ? false : undefined;
    return this.service.listarAdmin({
      categoria: q.categoria,
      publicado,
      q: q.q,
      publicoAlvo: q.publicoAlvo,
      page,
      pageSize,
    });
  }

  /** Carrega o modelo padrão de serviços (idempotente). */
  @Post('seed-modelo')
  seedModelo(@CurrentUser() user?: AuthUser) {
    return this.service.semeiarModelo(TenantContext.tenantId()!);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscarAdmin(id);
  }

  @Post()
  criar(@Body() dto: CriarServicoDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarServicoDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
