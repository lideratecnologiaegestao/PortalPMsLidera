import {
  Body, Controller, Delete, Get, Ip, Param, Post, Put, Headers, UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { EnqueteDto, EnquetesService } from './enquetes.service';

/** IP real do cliente: 1º item do X-Forwarded-For (nginx/Cloudflare) ou socket. */
function clientIp(xff: string | undefined, ip: string): string {
  return xff?.split(',')[0]?.trim() || ip || '';
}

/** Consulta e voto público (anônimo). A rota `ativa` vem antes de `:id`. */
@Controller('enquetes')
export class EnquetesController {
  constructor(private readonly service: EnquetesService) {}

  @Get('ativa')
  ativa(@Ip() ip: string, @Headers('user-agent') ua: string, @Headers('x-forwarded-for') xff?: string) {
    return this.service.getAtiva(clientIp(xff, ip), ua ?? '');
  }

  @Get(':id')
  porId(
    @Param('id') id: string,
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.service.getPublica(id, clientIp(xff, ip), ua ?? '');
  }

  @Post(':id/votar')
  votar(
    @Param('id') id: string,
    @Body() body: { opcaoId: string },
    @Ip() ip: string,
    @Headers('user-agent') ua: string,
    @Headers('x-forwarded-for') xff?: string,
  ) {
    return this.service.votar(id, body?.opcaoId, clientIp(xff, ip), ua ?? '');
  }
}

/** Gestão admin das enquetes. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/enquetes')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class EnquetesAdminController {
  constructor(private readonly service: EnquetesService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@Body() dto: EnqueteDto) {
    return this.service.criar(dto);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() dto: EnqueteDto) {
    return this.service.atualizar(id, dto);
  }

  @Post(':id/ativar')
  ativar(@Param('id') id: string) {
    return this.service.ativar(id);
  }

  @Post(':id/encerrar')
  encerrar(@Param('id') id: string) {
    return this.service.encerrar(id);
  }

  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
