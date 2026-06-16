import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { IaConhecimentoService } from './ia-conhecimento.service';
import { CriarConhecimentoDto, AtualizarConhecimentoDto } from './ia-conhecimento.dto';

/**
 * CRUD administrativo da base de conhecimento curada do assistente de IA.
 * Apenas GESTOR e ADMIN_PREFEITURA podem gerenciar — RLS isola por tenant.
 */
@Controller('admin/ia/conhecimento')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class IaConhecimentoController {
  constructor(private readonly service: IaConhecimentoService) {}

  @Get()
  listar() {
    return this.service.listar();
  }

  @Post()
  criar(@Body() dto: CriarConhecimentoDto, @Request() req: { user?: { id?: string } }) {
    return this.service.criar(dto, req.user?.id);
  }

  @Put(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarConhecimentoDto,
    @Request() req: { user?: { id?: string } },
  ) {
    return this.service.atualizar(id, dto, req.user?.id);
  }

  @Delete(':id')
  async excluir(@Param('id', ParseUUIDPipe) id: string) {
    await this.service.excluir(id);
    return { ok: true };
  }
}
