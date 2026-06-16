import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { DocumentosService } from './documentos.service';

const ator = () => TenantContext.get().userId as string | undefined;

/**
 * Administração do Cadastro de Documentos. RBAC: gestor/admin. RLS por tenant.
 * Gerencia cadastros (com auto-menu), seus tipos (taxonomia) e os documentos.
 *
 * Campos novos:
 *  - POST/PUT cadastros: `visibilidade` ('publico'|'restrito'), `grupoIds` (uuid[])
 *  - POST/PUT tipos: `parentId` (uuid|null) — hierarquia de tipos
 */
@Controller('admin/documentos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class DocumentosAdminController {
  constructor(private readonly service: DocumentosService) {}

  // ── cadastros (rotas literais antes de :id) ──
  @Get('cadastros')
  cadastros() {
    return this.service.listarCadastrosAdmin();
  }

  @Post('cadastros')
  criarCadastro(
    @Body() b: {
      nome: string;
      descricao?: string;
      icone?: string;
      ordem?: number;
      visibilidade?: 'publico' | 'restrito';
      grupoIds?: string[];
    },
  ) {
    return this.service.criarCadastro(b, ator());
  }

  @Put('cadastros/:id')
  atualizarCadastro(
    @Param('id') id: string,
    @Body() b: {
      nome?: string;
      descricao?: string;
      icone?: string;
      ordem?: number;
      ativo?: boolean;
      visibilidade?: 'publico' | 'restrito';
      grupoIds?: string[];
    },
  ) {
    return this.service.atualizarCadastro(id, b, ator());
  }

  @Delete('cadastros/:id')
  excluirCadastro(@Param('id') id: string) {
    return this.service.excluirCadastro(id, ator());
  }

  // ── tipos ──
  @Get('cadastros/:id/tipos')
  tipos(@Param('id') id: string) {
    return this.service.listarTipos(id);
  }

  @Post('cadastros/:id/tipos')
  criarTipo(
    @Param('id') id: string,
    @Body() b: { nome: string; ordem?: number; parentId?: string | null },
  ) {
    return this.service.criarTipo(id, b);
  }

  @Put('tipos/:id')
  atualizarTipo(
    @Param('id') id: string,
    @Body() b: { nome?: string; ordem?: number; ativo?: boolean; parentId?: string | null },
  ) {
    return this.service.atualizarTipo(id, b);
  }

  @Delete('tipos/:id')
  excluirTipo(@Param('id') id: string) {
    return this.service.excluirTipo(id);
  }

  // ── seeding (backfill dos cadastros padrão no tenant atual) ──
  @Post('_semear')
  semear() {
    return this.service.semearTenant(TenantContext.tenantId()!);
  }

  // ── migração: reclassifica documentos-tipo de /transparencia/documentos ──
  @Post('_migrar-transparencia')
  migrar() {
    return this.service.migrarDeTransparencia();
  }

  // ── backfill FTS: reenfileira a extração de texto dos documentos ainda não indexados ──
  @Post('_reindexar')
  reindexar() {
    return this.service.reindexarConteudo();
  }

  /**
   * Força a reextração de um documento específico (inclui OCR em camadas).
   * Zera conteudo_extraido e reenfileira o job com forcar=true.
   * Auditado como DOCUMENTO_REEXTRAIR.
   */
  @Post(':id/reextrair')
  reextrair(@Param('id') id: string) {
    return this.service.reextrairDocumento(id, ator());
  }

  /**
   * Backfill: reenfileira todos os documentos do tenant sem texto extraído
   * (conteudo_extraido nulo ou < 50 chars) para OCR em camadas (throttled: 200/chamada).
   */
  @Post('_reextrair-escaneados')
  reextrairEscaneados() {
    return this.service.reextrairEscaneados();
  }

  // ── documentos ──
  @Get()
  listar(
    @Query('cadastroId') cadastroId?: string,
    @Query('tipoId') tipoId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.service.listarDocumentosAdmin({ cadastroId, tipoId, q, page: page ? Number(page) : undefined });
  }

  @Get(':id')
  obter(@Param('id') id: string) {
    return this.service.obterDocumento(id);
  }

  @Post()
  criar(@Body() b: any) {
    return this.service.criarDocumento(b, ator());
  }

  @Put(':id')
  atualizar(@Param('id') id: string, @Body() b: any) {
    return this.service.atualizarDocumento(id, b, ator());
  }

  @Delete(':id')
  excluir(@Param('id') id: string) {
    return this.service.excluirDocumento(id, ator());
  }
}
