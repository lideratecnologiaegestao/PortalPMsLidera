import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarSecretariaDto, AtualizarSecretariaDto, DadosEventoDto } from './secretarias.dto';
import { SecretariasService } from './secretarias.service';

/** Leitura pública de secretarias ativas. */
@Controller('secretarias')
export class SecretariasController {
  constructor(private readonly service: SecretariasService) {}

  /** Lista todas as secretarias ativas do tenant. */
  @Get()
  listarAtivas() {
    return this.service.listarAtivas();
  }

  /** Estrutura organizacional (gabinete + órgãos de controle + organograma). */
  @Get('estrutura')
  estrutura() {
    return this.service.estrutura();
  }

  /**
   * Unidades de atendimento mais próximas de um ponto.
   * GET /api/secretarias/unidades/proximas?lat=&lng=&raio=  (raio em metros)
   * Rota literal antes de :slug para não colidir.
   */
  @Get('unidades/proximas')
  unidadesProximas(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('raio') raio?: string,
  ) {
    return this.service.unidadesProximas(Number(lat), Number(lng), Number(raio ?? 5000));
  }

  /**
   * Arquivo .ics de um evento (Apple/iPhone, Outlook desktop e demais).
   * GET /api/secretarias/eventos/:id/ics  → text/calendar (download)
   */
  @Get('eventos/:id/ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  async eventoIcs(@Param('id') id: string, @Res() res: Response) {
    const { nome, conteudo } = await this.service.eventoIcs(id);
    res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
    res.send(conteudo);
  }

  /**
   * Retorna detalhes públicos de uma secretaria ativa pelo slug.
   * GET /api/secretarias/:slug
   * Shape: { id, nome, sigla, responsavel, fotoUrl, descricao, email, telefone, slug }
   * 404 se não encontrada ou inativa.
   */
  @Get(':slug')
  buscarPorSlug(@Param('slug') slug: string) {
    return this.service.buscarPorSlug(slug);
  }
}

/** Gestão admin de secretarias. RBAC: GESTOR, ADMIN_PREFEITURA. */
@Controller('admin/secretarias')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class SecretariasAdminController {
  constructor(private readonly service: SecretariasService) {}

  @Get()
  listarAdmin(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.listarAdmin({
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  // trabalhos realizados (literais antes de :id)
  @Get(':id/trabalhos')
  listarTrabalhos(@Param('id') id: string) {
    return this.service.listarTrabalhos(id);
  }
  @Post(':id/trabalhos')
  addTrabalho(@Param('id') id: string, @Body() b: any) {
    return this.service.adicionarTrabalho(id, b);
  }
  @Delete('trabalhos/:tid')
  delTrabalho(@Param('tid') tid: string) {
    return this.service.excluirTrabalho(tid);
  }

  // unidades do órgão
  @Get(':id/unidades')
  listarUnidades(@Param('id') id: string) {
    return this.service.listarUnidades(id);
  }
  @Post(':id/unidades')
  addUnidade(@Param('id') id: string, @Body() b: any) {
    return this.service.adicionarUnidade(id, b);
  }
  @Put('unidades/:uid')
  editUnidade(@Param('uid') uid: string, @Body() b: any) {
    return this.service.atualizarUnidade(uid, b);
  }
  @Delete('unidades/:uid')
  delUnidade(@Param('uid') uid: string) {
    return this.service.excluirUnidade(uid);
  }

  // eventos (agenda da secretaria)
  @Get(':id/eventos')
  listarEventos(@Param('id') id: string) {
    return this.service.listarEventosAdmin(id);
  }
  @Post(':id/eventos')
  addEvento(@Param('id') id: string, @Body() dto: DadosEventoDto) {
    return this.service.adicionarEvento(id, dto);
  }
  @Put('eventos/:eid')
  editEvento(@Param('eid') eid: string, @Body() dto: DadosEventoDto) {
    return this.service.atualizarEvento(eid, dto);
  }
  @Delete('eventos/:eid')
  delEvento(@Param('eid') eid: string) {
    return this.service.excluirEvento(eid);
  }

  // autoridades (gabinete)
  @Get(':id/autoridades')
  listarAutoridades(@Param('id') id: string) {
    return this.service.listarAutoridades(id);
  }
  @Post(':id/autoridades')
  addAutoridade(@Param('id') id: string, @Body() b: any) {
    return this.service.adicionarAutoridade(id, b);
  }
  @Put('autoridades/:aid')
  editAutoridade(@Param('aid') aid: string, @Body() b: any) {
    return this.service.atualizarAutoridade(aid, b);
  }
  @Delete('autoridades/:aid')
  delAutoridade(@Param('aid') aid: string) {
    return this.service.excluirAutoridade(aid);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  criar(@Body() dto: CriarSecretariaDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub);
  }

  @Put(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarSecretariaDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub);
  }

  @Delete(':id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluir(id, user?.sub);
  }
}
