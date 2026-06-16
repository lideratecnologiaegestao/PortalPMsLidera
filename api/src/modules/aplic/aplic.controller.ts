import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { AplicIngestaoService } from './aplic-ingestao.service';
import { AplicConsultaService } from './aplic-consulta.service';

/**
 * Importação e consulta da carga contábil APLIC (TCE-MT) — módulo CT.
 * RBAC: GESTOR / ADMIN_PREFEITURA. RLS: TenantContext (automático).
 *
 * Fase 1 (POC): upload síncrono do .zip. Cargas muito grandes migrarão para
 * processamento assíncrono (fila) numa fase seguinte.
 */
@Controller('admin/aplic')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class AplicController {
  constructor(
    private readonly ingestao: AplicIngestaoService,
    private readonly consulta: AplicConsultaService,
    private readonly prisma: PrismaService,
  ) {}

  /** POST /api/admin/aplic/importar — multipart, campo `file` = .zip da carga. */
  @Post('importar')
  @UseInterceptors(FileInterceptor('file'))
  async importar(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string; mimetype?: string } | undefined,
    @Request() req: { user?: { id?: string } },
  ) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não identificado.');
    if (!file?.buffer?.length) throw new BadRequestException('Envie o arquivo .zip da carga no campo "file".');

    const nome = file.originalname ?? '';
    if (!/\.zip$/i.test(nome) && file.mimetype !== 'application/zip' && file.mimetype !== 'application/x-zip-compressed') {
      throw new BadRequestException('O arquivo deve ser um .zip de carga APLIC.');
    }

    try {
      return await this.ingestao.importarZip(tenantId, file.buffer, {
        arquivoNome: nome,
        criadoPor: req.user?.id,
      });
    } catch (e) {
      throw new BadRequestException(`Falha ao importar a carga: ${(e as Error).message}`);
    }
  }

  /** GET /api/admin/aplic/cargas — histórico de importações do tenant. */
  @Get('cargas')
  async cargas() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) return [];
    return this.prisma.db.aplicCarga.findMany({
      orderBy: { criadoEm: 'desc' },
      take: 50,
    });
  }

  /** GET /api/admin/aplic/resumo?exercicio=2026 — totais (empenhado/liquidado/pago). */
  @Get('resumo')
  async resumo(@Query('exercicio') exercicioStr?: string) {
    if (!TenantContext.tenantId()) return null;
    return this.consulta.resumo(exercicioStr ? Number(exercicioStr) : undefined);
  }

  /** GET /api/admin/aplic/credores/maiores?exercicio=&por=empenhado|liquidado&limite= */
  @Get('credores/maiores')
  async maioresCredores(
    @Query('exercicio') exercicioStr?: string,
    @Query('por') por?: string,
    @Query('limite') limiteStr?: string,
  ) {
    if (!TenantContext.tenantId()) return null;
    return this.consulta.maioresCredores({
      exercicio: exercicioStr ? Number(exercicioStr) : undefined,
      por: por === 'liquidado' ? 'liquidado' : 'empenhado',
      limite: limiteStr ? Number(limiteStr) : undefined,
    });
  }

  /** GET /api/admin/aplic/credor?q=nome|cpf&exercicio= */
  @Get('credor')
  async credor(@Query('q') q?: string, @Query('exercicio') exercicioStr?: string) {
    if (!TenantContext.tenantId() || !q) return null;
    return this.consulta.porCredor(q, exercicioStr ? Number(exercicioStr) : undefined);
  }

  /** GET /api/admin/aplic/empenho?numero=000001/2026&exercicio= */
  @Get('empenho')
  async empenho(@Query('numero') numero?: string, @Query('exercicio') exercicioStr?: string) {
    if (!TenantContext.tenantId() || !numero) return null;
    return this.consulta.situacaoEmpenho(numero, exercicioStr ? Number(exercicioStr) : undefined);
  }
}
