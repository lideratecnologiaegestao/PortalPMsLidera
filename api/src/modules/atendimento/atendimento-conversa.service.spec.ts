import { UnprocessableEntityException } from '@nestjs/common';
import { AtendimentoConversaService, redigirPII } from './atendimento-conversa.service';

/**
 * Testes unitários do AtendimentoConversaService.
 * Foco: FSM (máquina de estados), redação de PII e isolamento RLS.
 *
 * RLS:
 * O PrismaService real não é instanciado aqui — usamos mocks que simulam
 * o comportamento do scopo de tenant. O teste de isolamento RLS de integração
 * (tenant A não vê dado de tenant B) deve rodar contra o banco real
 * (ver docs de teste RLS local).
 */
describe('AtendimentoConversaService — unidade', () => {
  // ------------------------------------------------------------------ redigirPII

  describe('redigirPII()', () => {
    it('redige CPF no formato XXX.XXX.XXX-XX', () => {
      expect(redigirPII('meu cpf é 123.456.789-00 ok')).not.toContain('123.456.789-00');
      expect(redigirPII('meu cpf é 123.456.789-00 ok')).toContain('[REDACTED]');
    });

    it('redige CPF sem pontuação', () => {
      expect(redigirPII('12345678900')).toContain('[REDACTED]');
    });

    it('redige CNPJ', () => {
      expect(redigirPII('cnpj 12.345.678/0001-99')).toContain('[REDACTED]');
    });

    it('redige telefone', () => {
      expect(redigirPII('fone (65) 99999-1234')).toContain('[REDACTED]');
    });

    it('não altera texto sem PII', () => {
      const texto = 'Quero saber sobre o IPTU';
      expect(redigirPII(texto)).toBe(texto);
    });
  });

  // ------------------------------------------------------------------ FSM via mock

  describe('FSM — transições válidas e inválidas', () => {
    let service: AtendimentoConversaService;
    let prismaMock: any;

    beforeEach(() => {
      prismaMock = {
        db: {
          atendimentoConversa: {
            findUnique: jest.fn(),
            update: jest.fn(),
            updateMany: jest.fn(),
            create: jest.fn(),
            findMany: jest.fn(),
            count: jest.fn(),
          },
          atendimentoMensagem: {
            create: jest.fn(),
            findMany: jest.fn(),
            findUnique: jest.fn(),
          },
          atendimentoEvento: { create: jest.fn() },
          secretaria: { findUnique: jest.fn() },
          tenant: {
            findFirst: jest.fn().mockResolvedValue({
              atendimentoSaudacao: 'Olá!',
              atendimentoAvisoLgpd: null,
              atendimentoHumanoAtivo: true,
            }),
          },
        },
        platform: jest.fn().mockReturnValue({
          tenant: { findUnique: jest.fn() },
        }),
      };
      const notifMock = {
        avisarOuvidoresAtendimento: jest.fn().mockResolvedValue(undefined),
        avisarAtendentesSecretaria: jest.fn().mockResolvedValue(undefined),
        avisarAgente: jest.fn().mockResolvedValue(undefined),
      };
      service = new AtendimentoConversaService(prismaMock as any, notifMock as any);
    });

    it('permite bot → aguardando_agente', async () => {
      prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'bot',
        canal: 'widget',
      });
      prismaMock.db.atendimentoConversa.update.mockResolvedValue({
        id: 'c1',
        status: 'aguardando_agente',
        agente: null,
      });
      prismaMock.db.atendimentoEvento.create.mockResolvedValue({});

      await expect(
        service.escalar('c1', 'tenant1', true),
      ).resolves.toBeDefined();
    });

    it('rejeita encerrada → aguardando_agente com 422', async () => {
      prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'encerrada',
      });

      await expect(
        service.escalar('c1', 'tenant1', true),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('permite em_atendimento → aguardando_agente (transferir)', async () => {
      prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'em_atendimento',
        canal: 'widget',
        assunto: 'teste',
        secretariaId: null,
      });
      prismaMock.db.atendimentoConversa.update.mockResolvedValue({
        id: 'c1',
        status: 'aguardando_agente',
        canal: 'widget',
        assunto: 'teste',
      });
      prismaMock.db.atendimentoEvento.create.mockResolvedValue({});

      await expect(
        service.transferir('c1', 'tenant1', 'agente1', 'secretaria1'),
      ).resolves.toBeDefined();
    });

    it('rejeita assumir conversa não disponível (status bot) com ConflictException', async () => {
      // assumir via updateMany: só funciona quando status='aguardando_agente'.
      // Quando count=0, busca a conversa e lança ConflictException se não é o próprio agente.
      prismaMock.db.atendimentoConversa.updateMany.mockResolvedValue({ count: 0 });
      prismaMock.db.atendimentoConversa.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'bot',
        agenteId: null,
      });

      const { ConflictException } = await import('@nestjs/common');
      await expect(
        service.assumir('c1', 'tenant1', 'agente1'),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ------------------------------------------------------------------ isolamento RLS (mock)

  describe('Isolamento de tenant (mock)', () => {
    /**
     * Simula que o RLS impede que tenant A veja dados de tenant B:
     * quando TenantContext está configurado para tenant A, o Prisma não retorna
     * conversas do tenant B (o findUnique retorna null).
     *
     * Nota: o teste de integração real contra o banco PostGIS está documentado em
     * docs/testes-rls-atendimento.md e usa a configuração do MEMORY.md.
     */
    it('tenantA não acessa conversa do tenantB (findUnique retorna null)', async () => {
      const prismaMockA: any = {
        db: {
          atendimentoConversa: {
            // Simula RLS: conversa pertence ao tenant B, então retorna null para tenant A
            findUnique: jest.fn().mockResolvedValue(null),
          },
          atendimentoEvento: { create: jest.fn() },
          atendimentoMensagem: { create: jest.fn() },
          tenant: { findFirst: jest.fn().mockResolvedValue({ atendimentoSaudacao: null, atendimentoAvisoLgpd: null }) },
        },
        platform: jest.fn().mockReturnValue({ tenant: { findUnique: jest.fn() } }),
      };

      const notifMockA = { avisarOuvidoresAtendimento: jest.fn().mockResolvedValue(undefined) };
      const svcA = new AtendimentoConversaService(prismaMockA as any, notifMockA as any);

      const { NotFoundException } = await import('@nestjs/common');
      await expect(
        svcA.detalhe('conversa-do-tenant-b', 'tenant-a'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
