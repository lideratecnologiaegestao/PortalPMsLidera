import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingsService } from './embeddings.service';
import { IaIndexadorService } from './ia-indexador.service';
import { JOB_IA_REINDEX, QUEUE_IA } from '../queue/queue.constants';

/**
 * Endpoints administrativos da Camada 4 (busca semântica).
 * - POST /api/admin/ia/reindexar   → enfileira reindexação do corpus vetorial.
 * - GET  /api/admin/ia/index-status → estado atual do corpus (contagem por fonte).
 *
 * RBAC: GESTOR e ADMIN_PREFEITURA. RLS via TenantContext (automático).
 * Auditoria: IA_REINDEX_SOLICITADO.
 */
@Controller('admin/ia')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class IaAdminController {
  constructor(
    @InjectQueue(QUEUE_IA) private readonly iaQueue: Queue,
    private readonly embeddings: EmbeddingsService,
    private readonly iaIndexador: IaIndexadorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Enfileira a reindexação do corpus vetorial do tenant.
   * Idempotente: jobId fixo por tenant (BullMQ descarta duplicatas).
   * Se embeddings não estiver configurado, responde sem enfileirar (degrada).
   */
  @Post('reindexar')
  async reindexar(@Request() req: { user?: { id?: string } }) {
    const tenantId = TenantContext.tenantId();

    if (!tenantId) {
      return { enfileirado: false, configurado: false, aviso: 'Tenant não identificado.' };
    }

    const info = await this.embeddings.infoParaTenant(tenantId);
    if (!info.configurado) {
      return {
        enfileirado: false,
        configurado: false,
        aviso: 'Configure a chave de embeddings (Voyage/OpenAI) — globalmente ou nesta entidade — para habilitar a busca semântica.',
      };
    }

    // Audita antes de enfileirar
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: req.user?.id ?? null,
        acao: 'IA_REINDEX_SOLICITADO',
        entidade: 'ia_chunks',
        entidadeId: null,
        dados: {
          provider: info.provider,
          modelo: info.modelo,
        } as object,
      },
    });

    const jobId = `ia-reindex-${tenantId}`;
    await this.iaQueue.add(
      JOB_IA_REINDEX,
      { tenantId },
      {
        jobId, // dedup de runs CONCORRENTES; removeOnComplete/Fail=true p/ permitir re-disparo
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 2,
        backoff: { type: 'exponential', delay: 10_000 },
      },
    );

    return {
      enfileirado: true,
      configurado: true,
      jobId,
    };
  }

  /**
   * Retorna o estado atual do corpus vetorial do tenant:
   * total de chunks, contagem por fonte, modelo e provedor.
   */
  @Get('index-status')
  async indexStatus() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) {
      return { configurado: this.embeddings.configurado, total: 0, porFonte: [] };
    }
    return this.iaIndexador.status(tenantId);
  }
}
