import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { DiarioService, DadosMateria } from './diario.service';

/**
 * Painel admin do Diário Oficial. Rotas de leitura admin separadas do
 * controller público para evitar conflito de rota com `:numero`.
 * Mutações (PUT, POST revogar, DELETE) ficam no DiarioController.
 */
@Controller('admin/diario')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class DiarioAdminController {
  constructor(private readonly service: DiarioService) {}

  @Get()
  listar(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarAdmin({
      status,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  // ---- matérias da edição (literais e 2 segmentos não conflitam com :id) ----
  @Get(':id/materias')
  listarMaterias(@Param('id') id: string) {
    return this.service.listarMaterias(id);
  }

  @Post(':id/materias')
  addMateria(@Param('id') id: string, @Body() dto: DadosMateria) {
    return this.service.adicionarMateria(id, dto);
  }

  @Put('materias/:mid')
  editMateria(@Param('mid') mid: string, @Body() dto: DadosMateria) {
    return this.service.atualizarMateria(mid, dto);
  }

  @Delete('materias/:mid')
  delMateria(@Param('mid') mid: string) {
    return this.service.excluirMateria(mid);
  }

  /** (Re)gera o PDF da edição publicada. */
  @Post(':id/gerar-pdf')
  gerarPdf(@Param('id') id: string) {
    return this.service.regerarPdf(id);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscarAdmin(id);
  }
}
