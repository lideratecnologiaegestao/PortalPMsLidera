import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { LicitacoesService } from './licitacoes.service';

const ator = () => TenantContext.get().userId as string | undefined;

/** Administração das Licitações. RBAC gestor/admin, RLS por tenant. */
@Controller('admin/licitacoes')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class LicitacoesAdminController {
  constructor(private readonly service: LicitacoesService) {}

  @Get('modalidades')
  modalidades() {
    return this.service.listarModalidades();
  }
  @Get('criterios')
  criterios() {
    return this.service.listarCriterios();
  }
  // ── gestão manual das taxonomias ──
  @Get('modalidades/todas')
  modalidadesTodas() {
    return this.service.listarModalidadesAdmin();
  }
  @Post('modalidades')
  criarModalidade(@Body() b: any) {
    return this.service.criarModalidade(b);
  }
  @Put('modalidades/:id')
  atualizarModalidade(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizarModalidade(id, b);
  }
  @Delete('modalidades/:id')
  excluirModalidade(@Param('id') id: string) {
    return this.service.excluirModalidade(id);
  }
  @Get('criterios/todas')
  criteriosTodas() {
    return this.service.listarCriteriosAdmin();
  }
  @Post('criterios')
  criarCriterio(@Body() b: any) {
    return this.service.criarCriterio(b);
  }
  @Put('criterios/:id')
  atualizarCriterio(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizarCriterio(id, b);
  }
  @Delete('criterios/:id')
  excluirCriterio(@Param('id') id: string) {
    return this.service.excluirCriterio(id);
  }
  @Post('_semear')
  semear() {
    return this.service.semearTenant(TenantContext.tenantId()!);
  }

  // documentos da licitação (literais 'documentos/...' antes de ':id')
  @Put('documentos/:docId')
  atualizarDoc(@Param('docId') docId: string, @Body() b: any) {
    return this.service.atualizarDocumento(docId, b);
  }
  @Delete('documentos/:docId')
  excluirDoc(@Param('docId') docId: string) {
    return this.service.excluirDocumento(docId);
  }

  @Get()
  listar(@Query('q') q?: string, @Query('ano') ano?: string, @Query('page') page?: string) {
    return this.service.listarAdmin({ q, ano: ano ? Number(ano) : undefined, page: page ? Number(page) : undefined });
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
  addDoc(@Param('id') id: string, @Body() b: { fase: string; titulo: string; arquivoUrl?: string; ordem?: number }) {
    return this.service.adicionarDocumento(id, b);
  }
}
