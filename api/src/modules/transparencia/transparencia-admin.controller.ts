import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarDocumentoDto, AtualizarDocumentoDto } from './transparencia-admin.dto';
import { TransparenciaAdminService } from './transparencia-admin.service';

/**
 * Painel administrativo de transparência. RBAC: ADMIN_PREFEITURA, GESTOR, SUPER_ADMIN.
 * Gestão de documentos e consulta de sync-log (rastreabilidade das ingestões).
 */
@Controller('admin/transparencia')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
export class TransparenciaAdminController {
  constructor(private readonly service: TransparenciaAdminService) {}

  // -------------------------------------------------------- sync-log
  @Get('sync-log')
  syncLog(
    @Query('dataset') dataset?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarSyncLog({
      dataset,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  // -------------------------------------------------------- documentos
  @Get('documentos')
  listarDocumentos(
    @Query('categoria') categoria?: string,
    @Query('exercicio') exercicio?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarDocumentos({
      categoria,
      exercicio: exercicio ? Number(exercicio) : undefined,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  @Post('documentos')
  criarDocumento(@Body() dto: CriarDocumentoDto, @CurrentUser() user?: AuthUser) {
    return this.service.criarDocumento(dto, user?.sub);
  }

  @Patch('documentos/:id')
  atualizarDocumento(
    @Param('id') id: string,
    @Body() dto: AtualizarDocumentoDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizarDocumento(id, dto, user?.sub);
  }

  @Delete('documentos/:id')
  excluirDocumento(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluirDocumento(id, user?.sub);
  }
}
