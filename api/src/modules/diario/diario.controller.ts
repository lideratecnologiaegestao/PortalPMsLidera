import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import {
  ConfiabilidadeGuard,
  MinConfiabilidade,
  Nivel,
} from '../auth/confiabilidade';
import { MfaGuard, RequireMfa } from '../auth/mfa.guard';
import { PublicCacheInterceptor } from '../../common/http/public-cache.interceptor';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { DiarioService, NovaEdicao } from './diario.service';
import { DiarioAlertasService } from './diario-alertas.service';

/**
 * Diário Oficial. Composição/publicação restritas (gestor/admin); consulta e
 * verificação de autenticidade são públicas. A rota `verificar` vem ANTES de
 * `:numero` para não ser capturada pelo parâmetro.
 */
@Controller('diario')
@UseInterceptors(PublicCacheInterceptor)
export class DiarioController {
  constructor(
    private readonly service: DiarioService,
    private readonly alertas: DiarioAlertasService,
  ) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  criar(@Body() dto: NovaEdicao) {
    return this.service.criarRascunho(dto);
  }

  // Publicar é um ato oficial: além do RBAC, exige selo de confiabilidade
  // gov.br PRATA+ E o 2º fator (MFA) verificado na sessão (docs/04-seguranca).
  @Post(':id/publicar')
  @UseGuards(RolesGuard, ConfiabilidadeGuard, MfaGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  @MinConfiabilidade(Nivel.PRATA)
  @RequireMfa()
  publicar(@Param('id') id: string) {
    return this.service.publicar(id);
  }

  /** Verificação pública de autenticidade por hash. */
  @Get('verificar')
  verificar(@Query('hash') hash: string) {
    return this.service.verificar(hash);
  }

  /** Arquivo histórico de edições publicadas (filtros: ano, mês, tipo). */
  @Get()
  arquivo(
    @Query('ano') ano?: string,
    @Query('mes') mes?: string,
    @Query('tipoEdicao') tipoEdicao?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.arquivo({
      ano: ano ? Number(ano) : undefined,
      mes: mes ? Number(mes) : undefined,
      tipoEdicao: tipoEdicao || undefined,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(50, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  /** Busca full-text nas matérias de edições publicadas. */
  @Get('busca')
  buscar(
    @Query('q') q?: string,
    @Query('tipo') tipo?: string,
    @Query('orgao') orgao?: string,
    @Query('de') de?: string,
    @Query('ate') ate?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.service.buscar({
      q: q || undefined,
      tipo: tipo || undefined,
      orgao: orgao || undefined,
      de: de || undefined,
      ate: ate || undefined,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(50, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  /** Lista de tipos de matéria (para filtros). */
  @Get('tipos')
  tipos() {
    return this.service.tipos();
  }

  /** Anos com edições publicadas (navegador do arquivo). */
  @Get('anos')
  anos() {
    return this.service.anosDisponiveis();
  }

  /** Matéria individual (permalink público). */
  @Get('materia/:id')
  materia(@Param('id') id: string) {
    return this.service.materiaPublica(id);
  }

  /** Dados abertos (JSON) das matérias publicadas — CC BY 4.0. */
  @Get('dados-abertos')
  dadosAbertos() {
    return this.service.dadosAbertos();
  }

  /** Feed RSS 2.0 das edições publicadas. */
  @Get('rss')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  rss(@Headers('host') host: string) {
    return this.service.rss(host || 'localhost');
  }

  // ---- Monitoramento por termo (alertas — LGPD: consentimento + double opt-in) ----
  /** Cadastra um alerta (status pendente; envia link de confirmação). */
  @Post('alertas')
  criarAlerta(
    @Body() body: { termo: string; canal: string; destino: string },
    @Headers('host') host: string,
  ) {
    return this.alertas.criar(body, host || 'localhost');
  }

  /** Confirma um alerta pelo token (double opt-in). */
  @Get('alertas/confirmar')
  confirmarAlerta(@Query('token') token: string) {
    return this.alertas.confirmar(token);
  }

  /** Cancela (descadastra) um alerta pelo token. */
  @Get('alertas/cancelar')
  cancelarAlerta(@Query('token') token: string) {
    return this.alertas.cancelar(token);
  }

  /** Edição publicada por número (público). */
  @Get(':numero')
  porNumero(@Param('numero') numero: string) {
    return this.service.porNumero(numero);
  }

  /** Editar rascunho (SOMENTE rascunho; imutável após publicação). */
  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  editarRascunho(
    @Param('id') id: string,
    @Body() dto: Partial<NovaEdicao>,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.editarRascunho(id, dto, user?.sub);
  }

  /** Revoga edição publicada. */
  @Post(':id/revogar')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  revogar(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.revogar(id, user?.sub);
  }

  /** Exclui rascunho (rejeita se publicado/revogado). */
  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.GESTOR, Role.ADMIN_PREFEITURA)
  excluirRascunho(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.excluirRascunho(id, user?.sub);
  }
}
