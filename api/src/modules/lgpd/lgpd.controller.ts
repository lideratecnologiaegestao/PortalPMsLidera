/**
 * Controller público e do cidadão do módulo LGPD.
 *
 * Rotas:
 *  GET  /api/lgpd/encarregado            — público (sem auth)
 *  GET  /api/lgpd/meus-dados             — cidadão autenticado
 *  POST /api/lgpd/solicitacoes           — cidadão autenticado
 *  GET  /api/lgpd/solicitacoes           — cidadão autenticado
 *  GET  /api/lgpd/solicitacoes/:id       — cidadão autenticado
 *
 * Segurança (duas camadas — CLAUDE.md regra 2):
 *  - Camada 1 (RBAC): @UseGuards(RolesGuard) sem @Roles = qualquer autenticado
 *    (para cidadão autenticado); sem guard = público (encarregado).
 *  - Camada 2 (dados): RLS via PrismaService; userId sempre do JWT (user.sub).
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { MeusDadosService } from './meus-dados.service';
import { SolicitacoesService } from './solicitacoes.service';
import { LgpdDocService } from './doc/lgpd-doc.service';
import { CriarSolicitacaoDto } from './lgpd.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

@Controller('lgpd')
export class LgpdController {
  constructor(
    private readonly meusDados: MeusDadosService,
    private readonly solicitacoes: SolicitacoesService,
    private readonly prisma: PrismaService,
    private readonly lgpdDoc: LgpdDocService,
  ) {}

  /**
   * Documentação LGPD PUBLICADA do tenant atual — para /privacidade/sobre-lgpd.
   * Público (sem auth); retorna null se a entidade não publicou.
   */
  @Get('publico')
  async documentacaoPublica() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return null;
    return this.lgpdDoc.publico(tenantId);
  }

  /**
   * Retorna DPO do tenant atual.
   * Público — sem autenticação exigida (LGPD art. 41, §1º).
   */
  @Get('encarregado')
  async encarregado() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      // Nenhum tenant resolvido — retorna nulos sem erro
      return { dpoNome: null, dpoEmail: null };
    }

    // tenants não tem RLS (tabela de plataforma) — usa prisma.platform()
    // Justificativa: dado público exigido por lei, não há dados pessoais de cidadão.
    const tenant = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: { dpoNome: true, dpoEmail: true },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado.');
    return { dpoNome: tenant.dpoNome ?? null, dpoEmail: tenant.dpoEmail ?? null };
  }

  /**
   * Exportação/portabilidade de dados do próprio titular (LGPD art. 18, II e V).
   * Qualquer usuário autenticado pode exportar os próprios dados.
   */
  @UseGuards(RolesGuard)
  @Get('meus-dados')
  async meusDadosExportar(
    @CurrentUser() user: AuthUser | undefined,
    @Query('formato') formato?: string,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    // formato aceito: 'json' (padrão) — spec 3.1.1
    const fmt = (formato ?? 'json').toLowerCase();
    if (fmt !== 'json') {
      // Para formatos não suportados retorna apenas json
    }
    return this.meusDados.exportar(user.sub);
  }

  /**
   * Cidadão cria solicitação de direito LGPD (art. 18).
   * titularId sempre do JWT (user.sub) — nunca do body.
   */
  @UseGuards(RolesGuard)
  @Post('solicitacoes')
  async criarSolicitacao(
    @CurrentUser() user: AuthUser | undefined,
    @Body(new ValidationPipe({ whitelist: true })) dto: CriarSolicitacaoDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.solicitacoes.criar(user.sub, dto);
  }

  /** Cidadão lista as próprias solicitações. */
  @UseGuards(RolesGuard)
  @Get('solicitacoes')
  async listarSolicitacoes(
    @CurrentUser() user: AuthUser | undefined,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.solicitacoes.listarProprias(
      user.sub,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    );
  }

  /** Cidadão consulta detalhe da própria solicitação. */
  @UseGuards(RolesGuard)
  @Get('solicitacoes/:id')
  async detalharSolicitacao(
    @CurrentUser() user: AuthUser | undefined,
    @Param('id') id: string,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.solicitacoes.detalhe(user.sub, id);
  }
}
