/**
 * Testes dos novos métodos de menus interativos no WhatsappService:
 *   - enviarLista: envia lista interativa via Meta; Z-API degrada para texto
 *   - enviarBotoesPorCanal: reply buttons via canal específico
 *   - enviarListaPorCanal: lista interativa via canal específico
 *
 * Não usa @nestjs/testing — instancia serviços diretamente para evitar
 * dependência do pacote não instalado neste ambiente.
 */

import { of } from 'rxjs';
import { WhatsappService } from './whatsapp.service';
import { TenantContext } from '../../common/tenant/tenant.context';

// ---- Redis mock (circuit breaker) -----------------------------------------
jest.mock('../queue/redis.config', () => ({
  redisCommands: {
    get: jest.fn().mockResolvedValue(null),   // breaker fechado
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
  },
  redisConnection: { duplicate: jest.fn().mockReturnValue({}) },
  bullPrefix: 'portal',
}));

// ---- Helpers ---------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const CANAL_ID  = 'canal-test-001';

const mockPrisma = {
  db: { auditLog: { create: jest.fn().mockResolvedValue({}) }, whatsappTemplateEnvio: { create: jest.fn().mockResolvedValue({}) } },
  platform: jest.fn().mockReturnValue({}),
};

function buildService(cfgOverrides: Record<string, unknown> = {}) {
  const http = { post: jest.fn(), get: jest.fn() };
  const configService = {
    configDoTenant: jest.fn().mockResolvedValue({
      tenantId: TENANT_ID,
      provider: 'meta',
      fallbackProvider: undefined,
      metaPhoneNumberId: 'phone-001',
      metaToken: 'tok-meta',
      ativo: true,
      ...cfgOverrides,
    }),
  };
  const canaisService = {
    configDoCanal: jest.fn().mockResolvedValue({
      id: CANAL_ID,
      tenantId: TENANT_ID,
      label: 'WhatsApp Principal',
      provider: 'meta',
      tipo: 'whatsapp',
      metaPhoneNumberId: 'phone-canal-001',
      metaToken: 'meta-tok-canal',
      ativo: true,
    }),
  };

  const service = new WhatsappService(
    http as any,
    mockPrisma as any,
    configService as any,
    canaisService as any,
  );

  return { service, http, configService, canaisService };
}

function runInTenant<T>(fn: () => Promise<T>): Promise<T> {
  return TenantContext.run({ tenantId: TENANT_ID }, fn);
}

// ============================================================================
// enviarLista
// ============================================================================

describe('WhatsappService.enviarLista', () => {
  it('envia lista interativa via Meta e retorna wamid', async () => {
    const { service, http } = buildService();
    http.post.mockReturnValue(of({ data: { messages: [{ id: 'wamid-list-001' }] } }));

    const result = await runInTenant(() =>
      service.enviarLista('65999990000', {
        message: 'Escolha o tipo:',
        rows: [
          { id: 'Quero fazer uma denúncia.', label: '🚨 Denúncia' },
          { id: 'Quero fazer uma reclamação.', label: '😠 Reclamação' },
          { id: 'Quero deixar uma sugestão.', label: '💡 Sugestão' },
          { id: 'Quero deixar um elogio.', label: '👏 Elogio' },
          { id: 'Quero fazer uma solicitação.', label: '📋 Solicitação' },
        ],
      }),
    );

    expect(result.id).toBe('wamid-list-001');
    const body = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.type).toBe('interactive');
    expect((body.interactive as any).type).toBe('list');
  });

  it('Z-API degrada para texto numerado (sendList → sendText)', async () => {
    const { service, http } = buildService({
      provider: 'zapi',
      metaPhoneNumberId: undefined,
      metaToken: undefined,
      zapiBaseUrl: 'https://api.z-api.io/instances',
      zapiInstanceId: 'inst-001',
      zapiToken: 'tok-001',
      zapiClientToken: 'cli-001',
    });
    http.post.mockReturnValue(of({ data: { zaapId: 'zapi-text-001' } }));

    const result = await runInTenant(() =>
      service.enviarLista('65999990000', {
        message: 'Escolha:',
        rows: [
          { id: 'val1', label: 'Op 1' },
          { id: 'val2', label: 'Op 2' },
          { id: 'val3', label: 'Op 3' },
          { id: 'val4', label: 'Op 4' },
        ],
      }),
    );

    expect(result.id).toBeDefined();
    expect(http.post).toHaveBeenCalledWith(
      expect.stringContaining('/send-text'),
      expect.objectContaining({ message: expect.stringContaining('1. Op 1') }),
      expect.any(Object),
    );
  });

  it('lança TenantContext ausente quando não há contexto', async () => {
    const { service } = buildService();
    await expect(
      service.enviarLista('65999990000', { message: 'x', rows: [] }),
    ).rejects.toThrow('TenantContext ausente');
  });
});

