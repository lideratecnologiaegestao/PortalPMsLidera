import { Controller, Get, Header, Query } from '@nestjs/common';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AplicConsultaService } from './aplic-consulta.service';
import { AplicConfigService } from './aplic-config.service';

/**
 * Vitrine PÚBLICA de recursos por FONTE (contabilidade APLIC/TCE-MT):
 * disponibilidade por fonte (DDR), caixa e equivalentes por fonte, e
 * arrecadação por período. Sem auth; tenant via Host (RLS). Só serve quando a
 * fonte APLIC está habilitada para a entidade. Números determinísticos.
 */
@Controller('transparencia/recursos')
export class AplicRecursosController {
  constructor(
    private readonly consulta: AplicConsultaService,
    private readonly config: AplicConfigService,
  ) {}

  private async ativo(): Promise<boolean> {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return false;
    return (await this.config.obter(tenantId)).habilitado;
  }

  /** Saldo por fonte de recurso (disponibilidade — conta 8.2.1.1). */
  @Get('saldo-fonte')
  @Header('Cache-Control', 'public, max-age=300')
  async saldoFonte(@Query('ate') ate?: string) {
    if (!(await this.ativo())) return null;
    return this.consulta.saldoPorFonte(ate);
  }

  /** Saldo de caixa e equivalentes (conta 1.1.1.x), por fonte. */
  @Get('caixa')
  @Header('Cache-Control', 'public, max-age=300')
  async caixa(@Query('ate') ate?: string, @Query('fonte') fonte?: string) {
    if (!(await this.ativo())) return null;
    return this.consulta.saldoCaixaEquivalentes(ate, fonte);
  }

  /** Receita arrecadada entre duas datas (conta 6.2.1.2), total e por fonte. */
  @Get('arrecadado')
  @Header('Cache-Control', 'public, max-age=300')
  async arrecadado(@Query('de') de?: string, @Query('ate') ate?: string, @Query('fonte') fonte?: string) {
    if (!(await this.ativo())) return null;
    if (!de || !ate) return { erro: 'Informe as datas (de, ate) no formato AAAA-MM-DD.' };
    return this.consulta.arrecadadoPeriodo(de, ate, fonte);
  }
}
