import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
import { CriarRedirectDto, AtualizarRedirectDto, BulkRedirectDto } from './redirects.dto';
import { RedirectsService } from './redirects.service';

/**
 * Rota pública de resolução de redirect — usada pelo Next.js (middleware/rewrites)
 * para decidir se deve emitir um 301 antes de renderizar a página.
 *
 * Não requer autenticação; o isolamento de dados é garantido pelo RLS via
 * TenantContext (definido pelo TenantMiddleware pelo Host da requisição).
 */
@Controller('redirects')
export class RedirectsController {
  constructor(private readonly service: RedirectsService) {}

  @Get('resolve')
  async resolve(@Query('path') path?: string) {
    if (!path) throw new NotFoundException('Parâmetro "path" é obrigatório.');
    const result = await this.service.resolve(path);
    if (!result) throw new NotFoundException('Nenhum redirect ativo para este caminho.');
    return result;
  }
}

/**
 * Painel administrativo de redirects.
 * RBAC: GESTOR e ADMIN_PREFEITURA.
 */
@Controller('admin/redirects')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class RedirectsAdminController {
  constructor(private readonly service: RedirectsService) {}

  @Get()
  listar(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('q') q?: string,
  ) {
    return this.service.listar({
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(200, Math.max(1, Number(pageSize ?? 50))),
      q,
    });
  }

  @Post()
  criar(@Body() dto: CriarRedirectDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarRedirectDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }

  /**
   * Carga em lote idempotente (UPSERT por origem).
   * Aceita até 2.000 itens por requisição — para carregar os ~1.681 redirects do Joomla.
   */
  @Post('bulk')
  bulk(@Body() dto: BulkRedirectDto, @CurrentUser() user?: AuthUser) {
    return this.service.bulk(dto.itens, user?.sub);
  }
}
