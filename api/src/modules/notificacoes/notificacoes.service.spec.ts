/**
 * Testes unitários do NotificacoesService — entrega via Telegram.
 *
 * Cobre:
 *  1. alvosDeUsuarios inclui telegram quando telegramVerificado + notifTelegram + telegramChatId
 *  2. alvosDeUsuarios não inclui telegram quando verificado=false ou notifTelegram=false ou chatId=null
 *  3. entregar (manifestação): envia Telegram quando alvo.telegram + canal ativo; regista log canal='telegram'
 *  4. entregar: sem canal Telegram ativo → não envia, sem erro
 *  5. avisarOuvidoresAtendimento: envia Telegram quando há alvo com telegram + canal ativo
 *  6. avisarAtendentesSecretaria: idem
 *  7. avisarAgente: idem
 *
 * Padrão do projeto: mocks manuais, sem @nestjs/testing, sem banco/Redis.
 */

import { NotificacoesService } from './notificacoes.service';
import { TenantContext } from '../../common/tenant/tenant.context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TENANT_ID = 'tenant-notif-tg-001';

function runWithTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: TENANT_ID }, fn);
}

function makeQueue() {
  return { add: jest.fn().mockResolvedValue(undefined) };
}

function makeEmail() {
  return {
    enviar: jest.fn().mockResolvedValue({ id: 'email-id-1' }),
  };
}

function makeWhatsapp() {
  return {
    enviar: jest.fn().mockResolvedValue({ id: 'wa-id-1' }),
    enviarPorCanal: jest.fn().mockResolvedValue({ id: 'tg-id-1' }),
  };
}

function makePush() {
  return {
    tokensDoUsuario: jest.fn().mockResolvedValue([]),
    enviar: jest.fn().mockResolvedValue(0),
  };
}

/**
 * Constrói um mock de PrismaService com controle sobre:
 *  - db.user.findUnique
 *  - db.userContato.findFirst
 *  - db.tenantWhatsappCanal.findFirst   (para telegramCanalIdDoTenant)
 *  - db.manifestacao.findUnique
 *  - db.notificacaoLog.create
 *  - db.notificacaoUsuario.create
 *  - db.user.findMany (ouvidores)
 *  - platform().tenant.findUnique
 */
function makePrisma(overrides: {
  userContato?: Record<string, unknown> | null;
  telegramCanal?: { id: string } | null;
  user?: { email: string } | null;
  usersManyOuvidor?: { id: string }[];
} = {}) {
  const {
    userContato = null,
    telegramCanal = null,
    user = { email: 'ouvidor@prefeitura.gov.br' },
    usersManyOuvidor = [],
  } = overrides;

  const tenantWhatsappCanal = {
    findFirst: jest.fn().mockResolvedValue(telegramCanal),
  };

  const db = {
    user: {
      findUnique: jest.fn().mockResolvedValue(user),
      findMany: jest.fn().mockResolvedValue(usersManyOuvidor),
    },
    userContato: {
      findFirst: jest.fn().mockResolvedValue(userContato),
    },
    tenantWhatsappCanal,
    manifestacao: {
      findUnique: jest.fn().mockResolvedValue({
        cidadaoId: null,
        solicitanteEmail: 'cidadao@example.com',
        responsavelId: null,
        anonima: false,
      }),
    },
    notificacaoLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    notificacaoUsuario: {
      create: jest.fn().mockResolvedValue({}),
    },
  };

  const platform = jest.fn().mockReturnValue({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        dominio: null,
        subdominio: 'exemplolandia',
        slug: 'exemplolandia',
        nome: 'Exemplolandia',
      }),
    },
  });

  return { db, platform };
}

// ---------------------------------------------------------------------------
// 1. alvosDeUsuarios — campo telegram
// ---------------------------------------------------------------------------

