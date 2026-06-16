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
import { aplicarHeadersSvgSeguro } from './media.types';
import { MediaService } from './media.service';

@Controller('midia')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  // ---------------- categorias (admin) ----------------
  @Get('categorias')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  listarCategorias(@Query('tipo') tipo?: string) {
    return this.service.listarCategorias(tipo);
  }

  @Post('categorias')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  criarCategoria(
    @Body() dto: { tipo: string; nome: string; slug: string; descricao?: string },
  ) {
    return this.service.criarCategoria(dto);
  }

  // ---------------- upload admin ----------------
  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: any,
    @Body() dto: { categoriaId: string; visibilidade?: 'publico' | 'restrito'; altText?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.upload(file, dto, user?.sub);
  }

  // ---------------- servir mídia restrita (autenticado) ----------------
  @Get('privado/:id')
  async privado(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser | undefined,
    @Res() res: Response,
  ) {
    const { stream, contentType, asset } = await this.service.getPrivado(id, {
      id: user?.sub,
      role: user?.role,
    });
    const mime = contentType ?? (asset as any).mime;
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'no-store'); // restrito: nunca cacheia

    // Controles de segurança para SVG (defesa em profundidade).
    // Mídia privada pode incluir brasões/ícones SVG enviados por gestores.
    // O helper aplica CSP sandbox + Content-Disposition: attachment + nosniff.
    if (mime === 'image/svg+xml') {
      const nomeBase = ((asset as any).nomeOriginal as string)
        .replace(/\.svg$/i, '')
        .replace(/["\r\n]/g, '');
      aplicarHeadersSvgSeguro(res, nomeBase);
    }

    stream.pipe(res);
  }

  // ---------------- metadados / edição / exclusão (admin) ----------------
  @Get()
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  list(
    @Query('tipo') tipo?: string,
    @Query('categoria') categoria?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
  ) {
    return this.service.list({ tipo, categoria, q, page: page ? Number(page) : 1 });
  }

  // ---------------- editor de cores SVG ----------------
  // IMPORTANTE: estas rotas com sufixo literal devem vir ANTES de @Get(':id')
  // para que o roteador do Express não engula o segmento como :id.

  @Get(':id/svg-conteudo')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  svgConteudo(@Param('id') id: string) {
    return this.service.svgConteudo(id);
  }

  @Post(':id/recolorir')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  recolorir(
    @Param('id') id: string,
    @Body()
    dto: {
      substituicoes: Record<string, string>;
      categoriaId: string;
      visibilidade: 'publico' | 'restrito';
      altText?: string;
      /** Hex opcional. Se informado, define/substitui fill no <svg> raiz
       *  para recolorir elementos com cor herdada/implícita (preto padrão). */
      corBase?: string;
    },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.recolorir(id, dto, user?.sub);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  metadata(@Param('id') id: string) {
    return this.service.getMetadata(id);
  }

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  update(
    @Param('id') id: string,
    @Body() dto: { altText?: string; categoriaId?: string },
    @CurrentUser() user?: AuthUser,
  ) {
    return this.service.update(id, dto, user?.sub);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  remove(@Param('id') id: string, @CurrentUser() user?: AuthUser) {
    return this.service.remove(id, user?.sub);
  }
}
