/**
 * Controller administrativo do módulo LGPD.
 *
 * Rotas:
 *  GET   /api/lgpd/admin/conformidade               — admin_prefeitura, ouvidor
 *  PUT   /api/lgpd/admin/encarregado               — admin_prefeitura
 *  GET   /api/lgpd/admin/solicitacoes               — admin_prefeitura, ouvidor
 *  GET   /api/lgpd/admin/solicitacoes/:id           — admin_prefeitura, ouvidor
 *  PATCH /api/lgpd/admin/solicitacoes/:id           — admin_prefeitura, ouvidor
 *  POST  /api/lgpd/admin/solicitacoes/:id/anonimizar — admin_prefeitura, ouvidor
 *  POST  /api/lgpd/incidentes                       — admin_prefeitura, ouvidor
 *  GET   /api/lgpd/incidentes                       — admin_prefeitura, ouvidor
 *  GET   /api/lgpd/incidentes/:id                   — admin_prefeitura, ouvidor
 *  PATCH /api/lgpd/incidentes/:id                   — admin_prefeitura, ouvidor
 *  GET   /api/lgpd/incidentes/:id/relatorio         — admin_prefeitura, ouvidor
 *
 * Segurança (duas camadas — CLAUDE.md regra 2):
 *  - Camada 1 (RBAC): @Roles(...) + @UseGuards(RolesGuard)
 *  - Camada 2 (dados): RLS via PrismaService isola o tenant automaticamente
 */
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { SolicitacoesService } from './solicitacoes.service';
import { IncidentesService } from './incidentes.service';
import { LgpdDashboardService } from './lgpd-dashboard.service';
import { LgpdDocService, DadosLgpdEntidade } from './doc/lgpd-doc.service';
import {
  AtualizarSolicitacaoDto,
  AtualizarEncarregadoDto,
  CriarIncidenteDto,
  AtualizarIncidenteDto,
} from './lgpd.dto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

@Controller('lgpd')
@UseGuards(RolesGuard)
export class LgpdAdminController {
  constructor(
    private readonly solicitacoes: SolicitacoesService,
    private readonly incidentes: IncidentesService,
    private readonly dashboard: LgpdDashboardService,
    private readonly prisma: PrismaService,
    private readonly lgpdDoc: LgpdDocService,
  ) {}

  // ─── Documentação LGPD (gerar / baixar / publicar) ─────────────────────────

