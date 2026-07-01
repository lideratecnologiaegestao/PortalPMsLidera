import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { BuscaQueryDto } from './busca.dto';
import { BuscaService } from './busca.service';
import { BuscaSyncService } from './busca-sync.service';

/**
 * Buscador unificado do portal — acesso PÚBLICO.
 *
 * Sem @Roles nem @UseGuards(RolesGuard): o endpoint é público. O isolamento de
 * tenant é garantido exclusivamente pelo RLS (GUC `app.current_tenant_id`
 * configurado pelo TenantMiddleware antes de qualquer query). Conforme Regra 2
 * do CLAUDE.md, as duas camadas de segurança são independentes; aqui o RBAC
 * não se aplica (conteúdo é público), mas o RLS continua obrigatório.
 *
 * Validação do `q` (2–200 chars) e `tipo` (enum fechado) acontece via
 * ValidationPipe global (configurado em main.ts com whitelist: true).
 */
@Controller('busca')
export class BuscaController {
  constructor(private readonly service: BuscaService) {}

  @Get()
  buscar(@Query() query: BuscaQueryDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(50, Math.max(1, Number(query.pageSize ?? 10)));

    return this.service.buscar({
      q: query.q,
      tipo: query.tipo,
      page,
      pageSize,
    });
  }
}

/** Reindexação do buscador (admin). RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/busca')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class BuscaAdminController {
  constructor(private readonly sync: BuscaSyncService) {}

  /** Enfileira a reindexação completa do índice de busca do tenant. */
  @Post('reindexar')
  async reindexar() {
    const tenantId = TenantContext.tenantId()!;
    await this.sync.reindexarTenant(tenantId);
    return { enfileirado: true };
  }
}
