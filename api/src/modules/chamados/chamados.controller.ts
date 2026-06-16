import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UnauthorizedException,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { TenantContext } from '../../common/tenant/tenant.context';
import { ChamadosService } from './chamados.service';
import { verifyFoto } from './foto-token';

/**
 * App do Cidadão — chamados georreferenciados. Abertura é pública (login
 * opcional; `anonimo` força denúncia sem identidade). A atualização de status
 * é restrita à equipe (RBAC). Fotos sobem via multipart (regra 2b).
 */
@Controller('chamados')
export class ChamadosController {
  constructor(private readonly service: ChamadosService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('fotos', 5, {
      limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB por foto (anti-DoS)
      fileFilter: (_req, file, cb) =>
        cb(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)),
    }),
  )
  async criar(
    @Body() body: Record<string, string>,
    @UploadedFiles() fotos: Array<{ buffer: Buffer; mimetype: string }> = [],
  ) {
    const user = (TenantContext.get().userId as string | undefined) ?? null;
    return this.service.criar(
      {
        categoria: body.categoria,
        descricao: body.descricao,
        lat: Number(body.lat),
        lng: Number(body.lng),
        endereco: body.endereco,
        bairro: body.bairro,
        cidadaoId: user,
        anonimo: body.anonimo === 'true',
      },
      fotos.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype })),
    );
  }

  /** Mapa de próximos (projeção restrita por privacidade — ver DPIA). */
  @Get('proximos')
  proximos(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('raio') raio: string,
  ) {
    return this.service.proximos(Number(lat), Number(lng), raio ? Number(raio) : 500);
  }

  /** Serve a foto de um chamado por URL assinada (token com TTL). DPIA. */
  @Get('foto/:id')
  async foto(
    @Param('id') id: string,
    @Query('t') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if ((await verifyFoto(token)) !== id) {
      throw new UnauthorizedException('Link de foto inválido ou expirado.');
    }
    const { buffer, mime } = await this.service.serveFoto(id);
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(buffer);
  }

  /** Acompanhamento por protocolo (público — o protocolo é a credencial). */
  @Get(':protocolo')
  porProtocolo(@Param('protocolo') protocolo: string) {
    return this.service.porProtocolo(protocolo);
  }

  /** Equipe atualiza o status do chamado. */
  @Post(':id/atualizacoes')
  @UseGuards(RolesGuard)
  @Roles(Role.SERVIDOR, Role.GESTOR, Role.OUVIDOR, Role.ADMIN_PREFEITURA)
  atualizar(
    @Param('id') id: string,
    @Body() body: { status: string; comentario?: string },
  ) {
    return this.service.atualizar(id, body.status, body.comentario);
  }

  /** Dispara o expurgo por retenção (DPIA). Restrito; chamável por cron/n8n. */
  @Post('_expurgo')
  @UseGuards(RolesGuard)
  @Roles(Role.SUPER_ADMIN)
  expurgo() {
    return this.service.expurgar();
  }
}
