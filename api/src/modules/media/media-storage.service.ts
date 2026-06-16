import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

/** Acumula um Readable em Buffer. */
async function streamParaBuffer(stream: Readable): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

/**
 * Único ponto de contato com o object storage (MinIO/S3). As credenciais
 * vivem só aqui (backend). Frontend/app NUNCA recebem chave nem URL de
 * upload — sempre passam pela API. Ver docs/12-infraestrutura.md.
 */
@Injectable()
export class MediaStorageService {
  private readonly logger = new Logger(MediaStorageService.name);
  private readonly bucket = process.env.STORAGE_BUCKET ?? 'portal';

  private readonly s3 = new S3Client({
    endpoint: process.env.STORAGE_ENDPOINT, // http://portal-minio:9000
    region: process.env.STORAGE_REGION ?? 'us-east-1',
    forcePathStyle: process.env.STORAGE_FORCE_PATH_STYLE === 'true', // MinIO
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
      secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
    },
  });

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Stream para servir o arquivo pelo backend (público mascarado ou privado). */
  async getStream(key: string): Promise<{ stream: Readable; contentType?: string; size?: number }> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: res.Body as Readable,
      contentType: res.ContentType,
      size: res.ContentLength,
    };
  }

  /** Lê o objeto inteiro como Buffer — usar apenas para arquivos pequenos (ex.: SVG). */
  async getBuffer(key: string): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return streamParaBuffer(res.Body as Readable);
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
