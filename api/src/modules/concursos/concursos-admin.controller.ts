import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ConcursosService } from './concursos.service';

const ator = () => TenantContext.get().userId as string | undefined;

/** Administração dos Concursos e Processos Seletivos. RBAC gestor/admin, RLS. */
@Controller('admin/concursos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ConcursosAdminController {
  constructor(private readonly service: ConcursosService) {}

  @Get('tipos')
  tipos() {
    return this.service.listarTipos();
  }
  @Get('doc-tipos')
  docTipos() {
    return this.service.listarDocTipos();
  }
  // ── gestão manual das taxonomias ──
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
  @Get('doc-tipos/todas')
  docTiposTodas() {
    return this.service.listarDocTiposAdmin();
  }
  @Post('doc-tipos')
  criarDocTipo(@Body() b: any) {
    return this.service.criarDocTipo(b);
  }
  @Put('doc-tipos/:id')
  atualizarDocTipo(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizarDocTipo(id, b);
  }
  @Delete('doc-tipos/:id')
  excluirDocTipo(@Param('id') id: string) {
    return this.service.excluirDocTipo(id);
  }
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
