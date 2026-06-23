import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CidadaoAuthService } from '../auth/cidadao-auth.service';
import { TurnstileService } from '../turnstile/turnstile.service';
import { ElevationRequestsService } from './elevation-requests.service';
import { SolicitarElevacaoDto } from './elevation-requests.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

/**
 * Endpoints de elevação de papel + autocadastro do cidadão (ADR-0005 Fase 2).
 *
 * Path /api/auth (sobrepõe o AuthController do gov.br no mesmo prefixo,
 * com rotas distintas — NestJS resolve por nome de método).
 */
@Controller('auth')
export class ElevationRequestsAuthController {
  constructor(
    private readonly service: ElevationRequestsService,
    private readonly cidadaoAuth: CidadaoAuthService,
    private readonly turnstile: TurnstileService,
  ) {}

  /**
   * POST /api/auth/registrar — PÚBLICO (ADR-0005 Fase 2).
   * Cria conta de cidadão (role='cidadao') no tenant atual.
   * Delega ao CidadaoAuthService.cadastrar() para reusar validações e hash.
   * O e-mail precisa ser verificado antes de logar (comportamento padrão).
   */
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('registrar')
  @HttpCode(HttpStatus.CREATED)
  async registrar(
    @Body() dto: { nome: string; email: string; senha: string; turnstileToken?: string },
    @Ip() ip: string,
  ) {
    if (!(await this.turnstile.verificar(dto.turnstileToken, ip))) {
      throw new ForbiddenException('Verificação de segurança falhou. Recarregue a página e tente novamente.');
    }
    return this.cidadaoAuth.cadastrar(dto);
  }

  /**
   * POST /api/auth/solicitar-elevacao
   * Qualquer usuário logado pode solicitar elevação de papel.
   * super_admin, admin_prefeitura e cidadao são rejeitados pelo enum da DTO.
   */
  @Post('solicitar-elevacao')
  @UseGuards(RolesGuard)
  @Roles(
    Role.CIDADAO,
    Role.SERVIDOR,
    Role.GESTOR,
    Role.OUVIDOR,
    Role.ASSISTENTE_OUVIDORIA,
    Role.TI,
    Role.ADMIN_PREFEITURA,
  )
  @HttpCode(HttpStatus.CREATED)
  async solicitarElevacao(
    @Body() body: Record<string, unknown>,
    @CurrentUser() user: AuthUser,
  ) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      throw new BadRequestException('Solicitação de elevação ocorre no contexto de uma prefeitura.');
    }

    const dto = plainToInstance(SolicitarElevacaoDto, body);
    const erros = await validate(dto);
    if (erros.length > 0) {
      throw new BadRequestException(
        erros.flatMap((e) => Object.values(e.constraints ?? {})).join('; '),
      );
    }

    return this.service.solicitar(user.id, tenantId, dto);
  }

  /**
   * GET /api/auth/minhas-solicitacoes
   * Lista as solicitações do próprio usuário (todas as situações).
   */
  @Get('minhas-solicitacoes')
  @UseGuards(RolesGuard)
  @Roles(
    Role.CIDADAO,
    Role.SERVIDOR,
    Role.GESTOR,
    Role.OUVIDOR,
    Role.ASSISTENTE_OUVIDORIA,
    Role.TI,
    Role.ADMIN_PREFEITURA,
  )
  minhasSolicitacoes(@CurrentUser() user: AuthUser) {
    return this.service.minhasSolicitacoes(user.id);
  }
}
