import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { IsEmail } from 'class-validator';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { Evento } from './manifestacao.types';
import { ManifestacoesService } from './manifestacoes.service';
import { TramitacaoService } from './tramitacao.service';

class RecuperarProtocolosDto {
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email!: string;
}

@Controller('manifestacoes')
export class ManifestacoesController {
  constructor(
    private readonly service: ManifestacoesService,
    private readonly tramitacao: TramitacaoService,
  ) {}

  /**
   * Recuperação de protocolo por e-mail (bloco 12 Gov Digital / LGPD).
   * Endpoint PÚBLICO. NUNCA revela se o e-mail existe ou quantas manifestações há.
   * A lista é enviada ao próprio e-mail do titular (evita enumeração por terceiros).
   * Rate-limit: 3 req/min por IP.
   */
  @Post('recuperar-protocolos')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  recuperarProtocolos(@Body() dto: RecuperarProtocolosDto) {
    // Rate-limit via @Throttle (ThrottlerGuard global discrimina por IP).
    // O e-mail é usado apenas para consulta e envio ao titular; nunca aparece na resposta.
    return this.service.recuperarProtocolos(dto.email);
  }

  /** Cidadão registra uma manifestação (e-SIC ou Ouvidoria). */
  @Post()
  async registrar(@Body() dto: any) {
    // cidadaoId vem SEMPRE do token (se logado), nunca do body. Anônimo → undefined.
    const cidadaoId = TenantContext.get().userId;
    return this.service.registrar({ ...dto, cidadaoId });
  }

  /** Indicadores agregados (sem dado pessoal) — alimenta a home e relatórios. */
  @Get('estatisticas')
  estatisticas() {
    return this.tramitacao.estatisticas();
  }

  /** Acompanhamento por protocolo (+ chave para anônimo / não-dono). */
  @Get('acompanhar')
  acompanhar(@Query('protocolo') protocolo: string, @Query('chave') chave?: string) {
    return this.tramitacao.acompanhar(protocolo, chave);
  }

  /** Cidadão acrescenta mensagem à tramitação (protocolo + chave, ou logado). */
  @Post('acompanhar/mensagem')
  mensagemCidadao(@Body() body: { protocolo: string; chave?: string; conteudo: string }) {
    return this.tramitacao.mensagemCidadao(body.protocolo, body.chave, body.conteudo);
  }

  /** Pesquisa de satisfação (Lei 13.460), após a resposta. */
  @Post('acompanhar/avaliar')
  avaliar(@Body() body: { protocolo: string; chave?: string; nota: number; comentario?: string }) {
    return this.tramitacao.avaliar(body.protocolo, body.chave, body.nota, body.comentario);
  }

  /** Painel do cidadão logado: suas manifestações (filtrável por canal). */
  @Get('minhas')
  minhas(@Query('canal') canal?: string) {
    return this.tramitacao.minhas(canal);
  }

  /** Cidadão anexa um arquivo à tramitação (mídia restrita, via backend). */
  @Post('acompanhar/anexo')
  @UseInterceptors(FileInterceptor('file'))
  anexar(
    @UploadedFile() file: any,
    @Body() body: { protocolo: string; chave?: string },
  ) {
    return this.tramitacao.anexoCidadao(body.protocolo, body.chave, file);
  }

  /** Download de um anexo (valida protocolo + chave/dono). */
  @Get('acompanhar/anexo/:id')
  async baixarAnexo(
    @Param('id') id: string,
    @Query('protocolo') protocolo: string,
    @Query('chave') chave: string | undefined,
    @Res() res: Response,
  ) {
    const { stream, contentType, anexo } = await this.tramitacao.anexoStreamCidadao(protocolo, chave, id);
    res.setHeader('Content-Type', contentType ?? anexo.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${anexo.nomeArquivo}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }

  /** Cidadão abre recurso (e-SIC): 1ª ou 2ª instância, conforme o estado. */
  @Post('acompanhar/recurso')
  recurso(@Body() body: { protocolo: string; chave?: string; justificativa: string }) {
    return this.tramitacao.recursoCidadao(body.protocolo, body.chave, body.justificativa);
  }

  /** Ações disponíveis para o estado atual (alimenta os botões da UI). */
  @Get(':id/acoes')
  @UseGuards(RolesGuard)
  @Roles(Role.OUVIDOR, Role.SERVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
  async acoes(@Param('id') id: string) {
    return this.service.acoesDisponiveis(id);
  }

  /** Aplica uma transição de estado (responder, prorrogar, indeferir, etc.). */
  @Post(':id/eventos/:evento')
  @UseGuards(RolesGuard)
  @Roles(Role.OUVIDOR, Role.SERVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
  async transicionar(
    @Param('id') id: string,
    @Param('evento') evento: Evento,
    @Body() body: { observacao?: string },
  ) {
    // ator vem do contexto autenticado — NUNCA do body (auditoria não-forjável)
    const atorId = TenantContext.get().userId;
    return this.service.aplicarEvento(id, evento, { observacao: body.observacao, atorId });
  }
}
