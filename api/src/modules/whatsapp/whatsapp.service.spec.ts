import { Test } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { WhatsappService } from './whatsapp.service';
import { WhatsappConfigService } from './whatsapp-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { redisCommands } from '../queue/redis.config';

// ---- Mocks ----------------------------------------------------------------

const mockHttp = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
};

const mockPrisma = {
  db: {
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
  platform: jest.fn().mockReturnValue({}),
};

const mockConfigService = {
  configDoTenant: jest.fn(),
};

// Silencia redisCommands (circuit breaker)
jest.mock('../queue/redis.config', () => ({
  redisCommands: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  },
  redisConnection: { duplicate: jest.fn().mockReturnValue({}) },
  bullPrefix: 'portal',
}));

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: TENANT_ID }, fn);
}

// ---- Helpers de config ----------------------------------------------------

const cfgZapi = {
  tenantId: TENANT_ID,
  provider: 'zapi' as const,
  fallbackProvider: 'evolution' as const,
  zapiBaseUrl: 'https://api.z-api.io/instances',
  zapiInstanceId: 'inst-001',
  zapiToken: 'tok-001',
  zapiClientToken: 'cli-tok-001',
  zapiWebhookSecret: 'secret-xpto',
  evolutionApiUrl: 'http://evolution:8080',
  evolutionInstance: 'Lidera',
  evolutionApiKey: 'evo-key',
  ativo: true,
};

const cfgEvolution = {
  ...cfgZapi,
  provider: 'evolution' as const,
  fallbackProvider: undefined,
};

// ---- Testes ---------------------------------------------------------------

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: HttpService, useValue: mockHttp },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsappConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get(WhatsappService);
  });

  describe('enviar — provider Z-API', () => {
    it('envia texto com sucesso via Z-API e retorna id', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);
      mockHttp.post.mockReturnValue(
        of({ data: { zaapId: 'msg-zapi-001' } }),
      );

      const result = await runInTenant(() => service.enviar('65999990000', 'Olá'));

      expect(result.id).toBe('msg-zapi-001');
      expect(mockHttp.post).toHaveBeenCalledWith(
        expect.stringContaining('/send-text'),
        expect.objectContaining({ phone: '5565999990000', message: 'Olá' }),
        expect.any(Object),
      );
    });

    it('normaliza número para E.164 BR (adiciona 55)', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);
      mockHttp.post.mockReturnValue(of({ data: { zaapId: 'msg-001' } }));

      await runInTenant(() => service.enviar('65999990000', 'teste'));

      const body = mockHttp.post.mock.calls[0][1] as { phone: string };
      expect(body.phone).toBe('5565999990000');
    });

    it('não adiciona 55 se número já tem DDI', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);
      mockHttp.post.mockReturnValue(of({ data: { zaapId: 'msg-001' } }));

      await runInTenant(() => service.enviar('5565999990000', 'teste'));

      const body = mockHttp.post.mock.calls[0][1] as { phone: string };
      expect(body.phone).toBe('5565999990000');
    });
  });

  describe('failover — primário cai → fallback assume', () => {
    it('usa fallback Evolution quando Z-API falha', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);

      // Z-API falha nas duas tentativas
      mockHttp.post
        .mockReturnValueOnce(throwError(() => new Error('Timeout Z-API')))
        .mockReturnValueOnce(throwError(() => new Error('Timeout Z-API')))
        // Evolution fallback funciona
        .mockReturnValueOnce(of({ data: { key: { id: 'evo-msg-001' } } }));

      const result = await runInTenant(() => service.enviar('65999990000', 'Teste fallback'));

      expect(result.id).toBe('evo-msg-001');
      // Z-API tentou 2 vezes + Evolution 1 vez
      expect(mockHttp.post).toHaveBeenCalledTimes(3);
    });

    it('lança erro quando ambos os providers falham', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);

      mockHttp.post.mockReturnValue(throwError(() => new Error('Indisponível')));

      await expect(
        runInTenant(() => service.enviar('65999990000', 'Teste falha total')),
      ).rejects.toThrow('Falha ao enviar WhatsApp');
    });
  });

  describe('circuit breaker', () => {
    it('usa fallback quando circuit breaker está aberto para o primário', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);

      // Simula breaker aberto para Z-API
      (redisCommands.get as jest.Mock).mockImplementation((key: string) => {
        if (key.includes(':zapi:aberto')) return Promise.resolve('1');
        return Promise.resolve(null);
      });

      mockHttp.post.mockReturnValue(of({ data: { key: { id: 'evo-fallback' } } }));

      const result = await runInTenant(() => service.enviar('65999990000', 'teste CB'));
      expect(result.id).toBe('evo-fallback');
      // Z-API não deve ter sido chamada
      expect(mockHttp.post).toHaveBeenCalledTimes(1);
      const url = mockHttp.post.mock.calls[0][0] as string;
      expect(url).toContain('evolution');
    });
  });

  describe('enviar — provider Evolution direto', () => {
    it('envia via Evolution sem fallback', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgEvolution);
      mockHttp.post.mockReturnValue(of({ data: { key: { id: 'evo-001' } } }));

      const result = await runInTenant(() => service.enviar('65999990000', 'Olá'));

      expect(result.id).toBe('evo-001');
      const url = mockHttp.post.mock.calls[0][0] as string;
      expect(url).toContain('/message/sendText/');
    });
  });

  describe('auditoria LGPD-safe', () => {
    it('não loga o conteúdo da mensagem — apenas número mascarado', async () => {
      mockConfigService.configDoTenant.mockResolvedValue(cfgZapi);
      mockHttp.post.mockReturnValue(of({ data: { zaapId: 'msg-001' } }));

      await runInTenant(() => service.enviar('65999990000', 'mensagem confidencial xyz'));

      const auditCall = mockPrisma.db.auditLog.create.mock.calls[0][0];
      // Nunca deve aparecer o texto da mensagem
      expect(JSON.stringify(auditCall)).not.toContain('mensagem confidencial');
      // Número mascarado no audit
      expect(auditCall.data.dados.to_mascarado).toBe('••••0000');
    });
  });

  describe('habilitado getter', () => {
    it('retorna false quando sem config Z-API', () => {
      const originalEnv = { ...process.env };
      delete process.env.WHATSAPP_PROVIDER;
      delete process.env.EVOLUTION_API_URL;
      delete process.env.EVOLUTION_API_KEY;
      delete process.env.EVOLUTION_INSTANCE;
      process.env.WHATSAPP_PROVIDER = 'evolution';

      expect(service.habilitado).toBe(false);

      Object.assign(process.env, originalEnv);
    });
  });

});

