import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
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
import { IaGlobalService } from './ia-global.service';
import {
  CriarConteudoGlobalDto,
  AtualizarConteudoGlobalDto,
  ListarConteudosGlobalQuery,
} from './ia-global.dto';

/**
 * CRUD do acervo GLOBAL de conhecimento da IA — Console Lidera (plataforma).
 *
 * Prefixo: `/api/_platform/ia/...` — espelha o padrão de PlatformConfigController.
 * Guard: somente `super_admin` (Role.SUPER_ADMIN). O RolesGuard já dá bypass a
 * super_admin em qualquer rota; aqui declaramos explicitamente para documentação.
 *
 * Diferença das rotas `/api/admin/ia/...` (por tenant):
 *   - Estas rotas gerem o acervo GLOBAL (legislação federal, normas públicas)
 *     compartilhado por TODAS as prefeituras.
 *   - Não requerem TenantContext (as operações usam `prisma.platform()`).
 *
 * LGPD: conteúdo normativo público — sem PII de cidadão.
 * Auditoria: toda escrita registra em audit_log via IaGlobalService.
 */
@Controller('_platform/ia')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class IaGlobalController {
  constructor(private readonly service: IaGlobalService) {}

  // ── Status do acervo global ──────────────────────────────────────────────
  /** GET /api/_platform/ia/status → {configurado, provider, chunks} */
  @Get('status')
  status() {
    return this.service.status();
  }

  // ── Reindexação global ───────────────────────────────────────────────────
  /** POST /api/_platform/ia/reindexar → {enfileirado, motivo?} */
  @Post('reindexar')
  reindexar(@CurrentUser() user: AuthUser) {
    return this.service.reindexar(user?.id);
  }

  // ── CRUD de conteúdos ────────────────────────────────────────────────────

  /**
   * GET /api/_platform/ia/conteudos?dominio=&q=
   * Lista o acervo global com filtros opcionais (domínio e/ou FTS).
   */
  @Get('conteudos')
  listar(@Query() query: ListarConteudosGlobalQuery) {
    return this.service.listar(query);
  }

  /**
   * GET /api/_platform/ia/conteudos/:id
   * Retorna um conteúdo global completo (usado pela edição no painel).
   */
  @Get('conteudos/:id')
  obter(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.obter(id);
  }

  /**
   * POST /api/_platform/ia/conteudos
   * Cria um conteúdo global e dispara indexação incremental best-effort.
   */
  @Post('conteudos')
  criar(@Body() dto: CriarConteudoGlobalDto, @CurrentUser() user: AuthUser) {
    return this.service.criar(dto, user?.id);
  }

  /**
   * PUT /api/_platform/ia/conteudos/:id
   * Atualiza um conteúdo global e reindexa incrementalmente.
   */
  @Put('conteudos/:id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarConteudoGlobalDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.id);
  }

  /**
   * DELETE /api/_platform/ia/conteudos/:id
   * Remove o conteúdo e seus chunks (ON DELETE CASCADE na FK).
   */
  @Delete('conteudos/:id')
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    await this.service.excluir(id, user?.id);
    return { ok: true };
  }
}
