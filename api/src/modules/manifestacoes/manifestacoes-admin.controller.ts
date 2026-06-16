import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { ManifestacoesAdminService } from './manifestacoes-admin.service';
import { TramitacaoService } from './tramitacao.service';
import { AnexosService } from './anexos.service';
import { enviarExport } from '../../common/export/export.util';
import { relatorioCsvRows, relatorioDoc, relatorioPdf, relatorioXlsx } from './manifestacoes-relatorio.util';
import { ThemeService } from '../theme/theme.service';
import { carregarLogoRelatorio } from '../theme/logo-relatorio.util';

/**
 * Painel administrativo de manifestações (ESIC + Ouvidoria).
 * LGPD: identidade mascarada para manifestações anônimas. CPF nunca exposto.
 * RBAC: OUVIDOR, SERVIDOR, GESTOR, ADMIN_PREFEITURA.
 */
@Controller('admin/manifestacoes')
@UseGuards(RolesGuard)
@Roles(Role.OUVIDOR, Role.SERVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
export class ManifestacoesAdminController {
  constructor(
    private readonly service: ManifestacoesAdminService,
    private readonly tramitacao: TramitacaoService,
    private readonly anexos: AnexosService,
    private readonly theme: ThemeService,
  ) {}

  @Get()
  async listar(
    @Query('canal') canal?: string,
    @Query('status') status?: string,
    @Query('tipo') tipo?: string,
    @Query('q') q?: string,
    @Query('minhas') minhas?: string,
    @Query('secretariaId') secretariaId?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopoSecretariaId = await this.service.escopoSecretaria(user?.sub, user?.role);
    return this.service.listar({
      canal, status, tipo, q, secretariaId, escopoSecretariaId, dataDe, dataAte,
      // "Minhas atribuições" — fila do servidor/área (responsável = eu)
      responsavelId: minhas === 'true' ? user?.sub : undefined,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  /** Export da lista de manifestações (CSV/JSON), respeitando os filtros. */
  @Get('export')
  async export(
    @Res() res: Response,
    @Query('formato') formato?: string,
    @Query('canal') canal?: string,
    @Query('status') status?: string,
    @Query('tipo') tipo?: string,
    @Query('secretariaId') secretariaId?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopoSecretariaId = await this.service.escopoSecretaria(user?.sub, user?.role);
    const rows = await this.service.listarParaExport({ canal, status, tipo, secretariaId, escopoSecretariaId, dataDe, dataAte });
    enviarExport(res, formato, 'manifestacoes', rows, [
      { key: 'protocolo', label: 'Protocolo' }, { key: 'canal', label: 'Canal' },
      { key: 'tipo', label: 'Tipo' }, { key: 'status', label: 'Status' },
      { key: 'assunto', label: 'Assunto' }, { key: 'solicitante', label: 'Solicitante' },
      { key: 'secretaria', label: 'Secretaria' }, { key: 'prazo', label: 'Prazo' },
      { key: 'prorrogado', label: 'Prorrogado' }, { key: 'respondidoEm', label: 'Respondido em' },
      { key: 'criadoEm', label: 'Criado em' },
    ]);
  }

  /** Relatório consolidado (gráficos/TCE-MT): CSV, PDF ou DOC. */
  @Get('relatorio')
  async relatorio(
    @Res() res: Response,
    @Query('formato') formato?: string,
    @Query('canal') canal?: string,
    @Query('secretariaId') secretariaId?: string,
    @Query('dataDe') dataDe?: string,
    @Query('dataAte') dataAte?: string,
    @CurrentUser() user?: AuthUser,
  ) {
    const escopoSecretariaId = await this.service.escopoSecretaria(user?.sub, user?.role);
    const filtro = { canal, secretariaId, escopoSecretariaId, dataDe, dataAte };
    const dados = await this.service.relatorioDados(filtro);

    if (formato === 'pdf' || formato === 'doc') {
      const municipio = await this.service.municipioNome();
      if (formato === 'pdf') {
        const { tokens } = await this.theme.getTokens();
        const logoBuffer = await carregarLogoRelatorio(tokens);
        const buf = await relatorioPdf(dados, municipio, logoBuffer);
        res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="relatorio-ouvidoria.pdf"' });
        res.end(buf);
      } else {
        res.set({ 'Content-Type': 'application/msword', 'Content-Disposition': 'attachment; filename="relatorio-ouvidoria.doc"' });
        res.end(relatorioDoc(dados, municipio));
      }
      return;
    }
    if (formato === 'xlsx' || formato === 'excel') {
      res.set({ 'Content-Type': 'application/vnd.ms-excel; charset=utf-8', 'Content-Disposition': 'attachment; filename="relatorio-ouvidoria.xls"' });
      res.send(relatorioXlsx(dados));
      return;
    }
    if (formato === 'csv') {
      enviarExport(res, 'csv', 'relatorio-ouvidoria', relatorioCsvRows(dados), [
        { key: 'secao', label: 'Seção' }, { key: 'item', label: 'Item' }, { key: 'valor', label: 'Quantidade' },
      ]);
      return;
    }
    res.json(dados); // formato JSON (para os gráficos na tela)
  }

  @Get(':id')
  detalhe(@Param('id') id: string) {
    return this.service.detalhe(id);
  }

  /** Tramitação completa (chat + eventos), incluindo mensagens internas. */
  @Get(':id/tramitacao')
  tramitacao_(@Param('id') id: string) {
    return this.tramitacao.tramitacaoInterna(id);
  }

  @Patch(':id')
  atribuir(
    @Param('id') id: string,
    @Body() body: { responsavelId?: string; secretariaId?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atribuir(id, body, user?.sub);
  }

  /**
   * Mensagem do servidor/ouvidor na tramitação.
   * `interno=true` → ouvidor↔área (oculto ao cidadão).
   */
  @Post(':id/mensagem')
  mensagem(
    @Param('id') id: string,
    @Body() body: { conteudo: string; interno?: boolean },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.tramitacao.mensagemServidor(id, body.conteudo, {
      interno: !!body.interno,
      atorId: user?.sub,
    });
  }

  /** Responder ao cidadão (publica a resposta + encerra o SLA). */
  @Post(':id/responder')
  responder(
    @Param('id') id: string,
    @Body() body: { conteudo: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.tramitacao.responder(id, body.conteudo, user?.sub);
  }

  /** Encaminhar à área (atribui + tramitação interna + transição). */
  @Post(':id/encaminhar')
  encaminhar(
    @Param('id') id: string,
    @Body() body: { secretariaId?: string; responsavelId?: string; observacao?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.tramitacao.encaminhar(id, body, user?.sub);
  }

  /** Anexo do órgão (resposta com documento). */
  @Post(':id/anexo')
  @UseInterceptors(FileInterceptor('file'))
  anexar(@Param('id') id: string, @UploadedFile() file: any) {
    return this.anexos.upload(id, file, 'orgao');
  }

  /** Download de anexo (staff autorizado pelo RolesGuard do controller). */
  @Get('anexo/:anexoId')
  async baixarAnexo(@Param('anexoId') anexoId: string, @Res() res: Response) {
    const { stream, contentType, anexo } = await this.anexos.stream(anexoId);
    res.setHeader('Content-Type', contentType ?? anexo.mime ?? 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${anexo.nomeArquivo}"`);
    res.setHeader('Cache-Control', 'no-store');
    stream.pipe(res);
  }
}
