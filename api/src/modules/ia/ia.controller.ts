import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { IaService } from './ia.service';

/**
 * Camada de IA. A triagem é interna (RBAC) e produz SUGESTÃO para revisão
 * humana. Busca e chat são públicos e respondem só pela base oficial do
 * tenant (RLS), com citação da fonte.
 */
// chamadas de IA têm custo (tokens Anthropic) → limite por IP mais apertado.
@Throttle({ default: { limit: 15, ttl: 60_000 } })
@Controller('ia')
export class IaController {
  constructor(private readonly ia: IaService) {}

  @Post('triagem')
  @UseGuards(RolesGuard)
  @Roles(Role.OUVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
  triagem(@Body() body: { manifestacaoId: string }) {
    return this.ia.triagem(body.manifestacaoId);
  }

  @Post('busca')
  busca(@Body() body: { pergunta: string }) {
    return this.ia.busca(body.pergunta ?? '');
  }

  @Post('chat')
  chat(@Body() body: { pergunta: string }) {
    return this.ia.chat(body.pergunta ?? '');
  }

  /** OCR de documento (interno). Retorna texto; não persiste (DPIA). */
  @Post('ocr')
  @UseGuards(RolesGuard)
  @Roles(Role.OUVIDOR, Role.SERVIDOR, Role.GESTOR, Role.ADMIN_PREFEITURA)
  @UseInterceptors(
    FileInterceptor('documento', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB (anti-DoS)
      fileFilter: (_req, file, cb) =>
        cb(
          null,
          ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype),
        ),
    }),
  )
  ocr(@UploadedFile() documento: { buffer: Buffer; mimetype: string }) {
    return this.ia.ocr(documento.buffer, documento.mimetype);
  }
}
