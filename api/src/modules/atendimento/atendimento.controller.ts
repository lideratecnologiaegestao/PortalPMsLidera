import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TenantContext } from '../../common/tenant/tenant.context';
import { VisitorGuard } from './visitor.guard';
import { assinarVisitante } from './visitor-token.util';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { AtendimentoConfigService } from './atendimento-config.service';
import { ExpedienteService } from './expediente.service';
import {
  QUEUE_ATENDIMENTO,
  JOB_ATEND_PROCESSAR_MENSAGEM,
} from '../queue/queue.constants';

/**
 * Endpoints públicos do widget de atendimento (sem autenticação de servidor).
 * Visitante anônimo interage com a própria conversa via token JWT de visitante.
 */
@Controller('atendimento')
export class AtendimentoController {
  constructor(
    private readonly conversaService: AtendimentoConversaService,
    private readonly configService: AtendimentoConfigService,
    private readonly expediente: ExpedienteService,
    @InjectQueue(QUEUE_ATENDIMENTO) private readonly fila: Queue,
  ) {}

  /** GET /atendimento/config — configuração pública do widget (sem auth). */
  @Get('config')
  async getConfig() {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não identificado.');

    const cfg = await this.configService.configPublica(tenantId);
    const dentroExpediente = await this.expediente.dentroDoExpediente(tenantId);

    return { ...cfg, dentroExpediente };
  }

  /** POST /atendimento/conversas — inicia conversa (sem auth). */
  @Post('conversas')
  async iniciarConversa(
    @Body()
    body: {
      nome?: string;
      email?: string;
      assunto?: string;
      secretariaId?: string;
      origemUrl?: string;
    },
  ) {
    const tenantId = TenantContext.tenantId();
    if (!tenantId) throw new BadRequestException('Tenant não identificado.');

    return this.conversaService.iniciar({
      tenantId,
      canal: 'widget',
      visitanteNome: body.nome?.slice(0, 120),
      visitanteEmail: body.email?.slice(0, 200),
      secretariaId: body.secretariaId,
      assunto: body.assunto?.slice(0, 500),
      origemUrl: body.origemUrl?.slice(0, 500),
    });
  }

  /** GET /atendimento/conversas/:id/token — refresh do token de visitante. */
  @Get('conversas/:id/token')
  @UseGuards(VisitorGuard)
  async refreshToken(@Request() req: any) {
    const { conversaId, tenantId } = req.visitor;
    const token = await assinarVisitante(conversaId, tenantId);
    return { token };
  }

  /**
   * POST /atendimento/conversas/:id/mensagens — visitante envia mensagem.
   * Rate-limit: 10 por minuto por conversa.
   */
  @Post('conversas/:id/mensagens')
  @UseGuards(VisitorGuard)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async enviarMensagem(
    @Param('id') conversaId: string,
    @Body() body: { conteudo: string; anexos?: object[] },
    @Request() req: any,
  ) {
    const { tenantId } = req.visitor;
    const conteudo = (body.conteudo ?? '').trim();
    if (!conteudo) throw new BadRequestException('Conteúdo não pode ser vazio.');
    if (conteudo.length > 5000) throw new BadRequestException('Mensagem muito longa (máx. 5000 caracteres).');

    const msg = await this.conversaService.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'visitante',
      conteudo,
      anexos: body.anexos,
    });

    // Enfileira processamento do bot (idempotência por jobId)
    await this.fila.add(
      JOB_ATEND_PROCESSAR_MENSAGEM,
      { conversaId, mensagemId: msg.id, tenantId },
      {
        jobId: `atend-msg-${msg.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );

    return { id: msg.id, status: 'enfileirado' };
  }

  /** GET /atendimento/conversas/:id/mensagens — lista mensagens (sem internas). */
  @Get('conversas/:id/mensagens')
  @UseGuards(VisitorGuard)
  async listarMensagens(
    @Param('id') conversaId: string,
    @Query('before') before: string,
    @Request() req: any,
  ) {
    const { tenantId } = req.visitor;
    const msgs = await this.conversaService.listarMensagens(conversaId, tenantId, {
      antes: before,
      paraVisitante: true,
    });
    return msgs;
  }
}
