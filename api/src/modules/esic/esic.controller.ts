import { Controller, Get } from '@nestjs/common';
import { EsicService } from './esic.service';

/**
 * Relatório público de transparência ativa do e-SIC (LAI 12.527/2011).
 *
 * Não requer autenticação — transparência ativa exige disponibilização independente
 * de requerimento (LAI art. 8º). O isolamento de tenant é garantido pelo RLS via
 * TenantMiddleware (Host → tenant_id → GUC app.current_tenant_id).
 *
 * LGPD: nenhum campo de identificação do solicitante é exposto.
 */
@Controller('esic')
export class EsicController {
  constructor(private readonly service: EsicService) {}

  /**
   * Estatísticas e últimas solicitações (anonimizadas) do e-SIC do tenant.
   * Retorna: total, por status, série mensal 12m, tempo médio, % no prazo, lista últimas 50.
   */
  @Get('estatisticas')
  estatisticas() {
    return this.service.estatisticas();
  }
}
