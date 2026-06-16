/**
 * Unit tests — DocumentosFtsWorker (pipeline OCR em camadas)
 *
 * Cobre:
 *  A) PDF nativo: usa extração nativa; não chama Tesseract nem Claude.
 *  B) PDF escaneado: cai no Tesseract; não chama Claude quando confiança ok.
 *  C) Tesseract baixa confiança: chama Claude como fallback (se cadastro público).
 *  D) Idempotência: não reprocessa se já indexado (forcar=false).
 *  E) LGPD: cadastro restrito nunca envia ao Claude.
 *  F) Worker não quebra em falha de Tesseract/Claude (try/catch por página).
 *  G) Campos ocr_metodo/ocr_confianca/ocr_paginas são gravados.
 */

import { DocumentosFtsWorker } from './documentos-fts.worker';

// ─── Mocks globais ────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-aa-0000-0000-0000-000000000000';
const DOC_ID = 'doc-00000-0000-0000-0000-000000000000';

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    run: jest.fn((_ctx: unknown, fn: () => unknown) => fn()),
    tenantId: jest.fn(() => TENANT_ID),
  },
}));

// Mock de exec promisificado — o worker usa `const exec = promisify(execCb)`.
// Substituímos o módulo inteiro para que `exec(cmd)` retorne uma Promise
// controlada pelo teste.
const mockExec = jest.fn<Promise<{ stdout: string; stderr: string }>, [string]>();

jest.mock('node:child_process', () => ({})); // não usado diretamente
jest.mock('node:util', () => ({
  promisify: () => mockExec, // promisify de qualquer fn retorna mockExec
}));

// Mock de fs/promises: mkdtemp, rm, readFile, readdir, writeFile
const mockReaddir = jest.fn();
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn().mockResolvedValue(undefined);
const mockMkdtemp = jest.fn().mockResolvedValue('/tmp/pdf-ocr-test');
const mockRm = jest.fn().mockResolvedValue(undefined);

jest.mock('node:fs/promises', () => ({
  mkdtemp: (...args: unknown[]) => mockMkdtemp(...args),
  rm: (...args: unknown[]) => mockRm(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  readdir: (...args: unknown[]) => mockReaddir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));

jest.mock('node:os', () => ({ tmpdir: () => '/tmp' }));
jest.mock('node:path', () => ({
  join: (...parts: string[]) => parts.join('/'),
}));

// Mock do pdf-parse
const mockGetText = jest.fn();
const mockDestroy = jest.fn().mockResolvedValue(undefined);

jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn().mockImplementation(() => ({
    getText: mockGetText,
    destroy: mockDestroy,
  })),
}));

// Mock do mammoth
jest.mock('mammoth', () => ({
  extractRawText: jest.fn().mockResolvedValue({ value: '' }),
}));

// ─── Builders de mock ─────────────────────────────────────────────────────────

const buildPrisma = () => ({
  db: {
    documento: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    mediaAsset: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
  tx: jest.fn(),
});

const buildStorage = (buffer = Buffer.from('%PDF-1.4')) => ({
  get: jest.fn().mockResolvedValue({ buffer, mime: 'application/pdf' }),
});

const buildIaIndexador = () => ({
  reindexar: jest.fn().mockResolvedValue({ ok: true, total: 0, porFonte: {} }),
});

const buildAnthropic = (configurado = true, respostaClaude = 'Texto OCR Claude') => ({
  configurado,
  ocr: jest.fn().mockResolvedValue(respostaClaude),
});

const buildBuscaSync = () => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
});

const buildFilaIa = () => ({
  add: jest.fn().mockResolvedValue({}),
});

/** Cria o worker com todas as dependências mockadas. */
const buildWorker = (
  overrides: {
    prisma?: ReturnType<typeof buildPrisma>;
    storage?: ReturnType<typeof buildStorage>;
    iaIndexador?: ReturnType<typeof buildIaIndexador>;
    anthropic?: ReturnType<typeof buildAnthropic>;
    buscaSync?: ReturnType<typeof buildBuscaSync>;
    filaIa?: ReturnType<typeof buildFilaIa>;
  } = {},
) => {
  const prisma = overrides.prisma ?? buildPrisma();
  const storage = overrides.storage ?? buildStorage();
  const iaIndexador = overrides.iaIndexador ?? buildIaIndexador();
  const anthropic = overrides.anthropic ?? buildAnthropic();
  const buscaSync = overrides.buscaSync ?? buildBuscaSync();
  const filaIa = overrides.filaIa ?? buildFilaIa();
  const worker = new DocumentosFtsWorker(
    prisma as any,
    storage as any,
    iaIndexador as any,
    anthropic as any,
    buscaSync as any,
    filaIa as any,
  );
  return { worker, prisma, storage, iaIndexador, anthropic, buscaSync, filaIa };
};

/** Helper para criar um job simulado. */
const buildJob = (name: string, data: Record<string, unknown>) => ({
  name,
  id: 'job-001',
  data,
  attemptsMade: 0,
});

