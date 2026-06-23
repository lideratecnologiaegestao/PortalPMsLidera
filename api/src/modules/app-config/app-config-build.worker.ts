import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AnthropicService } from '../ia/anthropic.service';
import { StorageService } from '../storage/storage.service';
import { JOB_APP_BUILD, QUEUE_APP_BUILD } from '../queue/queue.constants';

const execFileAsync = promisify(execFile);

/** Timeout total do processo de polling (45 minutos). */
const BUILD_TIMEOUT_MS = 45 * 60 * 1_000;

/** Intervalo de polling do status no EAS. */
const POLL_INTERVAL_MS = 60 * 1_000;

interface BuildJobPayload {
  tenantId: string;
  buildId: string;
  perfil: 'preview' | 'production';
  slug: string;
}

/**
 * Worker da fila `app-build` (ADR-0006 Fase 2).
 *
 * Responsabilidades:
 *  1. Copia o código-fonte do app (MOBILE_SRC_DIR) para um dir temporário.
 *  2. Instala dependências (npm ci / npm install).
 *  3. Gera `tenants/<slug>.json` com a config do tenant (+ baixa ícone/splash se houver).
 *  4. Aciona `eas build --non-interactive --no-wait --json` → obtém eas_build_id.
 *  5. Polling a cada 60s via `eas build:view` até concluído, falhou ou timeout (45 min).
 *  6. Se falhou, envia o log parcial/erro à IA para gerar `erro_resumo` (~3 frases).
 *  7. Audita APP_BUILD_CONCLUIDO ou APP_BUILD_FALHOU.
 *  8. Limpa o dir temporário (try/finally).
 *
 * Concorrência = 1: builds são pesados de I/O e consomem o limite do EAS.
 * Qualquer exceção marca o build como 'falhou' — nunca derruba o processo.
 */
@Processor(QUEUE_APP_BUILD, { concurrency: 1 })
export class AppConfigBuildWorker extends WorkerHost {
  private readonly log = new Logger(AppConfigBuildWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly storage: StorageService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== JOB_APP_BUILD) return;

    const { tenantId, buildId, perfil, slug } = job.data as BuildJobPayload;
    if (!tenantId || !buildId || !perfil || !slug) {
      this.log.warn(`Job ${job.id} sem payload completo — ignorado.`);
      return;
    }

