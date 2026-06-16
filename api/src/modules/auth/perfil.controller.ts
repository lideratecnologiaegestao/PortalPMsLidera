import {
  Body,
  Controller,
  Get,
  Patch,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from './current-user.decorator';
import { AuthUser } from './jwt-auth.guard';
import { PerfilService } from './perfil.service';
import { AtualizarPerfilDto } from './perfil.dto';

/**
 * Endpoints de perfil do próprio usuário autenticado.
 *
 * GET  /api/auth/me/perfil  — retorna { id, nome, email, role, mfaHabilitado, govbrNivel }
 * PATCH /api/auth/me/perfil — atualiza nome, e-mail e/ou senha; audita a ação.
 *
 * Segurança (duas camadas obrigatórias — CLAUDE.md regra 2):
 *  - Camada 1 (RBAC): @UseGuards(RolesGuard). Sem @Roles declarado, o guard
 *    passa para qualquer req; a verificação de identidade é feita no handler
 *    (throw UnauthorizedException) para retornar 401, não 403.
 *  - Camada 2 (dados): RLS via PrismaService — o userId vem do token JWT (sub),
 *    jamais do body; o banco só devolve registros do tenant correto.
 */
@Controller('auth/me')
@UseGuards(RolesGuard)
export class PerfilController {
  constructor(private readonly perfil: PerfilService) {}

  /** Dados do próprio perfil. Qualquer usuário autenticado pode consultar. */
  @Get('perfil')
  async obterPerfil(@CurrentUser() user?: AuthUser) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.perfil.obter(user.sub);
  }

  /** Atualiza nome, e-mail e/ou senha do próprio usuário. */
  @Patch('perfil')
  async atualizarPerfil(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: AtualizarPerfilDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.perfil.atualizar(user.sub, dto);
  }
}