  /** Estado da documentação LGPD da entidade (metadados + dados usados). */
  @Get('admin/documentacao')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async obterDocumentacao(@CurrentUser() user: AuthUser | undefined) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    const tenantId = this.tenantAtual();
    return this.lgpdDoc.obter(tenantId);
  }

  /**
   * (Re)gera a documentação a partir do template global + dados da entidade.
   * Permite que o próprio responsável atualize a documentação.
   */
  @Post('admin/documentacao/gerar')
  @Roles(Role.ADMIN_PREFEITURA)
  async gerarDocumentacao(
    @CurrentUser() user: AuthUser | undefined,
    @Body() dto: DadosLgpdEntidade,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    const tenantId = this.tenantAtual();
    const res = await this.lgpdDoc.gerar(tenantId, dto ?? {}, user.sub);
    await this.prisma.db.auditLog.create({
      data: {
        tenantId, atorId: user.sub, acao: 'LGPD_DOC_GERADO',
        entidade: 'lgpd_documentos', entidadeId: tenantId, dados: { versao: res.versao },
      },
    });
    return res;
  }

  /** Publica/despublica a documentação na página pública /privacidade/sobre-lgpd. */
  @Put('admin/documentacao/publicacao')
  @Roles(Role.ADMIN_PREFEITURA)
  async publicarDocumentacao(
    @CurrentUser() user: AuthUser | undefined,
    @Body() body: { publicado?: boolean },
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    const tenantId = this.tenantAtual();
    const res = await this.lgpdDoc.publicar(tenantId, !!body?.publicado);
    await this.prisma.db.auditLog.create({
      data: {
        tenantId, atorId: user.sub, acao: res.publicado ? 'LGPD_DOC_PUBLICADO' : 'LGPD_DOC_DESPUBLICADO',
        entidade: 'lgpd_documentos', entidadeId: tenantId, dados: {},
      },
    });
    return res;
  }

  /** Baixa a documentação em pdf|txt|html. */
  @Get('admin/documentacao/download')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async baixarDocumentacao(
    @CurrentUser() user: AuthUser | undefined,
    @Query('formato') formato: string | undefined,
    @Res() res: Response,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    const tenantId = this.tenantAtual();
    const fmt = (formato ?? 'pdf').toLowerCase();
    if (fmt !== 'pdf' && fmt !== 'txt' && fmt !== 'html') {
      res.status(400).json({ message: 'Formato inválido (use pdf, txt ou html).' });
      return;
    }
    const { buffer, mime, filename } = await this.lgpdDoc.download(tenantId, fmt as 'pdf' | 'txt' | 'html');
    res.set({
      'Content-Type': mime,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  private tenantAtual(): string {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new NotFoundException('Tenant não resolvido.');
    return tenantId;
  }

  // ─── Dashboard de Conformidade LGPD ───────────────────────────────────────

  /**
   * Retorna um snapshot agregado de conformidade LGPD do tenant atual.
   * Read-only: apenas contagens e metadados — sem conteúdo de solicitações
   * ou incidentes (sem PII). Auditoria sem dados sensíveis.
   */
  @Get('admin/conformidade')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async conformidade(@CurrentUser() user: AuthUser | undefined) {
    if (!user) throw new UnauthorizedException('Não autenticado.');

    const tenantId = TenantContext.tenantId();
    const snapshot = await this.dashboard.conformidade();

    // Auditoria opcional — sem PII (CLAUDE.md regra 6)
    if (tenantId) {
      await this.prisma.db.auditLog.create({
        data: {
          tenantId,
          atorId: user.sub,
          acao: 'LGPD_CONFORMIDADE_CONSULTADA',
          entidade: 'lgpd_dashboard',
          entidadeId: tenantId,
          dados: { score: snapshot.score },
        },
      });
    }

    return snapshot;
  }

  // ─── Encarregado (DPO) ─────────────────────────────────────────────────────

  /**
   * Atualiza os dados do DPO do tenant.
   * Justificativa para prisma.platform(): tenants é tabela de plataforma,
   * não tem RLS por tenant_id — só super_admin ou admin_prefeitura do próprio
   * tenant devem editar. A proteção é feita pelo RBAC (@Roles) + validação
   * de tenantId (só atualiza o tenant do contexto atual).
   */
  @Put('admin/encarregado')
  @Roles(Role.ADMIN_PREFEITURA)
  async atualizarEncarregado(
    @CurrentUser() user: AuthUser | undefined,
    @Body(new ValidationPipe({ whitelist: true })) dto: AtualizarEncarregadoDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new NotFoundException('Tenant não resolvido.');

    const atualizado = await this.prisma.platform().tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.dpoNome !== undefined ? { dpoNome: dto.dpoNome } : {}),
        ...(dto.dpoEmail !== undefined ? { dpoEmail: dto.dpoEmail } : {}),
      },
      select: { dpoNome: true, dpoEmail: true },
    });

    // Auditoria
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: user.sub,
        acao: 'DPO_ATUALIZADO',
        entidade: 'tenants',
        entidadeId: tenantId,
        dados: { camposAlterados: Object.keys(dto) },
      },
    });

    return atualizado;
  }

  // ─── Solicitações ──────────────────────────────────────────────────────────

  @Get('admin/solicitacoes')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async listarSolicitacoes(
    @Query('status') status?: string,
    @Query('tipo') tipo?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.solicitacoes.listarAdmin({
      status,
      tipo,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('admin/solicitacoes/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async detalharSolicitacao(@Param('id') id: string) {
    return this.solicitacoes.detalheAdmin(id);
  }

  @Patch('admin/solicitacoes/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async atualizarSolicitacao(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Body(new ValidationPipe({ whitelist: true })) dto: AtualizarSolicitacaoDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.solicitacoes.atualizarAdmin(id, user.sub, dto);
  }

  /**
   * Executa anonimização do titular (spec 3.4).
   * Endpoint exclusivo do Encarregado — nunca exposto ao cidadão.
   */
  @Post('admin/solicitacoes/:id/anonimizar')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async anonimizarTitular(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.solicitacoes.anonimizarTitular(id, user.sub);
  }

  // ─── Incidentes de Segurança ───────────────────────────────────────────────

  @Post('incidentes')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async criarIncidente(
    @CurrentUser() user: AuthUser | undefined,
    @Body(new ValidationPipe({ whitelist: true })) dto: CriarIncidenteDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.incidentes.criar(user.sub, dto);
  }

  @Get('incidentes')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async listarIncidentes(
    @Query('status') status?: string,
    @Query('severidade') severidade?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.incidentes.listar({
      status,
      severidade,
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
    });
  }

  @Get('incidentes/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async detalharIncidente(@Param('id') id: string) {
    return this.incidentes.detalhe(id);
  }

  @Patch('incidentes/:id')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async atualizarIncidente(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Body(new ValidationPipe({ whitelist: true })) dto: AtualizarIncidenteDto,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.incidentes.atualizar(id, user.sub, dto);
  }

  /** Exporta relatório completo do incidente como evidência ANPD (spec 4.4). */
  @Get('incidentes/:id/relatorio')
  @Roles(Role.ADMIN_PREFEITURA, Role.OUVIDOR)
  async relatoriIncidente(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
  ) {
    if (!user) throw new UnauthorizedException('Não autenticado.');
    return this.incidentes.relatorio(id, user.sub);
  }
}
