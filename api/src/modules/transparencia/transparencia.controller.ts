import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { PublicCacheInterceptor } from '../../common/http/public-cache.interceptor';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import {
  JOB_TRANSPARENCIA_SYNC,
  QUEUE_TRANSPARENCIA,
} from '../queue/queue.constants';
import { TransparenciaService } from './transparencia.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { toCsv } from './csv.util';
import { DICIONARIO } from './dicionario';
import { pdfModeloDaCategoria } from './modelo-pdf.util';
import { ConsultaQuery, SyncPayload } from './transparencia.types';

/**
 * Portal da Transparência (transparência ativa, LC 131/LRF). Leituras são
 * PÚBLICAS (sem auth) — o RLS isola por tenant pelo Host. As exportações
 * CSV/JSON são a camada de dados abertos. A ingestão (`_sync`) é restrita e
 * roda em fila (ETL pesado do n8n).
 */
@Controller('transparencia')
@UseInterceptors(PublicCacheInterceptor)
export class TransparenciaController {
  constructor(
    private readonly service: TransparenciaService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_TRANSPARENCIA) private readonly fila: Queue,
  ) {}

  private parse(q: Record<string, string>): ConsultaQuery {
    return {
      ano: q.ano ? Number(q.ano) : undefined,
      mes: q.mes ? Number(q.mes) : undefined,
      orgao: q.orgao,
      cargo: q.cargo,
      credor: q.credor,
      page: q.page ? Number(q.page) : undefined,
      pageSize: q.pageSize ? Number(q.pageSize) : undefined,
    };
  }

  // ----------------------------------------------------------- DESPESAS
  @Get('despesas')
  listarDespesas(@Query() q: Record<string, string>) {
    return this.service.listarDespesas(this.parse(q));
  }

  @Get('despesas.json')
  exportarDespesasJson(@Query() q: Record<string, string>) {
    return this.service.exportarDespesas(this.parse(q));
  }

  @Get('despesas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="despesas.csv"')
  async exportarDespesasCsv(
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.service.exportarDespesas(this.parse(q));
    res.send(toCsv(rows as unknown as Record<string, unknown>[]));
  }

  // ----------------------------------------------------------- RECEITAS
  @Get('receitas')
  listarReceitas(@Query() q: Record<string, string>) {
    return this.service.listarReceitas(this.parse(q));
  }

  @Get('receitas.json')
  exportarReceitasJson(@Query() q: Record<string, string>) {
    return this.service.exportarReceitas(this.parse(q));
  }

  @Get('receitas.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="receitas.csv"')
  async exportarReceitasCsv(
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.service.exportarReceitas(this.parse(q));
    res.send(toCsv(rows as unknown as Record<string, unknown>[]));
  }

  // ------------------------------------------------------------- FOLHA
  // Público, porém com minimização LGPD: CPF nunca exposto, matrícula
  // mascarada, nome suprimível (parecer DPO em docs/06-lgpd-gdpr.md).
  @Get('folha')
  listarFolha(@Query() q: Record<string, string>) {
    return this.service.listarFolha(this.parse(q));
  }

  @Get('folha.json')
  exportarFolhaJson(@Query() q: Record<string, string>) {
    return this.service.exportarFolha(this.parse(q));
  }

  @Get('folha.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="folha.csv"')
  async exportarFolhaCsv(
    @Query() q: Record<string, string>,
    @Res() res: Response,
  ) {
    const rows = await this.service.exportarFolha(this.parse(q));
    res.send(toCsv(rows as unknown as Record<string, unknown>[]));
  }

  // -------------------------------------------------- Dicionário de dados
  @Get('dicionario')
  dicionario() {
    return DICIONARIO;
  }

  // ------------------------------------------- Documento publicado (storage)
  /**
   * Baixa um documento de Transparência guardado no storage (ex.: inteiro teor
   * de contrato / edital vindos da carga APLIC). Público; o RLS por Host garante
   * que o documento pertence à entidade. Sirva só docs com storage_key.
   */
  @Get('documento/:id')
  async documento(@Param('id') id: string, @Res() res: Response) {
    if (!TenantContext.tenantId()) { res.status(404).end(); return; }
    const doc = await this.prisma.db.transpDocumento.findUnique({
      where: { id },
      select: { storageKey: true, titulo: true },
    });
    if (!doc?.storageKey) { res.status(404).end(); return; }
    const { buffer, mime } = await this.storage.get(doc.storageKey);
    const nome = (doc.titulo || 'documento').replace(/[^\w.-]+/g, '_').slice(0, 80);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    res.send(buffer);
  }

  // ------------------------------------------- Documentos-modelo (exemplo)
  /**
   * Serve um PDF de EXEMPLO para uma categoria de documento de transparência.
   * Os documentos semeados no provisionamento apontam para cá, de modo que o
   * link entregue ao cidadão sempre baixa um arquivo válido (nunca 404),
   * deixando claro que a prefeitura deve substituí-lo pelo arquivo oficial.
   * Público (sem auth); o conteúdo não depende de tenant.
   */
  @Get('modelo/:slug')
  @Header('Content-Type', 'application/pdf')
  modelo(@Param('slug') slug: string, @Res() res: Response) {
    const categoria = slug.replace(/\.pdf$/i, '');
    const { nome, pdf } = pdfModeloDaCategoria(categoria);
    res.setHeader('Content-Disposition', `inline; filename="${nome}"`);
    res.send(pdf);
  }

  // ----------------------------------------------- Ingestão (ETL n8n)
  /**
   * Enfileira uma carga do sistema contábil. Restrito a admin do tenant /
   * super_admin (o n8n autentica como serviço). Processamento pesado vai
   * para a fila `integracoes` (worker faz o upsert idempotente).
   */
  @Post('_sync')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
  async sync(@Body() body: SyncPayload) {
    const tenantId = TenantContext.tenantId();
    await this.fila.add(
      JOB_TRANSPARENCIA_SYNC,
      {
        tenantId,
        dataset: body.dataset,
        origem: body.origem,
        registros: body.registros ?? [],
      },
      { jobId: `transp:${tenantId}:${body.dataset}:${Date.now()}` },
    );
    return { enfileirado: true, dataset: body.dataset, total: body.registros?.length ?? 0 };
  }
}
