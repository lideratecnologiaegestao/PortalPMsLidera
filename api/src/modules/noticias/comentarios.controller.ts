import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { PermissionsGuard } from '../../common/rbac/permissions.guard';
import { RequirePermissions } from '../../common/rbac/require-permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { EscopoSecretariaService } from '../../common/escopo/escopo-secretaria.service';
import { TurnstileService } from '../turnstile/turnstile.service';
import { ComentariosService } from './comentarios.service';
import { CriarComentarioDto, ListarComentariosAdminQuery } from './comentarios.dto';

/** Extrai o IP real do cliente respeitando proxies (X-Forwarded-For). */
function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) {
    const first = (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
    if (first) return first;
  }
  return req.ip ?? undefined;
}

/**
 * Rotas públicas de comentários vinculadas à rota de notícias.
 *
 * GET  /api/noticias/:id/comentarios  — lista aprovados (sem auth)
 * POST /api/noticias/:id/comentarios  — cria pendente (cidadão autenticado obrigatório)
 */
@Controller('noticias/:id/comentarios')
export class ComentariosController {
  constructor(
    private readonly service: ComentariosService,
    private readonly turnstile: TurnstileService,
  ) {}

  /** Lista comentários aprovados de uma notícia. Sem autenticação. */
  @Get()
  listar(@Param('id') noticiaId: string) {
    return this.service.listarAprovados(noticiaId);
  }

  /**
   * Cria um comentário pendente.
   * Exige cidadão autenticado (qualquer role de usuário logado).
   * Valida Turnstile (fail-open quando desabilitado).
   */
  @Post()
  async criar(
    @Param('id') noticiaId: string,
    @Body() dto: CriarComentarioDto,
    @Req() req: Request,
    @CurrentUser() user?: AuthUser,
  ) {
    // Cidadão deve estar autenticado
    if (!user?.sub) {
      throw new UnauthorizedException(
        'É necessário estar autenticado para comentar.',
      );
    }

    const ip = clientIp(req);

    // Validação Turnstile
    const turnstileOk = await this.turnstile.verificar(dto.turnstileToken, ip);
    if (!turnstileOk) {
      throw new BadRequestException(
        'Verificação de segurança falhou. Recarregue a página e tente novamente.',
      );
    }

    return this.service.criar({
      noticiaId,
      conteudo: dto.conteudo,
      autorUserId: user.sub,
      ip,
    });
  }
}

/**
 * Painel de moderação de comentários para administradores/gestores.
 *
 * GET  /api/admin/comentarios?status=pendente  — lista para moderação
 * POST /api/admin/comentarios/:id/aprovar       — aprova
 * POST /api/admin/comentarios/:id/reprovar      — reprova
 *
 * NOTA: a rota é `admin/comentarios` (NÃO `admin/noticias/comentarios`) para
 * evitar conflito com `GET admin/noticias/:id` do NoticiasAdminController, que
 * capturaria "comentarios" como :id e tentaria parseá-lo como UUID.
 *
 * Escopo ADR-0005 Fase 4: gestor/servidor só moderam comentários de notícias
 * da sua secretaria; admin_prefeitura/ti/super_admin moderam tudo.
 */
@Controller('admin/comentarios')
@UseGuards(RolesGuard, PermissionsGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SERVIDOR, Role.TI)
@RequirePermissions('noticias.gerenciar')
export class ComentariosAdminController {
  constructor(
    private readonly service: ComentariosService,
    private readonly escopoSvc: EscopoSecretariaService,
  ) {}

  @Get()
  async listar(
    @Query() q: ListarComentariosAdminQuery,
    @CurrentUser() user?: AuthUser,
  ) {
    const page = Math.max(1, Number(q.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const escopo = await this.escopoSvc.resolver(user?.sub, user?.role);
    return this.service.listarAdmin({
      status: q.status ?? 'pendente',
      page,
      pageSize,
      escopoSecretariaId: escopo,
    });
  }

  @Post(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!user?.sub) throw new ForbiddenException('Não autenticado.');
    const escopo = await this.escopoSvc.resolver(user.sub, user.role);
    return this.service.aprovar(id, user.sub, escopo);
  }

  @Post(':id/reprovar')
  async reprovar(
    @Param('id') id: string,
    @CurrentUser() user?: AuthUser,
  ) {
    if (!user?.sub) throw new ForbiddenException('Não autenticado.');
    const escopo = await this.escopoSvc.resolver(user.sub, user.role);
    return this.service.reprovar(id, user.sub, escopo);
  }
}
