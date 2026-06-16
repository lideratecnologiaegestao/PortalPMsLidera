import { Body, Controller, Get, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PainelService } from './painel.service';
import { signPainel, verifyPainel } from './painel-token';

/**
 * Painéis de parede (TV) — modo kiosk. Os GET são autorizados por TOKEN de
 * painel na URL (a TV não loga); o token é emitido por um admin via POST. O
 * tenant vem do Host (RLS); o token precisa bater com esse tenant e com o painel.
 */
@Controller('painel')
export class PainelController {
  constructor(private readonly service: PainelService) {}

  @Get('ouvidoria')
  async ouvidoria(@Query('k') k?: string) {
    await this.autorizar(k, 'ouvidoria');
    return this.service.ouvidoria();
  }

  @Get('prefeito')
  async prefeito(@Query('k') k?: string) {
    await this.autorizar(k, 'prefeito');
    return this.service.prefeito();
  }

  /** Admin gera o token/link da TV (uma vez; validade longa). */
  @Post('token')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.OUVIDOR)
  async emitir(@Body() body: { painel: 'ouvidoria' | 'prefeito' }) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new UnauthorizedException('Tenant não resolvido.');
    const painel = body?.painel === 'prefeito' ? 'prefeito' : 'ouvidoria';
    const token = await signPainel({ tenantId, painel });
    return { painel, token, path: `/painel-tv/${painel}?k=${token}` };
  }

  private async autorizar(k: string | undefined, painel: 'ouvidoria' | 'prefeito') {
    const tenantId = TenantContext.tenantId();
    const claims = k ? await verifyPainel(k) : null;
    if (!claims || claims.painel !== painel || claims.tenantId !== tenantId) {
      throw new UnauthorizedException('Token de painel inválido para este painel/município.');
    }
  }
}