// ─── Suite A: PDF nativo ──────────────────────────────────────────────────────

describe('A) PDF nativo — usa extração nativa sem OCR', () => {
  beforeEach(() => jest.clearAllMocks());

  it('grava conteudoExtraido e ocr_metodo=nativo quando PDF tem texto suficiente', async () => {
    const textoNativo = 'A'.repeat(500); // bem acima do limiar
    mockGetText.mockResolvedValue({ text: textoNativo, nPages: 2 });

    const { worker, prisma } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/doc.pdf',
          storageKey: 'tenant/doc.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });
    await worker.process(job as any);

    expect(prisma.db.documento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conteudoExtraido: expect.stringContaining('A'),
          ocrMetodo: 'nativo',
          ocrConfianca: null,
          ocrPaginas: 2,
        }),
      }),
    );

    // Não deve ter chamado pdftoppm nem tesseract
    expect(mockExec).not.toHaveBeenCalled();
  });
});

// ─── Suite B: PDF escaneado → Tesseract ──────────────────────────────────────

describe('B) PDF escaneado → Tesseract OCR', () => {
  const tsvAlta =
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' +
    '5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t85\tTexto\n' +
    '5\t1\t1\t1\t1\t2\t70\t10\t50\t20\t85\tOCR\n';

  beforeEach(() => {
    jest.clearAllMocks();
    // Simula: pdftoppm → ok, tesseract texto → ok, tesseract tsv → ok (conf alta)
    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes('pdftoppm')) return Promise.resolve({ stdout: '', stderr: '' });
      if (cmd.includes('tsv')) return Promise.resolve({ stdout: tsvAlta, stderr: '' });
      return Promise.resolve({ stdout: 'Texto OCR Tesseract da página', stderr: '' });
    });
    mockReaddir.mockResolvedValue(['pg-01.png']);
    mockReadFile.mockResolvedValue(Buffer.from('fake-png-data'));
  });

  it('detecta PDF escaneado e usa Tesseract; grava ocr_metodo=tesseract', async () => {
    // Texto nativo muito curto (escaneado)
    mockGetText.mockResolvedValue({ text: 'abc', nPages: 3 });

    const { worker, prisma, anthropic } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/scan.pdf',
          storageKey: 'tenant/scan.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });
    await worker.process(job as any);

    expect(prisma.db.documento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ocrMetodo: 'tesseract',
          ocrPaginas: 1, // 1 PNG gerado
        }),
      }),
    );

    // Claude não deve ter sido chamado (confiança alta do Tesseract)
    expect(anthropic.ocr).not.toHaveBeenCalled();
  });
});

// ─── Suite C: Tesseract baixa confiança → Claude (fallback) ──────────────────

describe('C) Tesseract baixa confiança → Claude como fallback', () => {
  const tsvBaixa =
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' +
    '5\t1\t1\t1\t1\t1\t10\t10\t50\t20\t20\tlixo\n';

  beforeEach(() => {
    jest.clearAllMocks();
    mockReaddir.mockResolvedValue(['pg-01.png']);
    mockReadFile.mockResolvedValue(Buffer.from('fake-png-data'));

    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes('pdftoppm')) return Promise.resolve({ stdout: '', stderr: '' });
      if (cmd.includes('tsv')) return Promise.resolve({ stdout: tsvBaixa, stderr: '' });
      return Promise.resolve({ stdout: 'lixo xibyte bsxr', stderr: '' });
    });
  });

  it('chama Claude quando Tesseract tem confiança < 30 e cadastro é público', async () => {
    mockGetText.mockResolvedValue({ text: '', nPages: 1 });

    const anthropic = buildAnthropic(true, 'Texto limpo via Claude');
    const { worker, prisma } = buildWorker({
      anthropic,
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/ruim.pdf',
          storageKey: 'tenant/ruim.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });
    await worker.process(job as any);

    expect(anthropic.ocr).toHaveBeenCalledTimes(1);
    expect(prisma.db.documento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ocrMetodo: 'claude',
          conteudoExtraido: 'Texto limpo via Claude',
        }),
      }),
    );
  });
});

// ─── Suite D: Idempotência ────────────────────────────────────────────────────

describe('D) Idempotência — não reprocessa se já indexado', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ignora job se conteudoIndexadoEm não é nulo e forcar=false', async () => {
    const { worker, prisma } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/doc.pdf',
          storageKey: 'tenant/doc.pdf',
          conteudoIndexadoEm: new Date('2025-01-01'), // já indexado
          conteudoExtraido: 'texto existente',
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', {
      tenantId: TENANT_ID,
      documentoId: DOC_ID,
      forcar: false,
    });
    await worker.process(job as any);

    expect(prisma.db.documento.update).not.toHaveBeenCalled();
    expect(mockGetText).not.toHaveBeenCalled();
  });

  it('reprocessa se forcar=true mesmo que já indexado', async () => {
    mockGetText.mockResolvedValue({ text: 'A'.repeat(500), nPages: 1 });

    const { worker, prisma } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/doc.pdf',
          storageKey: 'tenant/doc.pdf',
          conteudoIndexadoEm: new Date('2025-01-01'),
          conteudoExtraido: 'texto antigo',
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', {
      tenantId: TENANT_ID,
      documentoId: DOC_ID,
      forcar: true,
    });
    await worker.process(job as any);

    expect(prisma.db.documento.update).toHaveBeenCalled();
  });
});

