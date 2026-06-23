import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { IaConteudosService } from './ia-conteudos.service';
import {
  CriarConteudoDto,
  AtualizarConteudoDto,
  ListarConteudosQuery,
} from './ia-conteudos.dto';

type AuthRequest = { user?: { id?: string; role?: string } };

/**
 * CRUD administrativo dos conteúdos longos de conhecimento da IA (ia_conteudos).
 * Alimentam o RAG do chatbot com artigos, regimentos, normas, eventos etc.
 *
 * Escopo de secretaria (ADR-0005 Fase 4):
 *  - ADMIN_PREFEITURA / TI → acesso irrestrito.
 *  - GESTOR               → apenas conteúdos da secretaria de sua lotação.
 * RLS garante isolamento entre tenants.
 */
@Controller('admin/ia/conteudos')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA, Role.TI)
export class IaConteudosController {
  constructor(private readonly service: IaConteudosService) {}

  @Get()
  listar(@Query() query: ListarConteudosQuery, @Request() req: AuthRequest) {
    return this.service.listar(
      {
        categoria: query.categoria,
        secretariaId: query.secretaria,
        q: query.q,
      },
      req.user?.id,
      req.user?.role,
    );
  }

  @Get(':id')
  obter(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ) {
    return this.service.obter(id, req.user?.id, req.user?.role);
  }

  @Post()
  criar(@Body() dto: CriarConteudoDto, @Request() req: AuthRequest) {
    return this.service.criar(dto, req.user?.id, req.user?.role);
  }

  @Put(':id')
  atualizar(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AtualizarConteudoDto,
    @Request() req: AuthRequest,
  ) {
    return this.service.atualizar(id, dto, req.user?.id, req.user?.role);
  }

  @Delete(':id')
  async excluir(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: AuthRequest,
  ) {
    await this.service.excluir(id, req.user?.id, req.user?.role);
    return { ok: true };
  }
}
