import { Module } from '@nestjs/common';
import { CertificadoDigitalController } from './certificado-digital.controller';
import { CertificadoDigitalService } from './certificado-digital.service';

/**
 * Certificado Digital (ICP-Brasil A1) por tenant. Exporta o service para os
 * módulos que assinam PDFs (Diário Oficial, Escola/certificados de curso).
 */
@Module({
  controllers: [CertificadoDigitalController],
  providers: [CertificadoDigitalService],
  exports: [CertificadoDigitalService],
})
export class CertificadoDigitalModule {}
