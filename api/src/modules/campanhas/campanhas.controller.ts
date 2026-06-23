import { Controller, Get } from '@nestjs/common';
import { CampanhasService } from './campanhas.service';

/**
 * Endpoint público do resolver de campanhas.
 * Sem autenticação — o tenant é resolvido pelo TenantMiddleware (Host).
 * Cache Redis TTL 60s; resposta tolerante (capacidade malformada ignorada).
 */
@Controller('campanhas')
export class CampanhasController {
  constructor(private readonly service: CampanhasService) {}

  /**
   * GET /api/campanhas/ativas
   * Retorna o contexto de campanhas ativas para o tenant resolvido pelo Host.
   * Resposta conforme §4 do contrato.
   */
  @Get('ativas')
  ativas() {
    return this.service.resolverAtivas();
  }
}
