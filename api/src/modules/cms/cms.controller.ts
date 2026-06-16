import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
import {
  AtualizaPagina,
  CmsService,
  NovaPagina,
  NovoBloco,
  OrdemBloco,
} from './cms.service';

/**
 * CMS dinâmico. Leitura pública (`GET /pages/:slug`) isolada por RLS; edição
 * restrita a gestor/admin (RBAC). O tema (tokens/WCAG) fica no ThemeModule.
 *
 * Rotas admin novas (bloco 9 do TR):
 *   PATCH  /admin/pages/:id/blocks/reorder        — reordenação em lote
 *   GET    /admin/pages/templates                 — lista templates disponíveis
 *   GET    /admin/pages/:id/snapshots             — lista snapshots da página
 *   POST   /admin/pages/:id/snapshots             — cria snapshot manual
 *   GET    /admin/pages/:id/snapshots/:snapId     — retorna snapshot completo
 *   POST   /admin/pages/:id/snapshots/:snapId/restaurar — restaura snapshot
 */
@Controller()
export class CmsController {
  constructor(private readonly cms: CmsService) {}

  // ------------------------------------------------------------ público
  /** Lista as páginas CMS publicadas (slug + título) — usada no Mapa do Site. */
  @Get('pages')
  listarPublicadas() {
    return this.cms.listarPublicadas();
  }

  @Get('pages/:slug')
  pagina(@Param('slug') slug: string) {
    return this.cms.paginaPublica(slug);
  }

  // ----------------------------------------- templates (sem :id — deve vir antes)
  /**
   * Lista os templates de página disponíveis (id, nome, descricao).
   * Rota declarada ANTES de `GET /admin/pages/:id` para não ser capturada como id.
   */
  @Get('admin/pages/templates')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  listarTemplates() {
    return this.cms.listarTemplates();
  }

  // --------------------------------------------------------- edição (RBAC)
  /** Lista páginas do tenant com paginação (id, slug, titulo, publicado, atualizadoEm). */
  @Get('admin/pages')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  listarAdmin(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.cms.listarAdmin({
      q,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  @Get('admin/pages/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  paginaAdmin(@Param('id') id: string) {
    return this.cms.paginaAdmin(id);
  }

  @Post('pages')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  criar(@Body() dto: NovaPagina) {
    return this.cms.criarPagina(dto);
  }

  @Put('pages/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  atualizar(@Param('id') id: string, @Body() dto: AtualizaPagina) {
    return this.cms.atualizarPagina(id, dto);
  }

  @Post('pages/:id/blocks')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  addBloco(@Param('id') id: string, @Body() dto: NovoBloco) {
    return this.cms.adicionarBloco(id, dto);
  }

  @Put('blocks/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  updateBloco(@Param('id') id: string, @Body() dto: Partial<NovoBloco>) {
    return this.cms.atualizarBloco(id, dto);
  }

  @Delete('blocks/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  removeBloco(@Param('id') id: string) {
    return this.cms.removerBloco(id);
  }

  /** Exclui página + todos os blocos (cascade). Audit. */
  @Delete('pages/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  excluirPagina(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.cms.excluirPagina(id, user?.sub);
  }

  // -------------------------------------------- reordenação em lote
  /**
   * Reordena blocos de uma página em lote.
   * Body: `{ ordens: [{ id: string; ordem: number }, ...] }`
   */
  @Patch('admin/pages/:id/blocks/reorder')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  reordenarBlocos(
    @Param('id') id: string,
    @Body() body: { ordens: OrdemBloco[] },
  ) {
    return this.cms.reordenarBlocos(id, body?.ordens ?? []);
  }

  // -------------------------------------------- snapshots / versionamento
  /** Lista snapshots da página (id, titulo, motivo, criadoEm, criadoPor) — últimos 50. */
  @Get('admin/pages/:id/snapshots')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  listarSnapshots(@Param('id') id: string) {
    return this.cms.listarSnapshots(id);
  }

  /** Cria snapshot manual. Audita `CMS_SNAPSHOT_CRIADO`. */
  @Post('admin/pages/:id/snapshots')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  criarSnapshot(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.cms.criarSnapshotManual(id, user?.sub);
  }

  /** Retorna snapshot completo (payload para preview no front). */
  @Get('admin/pages/:id/snapshots/:snapId')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  obterSnapshot(@Param('id') id: string, @Param('snapId') snapId: string) {
    return this.cms.obterSnapshot(id, snapId);
  }

  /**
   * Restaura página ao estado de um snapshot.
   * Salva 'antes_de_restaurar' automaticamente. Audita `CMS_PAGINA_RESTAURADA`.
   */
  @Post('admin/pages/:id/snapshots/:snapId/restaurar')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  restaurarSnapshot(
    @Param('id') id: string,
    @Param('snapId') snapId: string,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.cms.restaurarSnapshot(id, snapId, user?.sub);
  }
}