// ---- Testes de isolamento de tenant ---------------------------------------

describe('WhatsappService — isolamento por tenant', () => {
  it('cada tenant usa sua própria config independente', async () => {
    const configService = {
      configDoTenant: jest.fn().mockImplementation((tenantId: string) => ({
        tenantId,
        provider: 'zapi',
        zapiBaseUrl: 'https://api.z-api.io/instances',
        zapiInstanceId: `inst-${tenantId.slice(-4)}`,
        zapiToken: `tok-${tenantId.slice(-4)}`,
        zapiClientToken: `cli-${tenantId.slice(-4)}`,
        ativo: true,
      })),
    };

    const http = {
      post: jest.fn().mockReturnValue(of({ data: { zaapId: 'ok' } })),
    };

    const module = await Test.createTestingModule({
      providers: [
        WhatsappService,
        { provide: HttpService, useValue: http },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WhatsappConfigService, useValue: configService },
      ],
    }).compile();
    const svc = module.get(WhatsappService);

    const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000001';
    const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000002';

    await TenantContext.run({ tenantId: TENANT_A }, () =>
      svc.enviar('65999990001', 'msg tenant A'),
    );
    await TenantContext.run({ tenantId: TENANT_B }, () =>
      svc.enviar('65999990002', 'msg tenant B'),
    );

    // Ambos os envios foram feitos e configDoTenant foi chamado com tenants diferentes
    expect(configService.configDoTenant).toHaveBeenCalledWith(TENANT_A);
    expect(configService.configDoTenant).toHaveBeenCalledWith(TENANT_B);
    // URLs chamadas contêm as instâncias corretas
    const urls = http.post.mock.calls.map((c) => c[0] as string);
    const instA = `inst-${TENANT_A.slice(-4)}`;
    const instB = `inst-${TENANT_B.slice(-4)}`;
    expect(urls.some((u) => u.includes(instA))).toBe(true);
    expect(urls.some((u) => u.includes(instB))).toBe(true);
  });
});

// ---- Testes de idempotência (parseInbound Z-API) --------------------------

describe('ZApiProvider.parseInbound — idempotência', () => {
  it('extrai messageId, from, texto e nome do payload ReceivedCallback', async () => {
    const { ZApiProvider } = await import('./zapi.provider');
    const provider = new ZApiProvider(null as any, {
      baseUrl: '',
      instanceId: '',
      token: '',
      clientToken: '',
    });

    const payload = {
      type: 'ReceivedCallback',
      phone: '5565999990000',
      messageId: 'msg-123',
      senderName: 'João',
      instanceId: 'inst-001',
      text: { message: 'Preciso de ajuda' },
    };

    const result = provider.parseInbound(payload);

    expect(result).not.toBeNull();
    expect(result!.messageId).toBe('msg-123');
    expect(result!.from).toBe('5565999990000');
    expect(result!.texto).toBe('Preciso de ajuda');
    expect(result!.nome).toBe('João');
    expect(result!.instancia).toBe('inst-001');
  });

  it('retorna null para tipos não-mensagem (ConnectedCallback)', async () => {
    const { ZApiProvider } = await import('./zapi.provider');
    const provider = new ZApiProvider(null as any, {
      baseUrl: '',
      instanceId: '',
      token: '',
      clientToken: '',
    });

    const result = provider.parseInbound({ type: 'ConnectedCallback' });
    expect(result).toBeNull();
  });

  it('retorna null para DeliveryCallback', async () => {
    const { ZApiProvider } = await import('./zapi.provider');
    const provider = new ZApiProvider(null as any, {
      baseUrl: '',
      instanceId: '',
      token: '',
      clientToken: '',
    });

    const result = provider.parseInbound({ type: 'DeliveryCallback', messageId: 'x' });
    expect(result).toBeNull();
  });
});
