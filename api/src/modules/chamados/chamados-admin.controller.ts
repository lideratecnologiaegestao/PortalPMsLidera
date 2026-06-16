import { BadRequestException, Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { ChamadosService } from './chamados.service';

const STATUS_VALIDOS = new Set([
  'aberto',
  'triagem',
  'em_atendimento',
  'resolvido',
  'reaberto',
  'cancelado',
  'duplicado',
]);

/**
 * Painel de Denúncias (Demandas Urbanas) — gestão dos chamados do App do Cidadão
 * pela equipe. RBAC: papéis internos. RLS limita ao tenant. Separado do
 * controller público (`/chamados`) para usar o prefixo `/admin/chamados` sem
 * conflitar com a rota pública `:protocolo`.
 */
@Controller('admin/chamados')
@UseGuards(RolesGuard)
@Roles(Role.SERVIDOR, Role.GESTOR, Role.OUVIDOR, Role.ADMIN_PREFEITURA)
export class ChamadosAdminController {
  constructor(private readonly service: ChamadosService) {}

  @Get()
  listar(
    @Query('status') status?: string,
    @Query('categoria') categoria?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarAdmin({
      status,
      categoria,
      q,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.service.detalheAdmin(id);
  }

  @Post(':id/status')
  atualizarStatus(@Param('id') id: string, @Body() body: { status: string; comentario?: string }) {
    if (!STATUS_VALIDOS.has(body?.status)) {
      throw new BadRequestException('Status inválido.');
    }
    return this.service.atualizar(id, body.status, body.comentario);
  }
}
