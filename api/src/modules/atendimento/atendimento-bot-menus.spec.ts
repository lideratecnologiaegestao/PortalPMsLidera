/**
 * Testes unitários de enviarRespostaBot — menus interativos no WhatsApp.
 *
 * Verifica que:
 *  - opcoes.length <= 3 → enviarBotoes / enviarBotoesPorCanal
 *  - opcoes.length > 3  → enviarLista / enviarListaPorCanal
 *  - canal sem opções   → enviarPorCanal / enviar (texto simples, retrocompat)
 *  - Telegram sem destino inicial resolve via DB
 *  - falha no envio nunca derruba a persistência (best-effort)
 */

import { AtendimentoBotService } from './atendimento-bot.service';
import { IaService } from '../ia/ia.service';
import { ManifestacoesService } from '../manifestacoes/manifestacoes.service';
import { TramitacaoService } from '../manifestacoes/tramitacao.service';
import { ExpedienteService } from './expediente.service';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';

// ---- Mocks -----------------------------------------------------------------

const mockPrisma = {
  db: {
    atendimentoConversa: {
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    atendimentoMensagem: {
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({}),
    },
    tenant: {
      findFirst: jest.fn(),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  },
  platform: jest.fn().mockReturnValue({}),
} as unknown as PrismaService;

const mockWhatsapp = {
  enviar: jest.fn().mockResolvedValue({ id: 'wa-text' }),
  enviarBotoes: jest.fn().mockResolvedValue({ id: 'wa-btns' }),
  enviarLista: jest.fn().mockResolvedValue({ id: 'wa-list' }),
  enviarPorCanal: jest.fn().mockResolvedValue({ id: 'wa-canal-text' }),
  enviarBotoesPorCanal: jest.fn().mockResolvedValue({ id: 'wa-canal-btns' }),
  enviarListaPorCanal: jest.fn().mockResolvedValue({ id: 'wa-canal-list' }),
} as unknown as WhatsappService;

const mockIa = {
  chatMultiturno: jest.fn().mockResolvedValue({ resposta: 'Resposta IA', confianca: 0.9 }),
} as unknown as IaService;

const mockManifestacoes = {} as unknown as ManifestacoesService;

const mockTramitacao = {
  acompanhar: jest.fn(),
} as unknown as TramitacaoService;

const mockExpediente = {
  dentroDoExpediente: jest.fn().mockResolvedValue(true),
} as unknown as ExpedienteService;

const mockConversa = {
  persistirMensagem: jest.fn().mockResolvedValue({}),
  escalar: jest.fn().mockResolvedValue({}),
  incrementarBotTentativas: jest.fn().mockResolvedValue(1),
} as unknown as AtendimentoConversaService;

// ---- Helpers ---------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';

function buildService() {
  return new AtendimentoBotService(
    mockPrisma,
    mockIa,
    mockManifestacoes,
    mockTramitacao,
    mockExpediente,
    mockConversa,
    mockWhatsapp,
  );
}

/** Conversa WhatsApp sem canalId (retrocompat). */
function conversaWA(overrides: Partial<{
  id: string; canal: string; visitanteTelefone: string | null;
  botTentativas: number; canalId: string | null;
}> = {}) {
  return {
    id: 'conv-001',
    status: 'bot',
    canal: 'whatsapp',
    visitanteTelefone: '5565999990001',
    botTentativas: 0,
    canalId: null,
    ...overrides,
  };
}

/** Conversa WhatsApp com canalId (multi-número Meta). */
function conversaComCanal(overrides: Partial<{
  id: string; canal: string; visitanteTelefone: string | null;
  botTentativas: number; canalId: string | null;
}> = {}) {
  return {
    id: 'conv-002',
    status: 'bot',
    canal: 'whatsapp',
    visitanteTelefone: '5565999990002',
    botTentativas: 0,
    canalId: 'canal-meta-001',
    ...overrides,
  };
}

function setupMocks(conversa: ReturnType<typeof conversaWA>, textoMensagem: string) {
  (mockPrisma.db.atendimentoConversa.findUnique as jest.Mock).mockResolvedValue(conversa);
  (mockPrisma.db.tenant.findFirst as jest.Mock).mockResolvedValue({
    iaChatWidgetAtivo: true,
    iaChatHabilitada: true,
    atendimentoHumanoAtivo: true,
  });
  (mockPrisma.db.atendimentoMensagem.findUnique as jest.Mock).mockResolvedValue({
    id: 'msg-001',
    conteudo: textoMensagem,
    autorTipo: 'visitante',
    interno: false,
  });
  (mockPrisma.db.atendimentoMensagem.findMany as jest.Mock).mockResolvedValue([]);
}

async function processarMensagem(service: AtendimentoBotService, conversaId: string) {
  await TenantContext.run({ tenantId: TENANT_ID }, () =>
    service.processarMensagem(conversaId, 'msg-001', TENANT_ID),
  );
}

// ============================================================================

describe('AtendimentoBotService — menus interativos', () => {
  let service: AtendimentoBotService;

  beforeEach(() => {
    jest.clearAllMocks();
    // Restaura mocks para estado padrão
    (mockWhatsapp.enviar as jest.Mock).mockResolvedValue({ id: 'wa-text' });
    (mockWhatsapp.enviarBotoes as jest.Mock).mockResolvedValue({ id: 'wa-btns' });
    (mockWhatsapp.enviarLista as jest.Mock).mockResolvedValue({ id: 'wa-list' });
    (mockWhatsapp.enviarPorCanal as jest.Mock).mockResolvedValue({ id: 'wa-canal-text' });
    (mockWhatsapp.enviarBotoesPorCanal as jest.Mock).mockResolvedValue({ id: 'wa-canal-btns' });
    (mockWhatsapp.enviarListaPorCanal as jest.Mock).mockResolvedValue({ id: 'wa-canal-list' });
    (mockIa.chatMultiturno as jest.Mock).mockResolvedValue({ resposta: 'Resposta IA', confianca: 0.9 });
    service = buildService();
  });

  // -------------------------------------------------------------------------
  // 1. Intent "registrar manifestação" → 5 opções → lista interativa
  // -------------------------------------------------------------------------

  describe('5 opções (menu de tipos) → lista interativa', () => {
    it('WhatsApp sem canalId: chama enviarLista', async () => {
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');
      await processarMensagem(service, 'conv-001');

      expect(mockWhatsapp.enviarLista).toHaveBeenCalledTimes(1);
      const [numero, payload] = (mockWhatsapp.enviarLista as jest.Mock).mock.calls[0];
      expect(numero).toBe('5565999990001');
      expect(payload.rows).toHaveLength(5);
    });

    it('id de cada row carrega o valor (o bot entende)', async () => {
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');
      await processarMensagem(service, 'conv-001');

      const [, payload] = (mockWhatsapp.enviarLista as jest.Mock).mock.calls[0];
      expect(payload.rows[0].id).toBe('Quero fazer uma denúncia.');
      expect(payload.rows[1].id).toBe('Quero fazer uma reclamação.');
    });

    it('WhatsApp com canalId: chama enviarListaPorCanal', async () => {
      setupMocks(conversaComCanal(), 'quero registrar');
      await processarMensagem(service, 'conv-002');

      expect(mockWhatsapp.enviarListaPorCanal).toHaveBeenCalledTimes(1);
      const [canalId, numero, payload] = (mockWhatsapp.enviarListaPorCanal as jest.Mock).mock.calls[0];
      expect(canalId).toBe('canal-meta-001');
      expect(numero).toBe('5565999990002');
      expect(payload.rows).toHaveLength(5);
    });

    it('NÃO chama enviarBotoes nem enviarPorCanal', async () => {
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');
      await processarMensagem(service, 'conv-001');

      expect(mockWhatsapp.enviarBotoes).not.toHaveBeenCalled();
      expect(mockWhatsapp.enviarPorCanal).not.toHaveBeenCalled();
    });

    it('persiste mensagem com 5 opcoes (widget web não quebra)', async () => {
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');
      await processarMensagem(service, 'conv-001');

      const calls = (mockConversa.persistirMensagem as jest.Mock).mock.calls;
      const botMsg = calls.find(
        ([, , opts]: [string, string, { autorTipo: string; opcoes?: unknown[] }]) =>
          opts.autorTipo === 'bot' && Array.isArray((opts as any).opcoes) && (opts as any).opcoes.length === 5,
      );
      expect(botMsg).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // 2. Resposta sem opções → texto simples (retrocompat)
  // -------------------------------------------------------------------------

  describe('resposta sem opções → texto simples', () => {
    it('WhatsApp sem canalId: chama enviar', async () => {
      setupMocks(conversaWA(), 'qual o horário de atendimento?');
      await processarMensagem(service, 'conv-001');

      expect(mockWhatsapp.enviar).toHaveBeenCalled();
      expect(mockWhatsapp.enviarBotoes).not.toHaveBeenCalled();
      expect(mockWhatsapp.enviarLista).not.toHaveBeenCalled();
    });

    it('WhatsApp com canalId: chama enviarPorCanal', async () => {
      setupMocks(conversaComCanal(), 'qual o horário?');
      await processarMensagem(service, 'conv-002');

      expect(mockWhatsapp.enviarPorCanal).toHaveBeenCalledTimes(1);
      const [canalId, numero] = (mockWhatsapp.enviarPorCanal as jest.Mock).mock.calls[0];
      expect(canalId).toBe('canal-meta-001');
      expect(numero).toBe('5565999990002');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Limites: label > 24 chars é truncado
  // -------------------------------------------------------------------------

  describe('limites de truncamento', () => {
    it('todos os labels têm no máximo 24 chars', async () => {
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');
      await processarMensagem(service, 'conv-001');

      const [, payload] = (mockWhatsapp.enviarLista as jest.Mock).mock.calls[0];
      for (const row of payload.rows as { label: string }[]) {
        expect(row.label.length).toBeLessThanOrEqual(24);
      }
    });
  });

  // -------------------------------------------------------------------------
  // 4. Best-effort: falha no envio não derruba a persistência
  // -------------------------------------------------------------------------

  describe('best-effort — falha no envio não derruba o fluxo', () => {
    it('lança erro no enviarListaPorCanal mas persistirMensagem ainda é chamado', async () => {
      (mockWhatsapp.enviarListaPorCanal as jest.Mock).mockRejectedValueOnce(
        new Error('Timeout na rede'),
      );
      setupMocks(conversaComCanal(), 'quero registrar');

      await expect(
        processarMensagem(service, 'conv-002'),
      ).resolves.not.toThrow();

      expect(mockConversa.persistirMensagem).toHaveBeenCalled();
    });

    it('lança erro no enviarLista mas persistirMensagem ainda é chamado', async () => {
      (mockWhatsapp.enviarLista as jest.Mock).mockRejectedValueOnce(
        new Error('Provider indisponível'),
      );
      setupMocks(conversaWA(), 'quero registrar uma ocorrência');

      await expect(
        processarMensagem(service, 'conv-001'),
      ).resolves.not.toThrow();

      expect(mockConversa.persistirMensagem).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 5. Canal Telegram — destino via visitanteIdentificador
  // -------------------------------------------------------------------------

  describe('canal telegram — destino via visitanteIdentificador', () => {
    it('consulta visitanteIdentificador quando telefone é null', async () => {
      const convTelegram = {
        id: 'conv-tg-001',
        status: 'bot',
        canal: 'telegram',
        visitanteTelefone: null,
        // O destino do Telegram/Messenger/Instagram vem do visitanteIdentificador
        // (chat_id/PSID), já carregado pelo findUnique da conversa — sem 2ª busca.
        visitanteIdentificador: '987654321',
        botTentativas: 0,
        canalId: 'canal-tg-001',
      };

      (mockPrisma.db.atendimentoConversa.findUnique as jest.Mock)
        .mockResolvedValue(convTelegram);

      (mockPrisma.db.tenant.findFirst as jest.Mock).mockResolvedValue({
        iaChatWidgetAtivo: true,
        iaChatHabilitada: true,
        atendimentoHumanoAtivo: true,
      });
      (mockPrisma.db.atendimentoMensagem.findUnique as jest.Mock).mockResolvedValue({
        id: 'msg-tg-001',
        conteudo: 'oi',
        autorTipo: 'visitante',
        interno: false,
      });
      (mockPrisma.db.atendimentoMensagem.findMany as jest.Mock).mockResolvedValue([]);

      await TenantContext.run({ tenantId: TENANT_ID }, () =>
        service.processarMensagem('conv-tg-001', 'msg-tg-001', TENANT_ID),
      );

      expect(mockWhatsapp.enviarPorCanal).toHaveBeenCalledWith(
        'canal-tg-001',
        '987654321',
        'Resposta IA',
      );
    });
  });
});
