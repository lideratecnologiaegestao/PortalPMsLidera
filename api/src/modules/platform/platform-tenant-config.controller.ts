import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappConfigService } from '../whatsapp/whatsapp-config.service';
import { TenantIaConfigService } from '../ia/tenant-ia-config.service';
import { LgpdDocService, DadosLgpdEntidade } from '../lgpd/doc/lgpd-doc.service';
import {
  PlatformAtendimentoConfigDto,
  PlatformIaConfigDto,
  PlatformLgpdConfigDto,
  PlatformWhatsappConfigDto,
} from './platform-config.dto';

/**
 * Painel "Configurações da Entidade" do Gerenciador (super_admin).
 * Centraliza o que precisa ser INDIVIDUALIZADO por tenant:
 *   - IA: limite de chunks + provedor/chaves de embeddings/Anthropic (override).
 *   - WhatsApp: provider Z-API/Evolution/Meta + credenciais (cifradas).
 *   - Atendimento/chat: flags de visibilidade do widget + mensagens + timezone.
 *   - LGPD: Encarregado de Dados (DPO).
 *
 * Segurança: SOMENTE super_admin; segredos retornados SEMPRE mascarados; escrita
 * cifrada via secret-box; auditoria por alteração. RLS preservado (os services de
 * IA/WhatsApp operam dentro de TenantContext do tenant-alvo; atendimento/LGPD são
 * colunas do Tenant e usam prisma.platform() — cross-tenant explícito).
 */
@Controller('_platform/tenants/:id/config')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class PlatformTenantConfigController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappConfig: WhatsappConfigService,
    private readonly iaConfig: TenantIaConfigService,
    private readonly lgpdDoc: LgpdDocService,
  ) {}

  // ============================================================ IA
  @Get('ia')
  async getIa(@Param('id') id: string) {
    await this.assertTenant(id);
    return this.iaConfig.mascarada(id);
  }

  @Put('ia')
  async putIa(
    @Param('id') id: string,
    @Body() dto: PlatformIaConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertTenant(id);
    await this.iaConfig.salvar(id, dto);
    await this.auditar(id, user, 'PLATFORM_CONFIG_IA', dto);
    return this.iaConfig.mascarada(id);
  }

  // ============================================================ WhatsApp
  @Get('whatsapp')
  async getWhatsapp(@Param('id') id: string) {
    await this.assertTenant(id);
    return this.whatsappConfig.configMascarada(id);
  }

  @Put('whatsapp')
  async putWhatsapp(
    @Param('id') id: string,
    @Body() dto: PlatformWhatsappConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertTenant(id);
    await this.whatsappConfig.salvar(id, dto);
    await this.auditar(id, user, 'PLATFORM_CONFIG_WHATSAPP', dto);
    return this.whatsappConfig.configMascarada(id);
  }

  // ============================================================ Atendimento
  private readonly camposAtendimento = {
    atendimentoHumanoAtivo: true,
    iaChatWidgetAtivo: true,
    iaChatHabilitada: true,
    iaTriagemHabilitada: true,
    atendimentoAvisoLgpd: true,
    atendimentoMensagemForaExp: true,
    atendimentoSaudacao: true,
    atendimentoInatividadeMin: true,
    atendimentoTimezone: true,
  } as const;

  @Get('atendimento')
  async getAtendimento(@Param('id') id: string) {
    const t = await this.prisma.platform().tenant.findUnique({
      where: { id },
      select: this.camposAtendimento,
    });
    if (!t) throw new NotFoundException('Tenant não encontrado.');
    return t;
  }

  @Put('atendimento')
  async putAtendimento(
    @Param('id') id: string,
    @Body() dto: PlatformAtendimentoConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertTenant(id);
    const data = somenteDefinidos(dto);
    const atualizado = await this.prisma.platform().tenant.update({
      where: { id },
      data,
      select: this.camposAtendimento,
    });
    await this.auditar(id, user, 'PLATFORM_CONFIG_ATENDIMENTO', dto);
    return atualizado;
  }

  // ============================================================ LGPD / DPO
  @Get('lgpd')
  async getLgpd(@Param('id') id: string) {
    const t = await this.prisma.platform().tenant.findUnique({
      where: { id },
      select: { dpoNome: true, dpoEmail: true },
    });
    if (!t) throw new NotFoundException('Tenant não encontrado.');
    return t;
  }

  @Put('lgpd')
  async putLgpd(
    @Param('id') id: string,
    @Body() dto: PlatformLgpdConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertTenant(id);
    const data: Record<string, unknown> = {};
    if (dto.dpoNome !== undefined) data.dpoNome = dto.dpoNome.trim() || null;
    if (dto.dpoEmail !== undefined) data.dpoEmail = dto.dpoEmail.trim() || null;
    const atualizado = await this.prisma.platform().tenant.update({
      where: { id },
      data,
      select: { dpoNome: true, dpoEmail: true },
    });
    await this.auditar(id, user, 'PLATFORM_CONFIG_LGPD', { dpoNome: dto.dpoNome });
    return atualizado;
  }

  // ============================================================ Documentação LGPD
  /** Estado da documentação LGPD gerada (metadados + dados complementares). */
  @Get('lgpd/documento')
  async getLgpdDocumento(@Param('id') id: string) {
    await this.assertTenant(id);
    return this.lgpdDoc.obter(id);
  }

  /**
   * "Gerar LGPD": renderiza a documentação com o template global + dados da
   * entidade e persiste. Os dados complementares (telefone/endereço do DPO,
   * endereço da entidade, autoridade signatária) vêm no corpo.
   */
  @Post('lgpd/gerar')
  async gerarLgpd(
    @Param('id') id: string,
    @Body() dto: DadosLgpdEntidade,
    @CurrentUser() user: AuthUser,
  ) {
    await this.assertTenant(id);
    const res = await this.lgpdDoc.gerar(id, dto ?? {}, user?.id);
    await this.auditar(id, user, 'PLATFORM_LGPD_DOC_GERADO', { versao: res.versao });
    return res;
  }

  // ============================================================ helpers
  private async assertTenant(id: string): Promise<void> {
    const t = await this.prisma.platform().tenant.findUnique({ where: { id }, select: { id: true } });
    if (!t) throw new NotFoundException('Tenant não encontrado.');
  }

  /**
   * Auditoria sem segredo em claro: registra apenas QUE campos mudaram (chaves),
   * nunca os valores de tokens/chaves.
   */
  private async auditar(
    tenantId: string,
    user: AuthUser,
    acao: string,
    dto: object,
  ): Promise<void> {
    await this.prisma.platform().auditLog.create({
      data: {
        tenantId: null,
        atorId: user?.id ?? null,
        acao,
        entidade: 'tenant',
        entidadeId: tenantId,
        dados: { camposAlterados: Object.keys(dto) },
      },
    });
  }
}

/** Mantém só as chaves presentes no DTO (ignora undefined). */
function somenteDefinidos(dto: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dto as Record<string, unknown>)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
