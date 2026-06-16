import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { TenantContext } from '../../common/tenant/tenant.context';
import { PrismaService } from '../../prisma/prisma.service';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { AtendimentoConfigService } from './atendimento-config.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

/**
 * Console de administração do atendimento omnichannel.
 * RBAC: OUVIDOR, SERVIDOR (escopado à secretaria), ADMIN_PREFEITURA.
 */
@Controller('admin/atendimento')
@UseGuards(RolesGuard)
@Roles(Role.OUVIDOR, Role.SERVIDOR, Role.ADMIN_PREFEITURA)
export class AtendimentoAdminController {
  constructor(
    private readonly conversaService: AtendimentoConversaService,
    private readonly configService: AtendimentoConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly prisma: PrismaService,
  ) {}

  /** GET /admin/atendimento/conversas */
  @Get('conversas')
  async listar(
    @Query('status') status: string,
    @Query('canal') canal: string,
    @Query('secretariaId') secretariaId: string,
    @Query('tagId') tagId: string,
    @Query('q') q: string,
    @Query('page') page: string,
    @Request() req: any,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const userId = req.user?.id;
    const role = req.user?.role;

    return this.conversaService.inbox({
      tenantId,
      userId,
      role,
      status,
      canal,
      secretariaId,
      tagId,
      q,
      page: page ? Number(page) : 1,
    });
  }

  /** GET /admin/atendimento/conversas/:id */
  @Get('conversas/:id')
  async detalhe(@Param('id') id: string) {
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.detalhe(id, tenantId);
  }

