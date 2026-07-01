import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { EscolaService } from './escola.service';
import {
  AtualizarAulaDto,
  AtualizarCursoDto,
  AtualizarModuloDto,
  AtualizarProvaDto,
  AtualizarTemplateDto,
  CorrigirTentativaDto,
  CriarAulaDto,
  CriarCursoDto,
  CriarModuloDto,
  CriarProvaDto,
  CriarTemplateDto,
  DuvidaDto,
  FeedbackDto,
  RespostaDuvidaDto,
  SubmeterProvaDto,
  TipoCertificadoDto,
} from './escola.dto';

/** Leitura pública: catálogo de cursos e validação de certificado. */
@Controller()
export class EscolaPublicController {
  constructor(private readonly service: EscolaService) {}

  @Get('cursos')
  listar() {
    return this.service.listarPublicos();
  }

  @Get('cursos/:slug')
  curso(@Param('slug') slug: string) {
    return this.service.cursoPublicoPorSlug(slug);
  }

  /** Validação pública de autenticidade do certificado (sem auth). */
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('validar/:codigo')
  validar(@Param('codigo') codigo: string) {
    return this.service.validarCertificado(codigo);
  }
}

/**
 * Área do aluno (autenticado). JwtAuthGuard é global/soft; o RolesGuard exige
 * usuário logado. Cidadão é o aluno padrão; demais papéis também podem cursar.
 */
@Controller('aluno/escola')
@UseGuards(RolesGuard)
@Roles(
  Role.CIDADAO,
  Role.SERVIDOR,
  Role.PROFESSOR,
  Role.GESTOR,
  Role.OUVIDOR,
  Role.ASSISTENTE_OUVIDORIA,
  Role.TI,
  Role.ADMIN_PREFEITURA,
)
export class EscolaAlunoController {
  constructor(private readonly service: EscolaService) {}

  // inscrição / meus cursos
  @Post('cursos/:slug/inscrever')
  inscrever(@Param('slug') slug: string, @CurrentUser() user: AuthUser) {
    return this.service.inscrever(slug, user.sub);
  }
  @Get('cursos')
  meusCursos(@CurrentUser() user: AuthUser) {
    return this.service.meusCursos(user.sub);
  }

  // aulas / conclusão
  @Get('aulas/:id')
  aula(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.aulaParaAluno(id, user.sub);
  }
  @Post('aulas/:id/concluir')
  concluir(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.concluirAula(id, user.sub);
  }

  // prova
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Get('provas/:id')
  iniciarProva(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.iniciarProva(id, user.sub);
  }
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('provas/heartbeat/:tentativaId')
  heartbeat(@Param('tentativaId') tentativaId: string, @CurrentUser() user: AuthUser) {
    return this.service.heartbeatProva(tentativaId, user.sub);
  }
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('provas/submeter')
  submeter(@Body() dto: SubmeterProvaDto, @CurrentUser() user: AuthUser) {
    return this.service.submeterProva(dto, user.sub);
  }
  @Get('tentativas/:id')
  resultado(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.resultadoTentativa(id, user.sub);
  }

  // certificados
  @Get('certificados')
  certificados(@CurrentUser() user: AuthUser) {
    return this.service.meusCertificados(user.sub);
  }
  /** Streama o PDF do certificado (gera on-demand na 1ª vez; idempotente). */
  @Get('certificados/:id/download')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const { buffer, filename } = await this.service.certificadoParaDownload(id, user.sub);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  }

  // fórum
  @Get('aulas/:id/duvidas')
  duvidas(@Param('id') id: string) {
    return this.service.listarDuvidas(id);
  }
  @Post('duvidas')
  criarDuvida(@Body() dto: DuvidaDto, @CurrentUser() user: AuthUser) {
    return this.service.criarDuvida(dto, user.sub);
  }
  @Post('duvidas/:id/responder')
  responder(@Param('id') id: string, @Body() dto: RespostaDuvidaDto, @CurrentUser() user: AuthUser) {
    return this.service.responderDuvida(id, dto, user.sub, user.role);
  }

  // feedback
  @Post('cursos/:slug/feedback')
  feedback(@Param('slug') slug: string, @Body() dto: FeedbackDto, @CurrentUser() user: AuthUser) {
    return this.service.enviarFeedback(slug, dto, user.sub);
  }
}

