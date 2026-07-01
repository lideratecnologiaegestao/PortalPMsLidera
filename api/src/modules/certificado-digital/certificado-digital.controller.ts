import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

/** Um .pfx/.p12 ICP-Brasil tem poucos KB; 512 KB é folgado. Barra uploads gigantes (anti-DoS). */
const OPCOES_UPLOAD = {
  limits: { fileSize: 512 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { originalname?: string; mimetype?: string },
    cb: (error: Error | null, aceita: boolean) => void,
  ) => {
    const nomeOk = /\.(pfx|p12)$/i.test(file.originalname ?? '');
    const mimeOk = ['application/x-pkcs12', 'application/pkcs12', 'application/octet-stream', ''].includes(file.mimetype ?? '');
    const ok = nomeOk || mimeOk;
    cb(ok ? null : new BadRequestException('Envie um arquivo de certificado .pfx ou .p12.'), ok);
  },
};
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { CertificadoDigitalService } from './certificado-digital.service';
import { ImportarCertificadoDto } from './certificado-digital.dto';

/**
 * Cofre do Certificado Digital (ICP-Brasil A1) — painel admin.
 * Importa o .pfx + senha (cifrados em repouso) usados para assinar os PDFs
 * institucionais. Acesso restrito ao admin da entidade / super admin.
 */
@Controller('admin/certificado-digital')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.SUPER_ADMIN)
export class CertificadoDigitalController {
  constructor(private readonly service: CertificadoDigitalService) {}

  /** Status do certificado (mascarado — sem .pfx/senha). */
  @Get()
  status() {
    return this.service.status();
  }

  /** Importa/atualiza o certificado: multipart "file" (.pfx) + campo "senha". */
  @Post()
  @UseInterceptors(FileInterceptor('file', OPCOES_UPLOAD))
  async importar(
    @UploadedFile() file: { buffer?: Buffer } | undefined,
    @Body() dto: ImportarCertificadoDto,
  ) {
    await this.service.salvar(file?.buffer as Buffer, dto.senha);
    return this.service.status();
  }

  /** Remove o certificado do tenant. */
  @Delete()
  async remover() {
    await this.service.remover();
    return { removido: true };
  }
}
