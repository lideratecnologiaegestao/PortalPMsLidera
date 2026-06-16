import {
  BadRequestException, Controller, Delete, Get, HttpCode, NotFoundException,
  Param, Post, Query, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { BackupService } from './backup.service';
import { JOB_BACKUP_RUN, QUEUE_BACKUP } from '../queue/queue.constants';

/** Backups da plataforma (super_admin). Status, lista e disparo manual. */
@Controller('_platform/backups')
@UseGuards(RolesGuard)
@Roles(Role.SUPER_ADMIN)
export class BackupController {
  constructor(
    @InjectQueue(QUEUE_BACKUP) private readonly fila: Queue,
    private readonly backup: BackupService,
    private readonly settings: PlatformSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async status() {
    const cfg = (await this.settings.mascarada()).backup;
    return {
      disponivel: this.backup.disponivel,
      bucket: process.env.BACKUP_BUCKET ?? 'portal-backups',
      config: cfg,
      backups: await this.backup.listar(),
      backupsEntidades: await this.backup.listarEntidades(),
    };
  }

  /** Dispara o backup de UMA entidade (dump SQL restaurável da entidade). */
  @Post('entidade/:tenantId')
  @HttpCode(200)
  async entidade(@Param('tenantId') tenantId: string, @CurrentUser() user: AuthUser) {
    if (!this.backup.disponivel) return { enfileirado: false, aviso: 'Backup não configurado no ambiente.' };
    await this.fila.add(JOB_BACKUP_RUN, { tenantId }, { jobId: `backup-ent-${tenantId}`, removeOnComplete: true, removeOnFail: true });
    await this.prisma.platform().auditLog.create({
      data: { tenantId: null, atorId: user?.id ?? null, acao: 'PLATFORM_BACKUP_ENTIDADE', entidade: 'backup', entidadeId: tenantId, dados: {} as object },
    });
    return { enfileirado: true };
  }

  @Post('executar')
  @HttpCode(200)
  async executar(@CurrentUser() user: AuthUser) {
    if (!this.backup.disponivel) {
      return { enfileirado: false, aviso: 'Backup não configurado no ambiente (STORAGE_* e BACKUP_DATABASE_URL).' };
    }
    await this.fila.add(JOB_BACKUP_RUN, {}, { jobId: 'backup-manual', removeOnComplete: true, removeOnFail: true });
    await this.prisma.platform().auditLog.create({
      data: { tenantId: null, atorId: user?.id ?? null, acao: 'PLATFORM_BACKUP_MANUAL', entidade: 'backup', entidadeId: null, dados: {} as object },
    });
    return { enfileirado: true };
  }

  /** Download de um backup (GET /api/_platform/backups/download?key=db/...). */
  @Get('download')
  async download(@Query('key') key: string, @Res() res: Response) {
    if (!key) throw new BadRequestException('Informe a key do backup.');
    const buffer = await this.backup.baixar(key);
    if (!buffer) throw new NotFoundException('Backup não encontrado.');
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
    res.send(buffer);
  }

  /** Exclui um backup (DELETE /api/_platform/backups?key=db/...). */
  @Delete()
  async excluir(@Query('key') key: string, @CurrentUser() user: AuthUser) {
    if (!key) throw new BadRequestException('Informe a key do backup.');
    const ok = await this.backup.excluir(key);
    await this.prisma.platform().auditLog.create({
      data: { tenantId: null, atorId: user?.id ?? null, acao: 'PLATFORM_BACKUP_EXCLUIR', entidade: 'backup', entidadeId: null, dados: { key } as object },
    });
    return { ok };
  }
}
