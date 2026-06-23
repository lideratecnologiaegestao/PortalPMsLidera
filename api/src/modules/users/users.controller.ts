import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/jwt-auth.guard';
import { CriarUserDto, AtualizarUserDto } from './users.dto';
import { UsersService } from './users.service';
import { UsersRelatorioService } from './users-relatorio.service';
import { enviarExport } from '../../common/export/export.util';
import { relatorioUsuariosPdf } from './users-relatorio.util';
import { ThemeService } from '../theme/theme.service';
import { carregarLogoRelatorio } from '../theme/logo-relatorio.util';


/**
 * Gestão de usuários do tenant. Restrito a ADMIN_PREFEITURA/SUPER_ADMIN.
 * LGPD: nunca retorna senhaHash, cpfHash, mfaSecret.
 * Proteção de auto-bloqueio: o usuário não pode alterar seu próprio role/ativo.
 */
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA)
export class UsersController {
  constructor(
    private readonly service: UsersService,
    private readonly relatorioService: UsersRelatorioService,
    private readonly theme: ThemeService,
  ) {}

  @Get()
  listar(
    @Query('role') role?: string,
    @Query('ativo') ativo?: string,
    @Query('q') q?: string,
    @Query('grupoId') grupoId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const ativoBool =
      ativo === 'true' ? true : ativo === 'false' ? false : undefined;
    return this.service.listar({
      role,
      ativo: ativoBool,
      q,
      grupoId,
      page: Math.max(1, Number(page ?? 1)),
      pageSize: Math.min(100, Math.max(1, Number(pageSize ?? 20))),
    });
  }

  /**
   * Relatório consolidado de usuários.
   * Rota literal ANTES de :id para não colidir com GET /:id.
   * Formatos: json (padrão) | csv | pdf
   */
  @Get('relatorio')
  async relatorio(
    @CurrentUser() user: AuthUser | undefined,
    @Query('formato') formato: string | undefined,
    @Query('dataDe') dataDe: string | undefined,
    @Query('dataAte') dataAte: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!user) throw new UnauthorizedException('Não autenticado.');

    const dados = await this.relatorioService.relatorio({ dataDe, dataAte });
    const fmt = (formato ?? 'json').toLowerCase();

    if (fmt === 'pdf') {
      // Obtém nome do município pelo tenant
      const tenant = await this.relatorioService.nomeTenant();
      const { tokens } = await this.theme.getTokens();
      const logoBuffer = await carregarLogoRelatorio(tokens);
      const pdf = await relatorioUsuariosPdf(dados, tenant, logoBuffer);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="relatorio-usuarios.pdf"');
      res.send(pdf);
      return;
    }

    if (fmt === 'csv') {
      // Achata os dados para CSV: resumo + logins
      const rows: Record<string, unknown>[] = [];
      rows.push({ secao: 'Resumo', item: 'Total', valor: dados.resumo.total });
      rows.push({ secao: 'Resumo', item: 'Ativos', valor: dados.resumo.ativos });
      rows.push({ secao: 'Resumo', item: 'Inativos', valor: dados.resumo.inativos });
      rows.push({ secao: 'Resumo', item: 'Com MFA', valor: dados.resumo.comMfa });
      rows.push({ secao: 'Resumo', item: 'Online agora', valor: dados.resumo.onlineAgora });
      dados.resumo.porPapel.forEach((p) =>
        rows.push({ secao: 'Por papel', item: p.papel, valor: p.total }),
      );
      dados.resumo.porGrupo.forEach((g) =>
        rows.push({ secao: 'Por grupo', item: g.grupo, valor: g.membros }),
      );
      dados.logins.forEach((l) =>
        rows.push({
          secao: 'Login',
          item: l.acao,
          valor: l.nomeAtor ?? l.email ?? '',
          data: l.data,
        }),
      );
      dados.ultimosAcessos.forEach((u) =>
        rows.push({
          secao: 'Último acesso',
          item: u.nome,
          valor: u.papel,
          data: u.ultimoLoginEm ?? '',
          email: u.email,
        }),
      );
      enviarExport(res, fmt, 'relatorio-usuarios', rows, [
        { key: 'secao', label: 'Seção' },
        { key: 'item', label: 'Item' },
        { key: 'valor', label: 'Valor' },
        { key: 'data', label: 'Data' },
        { key: 'email', label: 'E-mail' },
      ]);
      return;
    }

    // JSON
    res.json(dados);
  }

  @Get(':id')
  buscar(@Param('id') id: string) {
    return this.service.buscar(id);
  }

  @Post()
  criar(@Body() dto: CriarUserDto, @CurrentUser() user?: AuthUser) {
    return this.service.criar(dto, user?.sub, user?.role);
  }

  @Patch(':id')
  atualizar(
    @Param('id') id: string,
    @Body() dto: AtualizarUserDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.atualizar(id, dto, user?.sub, user?.role);
  }

  @Delete(':id')
  desativar(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.desativar(id, user?.sub);
  }

}
