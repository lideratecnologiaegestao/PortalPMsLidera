import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { exec as execCb } from 'node:child_process';
import { mkdtemp, rm, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import * as mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { IaIndexadorService } from '../ia/ia-indexador.service';
import { AnthropicService } from '../ia/anthropic.service';
import { BuscaSyncService } from '../busca/busca-sync.service';
import {
  JOB_EXTRAI_TEXTO_DOCUMENTO,
  JOB_IA_REINDEX,
  QUEUE_IA,
} from '../queue/queue.constants';

const exec = promisify(execCb);

interface ExtracaoJob {
  tenantId: string;
  documentoId: string;
  forcar?: boolean; // se true, reprocessa mesmo que já indexado
}

interface ReindexJob {
  tenantId: string;
}

const MAX_CHARS = 400_000; // limita o tamanho indexado (tsvector)

/**
 * Limiar de texto nativo considerado "escaneado":
 * menos de 50 chars por página OU menos de 100 no total.
 */
const CHARS_POR_PAGINA_MINIMO = 50;
const TOTAL_CHARS_MINIMO = 100;

/**
 * Limites para controlar custo/tempo do OCR.
 * - MAX_PAGINAS_TESSERACT: paginas rasterizadas para Tesseract
 * - MAX_PAGINAS_CLAUDE: paginas enviadas ao Claude (apenas fallback de baixa confiança)
 * - CONFIANCA_TESSERACT_MINIMA: limiar (%) abaixo do qual a página vai p/ Claude
 */
const MAX_PAGINAS_TESSERACT = 40;
const MAX_PAGINAS_CLAUDE = 10;
const CONFIANCA_TESSERACT_MINIMA = 30;

type OcrMetodo = 'nativo' | 'tesseract' | 'claude' | 'vazio';

interface ResultadoExtracao {
  texto: string;
  metodo: OcrMetodo;
  confianca: number | null;
  paginas: number;
}

/**
 * Worker da fila `ia`: trata dois jobs distintos.
 *
 * 1. JOB_EXTRAI_TEXTO_DOCUMENTO — extrai o texto do arquivo de um documento
 *    via pipeline em camadas: nativo → Tesseract OCR → Claude visão.
 *    Grava em `conteudo_extraido`, `ocr_metodo`, `ocr_confianca`, `ocr_paginas`.
 *
 * 2. JOB_IA_REINDEX — (re)constrói o corpus vetorial ia_chunks do tenant.
 *
 * Roda fora do HTTP → abre o TenantContext para o RLS valer.
 */
@Processor(QUEUE_IA, { concurrency: 2 })
export class DocumentosFtsWorker extends WorkerHost {
  private readonly log = new Logger(DocumentosFtsWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly iaIndexador: IaIndexadorService,
    private readonly anthropic: AnthropicService,
    private readonly buscaSync: BuscaSyncService,
    @InjectQueue(QUEUE_IA) private readonly filaIa: Queue,
  ) {
    super();
  }

  async process(job: Job<ExtracaoJob | ReindexJob>): Promise<void> {
    // ---- Reindexação vetorial (Camada 4) ----
    if (job.name === JOB_IA_REINDEX) {
      const { tenantId } = job.data as ReindexJob;
      if (!tenantId) return;
      const resultado = await TenantContext.run({ tenantId }, () =>
        this.iaIndexador.reindexar(tenantId),
      );
      this.log.log(
        `Reindexação concluída (tenant ${tenantId}): total=${resultado.total}, ok=${resultado.ok}` +
          (resultado.motivo ? `, motivo=${resultado.motivo}` : ''),
      );
      return;
    }

    // ---- Extração FTS de documento ----
    if (job.name !== JOB_EXTRAI_TEXTO_DOCUMENTO) return;

    const { tenantId, documentoId, forcar } = job.data as ExtracaoJob;
    if (!tenantId || !documentoId) return;

    await TenantContext.run({ tenantId }, async () => {
      const doc = await this.prisma.db.documento.findUnique({
        where: { id: documentoId },
        select: {
          id: true,
          arquivoUrl: true,
          storageKey: true,
          conteudoIndexadoEm: true,
          conteudoExtraido: true,
          // LGPD: não buscamos PII; só precisamos checar visibilidade para decidir
          // se enviamos ao Claude (documentos restritos não são enviados).
          cadastro: { select: { visibilidade: true } },
        },
      });
      if (!doc?.arquivoUrl) return;

      // Idempotência: não reprocessa se já indexado (a menos que forcar=true)
      if (!forcar && doc.conteudoIndexadoEm) {
        this.log.log(`Documento ${documentoId} já indexado em ${doc.conteudoIndexadoEm.toISOString()}; ignorando.`);
        return;
      }

      const key = await this.resolverStorageKey(doc.storageKey, doc.arquivoUrl);
      if (!key) {
        this.log.warn(`Documento ${documentoId}: storageKey não resolvido (arquivo externo?).`);
        return;
      }

      const { buffer, mime } = await this.storage.get(key);

      // LGPD: documentos restritos nunca são enviados ao Claude/Voyage
      const visibilidade = (doc as any).cadastro?.visibilidade ?? 'publico';
      const podeUsarClaude = visibilidade === 'publico' && this.anthropic.configurado;

      const resultado = await this.extrairComPipeline(
        buffer, mime, doc.arquivoUrl, podeUsarClaude,
      );

      const limpo = (resultado.texto || '').replace(/\s+/g, ' ').trim().slice(0, MAX_CHARS);

      await this.prisma.db.documento.update({
        where: { id: documentoId },
        data: {
          conteudoExtraido: limpo || null,
          conteudoIndexadoEm: new Date(),
          ocrMetodo: resultado.metodo,
          ocrConfianca: resultado.confianca,
          ocrPaginas: resultado.paginas,
        },
      });

      this.log.log(
        `Documento ${documentoId} indexado: ${limpo.length} chars, ` +
        `método=${resultado.metodo}, confiança=${resultado.confianca ?? 'N/A'}%, ` +
        `páginas=${resultado.paginas}.`,
      );

      // Garante que o texto OCR entre no FTS unificado e nos vetores IA
      this.buscaSync.enqueue('documento', documentoId).catch(() => undefined);
      await this.enfileirarReembed(tenantId);
    });
  }

  // ─────────────────────────── Pipeline de extração em camadas ──────────────

  private async extrairComPipeline(
    buffer: Buffer,
    mime: string,
    arquivoUrl: string,
    podeUsarClaude: boolean,
  ): Promise<ResultadoExtracao> {
    const ext = (arquivoUrl.split('.').pop() || '').toLowerCase();

    // Arquivos não-PDF: extração direta sem OCR
    if (ext !== 'pdf' && mime !== 'application/pdf') {
      const texto = await this.extrairNaoPdf(buffer, mime, ext);
      return {
        texto,
        metodo: 'nativo',
        confianca: null,
        paginas: 0,
      };
    }

    // === Camada 1: Extração nativa (pdf-parse) ===
    let textoNativo = '';
    let numeroPaginas = 0;
    try {
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      try {
        const r = await parser.getText();
        textoNativo = r.text ?? '';
        // pdf-parse v2 expõe nPages ou numberOfPages dependendo da versão
        numeroPaginas = (r as any).nPages ?? (r as any).numberOfPages ?? 0;
      } finally {
        await parser.destroy().catch(() => undefined);
      }
    } catch (e) {
      this.log.warn(`Extração nativa falhou: ${(e as Error).message}`);
    }

    // Heurística de detecção de PDF escaneado
    const textoLimpo = textoNativo.trim();
    const eEscaneado = this.detectarEscaneado(textoLimpo, numeroPaginas);

    if (!eEscaneado) {
      return {
        texto: textoNativo,
        metodo: 'nativo',
        confianca: null,
        paginas: numeroPaginas,
      };
    }

    this.log.log(`PDF escaneado detectado (${textoLimpo.length} chars, ${numeroPaginas} págs.) — iniciando OCR.`);

    // === Camada 2: Tesseract OCR (local, grátis) ===
    return this.extrairComOcr(buffer, numeroPaginas, podeUsarClaude);
  }

  /**
   * Detecta se o PDF é escaneado (imagem) com base na quantidade de texto nativo.
   * Heurística: menos de CHARS_POR_PAGINA_MINIMO por página ou menos de
   * TOTAL_CHARS_MINIMO no total → considerado escaneado.
   */
  private detectarEscaneado(textoLimpo: string, numeroPaginas: number): boolean {
    if (textoLimpo.length < TOTAL_CHARS_MINIMO) return true;
    if (numeroPaginas > 0 && textoLimpo.length < numeroPaginas * CHARS_POR_PAGINA_MINIMO) return true;
    return false;
  }

  /**
   * Pipeline OCR:
   *  1. Rasteriza o PDF para PNG usando pdftoppm (poppler).
   *  2. Para cada página: roda tesseract; avalia confiança.
   *  3. Páginas com confiança baixa (ou vazias): Claude visão como fallback.
   *  4. Concatena tudo.
   */
  private async extrairComOcr(
    buffer: Buffer,
    numeroPaginasPdf: number,
    podeUsarClaude: boolean,
  ): Promise<ResultadoExtracao> {
    let tmpDir: string | null = null;

    try {
      tmpDir = await mkdtemp(join(tmpdir(), 'pdf-ocr-'));
      const pdfPath = join(tmpDir, 'input.pdf');

      // Escreve o PDF no disco temporário
      await writeFile(pdfPath, buffer); // fs.promises — não import externo

      // Rasteriza páginas com pdftoppm (DPI 200, PNG, limite de páginas)
      const lastPage = Math.min(MAX_PAGINAS_TESSERACT, numeroPaginasPdf > 0 ? numeroPaginasPdf : MAX_PAGINAS_TESSERACT);
      const prefixo = join(tmpDir, 'pg');
      try {
        await exec(
          `pdftoppm -r 200 -png -f 1 -l ${lastPage} "${pdfPath}" "${prefixo}"`,
        );
      } catch (e) {
        this.log.warn(`pdftoppm falhou: ${(e as Error).message}`);
        // Sem rasterização → retorna como vazio (PDF protegido/corrompido)
        return { texto: '', metodo: 'vazio', confianca: null, paginas: 0 };
      }

      // Lista PNGs gerados em ordem (pg-01.png, pg-02.png…)
      const arquivos = (await readdir(tmpDir))
        .filter((f) => f.endsWith('.png'))
        .sort();

      if (arquivos.length === 0) {
        this.log.warn('pdftoppm não gerou imagens — PDF pode estar corrompido ou protegido.');
        return { texto: '', metodo: 'vazio', confianca: null, paginas: 0 };
      }

      const textosPartes: string[] = [];
      const confiancasPartes: number[] = [];
      let paginasProcessadas = 0;
      let paginasClaude = 0;
      let metodoFinal: OcrMetodo = 'tesseract';

      for (const arquivo of arquivos) {
        const pngPath = join(tmpDir, arquivo);
        paginasProcessadas++;

        // Tesseract: extrai texto e confiança
        const { texto: textoTesseract, confianca } = await this.rodarTesseract(pngPath).catch(() => ({
          texto: '', confianca: 0,
        }));

        const precisaClaude =
          podeUsarClaude &&
          paginasClaude < MAX_PAGINAS_CLAUDE &&
          confianca < CONFIANCA_TESSERACT_MINIMA;

        if (precisaClaude) {
          // Camada 3: Claude visão (fallback para páginas ruins)
          const textoClaude = await this.extrairPaginaClaude(pngPath).catch((e: Error) => {
            this.log.warn(`Claude OCR falhou na página ${arquivo}: ${e.message}`);
            return '';
          });
          paginasClaude++;
          metodoFinal = 'claude';
          textosPartes.push(textoClaude || textoTesseract);
          confiancasPartes.push(textoClaude ? 100 : confianca);
        } else {
          textosPartes.push(textoTesseract);
          confiancasPartes.push(confianca);
        }
      }

      // Confiança média ponderada
      const confiancaMedia =
        confiancasPartes.length > 0
          ? confiancasPartes.reduce((a, b) => a + b, 0) / confiancasPartes.length
          : null;

      const textoFinal = textosPartes.join('\n\n').trim();

      if (!textoFinal) {
        metodoFinal = 'vazio';
      }

      return {
        texto: textoFinal,
        metodo: metodoFinal,
        confianca: confiancaMedia !== null ? Math.round(confiancaMedia * 10) / 10 : null,
        paginas: paginasProcessadas,
      };
    } finally {
      // Limpa os arquivos temporários
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  /**
   * Executa Tesseract em uma imagem PNG e retorna texto + confiança estimada.
   * Usa modo TSV para capturar confiança por palavra.
   */
  private async rodarTesseract(pngPath: string): Promise<{ texto: string; confianca: number }> {
    // Extrai texto puro (stdout)
    const { stdout: textoRaw } = await exec(
      `tesseract "${pngPath}" stdout -l por --psm 1 quiet 2>/dev/null`,
    ).catch(() => ({ stdout: '' }));

    // Extrai TSV para calcular confiança média
    const { stdout: tsvRaw } = await exec(
      `tesseract "${pngPath}" stdout -l por --psm 1 tsv 2>/dev/null`,
    ).catch(() => ({ stdout: '' }));

    const confianca = this.calcularConfiancaTsv(tsvRaw);
    return { texto: textoRaw.trim(), confianca };
  }

  /**
   * Parseia o TSV do Tesseract (coluna 10 = conf) e calcula a média das palavras
   * com confiança válida (>= 0; Tesseract usa -1 para separadores).
   */
  private calcularConfiancaTsv(tsv: string): number {
    if (!tsv) return 0;
    const linhas = tsv.split('\n').slice(1); // pula o cabeçalho
    const valores: number[] = [];
    for (const linha of linhas) {
      const colunas = linha.split('\t');
      if (colunas.length < 11) continue;
      const conf = parseFloat(colunas[10]);
      if (!isNaN(conf) && conf >= 0) valores.push(conf);
    }
    if (valores.length === 0) return 0;
    return valores.reduce((a, b) => a + b, 0) / valores.length;
  }

  /**
   * Envia uma página PNG para o Claude visão e retorna a transcrição verbatim.
   * Só é chamado para páginas com Tesseract de baixa confiança (fallback).
   */
  private async extrairPaginaClaude(pngPath: string): Promise<string> {
    const dados = await readFile(pngPath);
    const base64 = dados.toString('base64');
    return this.anthropic.ocr(base64, 'image/png');
  }

  /**
   * Extração para formatos não-PDF (DOCX, TXT).
   */
  private async extrairNaoPdf(buffer: Buffer, mime: string, ext: string): Promise<string> {
    try {
      if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
        const r = await mammoth.extractRawText({ buffer });
        return r.value;
      }
      if (ext === 'txt' || mime.startsWith('text/')) {
        return buffer.toString('utf8');
      }
    } catch (e) {
      this.log.warn(`Falha ao extrair texto (${ext}): ${(e as Error).message}`);
    }
    return '';
  }

  // ─────────────────────────── Helpers ──────────────────────────────────────

  /** storageKey explícito ou resolvido pelo hash da URL pública /midia/.../<hash>.<ext>. */
  private async resolverStorageKey(storageKey: string | null, arquivoUrl: string): Promise<string | null> {
    if (storageKey) return storageKey;
    const m = arquivoUrl.match(/\/midia\/[^/]+\/[^/]+\/([^/.]+)\.[^/.]+$/);
    if (!m) return null;
    const asset = await this.prisma.db.mediaAsset.findFirst({
      where: { hash: m[1] }, select: { storageKey: true },
    });
    return (asset as { storageKey?: string } | null)?.storageKey ?? null;
  }

  /**
   * Enfileira reindexação vetorial do tenant para que o texto OCR entre
   * no corpus ia_chunks (Camada 4 do RAG).
   * Fire-and-forget: usa a mesma QUEUE_IA (o worker já escuta JOB_IA_REINDEX).
   * Idempotente: jobId fixo por tenant; se já estiver na fila, não duplica.
   */
  private async enfileirarReembed(tenantId: string): Promise<void> {
    try {
      await this.filaIa.add(
        JOB_IA_REINDEX,
        { tenantId },
        {
          jobId: `ia-reindex-${tenantId}`,
          attempts: 2,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (e: unknown) {
      // nunca derrubar o worker por falha no enfileiramento
      this.log.warn(`Falha ao enfileirar reindexação vetorial pós-OCR: ${(e as Error).message}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<ExtracaoJob | ReindexJob>, error: Error): Promise<void> {
    this.log.warn(`Job ${job.name} falhou (${JSON.stringify(job.data)}): ${error.message}`);

    // Dead-letter em audit_log (regra de auditoria de falhas de worker)
    try {
      const tenantId = (job.data as { tenantId?: string }).tenantId ?? null;
      if (tenantId) {
        await TenantContext.run({ tenantId }, () =>
          this.prisma.db.auditLog.create({
            data: {
              tenantId,
              atorId: null,
              acao: 'WORKER_FALHOU',
              entidade: 'ia_worker',
              entidadeId: null,
              dados: {
                jobName: job.name,
                jobId: job.id,
                erro: error.message,
                tentativas: job.attemptsMade,
              } as object,
            },
          }),
        );
      }
    } catch {
      // nunca deixar a falha de auditoria derrubar o handler
    }
  }
}
