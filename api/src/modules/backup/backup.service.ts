import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { createGzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { Client as FtpClient } from 'basic-ftp';
import {
  S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand,
  HeadBucketCommand, CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { PrismaService } from '../../prisma/prisma.service';

export interface BackupConfig {
  dbAtivo?: boolean;
  storageAtivo?: boolean;
  retencaoDias?: number;
  frequencia?: 'diario' | '12h' | '6h' | 'semanal';
  hora?: number;
  ultimoEm?: string;
  ultimoStatus?: string;
  ultimoTamanho?: number;
  ultimoErro?: string;
}

/**
 * Backups automáticos: dump do banco (pg_dump COMO SUPERUSUÁRIO — portal_app tem
 * RLS forçado e dumparia 0 linhas) compactado e enviado ao bucket MinIO
 * `portal-backups`. Retenção por dias. Frequência configurável no painel.
 *
 * Superusuário vem do .env (BACKUP_DATABASE_URL) — segredo de infra, não do painel.
 */
@Injectable()
export class BackupService {
  private readonly log = new Logger(BackupService.name);
  private readonly bucket = process.env.BACKUP_BUCKET ?? 'portal-backups';
  private readonly s3 = process.env.STORAGE_ENDPOINT
    ? new S3Client({
        endpoint: process.env.STORAGE_ENDPOINT,
        region: process.env.STORAGE_REGION ?? 'us-east-1',
        forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
        credentials: {
          accessKeyId: process.env.STORAGE_ACCESS_KEY ?? '',
          secretAccessKey: process.env.STORAGE_SECRET_KEY ?? '',
        },
      })
    : null;

  constructor(
    private readonly settings: PlatformSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  /** True se há infra para backup (S3 + URL de superusuário). */
  get disponivel(): boolean {
    return !!this.s3 && !!process.env.BACKUP_DATABASE_URL;
  }

  /** Decide, no tique horário, se um backup agendado está na hora de rodar. */
  estaNaHora(cfg: BackupConfig): boolean {
    if (!cfg.dbAtivo && !cfg.storageAtivo) return false;
    const agora = new Date();
    const ultimo = cfg.ultimoEm ? new Date(cfg.ultimoEm) : null;
    const horas = ultimo ? (agora.getTime() - ultimo.getTime()) / 3_600_000 : Infinity;
    const hora = cfg.hora ?? 3;
    switch (cfg.frequencia ?? 'diario') {
      case '6h': return horas >= 5.5;
      case '12h': return horas >= 11.5;
      case 'semanal':
        return agora.getHours() === hora && horas >= 6.5 * 24;
      case 'diario':
      default:
        return agora.getHours() === hora && (!ultimo || ultimo.toDateString() !== agora.toDateString());
    }
  }

  /** Executa o backup conforme a config atual. Atualiza o status no painel. */
  async executar(manual = false): Promise<{ ok: boolean; tamanho?: number; key?: string; erro?: string }> {
    if (!this.disponivel) {
      return { ok: false, erro: 'Backup não configurado (faltam STORAGE_* e BACKUP_DATABASE_URL no ambiente).' };
    }
    const cfg = ((await this.settings.get()).backup as BackupConfig) ?? {};
    if (!cfg.dbAtivo && !cfg.storageAtivo) {
      return { ok: false, erro: 'Nenhum item de backup está ativo.' };
    }

    try {
      await this.garantirBucket();
      let key: string | undefined;
      let tamanho = 0;

      if (cfg.dbAtivo) {
        const dump = await this.dumpBancoGz();
        key = `db/portal-${this.timestamp()}.sql.gz`;
        await this.s3!.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: dump, ContentType: 'application/gzip' }));
        tamanho = dump.length;
        this.log.log(`Backup do banco enviado: ${key} (${(tamanho / 1_048_576).toFixed(1)} MB).`);
        await this.tentarFtp(dump, key);
      }

      // (storage: o conteúdo já vive no MinIO; cópia para o bucket de backup fica
      // para a etapa de OFFSITE — protege contra perda total. Aqui marcamos a flag.)

      await this.aplicarRetencao(cfg.retencaoDias ?? 14);
      await this.settings.mergeBackup({
        ultimoEm: new Date().toISOString(),
        ultimoStatus: 'ok',
        ultimoTamanho: tamanho,
        ultimoErro: null,
        ultimoManual: manual,
      });
      return { ok: true, tamanho, key };
    } catch (e) {
      const erro = String((e as Error).message).slice(0, 500);
      this.log.error(`Falha no backup: ${erro}`);
      await this.settings.mergeBackup({ ultimoEm: new Date().toISOString(), ultimoStatus: 'erro', ultimoErro: erro }).catch(() => undefined);
      return { ok: false, erro };
    }
  }

  /** Lista os backups de banco no bucket (mais recentes primeiro). */
  async listar(): Promise<{ key: string; tamanho: number; em: string }[]> {
    if (!this.s3) return [];
    try {
      const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'db/' }));
      return (r.Contents ?? [])
        .map((o) => ({ key: o.Key!, tamanho: o.Size ?? 0, em: o.LastModified?.toISOString() ?? '' }))
        .sort((a, b) => b.em.localeCompare(a.em));
    } catch {
      return [];
    }
  }

  /** Baixa um backup do bucket (para download pelo super_admin). */
  async baixar(key: string): Promise<Buffer | null> {
    if (!this.s3 || !keyDeBackup(key)) return null;
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      const bytes = await r.Body!.transformToByteArray();
      return Buffer.from(bytes);
    } catch {
      return null;
    }
  }

  /** Exclui um backup do bucket. */
  async excluir(key: string): Promise<boolean> {
    if (!this.s3 || !keyDeBackup(key)) return false;
    try {
      await this.s3.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: [{ Key: key }] } }));
      return true;
    } catch {
      return false;
    }
  }

  /** Backup SQL RESTAURÁVEL de UMA entidade (só as linhas dela, filtradas por RLS). */
  async executarEntidade(tenantId: string): Promise<{ ok: boolean; key?: string; tamanho?: number; erro?: string }> {
    if (!this.disponivel) return { ok: false, erro: 'Backup não configurado no ambiente.' };
    try {
      const t = await this.prisma.platform().tenant.findUnique({ where: { id: tenantId }, select: { slug: true } });
      if (!t) return { ok: false, erro: 'Entidade não encontrada.' };
      // Tabelas com tenant_id, EXCETO as cuja policy RLS permite linhas tenant_id IS NULL
      // (ex.: audit_log, user_sessions) — elas trariam linhas de plataforma/outras
      // entidades para o dump. Assim o backup da entidade fica 100% isolado.
      const cols = await this.prisma.platform().$queryRaw<{ table_name: string }[]>`
        SELECT col.table_name FROM information_schema.columns col
        WHERE col.column_name = 'tenant_id' AND col.table_schema = 'public'
          AND col.table_name NOT IN (
            SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
            WHERE pg_get_expr(p.polqual, p.polrelid) LIKE '%tenant_id IS NULL%'
          )
        ORDER BY col.table_name`;
      const tabelas = cols.map((c) => c.table_name);
      if (!tabelas.length) return { ok: false, erro: 'Nenhuma tabela com tenant_id.' };

      const dump = await this.dumpEntidadeGz(tenantId, tabelas);
      await this.garantirBucket();
      const key = `entidades/${t.slug}/portal-${t.slug}-${this.timestamp()}.sql.gz`;
      await this.s3!.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: dump, ContentType: 'application/gzip' }));
      this.log.log(`Backup da entidade ${t.slug}: ${key} (${(dump.length / 1_048_576).toFixed(1)} MB).`);
      await this.tentarFtp(dump, key);
      return { ok: true, key, tamanho: dump.length };
    } catch (e) {
      const erro = String((e as Error).message).slice(0, 500);
      this.log.error(`Falha no backup da entidade: ${erro}`);
      return { ok: false, erro };
    }
  }

  /** Lista backups por entidade. */
  async listarEntidades(): Promise<{ key: string; tamanho: number; em: string }[]> {
    if (!this.s3) return [];
    try {
      const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'entidades/' }));
      return (r.Contents ?? [])
        .map((o) => ({ key: o.Key!, tamanho: o.Size ?? 0, em: o.LastModified?.toISOString() ?? '' }))
        .sort((a, b) => b.em.localeCompare(a.em));
    } catch {
      return [];
    }
  }

  // ----------------------------------------------------------------- internos

  /** Envia o dump por FTP (offsite), se configurado. Best-effort (não falha o backup). */
  private async tentarFtp(buffer: Buffer, key: string): Promise<void> {
    const cfg = await this.settings.ftpConfig();
    if (!cfg.ativo || !cfg.host) return;
    const client = new FtpClient(30_000);
    try {
      await client.access({ host: cfg.host, port: cfg.port ?? 21, user: cfg.user, password: cfg.pass, secure: cfg.secure });
      if (cfg.dir) await client.ensureDir(cfg.dir);
      await client.uploadFrom(Readable.from(buffer), key.split('/').pop()!);
      this.log.log(`Backup também enviado por FTP (${cfg.host}).`);
    } catch (e) {
      this.log.warn(`Falha ao enviar backup por FTP: ${(e as Error).message}`);
    } finally {
      client.close();
    }
  }

  /** Dump completo (superusuário, BACKUP_DATABASE_URL). */
  private dumpBancoGz(): Promise<Buffer> {
    const env = this.pgEnv(process.env.BACKUP_DATABASE_URL!);
    return this.spawnGz('pg_dump', ['--no-owner', '--no-privileges', '-Fp'], env);
  }

  /**
   * Dump --data-only de UMA entidade: portal_app (NOBYPASSRLS) + GUC do tenant.
   * `--enable-row-security` faz o pg_dump RESPEITAR a RLS no COPY → exporta só as
   * linhas da entidade (sem ele, o pg_dump ERRA em tabela com RLS). Restaurar exige
   * --disable-triggers (FKs circulares) e o tenant já existente.
   */
  private dumpEntidadeGz(tenantId: string, tabelas: string[]): Promise<Buffer> {
    const env = { ...this.pgEnv(process.env.DATABASE_URL!), PGOPTIONS: `-c app.current_tenant_id=${tenantId}` };
    const args = ['--data-only', '--no-owner', '--enable-row-security', '-Fp'];
    for (const t of tabelas) args.push('-t', `public.${t}`);
    return this.spawnGz('pg_dump', args, env);
  }

  /** Monta as variáveis PG* a partir de uma URL de conexão. */
  private pgEnv(connUrl: string): NodeJS.ProcessEnv {
    const url = new URL(connUrl);
    return {
      ...process.env,
      PGHOST: url.hostname,
      PGPORT: url.port || '5432',
      PGUSER: decodeURIComponent(url.username),
      PGPASSWORD: decodeURIComponent(url.password),
      PGDATABASE: url.pathname.replace(/^\//, ''),
    };
  }

  /** Roda um comando e devolve o stdout gzipado em buffer. */
  private spawnGz(cmd: string, args: string[], env: NodeJS.ProcessEnv): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const pg = spawn(cmd, args, { env });
      const gz = createGzip();
      const chunks: Buffer[] = [];
      let stderr = '';
      pg.stderr.on('data', (d) => { stderr += String(d); });
      pg.on('error', (e) => reject(new Error(`pg_dump não encontrado/erro: ${e.message}`)));
      pg.on('close', (code) => { if (code !== 0) reject(new Error(`pg_dump saiu com código ${code}: ${stderr.slice(0, 300)}`)); });
      gz.on('data', (c: Buffer) => chunks.push(c));
      gz.on('end', () => resolve(Buffer.concat(chunks)));
      gz.on('error', reject);
      pg.stdout.pipe(gz);
    });
  }

  /** Remove backups mais antigos que `dias`. */
  private async aplicarRetencao(dias: number): Promise<void> {
    if (!this.s3) return;
    const limite = Date.now() - dias * 86_400_000;
    const r = await this.s3.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: 'db/' }));
    const velhos = (r.Contents ?? []).filter((o) => (o.LastModified?.getTime() ?? Infinity) < limite);
    if (!velhos.length) return;
    await this.s3.send(new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: { Objects: velhos.map((o) => ({ Key: o.Key! })) },
    }));
    this.log.log(`Retenção: removidos ${velhos.length} backup(s) com mais de ${dias} dias.`);
  }

  private async garantirBucket(): Promise<void> {
    if (!this.s3) return;
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try { await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket })); this.log.log(`Bucket "${this.bucket}" criado.`); }
      catch (e) { this.log.warn(`Não foi possível criar o bucket "${this.bucket}": ${(e as Error).message}`); }
    }
  }

  private timestamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }
}

/** Aceita só keys dos prefixos de backup (anti-travessia para outras keys). */
function keyDeBackup(key: string): boolean {
  return key.startsWith('db/') || key.startsWith('entidades/');
}
