import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ConselhosService } from './conselhos.service';

const ator = () => TenantContext.get().userId as string | undefined;

/** Administração dos Conselhos Municipais. RBAC gestor/admin, RLS por tenant. */
@Controller('admin/conselhos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ConselhosAdminController {
  constructor(private readonly service: ConselhosService) {}

  @Get('tipos')
  tipos() {
    return this.service.listarTipos();
  }
  // ── gestão manual da taxonomia ──
  @Get('tipos/todas')
  tiposTodas() {
    return this.service.listarTiposAdmin();
  }
  @Post('tipos')
  criarTipo(@Body() b: any) {
    return this.service.criarTipo(b);
  }
  @Put('tipos/:id')
  atualizarTipo(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizarTipo(id, b);
  }
  @Delete('tipos/:id')
  excluirTipo(@Param('id') id: string) {
    return this.service.excluirTipo(id);
  }
  @Post('_semear')
  semear() {
    return this.service.semearTenant(TenantContext.tenantId()!);
  }

  // membros e documentos (literais antes de :id)
  @Delete('membros/:id')
  delMembro(@Param('id') id: string) {
    return this.service.excluirMembro(id);
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
  @Post(':id/membros')
  addMembro(@Param('id') id: string, @Body() b: any) {
    return this.service.addMembro(id, b);
  }
  @Post(':id/documentos')
  addDoc(@Param('id') id: string, @Body() b: any) {
    return this.service.addDocumento(id, b);
  }
}