  /** POST /admin/atendimento/conversas/:id/mensagens — responder ou nota interna. */
  @Post('conversas/:id/mensagens')
  async responder(
    @Param('id') conversaId: string,
    @Body() body: { conteudo: string; interno?: boolean; anexos?: object[] },
    @Request() req: any,
  ) {
    const tenantId = TenantContext.tenantId()!;
    const agenteId = req.user?.id;
    const conteudo = (body.conteudo ?? '').trim();
    if (!conteudo) throw new BadRequestException('Conteúdo não pode ser vazio.');

    const msg = await this.conversaService.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'agente',
      autorId: agenteId,
      conteudo,
      anexos: body.anexos,
      interno: body.interno ?? false,
    });

    // Se canal whatsapp e não-interno, envia via WhatsApp
    if (!body.interno) {
      try {
        const c = await TenantContext.run({ tenantId }, () =>
          this.prisma.db.atendimentoConversa.findUnique({
            where: { id: conversaId },
            select: { canal: true, visitanteTelefone: true },
          }),
        );
        if (c?.canal === 'whatsapp' && c?.visitanteTelefone) {
          await this.whatsapp.enviar(c.visitanteTelefone, conteudo).catch(() => undefined);
        }
      } catch {
        // best-effort
      }
    }

    return msg;
  }

  /** POST /admin/atendimento/conversas/:id/assumir */
  @Post('conversas/:id/assumir')
  async assumir(@Param('id') conversaId: string, @Request() req: any) {
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.assumir(conversaId, tenantId, req.user?.id);
  }

  /** POST /admin/atendimento/conversas/:id/atribuir (OUVIDOR/ADMIN) */
  @Post('conversas/:id/atribuir')
  @Roles(Role.OUVIDOR, Role.ADMIN_PREFEITURA)
  async atribuir(
    @Param('id') conversaId: string,
    @Body() body: { agenteId: string; secretariaId?: string },
    @Request() req: any,
  ) {
    if (!body.agenteId) throw new BadRequestException('agenteId obrigatório.');
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.atribuir(conversaId, tenantId, req.user?.id, body);
  }

  /** POST /admin/atendimento/conversas/:id/transferir */
  @Post('conversas/:id/transferir')
  async transferir(
    @Param('id') conversaId: string,
    @Body() body: { secretariaId: string },
    @Request() req: any,
  ) {
    if (!body.secretariaId) throw new BadRequestException('secretariaId obrigatório.');
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.transferir(conversaId, tenantId, req.user?.id, body.secretariaId);
  }

  /** POST /admin/atendimento/conversas/:id/encerrar */
  @Post('conversas/:id/encerrar')
  async encerrar(
    @Param('id') conversaId: string,
    @Body() body: { mensagemEncerramento?: string },
    @Request() req: any,
  ) {
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.encerrar(conversaId, tenantId, req.user?.id, body.mensagemEncerramento);
  }

  /** PATCH /admin/atendimento/conversas/:id/tags */
  @Patch('conversas/:id/tags')
  async setTags(
    @Param('id') conversaId: string,
    @Body() body: { tagIds: string[] },
  ) {
    if (!Array.isArray(body.tagIds)) throw new BadRequestException('tagIds deve ser array.');
    const tenantId = TenantContext.tenantId()!;
    return this.conversaService.setTags(conversaId, tenantId, body.tagIds);
  }

  /** GET /admin/atendimento/conversas/:id/transcricao — retorna .txt */
  @Get('conversas/:id/transcricao')
  async transcricao(@Param('id') conversaId: string, @Res() res: Response) {
    const tenantId = TenantContext.tenantId()!;
    const texto = await this.conversaService.transcricao(conversaId, tenantId);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="transcricao-${conversaId}.txt"`,
    );
    res.send(texto);
  }

  // ------------------------------------------------------------------ tags

  /** GET /admin/atendimento/tags */
  @Get('tags')
  async listarTags() {
    const tenantId = TenantContext.tenantId()!;
    return this.configService.listarTags(tenantId);
  }

  /** POST /admin/atendimento/tags (ADMIN) */
  @Post('tags')
  @Roles(Role.ADMIN_PREFEITURA)
  async criarTag(@Body() body: { nome: string; cor?: string }) {
    if (!body.nome?.trim()) throw new BadRequestException('Nome da tag obrigatório.');
    const tenantId = TenantContext.tenantId()!;
    return this.configService.criarTag(tenantId, body);
  }

  /** DELETE /admin/atendimento/tags/:id (ADMIN) */
  @Delete('tags/:id')
  @Roles(Role.ADMIN_PREFEITURA)
  async excluirTag(@Param('id') tagId: string) {
    const tenantId = TenantContext.tenantId()!;
    return this.configService.excluirTag(tenantId, tagId);
  }

  // ------------------------------------------------------------------ config

  /** GET /admin/atendimento/config (ADMIN) */
  @Get('config')
  @Roles(Role.ADMIN_PREFEITURA)
  async getConfig() {
    const tenantId = TenantContext.tenantId()!;
    return this.configService.getConfig(tenantId);
  }

  /** PUT /admin/atendimento/config (ADMIN) */
  @Put('config')
  @Roles(Role.ADMIN_PREFEITURA)
  async putConfig(@Body() body: Record<string, unknown>) {
    const tenantId = TenantContext.tenantId()!;
    return this.configService.putConfig(tenantId, {
      atendimentoHumanoAtivo: body.atendimentoHumanoAtivo as boolean | undefined,
      iaChatWidgetAtivo: body.iaChatWidgetAtivo as boolean | undefined,
      atendimentoAvisoLgpd: body.atendimentoAvisoLgpd as string | undefined,
      atendimentoMensagemForaExp: body.atendimentoMensagemForaExp as string | undefined,
      atendimentoSaudacao: body.atendimentoSaudacao as string | undefined,
      atendimentoInatividadeMin: body.atendimentoInatividadeMin as number | undefined,
      atendimentoTimezone: body.atendimentoTimezone as string | undefined,
      evolutionInstancia: body.evolutionInstancia as string | undefined,
    });
  }

  /** PUT /admin/atendimento/config/horario (ADMIN) */
  @Put('config/horario')
  @Roles(Role.ADMIN_PREFEITURA)
  async putHorario(
    @Body() body: {
      horario: { diaSemana: number; horaInicio: string; horaFim: string; ativo: boolean }[];
    },
  ) {
    if (!Array.isArray(body.horario) || body.horario.length === 0) {
      throw new BadRequestException('horario deve ser um array com ao menos 1 entrada.');
    }
    const tenantId = TenantContext.tenantId()!;
    return this.configService.putHorario(tenantId, body.horario);
  }
}
