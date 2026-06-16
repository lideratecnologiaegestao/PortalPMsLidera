import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query, Res,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { ChatService } from './chat.service';

/**
 * Chat interno (funcionários). Todas as rotas exigem papel INTERNO — o cidadão
 * NUNCA acessa o chat interno. A visibilidade por conversa é validada no service
 * (participante) e isolada por tenant via RLS.
 */
@Controller('chat')
@UseGuards(RolesGuard)
@Roles(Role.OUVIDOR, Role.SERVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('conversas')
  conversas() {
    return this.chat.listarConversas();
  }

  @Post('conversas')
  criar(@Body() dto: { tipo: 'dm' | 'grupo'; titulo?: string; participantes: string[] }) {
    return this.chat.criarConversa(dto);
  }

  @Post('conversas/protocolo/:manifestacaoId')
  protocolo(@Param('manifestacaoId') id: string) {
    return this.chat.conversaDeProtocolo(id);
  }

  @Get('conversas/:id/mensagens')
  historico(@Param('id') id: string, @Query('before') before?: string) {
    return this.chat.historico(id, before);
  }

  @Post('conversas/:id/mensagens')
  enviar(@Param('id') id: string, @Body() dto: { conteudo?: string; respondendoA?: string }) {
    return this.chat.enviar(id, dto);
  }

  @Post('conversas/:id/anexo')
  @UseInterceptors(FileInterceptor('file'))
  anexo(@Param('id') id: string, @UploadedFile() file: any, @Body() body: { conteudo?: string }) {
    return this.chat.enviarComAnexo(id, file, body?.conteudo);
  }

  @Get('anexo/:mensagemId/:idx')
  async baixar(@Param('mensagemId') mid: string, @Param('idx') idx: string, @Res() res: Response) {
    const { stream, contentType, anexo } = await this.chat.baixarAnexo(mid, Number(idx));
    res.setHeader('Content-Type', contentType ?? anexo.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${anexo.nome}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }

  @Post('conversas/:id/ler')
  ler(@Param('id') id: string) {
    return this.chat.marcarLido(id);
  }

  @Patch('mensagens/:id')
  editar(@Param('id') id: string, @Body() body: { conteudo: string }) {
    return this.chat.editar(id, body.conteudo);
  }

  @Delete('mensagens/:id')
  excluir(@Param('id') id: string) {
    return this.chat.excluir(id);
  }

  @Get('usuarios')
  usuarios(@Query('q') q?: string) {
    return this.chat.usuariosInternos(q);
  }

  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file'))
  avatar(@UploadedFile() file: any) {
    return this.chat.definirAvatar(file);
  }

  @Get('avatar/:userId')
  async verAvatar(@Param('userId') userId: string, @Res() res: Response) {
    const { stream, mime } = await this.chat.avatarStream(userId);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.pipe(res);
  }
}