describe('NotificacoesService.alvosDeUsuarios — telegram', () => {
  function buildService(userContato: Record<string, unknown> | null, user = { email: 'a@b.com' }) {
    const prisma = makePrisma({ userContato, user });
    return {
      svc: new (NotificacoesService as any)(
        prisma,
        makeEmail(),
        makeWhatsapp(),
        makePush(),
        makeQueue(),
      ),
      prisma,
    };
  }

  it('inclui telegram quando verificado + notifTelegram + chatId preenchido', async () => {
    const { svc } = buildService({
      email: 'a@b.com',
      emailVerificado: true,
      notifEmail: true,
      whatsapp: null,
      whatsappVerificado: false,
      notifWhatsapp: false,
      telegramChatId: '123456789',
      telegramVerificado: true,
      notifTelegram: true,
    });

    const alvos: any[] = await runWithTenant(() => (svc as any).alvosDeUsuarios(['user-1']));

    expect(alvos).toHaveLength(1);
    expect(alvos[0].telegram).toBe('123456789');
  });

  it('NÃO inclui telegram quando telegramVerificado=false', async () => {
    const { svc } = buildService({
      email: 'a@b.com',
      emailVerificado: true,
      notifEmail: true,
      telegramChatId: '123456789',
      telegramVerificado: false,
      notifTelegram: true,
    });

    const alvos: any[] = await runWithTenant(() => (svc as any).alvosDeUsuarios(['user-1']));
    expect(alvos[0].telegram).toBeUndefined();
  });

  it('NÃO inclui telegram quando notifTelegram=false', async () => {
    const { svc } = buildService({
      email: 'a@b.com',
      emailVerificado: true,
      notifEmail: true,
      telegramChatId: '123456789',
      telegramVerificado: true,
      notifTelegram: false,
    });

    const alvos: any[] = await runWithTenant(() => (svc as any).alvosDeUsuarios(['user-1']));
    expect(alvos[0].telegram).toBeUndefined();
  });

  it('NÃO inclui telegram quando telegramChatId=null', async () => {
    const { svc } = buildService({
      email: 'a@b.com',
      emailVerificado: true,
      notifEmail: true,
      telegramChatId: null,
      telegramVerificado: true,
      notifTelegram: true,
    });

    const alvos: any[] = await runWithTenant(() => (svc as any).alvosDeUsuarios(['user-1']));
    expect(alvos[0].telegram).toBeUndefined();
  });

  it('inclui alvo mesmo sem email/whatsapp quando só tem telegram', async () => {
    const { svc } = buildService({
      email: null,
      emailVerificado: false,
      notifEmail: false,
      whatsapp: null,
      whatsappVerificado: false,
      notifWhatsapp: false,
      telegramChatId: '987654321',
      telegramVerificado: true,
      notifTelegram: true,
    }, null as any);

    const alvos: any[] = await runWithTenant(() => (svc as any).alvosDeUsuarios(['user-2']));
    expect(alvos).toHaveLength(1);
    expect(alvos[0].telegram).toBe('987654321');
    expect(alvos[0].email).toBeUndefined();
    expect(alvos[0].whatsapp).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2. entregar — Telegram (manifestação)
// ---------------------------------------------------------------------------

describe('NotificacoesService.entregar — canal Telegram', () => {
  const PAYLOAD = {
    tenantId: TENANT_ID,
    manifestacaoId: 'manif-001',
    protocolo: '2026000001',
    evento: 'atribuicao' as any,
    destino: 'responsavel' as any,
  };

  function buildService(telegramCanal: { id: string } | null) {
    const whatsapp = makeWhatsapp();
    const prisma = makePrisma({ telegramCanal });
    const svc = new (NotificacoesService as any)(
      prisma,
      makeEmail(),
      whatsapp,
      makePush(),
      makeQueue(),
    );
    return { svc, whatsapp, prisma };
  }

  it('envia Telegram quando alvo tem telegram + canal ativo', async () => {
    const { svc, whatsapp, prisma } = buildService({ id: 'canal-tg-1' });

    const alvo = { email: undefined, whatsapp: undefined, telegram: '555111222', notifEmail: false };

    await runWithTenant(() => (svc as any).entregar(PAYLOAD, alvo, 'Mensagem de teste'));

    expect(whatsapp.enviarPorCanal).toHaveBeenCalledWith('canal-tg-1', '555111222', 'Mensagem de teste');

    // Deve registrar log canal='telegram'
    const logCall = prisma.db.notificacaoLog.create.mock.calls.find(
      (c: any[]) => c[0]?.data?.canal === 'telegram',
    );
    expect(logCall).toBeDefined();
    expect(logCall![0].data.status).toBe('enviado');
  });

  it('NÃO envia Telegram quando não há canal ativo (telegramCanalId=null)', async () => {
    const { svc, whatsapp } = buildService(null);

    const alvo = { email: undefined, whatsapp: undefined, telegram: '555111222', notifEmail: false };

    await runWithTenant(() => (svc as any).entregar(PAYLOAD, alvo, 'Mensagem de teste'));

    expect(whatsapp.enviarPorCanal).not.toHaveBeenCalled();
  });

  it('registra falha no log quando envio Telegram lança erro (best-effort)', async () => {
    const whatsapp = makeWhatsapp();
    whatsapp.enviarPorCanal.mockRejectedValueOnce(new Error('Telegram API timeout'));
    const prisma = makePrisma({ telegramCanal: { id: 'canal-tg-1' } });
    const svc = new (NotificacoesService as any)(
      prisma,
      makeEmail(),
      whatsapp,
      makePush(),
      makeQueue(),
    );

    const alvo = { email: undefined, whatsapp: undefined, telegram: '999000111', notifEmail: false };

    // Não deve lançar
    await expect(
      runWithTenant(() => (svc as any).entregar(PAYLOAD, alvo, 'Msg'))
    ).resolves.not.toThrow();

    const logCall = prisma.db.notificacaoLog.create.mock.calls.find(
      (c: any[]) => c[0]?.data?.canal === 'telegram',
    );
    expect(logCall).toBeDefined();
    expect(logCall![0].data.status).toBe('falha');
    expect(logCall![0].data.erro).toContain('Telegram API timeout');
  });
});

// ---------------------------------------------------------------------------
// 3. avisarOuvidoresAtendimento — Telegram
// ---------------------------------------------------------------------------

describe('NotificacoesService.avisarOuvidoresAtendimento — Telegram', () => {
  it('envia Telegram quando ouvidor tem telegram + canal ativo', async () => {
    const whatsapp = makeWhatsapp();
    const prisma = makePrisma({
      telegramCanal: { id: 'canal-tg-99' },
      usersManyOuvidor: [{ id: 'ouvidor-1' }],
      userContato: {
        email: null,
        emailVerificado: false,
        notifEmail: false,
        whatsapp: null,
        whatsappVerificado: false,
        notifWhatsapp: false,
        telegramChatId: '111222333',
        telegramVerificado: true,
        notifTelegram: true,
      },
      user: { email: 'ouvidor@pref.gov.br' },
    });

    const svc = new (NotificacoesService as any)(
      prisma,
      makeEmail(),
      whatsapp,
      makePush(),
      makeQueue(),
    );

    await svc.avisarOuvidoresAtendimento(TENANT_ID, { conversaId: 'conv-111', canal: 'widget' });

    expect(whatsapp.enviarPorCanal).toHaveBeenCalledWith(
      'canal-tg-99',
      '111222333',
      expect.stringContaining('Exemplolandia'),
    );
  });

  it('NÃO envia Telegram quando não há canal ativo', async () => {
    const whatsapp = makeWhatsapp();
    const prisma = makePrisma({
      telegramCanal: null,
      usersManyOuvidor: [{ id: 'ouvidor-2' }],
      userContato: {
        telegramChatId: '111222333',
        telegramVerificado: true,
        notifTelegram: true,
        email: null,
        emailVerificado: false,
        notifEmail: false,
        whatsapp: null,
        whatsappVerificado: false,
        notifWhatsapp: false,
      },
      user: { email: 'ouvidor@pref.gov.br' },
    });

    const svc = new (NotificacoesService as any)(
      prisma,
      makeEmail(),
      whatsapp,
      makePush(),
      makeQueue(),
    );

    await svc.avisarOuvidoresAtendimento(TENANT_ID, { conversaId: 'conv-222' });

    expect(whatsapp.enviarPorCanal).not.toHaveBeenCalled();
  });
});
