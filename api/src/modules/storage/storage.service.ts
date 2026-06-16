import { Injectable, Logger } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';

/**
 * Armazenamento de objetos (fotos de chamados, anexos). Fronteira de camadas
 * (CLAUDE.md regra 2b): SÓ o backend toca no storage; o app/web sobem via API
 * (multipart) e nunca recebem credencial nem URL de upload.
 *
 * Em produção usa MinIO/S3 (vars STORAGE_* no .env). Em dev, se STORAGE_ENDPOINT
 * não estiver definido, cai para disco local (`./storage-dev`). A interface
 * `put()`/`get()` é a mesma nos dois modos.
 */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);

  private readonly baseDir = process.env.STORAGE_LOCAL_DIR ?? './storage-dev';
  private readonly endpoint = process.env.STORAGE_ENDPOINT;
  private readonly bucket = process.env.STORAGE_BUCKET ?? 'portal';
  private readonly s3 = this.endpoint
    ? new S3Client({
        endpoint: this.endpoint,
        region: process.env.STORAGE_REGION ?? 'us-east-1',
        forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
          secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
        },
      })
    : null;
  private bucketPronto = false;

  /** Grava o buffer e devolve a storage_key (caminho lógico no bucket). */
  async put(prefixo: string, buffer: Buffer, mime: string): Promise<string> {
    const ext = this.extPorMime(mime);
    const key = `${prefixo}/${randomUUID()}${ext}`;
    if (this.s3) {
      await this.garantirBucket();
      await this.s3.send(
        new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: buffer, ContentType: mime }),
      );
    } else {
      const destino = join(this.baseDir, key);
      await mkdir(dirname(destino), { recursive: true });
      await writeFile(destino, buffer);
    }
    this.log.debug(`Objeto gravado: ${key} (${buffer.length} bytes)`);
    return key;
  }

  /** Lê um objeto pela storage_key (uso interno do backend; nunca exposto). */
  async get(key: string): Promise<{ buffer: Buffer; mime: string }> {
    if (this.s3) {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await r.Body!.transformToByteArray();
      return { buffer: Buffer.from(bytes), mime: r.ContentType ?? this.mimePorExt(key) };
    }
    const buffer = await readFile(join(this.baseDir, key));
    return { buffer, mime: this.mimePorExt(key) };
  }

  /** Cria o bucket na primeira gravação se ele ainda não existir (idempotente). */
  private async garantirBucket(): Promise<void> {
    if (this.bucketPronto || !this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.log.log(`Bucket "${this.bucket}" criado no storage.`);
      } catch (e) {
        // corrida: outro processo pode ter criado entre o head e o create
        this.log.warn(`Não foi possível criar o bucket "${this.bucket}": ${(e as Error).message}`);
      }
    }
    this.bucketPronto = true;
  }

  private extPorMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'application/pdf': '.pdf',
    };
    return map[mime] ?? '';
  }

  private mimePorExt(key: string): string {
    const map: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    };
    return map[extname(key).toLowerCase()] ?? 'application/octet-stream';
  }
}
