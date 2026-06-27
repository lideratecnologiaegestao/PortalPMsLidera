/**
 * Testes unitários do ContatosService — fluxo de vínculo Telegram.
 *
 * Padrão do projeto: sem @nestjs/testing; mocks manuais mínimos; sem banco nem Redis.
 */

import { createHash } from 'crypto';
import { ContatosService } from './contatos.service';
import { TenantContext } from '../../common/tenant/tenant.context';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');

// ---- Helpers para construir mocks mínimos -----------------------------------

function makeEmailService() {
  return { configurado: jest.fn().mockResolvedValue(false), enviar: jest.fn() };
}

function makeWhatsappService() {
  return { habilitado: false, enviar: jest.fn() };
}

/** Cria um PrismaService mock com controle total das respostas do db. */
function makePrisma() {
  const db = {
    userContato: {
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    tenantWhatsappCanal: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
  };
  return { db, platform: jest.fn().mockReturnValue({ tenantWhatsappCanal: { findFirst: jest.fn() } }) };
}

const TENANT_ID = 'tenant-aaa-111';
const USER_ID   = 'user-bbb-222';

// ---- Envolve testes no TenantContext correto --------------------------------

function runWithTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: TENANT_ID }, fn);
}

// ============================================================================
// gerarCodigoVinculoTelegram
// ============================================================================

describe('ContatosService.gerarCodigoVinculoTelegram', () => {
  it('gera código 6 dígitos e salva o HASH (não o código em claro)', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue({ id: 'contato-id-1' });
    prisma.db.userContato.update.mockResolvedValue({});

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await runWithTenant(() => svc.gerarCodigoVinculoTelegram(USER_ID));

    expect(resultado.codigo).toMatch(/^\d{6}$/);
    expect(resultado.expiraEm).toBeInstanceOf(Date);
    expect(resultado.expiraEm.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

    const updateCall = prisma.db.userContato.update.mock.calls[0][0];
    expect(updateCall.data.telegramCodigo).toBe(hash(resultado.codigo));
    expect(updateCall.data.telegramCodigo).not.toBe(resultado.codigo); // garante que é hash
    expect(updateCall.data.telegramVerificado).toBe(false);
    expect(updateCall.data.telegramChatId).toBeNull();
  });

  it('cria linha userContato quando ainda não existe', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue(null); // inexistente
    prisma.db.userContato.create.mockResolvedValue({});

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await runWithTenant(() => svc.gerarCodigoVinculoTelegram(USER_ID));

    expect(prisma.db.userContato.create).toHaveBeenCalledTimes(1);
    expect(prisma.db.userContato.update).not.toHaveBeenCalled();

    const createCall = prisma.db.userContato.create.mock.calls[0][0];
    expect(createCall.data.telegramCodigo).toBe(hash(resultado.codigo));
    expect(createCall.data.tenantId).toBe(TENANT_ID);
    expect(createCall.data.userId).toBe(USER_ID);
  });

  it('expiração fica ~15 minutos no futuro', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue({ id: 'c1' });
    prisma.db.userContato.update.mockResolvedValue({});

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const antes = Date.now();
    const resultado = await runWithTenant(() => svc.gerarCodigoVinculoTelegram(USER_ID));
    const depois = Date.now();

    const diffMs = resultado.expiraEm.getTime() - antes;
    expect(diffMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(15 * 60 * 1000 + (depois - antes) + 100);
  });
});

// ============================================================================
// vincularTelegramPorCodigo
// ============================================================================

