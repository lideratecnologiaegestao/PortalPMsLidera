import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { QUEUE_APP_BUILD, JOB_APP_BUILD } from '../queue/queue.constants';
import { PerfilBuild } from './app-config-build.dto';

/**
 * Gerencia a solicitação, listagem e consulta de builds EAS do App do Cidadão.
 *
 * Pré-requisitos verificados em `solicitar()`:
 *  - config.easProjectId preenchido (precisa de `eas init` pelo time Lidera).
 *  - EXPO_TOKEN presente no env do servidor (infra responsabilidade do deploy).
 *  - config.apiUrl preenchido (necessário para o app saber onde falar com a API).
 *
 * Auditoria: APP_BUILD_SOLICITADO em todo caso de sucesso.
 */
@Injectable()
export class AppConfigBuildService {
  private readonly log = new Logger(AppConfigBuildService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(QUEUE_APP_BUILD) private readonly fila: Queue,
  ) {}

  /**
   * Valida pré-requisitos, cria o registro em `tenant_app_builds` com status
   * 'enfileirado' e enfileira o job. Retorna { buildId, status }.
   */
  async solicitar(perfil: PerfilBuild, userId: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    // 1. Carrega a config do app para este tenant
    const config = await this.prisma.db.tenantAppConfig.findUnique({
      where: { tenantId },
      select: {
        easProjectId: true,
        easOwner: true,
        apiUrl: true,
        appName: true,
        appShortName: true,
        scheme: true,
        bundleId: true,
        primaryColor: true,
        iconStorageKey: true,
        splashStorageKey: true,
      },
    });

    // 2. Busca o slug do tenant (necessário como arg do eas build)
    const tenant = await this.prisma.platform().tenant.findUnique({
      where: { id: tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new BadRequestException('Tenant não encontrado.');

    // 3. Validações de pré-requisito
    if (!config?.easProjectId?.trim()) {
      throw new BadRequestException(
        'Projeto EAS não configurado para esta entidade — peça à equipe Lidera o eas init.',
      );
    }
    if (!process.env.EXPO_TOKEN?.trim()) {
      throw new BadRequestException(
        'Servidor de build não configurado (EXPO_TOKEN).',
      );
    }
    if (!config.apiUrl?.trim()) {
      throw new BadRequestException(
        'A URL da API (apiUrl) precisa estar preenchida antes de gerar o build.',
      );
    }

    // 4. Cria o registro de build com status 'enfileirado'
    const build = await this.prisma.db.tenantAppBuild.create({
      data: {
        tenantId,
        perfil,
        plataforma: 'android',
        status: 'enfileirado',
        solicitadoPor: userId,
      },
    });

    // 5. Enfileira o job (jobId = buildId garante idempotência)
    await this.fila.add(
      JOB_APP_BUILD,
      { tenantId, buildId: build.id, perfil, slug: tenant.slug },
      {
        jobId: build.id,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 200 },
      },
    );

    // 6. Audita
    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: userId,
        acao: 'APP_BUILD_SOLICITADO',
        entidade: 'tenant_app_builds',
        entidadeId: build.id,
        dados: { perfil, buildId: build.id } as object,
      } as any,
    });

    this.log.log(`Build ${build.id} (${perfil}) enfileirado para tenant ${tenantId}.`);
    return { buildId: build.id, status: 'enfileirado' as const };
  }

  /**
   * Lista os builds do tenant atual (RLS garante isolamento).
   * Ordem: mais recentes primeiro.
   */
  async listar(limit = 20) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    const cap = Math.min(Math.max(1, limit), 100);
    return this.prisma.db.tenantAppBuild.findMany({
      where: { tenantId },
      orderBy: { criadoEm: 'desc' },
      take: cap,
      select: {
        id: true,
        perfil: true,
        plataforma: true,
        status: true,
        easBuildId: true,
        easBuildUrl: true,
        logUrl: true,
        erroResumo: true,
        criadoEm: true,
        atualizadoEm: true,
        solicitante: { select: { id: true, nome: true } },
      },
    });
  }

  /**
   * Retorna um build específico do tenant. 404 se não pertencer ao tenant (RLS).
   */
  async obter(id: string) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não resolvido.');

    const build = await this.prisma.db.tenantAppBuild.findFirst({
      where: { id, tenantId },
      select: {
        id: true,
        perfil: true,
        plataforma: true,
        status: true,
        easBuildId: true,
        easBuildUrl: true,
        logUrl: true,
        erroResumo: true,
        criadoEm: true,
        atualizadoEm: true,
        solicitante: { select: { id: true, nome: true } },
      },
    });

    if (!build) throw new NotFoundException(`Build ${id} não encontrado.`);
    return build;
  }
}