    // Cada build roda dentro do contexto do tenant para que o PrismaService
    // aplique o RLS correto ao gravar atualizações de status e audit_log.
    await TenantContext.run({ tenantId }, () => this.executarBuild(tenantId, buildId, perfil, slug));
  }

  // ---------------------------------------------------------------------------
  // Fluxo principal do build
  // ---------------------------------------------------------------------------

  private async executarBuild(
    tenantId: string,
    buildId: string,
    perfil: 'preview' | 'production',
    slug: string,
  ): Promise<void> {
    const tmpDir = path.join(os.tmpdir(), 'app-builds', buildId);
    let easBuildId: string | undefined;

    try {
      // ── 1. Carrega config do tenant ──────────────────────────────────────
      const config = await this.prisma.db.tenantAppConfig.findUnique({
        where: { tenantId },
      });

      // ── 2. Status: preparando ────────────────────────────────────────────
      await this.atualizarStatus(buildId, 'preparando');

      // ── 3. Prepara diretório temporário ──────────────────────────────────
      await this.prepararDirTemp(tmpDir);

      // ── 4. Gera tenants/<slug>.json com a config ──────────────────────────
      await this.gerarArquivoConfig(tmpDir, slug, config);

      // ── 5. Baixa ícone e splash se existirem ─────────────────────────────
      await this.baixarAssets(tmpDir, slug, config);

      // ── 6. npm ci (precisa das deps para o eas ler app.config.ts) ─────────
      await this.instalarDeps(tmpDir);

      // ── 7. Status: em_build — inicia EAS Build ────────────────────────────
      await this.atualizarStatus(buildId, 'em_build');

      const easResult = await this.iniciarEasBuild(tmpDir, slug, perfil);
      easBuildId = easResult.id;
      const logUrl = easResult.logUrl ?? null;

      await this.prisma.db.tenantAppBuild.update({
        where: { id: buildId },
        data: { easBuildId, logUrl },
      });

      // ── 8. Polling ────────────────────────────────────────────────────────
      const { status: statusFinal, buildUrl, erroTexto } =
        await this.pollingStatus(tmpDir, slug, easBuildId, logUrl);

      if (statusFinal === 'concluido') {
        await this.prisma.db.tenantAppBuild.update({
          where: { id: buildId },
          data: { status: 'concluido', easBuildUrl: buildUrl ?? null },
        });
        await this.auditar(tenantId, buildId, 'APP_BUILD_CONCLUIDO', { easBuildId, buildUrl });
        this.log.log(`Build ${buildId} concluído. URL: ${buildUrl}`);
      } else {
        // falhou ou timeout
        const erroResumo = await this.diagnosticarErroIA(erroTexto ?? 'Build falhou sem detalhes.');
        await this.prisma.db.tenantAppBuild.update({
          where: { id: buildId },
          data: { status: 'falhou', erroResumo },
        });
        await this.auditar(tenantId, buildId, 'APP_BUILD_FALHOU', { easBuildId, erroResumo });
        this.log.warn(`Build ${buildId} falhou. Resumo IA: ${erroResumo}`);
      }
    } catch (err) {
      // Captura qualquer exceção não prevista — não derruba o worker
      const msg = (err as Error).message ?? String(err);
      this.log.error(`Build ${buildId} exceção inesperada: ${msg}`);
      let erroResumo: string;
      try {
        erroResumo = await this.diagnosticarErroIA(msg);
      } catch {
        erroResumo = msg.slice(0, 500);
      }
      try {
        await this.prisma.db.tenantAppBuild.update({
          where: { id: buildId },
          data: { status: 'falhou', erroResumo },
        });
        await this.auditar(tenantId, buildId, 'APP_BUILD_FALHOU', { easBuildId, erroResumo });
      } catch (auditErr) {
        this.log.error(`Falha ao gravar status 'falhou': ${(auditErr as Error).message}`);
      }
    } finally {
      // Limpa o dir temp em qualquer caso
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
        this.log.debug(`Dir temp removido: ${tmpDir}`);
      } catch (rmErr) {
        this.log.warn(`Não foi possível remover dir temp ${tmpDir}: ${(rmErr as Error).message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Preparação do diretório temporário (cópia filtrada do MOBILE_SRC_DIR)
  // ---------------------------------------------------------------------------

  private async prepararDirTemp(tmpDir: string): Promise<void> {
    const srcDir = process.env.MOBILE_SRC_DIR ?? '/mobile-src';

    // Verifica se o src existe
    try {
      await fs.access(srcDir);
    } catch {
      throw new Error(
        `Diretório de código-fonte do app não encontrado: ${srcDir} (MOBILE_SRC_DIR não configurado ou não montado).`,
      );
    }

    // Cria o destino
    await fs.mkdir(tmpDir, { recursive: true });

    // Cópia recursiva excluindo diretórios pesados
    await this.copiarRecursivo(srcDir, tmpDir, new Set([
      'node_modules', '.expo', '.git', 'android', 'ios',
    ]));
  }

  /**
   * Cópia recursiva de src → dest excluindo entradas cujo nome esteja em `excluir`.
   * Usa apenas fs nativo — sem dependências externas.
   */
  private async copiarRecursivo(
    src: string,
    dest: string,
    excluir: Set<string>,
  ): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      if (excluir.has(entry.name)) continue;
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copiarRecursivo(srcPath, destPath, excluir);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Geração do arquivo de config do tenant
  // ---------------------------------------------------------------------------

  private async gerarArquivoConfig(
    tmpDir: string,
    slug: string,
    config: any,
  ): Promise<void> {
    const tenantsDir = path.join(tmpDir, 'tenants');
    await fs.mkdir(tenantsDir, { recursive: true });

    const payload = {
      slug,
      name: config?.appName ?? slug,
      shortName: config?.appShortName ?? slug,
      scheme: config?.scheme ?? slug,
      bundleId: config?.bundleId ?? `br.gov.${slug}`,
      primaryColor: config?.primaryColor ?? '#1351B4',
      apiUrl: config?.apiUrl ?? '',
      easProjectId: config?.easProjectId ?? '',
      easOwner: config?.easOwner ?? '',
    };

    await fs.writeFile(
      path.join(tenantsDir, `${slug}.json`),
      JSON.stringify(payload, null, 2),
      'utf-8',
    );
  }

  // ---------------------------------------------------------------------------
  // Download de ícone e splash do storage
  // ---------------------------------------------------------------------------

  private async baixarAssets(
    tmpDir: string,
    slug: string,
    config: any,
  ): Promise<void> {
    if (!config) return;
    const assetsDir = path.join(tmpDir, 'tenants', slug);

    if (config.iconStorageKey) {
      try {
        const { buffer } = await this.storage.get(config.iconStorageKey);
        await fs.mkdir(assetsDir, { recursive: true });
        await fs.writeFile(path.join(assetsDir, 'icon.png'), buffer);
        this.log.debug(`Ícone baixado para ${assetsDir}/icon.png`);
      } catch (err) {
        this.log.warn(`Não foi possível baixar ícone do storage: ${(err as Error).message}`);
      }
    }

    if (config.splashStorageKey) {
      try {
        const { buffer } = await this.storage.get(config.splashStorageKey);
        await fs.mkdir(assetsDir, { recursive: true });
        await fs.writeFile(path.join(assetsDir, 'splash.png'), buffer);
        this.log.debug(`Splash baixado para ${assetsDir}/splash.png`);
      } catch (err) {
        this.log.warn(`Não foi possível baixar splash do storage: ${(err as Error).message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // npm ci no diretório temporário
  // ---------------------------------------------------------------------------

  private async instalarDeps(tmpDir: string): Promise<void> {
    // Prefere npm ci (determinístico); se não houver package-lock.json, usa npm install
    const lockExists = await fs
      .access(path.join(tmpDir, 'package-lock.json'))
      .then(() => true)
      .catch(() => false);

    const args = lockExists
      ? ['ci', '--prefer-offline']
      : ['install', '--no-audit', '--no-fund'];

    this.log.log(`Instalando deps: npm ${args.join(' ')} em ${tmpDir}`);

    await execFileAsync('npm', args, {
      cwd: tmpDir,
      env: { ...process.env },
      timeout: 10 * 60 * 1_000, // 10 min
      maxBuffer: 50 * 1024 * 1024, // 50 MB stdout
    });
  }

  // ---------------------------------------------------------------------------
  // Inicia o EAS Build (--no-wait, retorna o ID do build)
  // ---------------------------------------------------------------------------

  private async iniciarEasBuild(
    tmpDir: string,
    slug: string,
    perfil: 'preview' | 'production',
  ): Promise<{ id: string; logUrl?: string }> {
    this.log.log(`Iniciando EAS Build: perfil=${perfil}, tenant=${slug}`);

    // NOTA DE SEGURANÇA: slug e perfil vão como argumentos posicionais separados
    // (execFile), NUNCA interpolados em uma string de shell — evita injection.
    const { stdout } = await execFileAsync(
      'eas',
      [
        'build',
        '--platform', 'android',
        '--profile', perfil,
        '--non-interactive',
        '--no-wait',
        '--json',
      ],
      {
        cwd: tmpDir,
        env: {
          ...process.env,
          EXPO_TOKEN: process.env.EXPO_TOKEN ?? '',
          APP_TENANT: slug,
          EAS_NO_VCS: '1',
        },
        timeout: 5 * 60 * 1_000, // 5 min para iniciar
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    return this.parsearRespostaEasBuild(stdout);
  }

  /**
   * Parseia o stdout do `eas build --json`.
   * O EAS CLI pode retornar um objeto único ou um array de builds.
   * Extrai id + logUrl de forma robusta.
   */
  private parsearRespostaEasBuild(stdout: string): { id: string; logUrl?: string } {
    // O EAS às vezes emite linhas de progresso antes do JSON — extrai o primeiro bloco JSON
    const jsonMatch = stdout.match(/(\[.*\]|\{.*\})/s);
    if (!jsonMatch) {
      throw new Error(`EAS Build não retornou JSON válido. stdout: ${stdout.slice(0, 500)}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[1]);
    } catch {
      throw new Error(`Falha ao parsear JSON do EAS Build: ${jsonMatch[1].slice(0, 300)}`);
    }

    // Pode ser array ou objeto
    const item = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!item || typeof item !== 'object') {
      throw new Error(`JSON do EAS Build não contém objeto de build: ${JSON.stringify(parsed).slice(0, 300)}`);
    }

    const obj = item as Record<string, unknown>;
    const id = (obj['id'] ?? obj['buildId']) as string | undefined;
    if (!id) {
      throw new Error(`EAS Build não retornou 'id': ${JSON.stringify(obj).slice(0, 300)}`);
    }

    const logUrl =
      (obj['logUrl'] as string | undefined) ??
      (obj['logsUrl'] as string | undefined) ??
      undefined;

    return { id, logUrl };
  }

  // ---------------------------------------------------------------------------
  // Polling do status via `eas build:view --json`
  // ---------------------------------------------------------------------------

  private async pollingStatus(
    tmpDir: string,
    slug: string,
    easBuildId: string,
    logUrl: string | null,
  ): Promise<{ status: 'concluido' | 'falhou'; buildUrl?: string; erroTexto?: string }> {
    const deadline = Date.now() + BUILD_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await this.esperar(POLL_INTERVAL_MS);

      let viewResult: Record<string, unknown>;
      try {
        // NOTA: easBuildId vem do próprio EAS (UUID) — sem risco de injection,
        // mas passado como argumento posicional mesmo assim.
        const { stdout } = await execFileAsync(
          'eas',
          ['build:view', easBuildId, '--json'],
          {
            cwd: tmpDir,
            env: {
              ...process.env,
              EXPO_TOKEN: process.env.EXPO_TOKEN ?? '',
              APP_TENANT: slug,
              EAS_NO_VCS: '1',
            },
            timeout: 30_000, // 30s
            maxBuffer: 5 * 1024 * 1024,
          },
        );
        viewResult = this.parsearViewJson(stdout);
      } catch (err) {
        this.log.warn(`Polling falhou (tentará novamente): ${(err as Error).message}`);
        continue;
      }

      const easStatus = (viewResult['status'] as string | undefined)?.toLowerCase() ?? '';
      this.log.debug(`Polling build ${easBuildId}: status=${easStatus}`);

      if (easStatus === 'finished') {
        const buildUrl = this.extrairBuildUrl(viewResult);
        return { status: 'concluido', buildUrl };
      }

      if (easStatus === 'errored' || easStatus === 'canceled' || easStatus === 'cancelled') {
        const erroTexto = this.extrairErroTexto(viewResult);
        return { status: 'falhou', erroTexto };
      }

      // Em andamento: in-queue, in-progress, building, etc. → continua polling
    }

    // Timeout
    return { status: 'falhou', erroTexto: 'Tempo limite de 45 minutos excedido sem resposta do EAS.' };
  }

  private parsearViewJson(stdout: string): Record<string, unknown> {
    const jsonMatch = stdout.match(/(\[.*\]|\{.*\})/s);
    if (!jsonMatch) return {};
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      return Array.isArray(parsed) ? (parsed[0] ?? {}) : (parsed as Record<string, unknown>);
    } catch {
      return {};
    }
  }

  private extrairBuildUrl(obj: Record<string, unknown>): string | undefined {
    const artifacts = obj['artifacts'] as Record<string, unknown> | undefined;
    return (
      (artifacts?.['applicationArchiveUrl'] as string | undefined) ??
      (artifacts?.['buildUrl'] as string | undefined) ??
      (obj['buildUrl'] as string | undefined) ??
      undefined
    );
  }

  private extrairErroTexto(obj: Record<string, unknown>): string {
    const partes: string[] = [];
    const error = obj['error'] as Record<string, unknown> | string | undefined;
    if (typeof error === 'string') partes.push(error);
    else if (error && typeof error === 'object') {
      const msg = (error['message'] ?? error['title']) as string | undefined;
      if (msg) partes.push(msg);
    }
    const logSnippet = obj['logSnippet'] as string | undefined;
    if (logSnippet) partes.push(logSnippet.slice(-1000));
    return partes.join('\n') || 'Build falhou sem detalhes adicionais.';
  }

  // ---------------------------------------------------------------------------
  // Diagnóstico IA do erro
  // ---------------------------------------------------------------------------

  private async diagnosticarErroIA(erroTexto: string): Promise<string> {
    try {
      const resumo = await this.anthropic.completar({
        system:
          'Você analisa logs de build EAS Android. Em até 3 frases objetivas em pt-BR, diga a causa provável e a correção.',
        user: erroTexto.slice(0, 3000), // limita para não exceder tokens
        maxTokens: 256,
      });
      return resumo.trim().slice(0, 500);
    } catch (err) {
      this.log.warn(`IA de diagnóstico falhou: ${(err as Error).message}`);
      // Degrada graciosamente: usa o texto do erro direto
      return erroTexto.slice(0, 500);
    }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private async atualizarStatus(buildId: string, status: string): Promise<void> {
    await this.prisma.db.tenantAppBuild.update({
      where: { id: buildId },
      data: { status },
    });
    this.log.debug(`Build ${buildId} → ${status}`);
  }

  private async auditar(
    tenantId: string,
    buildId: string,
    acao: string,
    dados: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.prisma.db.auditLog.create({
        data: {
          tenantId,
          atorId: null,
          acao,
          entidade: 'tenant_app_builds',
          entidadeId: buildId,
          dados: dados as object,
        } as any,
      });
    } catch (err) {
      this.log.warn(`Falha ao auditar ${acao}: ${(err as Error).message}`);
    }
  }

  private esperar(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ---------------------------------------------------------------------------
  // Dead-letter: falhas que esgotaram tentativas → audit_log (Regra #6)
  // ---------------------------------------------------------------------------

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const { tenantId, buildId } = (job.data ?? {}) as Partial<BuildJobPayload>;
    this.log.error(`Job ${job.id} falhou definitivamente: ${error.message}`);

    if (!tenantId || !buildId) return;

    try {
      await TenantContext.run({ tenantId }, () =>
        this.prisma.db.auditLog.create({
          data: {
            tenantId,
            atorId: null,
            acao: 'APP_BUILD_JOB_DEAD_LETTER',
            entidade: 'queue',
            entidadeId: job.id ?? null,
            dados: {
              buildId,
              erro: error.message,
              jobName: job.name,
            } as object,
          } as any,
        }),
      );
    } catch {
      // best-effort
    }
  }
}
