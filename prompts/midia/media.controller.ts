import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response, Request } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
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
  criarCategoria(@Body() dto: { tipo: string; nome: string; slug: string; descricao?: string }) {
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
    @Req() req: Request,
  ) {
    return this.service.upload(file, dto, (req as any).user?.id);
  }

  // ---------------- upload do cidadão (restrito, vinculado) ----------------
  @Post('cidadao')
  @UseInterceptors(FileInterceptor('file'))
  uploadCidadao(
    @UploadedFile() file: any,
    @Body() dto: { categoriaId: string; manifestacaoId?: string; chamadoId?: string },
    @Req() req: Request,
  ) {
    return this.service.uploadCidadao(file, dto, (req as any).user?.id);
  }

  // ---------------- servir mídia restrita (autenticado) ----------------
  @Get('privado/:id')
  async privado(@Param('id') id: string, @Req() req: Request, @Res() res: Response) {
    const { stream, contentType, asset } = await this.service.getPrivado(id, (req as any).user);
    res.setHeader('Content-Type', contentType ?? (asset as any).mime);
    res.setHeader('Cache-Control', 'no-store'); // restrito: nunca cacheia
    stream.pipe(res);
  }

  // ---------------- metadados / edição / exclusão (admin) ----------------
  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  metadata(@Param('id') id: string) {
    return this.service.getMetadata(id);
  }

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

  @Put(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR, Role.SERVIDOR)
  update(
    @Param('id') id: string,
    @Body() dto: { altText?: string; categoriaId?: string },
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, (req as any).user?.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
  remove(@Param('id') id: string, @Req() req: Request) {
    return this.service.remove(id, (req as any).user?.id);
  }
}
