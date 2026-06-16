import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ConveniosService } from './convenios.service';

const ator = () => TenantContext.get().userId as string | undefined;

@Controller('admin/convenios')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ConveniosAdminController {
  constructor(private readonly service: ConveniosService) {}

  @Post('_semear')
  semear() {
    return this.service.semearTenant(TenantContext.tenantId()!);
  }
  @Delete('documentos/:id')
  delDoc(@Param('id') id: string) {
    return this.service.excluirDocumento(id);
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
  @Post(':id/documentos')
  addDoc(@Param('id') id: string, @Body() b: any) {
    return this.service.addDocumento(id, b);
  }
}