describe('ContatosService.vincularTelegramPorCodigo', () => {
  const CHAT_ID = '987654321';
  const CODIGO  = '472910';

  function makeContato(overrides: Record<string, unknown> = {}) {
    return {
      id: 'contato-id-2',
      userId: USER_ID,
      telegramCodigo: hash(CODIGO),
      telegramCodigoExp: new Date(Date.now() + 10 * 60 * 1000), // 10 min no futuro
      ...overrides,
    };
  }

  it('vínculo válido: seta chatId, marca verificado e limpa código', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue(makeContato());
    prisma.db.userContato.update.mockResolvedValue({});
    prisma.db.user.findUnique.mockResolvedValue({ nome: 'Maria Silva' });

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await svc.vincularTelegramPorCodigo(TENANT_ID, CODIGO, CHAT_ID);

    expect(resultado.ok).toBe(true);
    expect(resultado.nome).toBe('Maria Silva');

    const updateData = prisma.db.userContato.update.mock.calls[0][0].data;
    expect(updateData.telegramChatId).toBe(CHAT_ID);
    expect(updateData.telegramVerificado).toBe(true);
    expect(updateData.telegramCodigo).toBeNull();
    expect(updateData.telegramCodigoExp).toBeNull();
  });

  it('código errado retorna ok:false', async () => {
    const prisma = makePrisma();
    // findFirst retorna null porque o hash não casa
    prisma.db.userContato.findFirst.mockResolvedValue(null);

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await svc.vincularTelegramPorCodigo(TENANT_ID, '000000', CHAT_ID);

    expect(resultado.ok).toBe(false);
    expect(prisma.db.userContato.update).not.toHaveBeenCalled();
  });

  it('código expirado retorna ok:false (findFirst retorna null por causa do filtro exp > now)', async () => {
    const prisma = makePrisma();
    // O prisma mock com filtro gt:agora — simulamos que não retornou registro (já expirou)
    prisma.db.userContato.findFirst.mockResolvedValue(null);

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await svc.vincularTelegramPorCodigo(TENANT_ID, CODIGO, CHAT_ID);

    expect(resultado.ok).toBe(false);
    expect(prisma.db.userContato.update).not.toHaveBeenCalled();
  });

  it('o findFirst recebe o hash do código (nunca o código em claro)', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue(null);

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    await svc.vincularTelegramPorCodigo(TENANT_ID, CODIGO, CHAT_ID);

    const findArgs = prisma.db.userContato.findFirst.mock.calls[0][0];
    expect(findArgs.where.telegramCodigo).toBe(hash(CODIGO));
    expect(findArgs.where.telegramCodigo).not.toBe(CODIGO);
  });

  it('ok:true mesmo quando busca do nome do user falha (best-effort)', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue(makeContato());
    prisma.db.userContato.update.mockResolvedValue({});
    prisma.db.user.findUnique.mockRejectedValue(new Error('DB offline'));

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const resultado = await svc.vincularTelegramPorCodigo(TENANT_ID, CODIGO, CHAT_ID);

    expect(resultado.ok).toBe(true);
    expect(resultado.nome).toBeUndefined();
  });
});

// ============================================================================
// removerTelegram
// ============================================================================

describe('ContatosService.removerTelegram', () => {
  it('zera chatId, verificado e código quando existe contato', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue({ id: 'c3' });
    prisma.db.userContato.update.mockResolvedValue({});

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    await runWithTenant(() => svc.removerTelegram(USER_ID));

    const updateData = prisma.db.userContato.update.mock.calls[0][0].data;
    expect(updateData.telegramChatId).toBeNull();
    expect(updateData.telegramVerificado).toBe(false);
    expect(updateData.telegramCodigo).toBeNull();
    expect(updateData.telegramCodigoExp).toBeNull();
  });

  it('não faz nada quando não há contato cadastrado (idempotente)', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue(null);

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    await runWithTenant(() => svc.removerTelegram(USER_ID));

    expect(prisma.db.userContato.update).not.toHaveBeenCalled();
  });
});

// ============================================================================
// obter — campos telegram
// ============================================================================

describe('ContatosService.obter — campos telegram', () => {
  it('mascara chatId expondo somente os 4 últimos dígitos', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue({
      telegramChatId: '987654321',
      telegramVerificado: true,
      notifTelegram: true,
      notifWhatsapp: true,
      notifEmail: true,
    });
    prisma.db.user.findUnique.mockResolvedValue({ email: 'x@x.com' });
    prisma.db.tenantWhatsappCanal.findFirst.mockResolvedValue({ id: 'canal-tg-1' });

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const r = await runWithTenant(() => svc.obter(USER_ID));

    expect(r.telegram).toBe('****4321');
    expect(r.telegramVerificado).toBe(true);
    expect(r.canais.telegram).toBe(true);
  });

  it('telegram=null quando ainda não vinculado', async () => {
    const prisma = makePrisma();
    prisma.db.userContato.findFirst.mockResolvedValue({
      telegramChatId: null,
      telegramVerificado: false,
      notifWhatsapp: true,
      notifEmail: true,
      notifTelegram: true,
    });
    prisma.db.user.findUnique.mockResolvedValue({ email: 'x@x.com' });
    prisma.db.tenantWhatsappCanal.findFirst.mockResolvedValue(null);

    const svc = new ContatosService(
      prisma as any,
      makeEmailService() as any,
      makeWhatsappService() as any,
    );

    const r = await runWithTenant(() => svc.obter(USER_ID));

    expect(r.telegram).toBeNull();
    expect(r.telegramVerificado).toBe(false);
    expect(r.canais.telegram).toBe(false);
  });
});