/**
 * Painel do professor: CRUD de curso/módulo/aula/prova e correção de
 * dissertativas. RBAC: PROFESSOR (gestores/admin também gerenciam).
 */
@Controller('professor/escola')
@UseGuards(RolesGuard)
@Roles(Role.PROFESSOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
export class EscolaProfessorController {
  constructor(private readonly service: EscolaService) {}

  // cursos
  @Get('cursos')
  listar(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.service.listarGestao({
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }
  @Get('cursos/:id')
  buscar(@Param('id') id: string) {
    return this.service.buscarCurso(id);
  }
  @Post('cursos')
  criar(@Body() dto: CriarCursoDto, @CurrentUser() user?: AuthUser) {
    return this.service.criarCurso(dto, user?.sub);
  }
  @Put('cursos/:id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarCursoDto, @CurrentUser() user?: AuthUser) {
    return this.service.atualizarCurso(id, dto, user?.sub);
  }
  @Delete('cursos/:id')
  excluir(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluirCurso(id, user?.sub);
  }

  // módulos
  @Post('cursos/:id/modulos')
  criarModulo(@Param('id') id: string, @Body() dto: CriarModuloDto) {
    return this.service.criarModulo(id, dto);
  }
  @Put('modulos/:mid')
  atualizarModulo(@Param('mid') mid: string, @Body() dto: AtualizarModuloDto) {
    return this.service.atualizarModulo(mid, dto);
  }
  @Delete('modulos/:mid')
  excluirModulo(@Param('mid') mid: string) {
    return this.service.excluirModulo(mid);
  }

  // aulas
  @Post('cursos/:id/aulas')
  criarAula(@Param('id') id: string, @Body() dto: CriarAulaDto) {
    return this.service.criarAula(id, dto);
  }
  @Put('aulas/:aid')
  atualizarAula(@Param('aid') aid: string, @Body() dto: AtualizarAulaDto) {
    return this.service.atualizarAula(aid, dto);
  }
  @Delete('aulas/:aid')
  excluirAula(@Param('aid') aid: string) {
    return this.service.excluirAula(aid);
  }

  // provas
  @Post('cursos/:id/provas')
  criarProva(@Param('id') id: string, @Body() dto: CriarProvaDto) {
    return this.service.criarProva(id, dto);
  }
  @Put('provas/:pid')
  atualizarProva(@Param('pid') pid: string, @Body() dto: AtualizarProvaDto) {
    return this.service.atualizarProva(pid, dto);
  }
  @Delete('provas/:pid')
  excluirProva(@Param('pid') pid: string) {
    return this.service.excluirProva(pid);
  }

  // correção de dissertativas
  @Get('correcoes')
  correcoes() {
    return this.service.listarCorrecoesPendentes();
  }
  @Post('correcoes/:tentativaId/corrigir')
  corrigir(@Param('tentativaId') tentativaId: string, @Body() dto: CorrigirTentativaDto, @CurrentUser() user?: AuthUser) {
    return this.service.corrigirTentativa(tentativaId, dto, user?.sub);
  }
}

/** Gestão admin: templates e tipos de certificado. */
@Controller('admin/escola')
@UseGuards(RolesGuard)
@Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
export class EscolaAdminController {
  constructor(private readonly service: EscolaService) {}

  // templates de certificado
  @Get('templates')
  templates() {
    return this.service.listarTemplates();
  }
  @Post('templates')
  criarTemplate(@Body() dto: CriarTemplateDto) {
    return this.service.criarTemplate(dto);
  }
  @Put('templates/:id')
  atualizarTemplate(@Param('id') id: string, @Body() dto: AtualizarTemplateDto) {
    return this.service.atualizarTemplate(id, dto);
  }
  @Delete('templates/:id')
  excluirTemplate(@Param('id') id: string) {
    return this.service.excluirTemplate(id);
  }

  // tipos de certificado
  @Get('tipos-certificado')
  tipos() {
    return this.service.listarTiposCertificado();
  }
  @Post('tipos-certificado')
  criarTipo(@Body() dto: TipoCertificadoDto) {
    return this.service.criarTipoCertificado(dto);
  }
  @Delete('tipos-certificado/:id')
  excluirTipo(@Param('id') id: string) {
    return this.service.excluirTipoCertificado(id);
  }
}