// ============================================================================
// enviarBotoesPorCanal
// ============================================================================

describe('WhatsappService.enviarBotoesPorCanal', () => {
  it('envia reply buttons via Meta Cloud e retorna wamid', async () => {
    const { service, http } = buildService();
    http.post.mockReturnValue(of({ data: { messages: [{ id: 'wamid-btn-canal-001' }] } }));

    const result = await runInTenant(() =>
      service.enviarBotoesPorCanal(CANAL_ID, '65999990000', {
        message: 'Confirme:',
        buttons: [
          { id: 'sim', label: 'Sim' },
          { id: 'nao', label: 'Não' },
        ],
      }),
    );

    expect(result.id).toBe('wamid-btn-canal-001');
    const body = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.type).toBe('interactive');
    expect((body.interactive as any).type).toBe('button');
  });
});

// ============================================================================
// enviarListaPorCanal
// ============================================================================

describe('WhatsappService.enviarListaPorCanal', () => {
  it('envia lista interativa via canal Meta e retorna wamid', async () => {
    const { service, http } = buildService();
    http.post.mockReturnValue(of({ data: { messages: [{ id: 'wamid-list-canal-001' }] } }));

    const result = await runInTenant(() =>
      service.enviarListaPorCanal(CANAL_ID, '65999990000', {
        message: 'Escolha:',
        rows: [
          { id: 'Quero fazer uma denúncia.', label: '🚨 Denúncia' },
          { id: 'Quero fazer uma reclamação.', label: '😠 Reclamação' },
          { id: 'Quero deixar uma sugestão.', label: '💡 Sugestão' },
          { id: 'Quero deixar um elogio.', label: '👏 Elogio' },
          { id: 'Quero fazer uma solicitação.', label: '📋 Solicitação' },
        ],
      }),
    );

    expect(result.id).toBe('wamid-list-canal-001');
    const body = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.type).toBe('interactive');
    expect((body.interactive as any).type).toBe('list');
  });

  it('fallback para texto quando provider não tem sendList (canal tipo instagram)', async () => {
    // Instagram (InstagramProvider) degrada sendList para texto
    const { service, http, canaisService } = buildService();
    (canaisService.configDoCanal as jest.Mock).mockResolvedValue({
      id: CANAL_ID,
      tenantId: TENANT_ID,
      label: 'Instagram',
      provider: 'meta',
      tipo: 'instagram',
      metaPhoneNumberId: 'ig-page-001',
      metaToken: 'ig-tok',
      ativo: true,
    });
    http.post.mockReturnValue(of({ data: { message_id: 'ig-msg-001' } }));

    const result = await runInTenant(() =>
      service.enviarListaPorCanal(CANAL_ID, 'ig-user-001', {
        message: 'Escolha:',
        rows: [
          { id: 'val1', label: 'Opção 1' },
          { id: 'val2', label: 'Opção 2' },
          { id: 'val3', label: 'Opção 3' },
          { id: 'val4', label: 'Opção 4' },
        ],
      }),
    );

    // InstagramProvider.sendList → sendText → ok
    expect(result.id).toBeDefined();
    // Enviou como texto (não interactive)
    const body = http.post.mock.calls[0][1] as Record<string, unknown>;
    expect(body.type).toBeUndefined(); // Instagram usa {recipient, message}
    const msgBody = (body as any).message;
    expect(typeof msgBody?.text).toBe('string');
    expect(msgBody.text).toContain('1. Opção 1');
  });
});
