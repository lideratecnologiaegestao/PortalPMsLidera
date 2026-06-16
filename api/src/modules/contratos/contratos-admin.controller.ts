import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ContratosService } from './contratos.service';

const ator = () => TenantContext.get().userId as string | undefined;

@Controller('admin/contratos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ContratosAdminController {
  constructor(private readonly service: ContratosService) {}

  @Get('licitacoes')
  licitacoes() {
    return this.service.listarLicitacoes();
  }
  @Post('_semear')
  semear() {
    return this.service.semearTenant(TenantContext.tenantId()!);
  }
  @Delete('aditivos/:id')
  delAditivo(@Param('id') id: string) {
    return this.service.excluirAditivo(id);
  }
  @Get()
  listar() {
    return this.service.listarAdmin();
  }
  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obter(id);
  }
  @Post()
  criar(@Body() b: any) {
    return this.service.criar(b, ator());
  }
  @Put(':id')
  atualizar(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizar(id, b, ator());
  }
  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.service.excluir(id, ator());
  }
  @Post(':id/aditivos')
  addAditivo(@Param('id') id: string, @Body() b: any) {
    return this.service.addAditivo(id, b);
  }
}