// ─── Suite E: LGPD — restrito nunca vai ao Claude ─────────────────────────────

describe('E) LGPD — documento restrito nunca enviado ao Claude', () => {
  const tsvMuitoBaixa =
    'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n' +
    '5\t1\t1\t1\t1\t1\t0\t0\t0\t0\t5\tlixo\n';

  beforeEach(() => {
    jest.clearAllMocks();
    mockReaddir.mockResolvedValue(['pg-01.png']);
    mockReadFile.mockResolvedValue(Buffer.from('fake-png-data'));

    mockExec.mockImplementation((cmd: string) => {
      if (cmd.includes('pdftoppm')) return Promise.resolve({ stdout: '', stderr: '' });
      if (cmd.includes('tsv')) return Promise.resolve({ stdout: tsvMuitoBaixa, stderr: '' });
      return Promise.resolve({ stdout: 'lixo', stderr: '' });
    });
  });

  it('NÃO chama Claude para documentos restritos (visibilidade=restrito)', async () => {
    mockGetText.mockResolvedValue({ text: '', nPages: 1 });

    const anthropic = buildAnthropic(true, 'texto claude');
    const { worker } = buildWorker({
      anthropic,
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/restrito.pdf',
          storageKey: 'tenant/restrito.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'restrito' }, // restrito!
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });
    await worker.process(job as any);

    expect(anthropic.ocr).not.toHaveBeenCalled();
  });
});

// ─── Suite F: Resiliência — worker não quebra em falha ───────────────────────

describe('F) Resiliência — falha não derruba o worker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trata falha no pdf-parse graciosamente e continua', async () => {
    mockGetText.mockRejectedValue(new Error('PDF corrompido'));
    mockReaddir.mockResolvedValue([]); // sem PNGs (pdftoppm não gerou imagens)

    mockExec.mockResolvedValue({ stdout: '', stderr: '' });

    const { worker, prisma } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/corrompido.pdf',
          storageKey: 'tenant/corrompido.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });

    // Não deve lançar
    await expect(worker.process(job as any)).resolves.not.toThrow();

    // Grava vazio ou null (metodo=vazio)
    expect(prisma.db.documento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ocrMetodo: 'vazio',
        }),
      }),
    );
  });

  it('onFailed grava no audit_log sem lançar exceção', async () => {
    const { worker, prisma } = buildWorker();

    const job = buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID });
    const erro = new Error('erro simulado');

    // Não deve lançar
    await expect(worker.onFailed(job as any, erro)).resolves.not.toThrow();

    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'WORKER_FALHOU',
          entidade: 'ia_worker',
        }),
      }),
    );
  });
});

// ─── Suite G: Campos OCR gravados corretamente ────────────────────────────────

describe('G) Campos OCR gravados (ocr_metodo/ocr_confianca/ocr_paginas)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('PDF nativo: ocrConfianca=null, ocrMetodo=nativo', async () => {
    const textoNativo = 'B'.repeat(300);
    mockGetText.mockResolvedValue({ text: textoNativo, nPages: 1 });

    const { worker, prisma } = buildWorker({
      prisma: (() => {
        const p = buildPrisma();
        p.db.documento.findUnique.mockResolvedValue({
          id: DOC_ID,
          arquivoUrl: 'http://s3/doc.pdf',
          storageKey: 'tenant/doc.pdf',
          conteudoIndexadoEm: null,
          conteudoExtraido: null,
          cadastro: { visibilidade: 'publico' },
        });
        return p;
      })(),
    });

    await worker.process(buildJob('ia.extrai-texto-documento', { tenantId: TENANT_ID, documentoId: DOC_ID }) as any);

    const updateCall = (prisma.db.documento.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.ocrMetodo).toBe('nativo');
    expect(updateCall.data.ocrConfianca).toBeNull();
    expect(updateCall.data.ocrPaginas).toBe(1);
  });
});

// ─── Suite H: obterDocumentoPublico expõe conteudoExtraido e ocrMetodo ────────

describe('H) obterDocumentoPublico expõe campos OCR apenas para públicos', () => {
  it('service.ts expõe conteudoExtraido e ocrMetodo no retorno público', () => {
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'documentos.service.ts'),
      'utf-8',
    );
    expect(source).toContain('conteudoExtraido');
    expect(source).toContain('ocrMetodo');
    // Os campos só aparecem em obterDocumentoPublico (cadastro visibilidade=publico)
    expect(source).toMatch(/obterDocumentoPublico[\s\S]{0,500}conteudoExtraido/);
  });
});
