import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { JOB_DIARIO_ALERTAS, JOB_DIARIO_PDF, QUEUE_INTEGRACOES } from '../queue/queue.constants';
import { DiarioPdfService } from './diario-pdf.service';
import { DiarioConfigService } from './diario-config.service';
import { HINO_BANDEIRA, HINO_NACIONAL } from './hinos-nacionais';
import { DiarioAlertasService } from './diario-alertas.service';
import { ThemeService } from '../theme/theme.service';
import { carregarLogoRelatorio } from '../theme/logo-relatorio.util';

interface DiarioJob {
  tenantId: string;
  edicaoId: string;
}

function hostDoTenant(tenant: { dominio: string | null; slug: string } | null): string {
  const base = process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
  return tenant?.dominio ?? `${tenant?.slug ?? 'portal'}.${base}`;
}

/**
 * Worker da fila `integracoes`. Gera o PDF da edição publicada de forma
 * assíncrona (não bloqueia o ato de publicar) e grava o ponteiro do arquivo.
 * Roda fora do HTTP → abre o TenantContext para o RLS valer.
 */
@Processor(QUEUE_INTEGRACOES, { concurrency: 2 })
export class DiarioWorker extends WorkerHost {
  private readonly log = new Logger(DiarioWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: DiarioPdfService,
    private readonly storage: StorageService,
    private readonly alertasSvc: DiarioAlertasService,
    private readonly theme: ThemeService,
    private readonly diarioConfig: DiarioConfigService,
  ) {
    super();
  }

  async process(job: Job<DiarioJob>): Promise<void> {
    const { tenantId, edicaoId } = job.data ?? {};
    if (!tenantId || !edicaoId) return;
    if (job.name === JOB_DIARIO_PDF) return this.gerarPdf(tenantId, edicaoId);
    if (job.name === JOB_DIARIO_ALERTAS) return this.processarAlertas(tenantId, edicaoId);
  }

  /** Dispara o monitoramento por termo para a edição recém-publicada. */
  private async processarAlertas(tenantId: string, edicaoId: string): Promise<void> {
    await TenantContext.run({ tenantId }, async () => {
      const tenant = await this.prisma.platform().tenant.findUnique({ where: { id: tenantId } });
      await this.alertasSvc.processarEdicao(edicaoId, hostDoTenant(tenant));
    });
  }

  private async gerarPdf(tenantId: string, edicaoId: string): Promise<void> {
    await TenantContext.run({ tenantId }, async () => {
      const ed = await this.prisma.db.diarioEdicao.findUnique({ where: { id: edicaoId } });
      if (!ed || ed.status !== 'publicado') return;

      const materias = await this.prisma.db.diarioMateria.findMany({
        where: { edicaoId },
        orderBy: [{ ordem: 'asc' }, { criadoEm: 'asc' }],
        include: { secretaria: { select: { nome: true } } },
      });

      // dados do município (registro de tenants — fora do escopo RLS)
      const tenant = await this.prisma
        .platform()
        .tenant.findUnique({ where: { id: tenantId } });
      const verifyUrl = `https://${hostDoTenant(tenant)}/diario/verificar?hash=${ed.hash ?? ''}`;

      // Carrega o logo do tenant (serve de brasão no cabeçalho/hinos) — null = sem imagem.
      const { tokens } = await this.theme.getTokens();
      const logoBuffer = await carregarLogoRelatorio(tokens);

      // Layout + dados institucionais e hinos (símbolos oficiais).
      const layout = await this.diarioConfig.obter();
      const hinoBrasao = await this.prisma.db.hinoBrasao.findFirst({ select: { hinoTexto: true } });
      const hinoEstado = layout.incluirHinos ? await this.diarioConfig.hinoDoEstado(tenant?.uf) : null;
      const hinoMunicipio =
        layout.incluirHinos && hinoBrasao?.hinoTexto?.trim()
          ? { titulo: `Hino do Município de ${tenant?.nome ?? ''}`.trim(), autores: '', letra: hinoBrasao.hinoTexto.trim() }
          : null;

      const { buffer, paginas } = await this.pdf.gerar(
        {
          numero: ed.numero,
          dataEdicao: ed.dataEdicao,
          titulo: ed.titulo,
          conteudo: ed.conteudo,
          tipoEdicao: ed.tipoEdicao,
          hash: ed.hash,
          municipio: tenant?.nome,
          uf: tenant?.uf,
          verifyUrl,
        },
        materias.map((m) => ({
          tipo: m.tipo,
          numeroAto: m.numeroAto,
          titulo: m.titulo,
          ementa: m.ementa,
          conteudo: m.conteudo,
          orgao: m.secretaria?.nome ?? m.orgaoNome ?? null,
        })),
        {
          logoBuffer,
          brasaoBuffer: logoBuffer, // p/ municípios, o logo é o brasão
          entidade: {
            nome: tenant?.nome ?? 'Entidade',
            cnpj: tenant?.cnpj ?? null,
            endereco: layout.endereco,
            horario: layout.horarioAtendimento,
            telefone: layout.telefone,
          },
          layout: {
            colunas: layout.colunas,
            cabecalhoAtivo: layout.cabecalhoAtivo,
            rodapeAtivo: layout.rodapeAtivo,
            incluirHinos: layout.incluirHinos,
          },
          hinos: layout.incluirHinos
            ? { municipio: hinoMunicipio, estado: hinoEstado, bandeira: HINO_BANDEIRA, nacional: HINO_NACIONAL }
            : null,
        },
      );

      const key = await this.storage.put(`diario/${tenantId}`, buffer, 'application/pdf');
      await this.prisma.db.diarioEdicao.update({
        where: { id: edicaoId },
        data: { arquivoKey: key, totalPaginas: paginas },
      });
      this.log.log(`PDF da edição ${ed.numero} gerado (${paginas} pág., ${buffer.length} bytes).`);
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<DiarioJob>, error: Error): Promise<void> {
    const tenantId = job.data?.tenantId;
    if (!tenantId) return;
    await TenantContext.run({ tenantId }, () =>
      this.prisma.db.auditLog.create({
        data: {
          tenantId,
          acao: 'DIARIO_PDF_FALHOU',
          entidade: 'diario_edicoes',
          entidadeId: job.data?.edicaoId ?? null,
          dados: { erro: error.message },
        } as any,
      }),
    );
  }
}
