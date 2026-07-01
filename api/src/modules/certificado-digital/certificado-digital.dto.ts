import { IsNotEmpty, IsString } from 'class-validator';

/** Importação do certificado: arquivo .pfx via multipart ("file") + senha no corpo. */
export class ImportarCertificadoDto {
  @IsString() @IsNotEmpty() senha!: string;
}
