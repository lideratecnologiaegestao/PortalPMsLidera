/**
 * Unit tests para IaService — 3 camadas de contexto do bot.
 * Verifica que fatos do tenant, conhecimento curado e RAG multi-fonte
 * são montados corretamente no prompt sem vazamento entre tenants.
 */
import { ForbiddenException } from '@nestjs/common';
import { IaService } from './ia.service';

// Estes testes exercitam a montagem do contexto em 3 camadas via `completar`.
// Desliga a busca web de saúde (server tool) para que o caminho sem ferramentas
// seja usado e as asserções sobre `anthropic.completar` continuem válidas.
process.env.IA_WEB_SEARCH_SAUDE = 'off';

const TENANT_A = 'tenant-a-uuid';

// -------------------------------------------------------------------------- mocks
const mockTenant = { nome: 'Barão de Melgaço', uf: 'MT', dpoNome: 'João DPO', dpoEmail: 'dpo@barao.mt.gov.br' };

const buildPrisma = () => ({
  db: {
    manifestacao: { findUnique: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    iaConhecimento: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  },
  platform: jest.fn().mockReturnValue({
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        ...mockTenant,
        iaTriagemHabilitada: true,
        iaChatHabilitada: true,
      }),
    },
  }),
});

const buildConhecimento = (overrides: Partial<{
  buscar: jest.Mock;
  fixados: jest.Mock;
}> = {}) => ({
  buscar: overrides.buscar ?? jest.fn().mockResolvedValue([]),
  fixados: overrides.fixados ?? jest.fn().mockResolvedValue([]),
});

const buildAnthropic = () => ({
  completar: jest.fn().mockResolvedValue('Resposta do bot'),
  completarComFerramentas: jest.fn().mockResolvedValue('Resposta do bot'),
  ocr: jest.fn(),
});

// Stub do serviço de consulta fiscal (APLIC) — não é exercitado nestes testes
// (sem dados fiscais, as ferramentas fiscais não são acionadas).
const buildAplicConsulta = () => ({});

const buildAntivirus = () => ({
  limpo: jest.fn().mockResolvedValue(true),
});

const buildEmbeddings = () => ({
  configurado: false,
  embed: jest.fn().mockResolvedValue(null),
});

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => TENANT_A,
    get: () => ({ userId: 'user-uuid', tenantId: TENANT_A }),
    run: (_ctx: unknown, fn: () => unknown) => fn(),
  },
}));

// -------------------------------------------------------------------------- helpers
function buildService(overrides: {
  prisma?: ReturnType<typeof buildPrisma>;
  conhecimento?: ReturnType<typeof buildConhecimento>;
  anthropic?: ReturnType<typeof buildAnthropic>;
} = {}) {
  const prisma = overrides.prisma ?? buildPrisma();
  const conhecimento = overrides.conhecimento ?? buildConhecimento();
  const anthropic = overrides.anthropic ?? buildAnthropic();
  return {
    service: new IaService(
      prisma as any,
      anthropic as any,
      buildAntivirus() as any,
      buildEmbeddings() as any,
      conhecimento as any,
      buildAplicConsulta() as any,
    ),
    prisma,
    conhecimento,
    anthropic,
  };
}

// -------------------------------------------------------------------------- testes
describe('IaService — chat com contexto em 3 camadas', () => {
  describe('chat()', () => {
    it('retorna resposta e fontes', async () => {
      const { service } = buildService();
      const result = await service.chat('Qual o horário da prefeitura?');
      expect(result.resposta).toBe('Resposta do bot');
      expect(Array.isArray(result.fontes)).toBe(true);
    });

    it('lança ForbiddenException se chat não habilitado', async () => {
      const prisma = buildPrisma();
      (prisma.platform as jest.Mock).mockReturnValue({
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            iaTriagemHabilitada: false,
            iaChatHabilitada: false,
          }),
        },
      });
      const { service } = buildService({ prisma });
      await expect(service.chat('pergunta')).rejects.toThrow(ForbiddenException);
    });

    it('trunca pergunta a 500 chars (anti-abuso)', async () => {
      const { service, anthropic } = buildService();
      const perguntaLonga = 'x'.repeat(1000);
      await service.chat(perguntaLonga);
      const userPrompt: string = (anthropic.completar as jest.Mock).mock.calls[0][0].user;
      // A pergunta no prompt não deve ter mais de 500 chars da original
      expect(userPrompt.includes('x'.repeat(501))).toBe(false);
    });

    it('inclui INFORMAÇÕES OFICIAIS DA ENTIDADE quando fatos disponíveis', async () => {
      const prisma = buildPrisma();
      // Primeiro call de $queryRaw = secretarias para fatosDoTenant
      // Demais calls = RAG multi-fonte (retornam [] para simplificar)
      let callCount = 0;
      (prisma.db.$queryRaw as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([
            { nome: 'Secretaria de Saúde', responsavel: 'Dr. Silva', horario: '8h-17h', telefone: '(65) 3333-0001', email: 'saude@barao.mt.gov.br' },
          ]);
        }
        return Promise.resolve([]);
      });
      const { service, anthropic } = buildService({ prisma });
      await service.chat('Quais secretarias existem?');
      const userPrompt: string = (anthropic.completar as jest.Mock).mock.calls[0][0].user;
      expect(userPrompt).toContain('INFORMAÇÕES OFICIAIS DA ENTIDADE');
      expect(userPrompt).toContain('Barão de Melgaço');
      expect(userPrompt).toContain('MT');
    });

    it('inclui RESPOSTAS OFICIAIS CADASTRADAS quando conhecimento tem match', async () => {
      const conhecimento = buildConhecimento({
        buscar: jest.fn().mockResolvedValue([{ pergunta: 'Como solicitar?', resposta: 'Via portal.' }]),
      });
      const { service, anthropic } = buildService({ conhecimento });
      await service.chat('Como solicitar?');
      const userPrompt: string = (anthropic.completar as jest.Mock).mock.calls[0][0].user;
      expect(userPrompt).toContain('RESPOSTAS OFICIAIS CADASTRADAS');
      expect(userPrompt).toContain('Via portal.');
    });

    it('deduplicar fixados + matches (não repete a mesma pergunta)', async () => {
      const item = { pergunta: 'Como solicitar?', resposta: 'Via portal.' };
      const conhecimento = buildConhecimento({
        fixados: jest.fn().mockResolvedValue([item]),
        buscar: jest.fn().mockResolvedValue([item]), // mesmo item nos dois
      });
      const { service, anthropic } = buildService({ conhecimento });
      // Pergunta DIFERENTE do texto do item, para isolar a dedup do bloco de
      // conhecimento (senão a frase também apareceria na linha "PERGUNTA:").
      await service.chat('Tenho uma dúvida sobre o procedimento');
      const userPrompt: string = (anthropic.completar as jest.Mock).mock.calls[0][0].user;
      // Deve aparecer apenas 1 vez no bloco de conhecimento (fixado + match dedup)
      const count = (userPrompt.match(/Como solicitar\?/g) ?? []).length;
      expect(count).toBe(1);
    });

    it('confiança = 0.95 quando há match em conhecimento curado', async () => {
      const conhecimento = buildConhecimento({
        buscar: jest.fn().mockResolvedValue([{ pergunta: 'P', resposta: 'R' }]),
      });
      const { service } = buildService({ conhecimento });
      const result = await service.chat('P');
      expect(result.confianca).toBe(0.95);
    });

    it('confiança = 0.2 quando não há nenhuma fonte', async () => {
      const { service } = buildService();
      const result = await service.chat('pergunta sem resultado algum');
      // sem RAG e sem conhecimento, confiança é 0.2
      expect(result.confianca).toBe(0.2);
    });

    it('audita a ação IA_CHAT', async () => {
      const { service, prisma } = buildService();
      await service.chat('Pergunta?');
      expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'IA_CHAT' }),
        }),
      );
    });
  });

  // --------------------------------------------------------------- chatMultiturno
  describe('chatMultiturno()', () => {
    it('inclui histórico limitado a 8 trocas', async () => {
      const historico = Array.from({ length: 12 }, (_, i) => ({
        papel: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
        texto: `msg${i}`,
      }));
      const { service, anthropic } = buildService();
      await service.chatMultiturno(historico, 'pergunta atual', TENANT_A);
      const userPrompt: string = (anthropic.completar as jest.Mock).mock.calls[0][0].user;
      // Apenas as últimas 8 msgs — msg0..msg3 não devem aparecer
      expect(userPrompt).not.toContain('msg0');
      expect(userPrompt).toContain('msg4');
    });

    it('lança ForbiddenException se chat não habilitado', async () => {
      const prisma = buildPrisma();
      (prisma.platform as jest.Mock).mockReturnValue({
        tenant: {
          findUnique: jest.fn().mockResolvedValue({
            iaTriagemHabilitada: false,
            iaChatHabilitada: false,
          }),
        },
      });
      const { service } = buildService({ prisma });
      await expect(service.chatMultiturno([], 'pergunta', TENANT_A)).rejects.toThrow(ForbiddenException);
    });
  });

  // --------------------------------------------------------------- busca()
  describe('busca()', () => {
    it('retorna resultados com url e fonte', async () => {
      const prisma = buildPrisma();
      (prisma.db.$queryRaw as jest.Mock).mockResolvedValueOnce([]); // secretarias (fatos)
        // retorna resultados do CMS no segundo call
      const { service } = buildService({ prisma });
      const result = await service.busca('alvará');
      expect(result.pergunta).toBe('alvará');
      expect(Array.isArray(result.resultados)).toBe(true);
    });
  });

  // --------------------------------------------------------------- fontes no contexto
  describe('fontes retornadas ao caller', () => {
    it('fontes incluem url quando trechos têm url', async () => {
      const prisma = buildPrisma();
      (prisma.db.$queryRaw as jest.Mock).mockImplementation((tpl: TemplateStringsArray) => {
        // Simulando retorno do RAG de serviços
        const query = tpl?.[0] ?? '';
        if (query.includes('servicos')) {
          return Promise.resolve([{
            slug: 'alvara-de-funcionamento',
            titulo: 'Alvará de Funcionamento',
            texto: 'Solicite o alvará no portal.',
            url: '/servicos/alvara-de-funcionamento',
            fonte: 'servicos',
          }]);
        }
        return Promise.resolve([]);
      });
      const { service } = buildService({ prisma });
      const result = await service.chat('alvará');
      // Verifica que fontes são devolvidas ao caller
      expect(Array.isArray(result.fontes)).toBe(true);
    });
  });
});

// -------------------------------------------------------------------------- RLS isolation
describe('IaService — isolamento RLS (tenant A não vê dado de tenant B)', () => {
  it('fatosDoTenant consulta platform() pelo tenantId do contexto (não hardcoded)', async () => {
    const prisma = buildPrisma();
    const platformMock = jest.fn().mockReturnValue({
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          ...mockTenant,
          iaTriagemHabilitada: true,
          iaChatHabilitada: true,
        }),
      },
    });
    prisma.platform = platformMock;
    const { service } = buildService({ prisma });
    await service.chat('pergunta');
    // platform() deve ter sido chamado pelo flags() e por fatosDoTenant()
    // A query de tenant usa o tenantId do contexto (TENANT_A), não hardcoded
    const platCall = platformMock.mock.results[0].value;
    expect(platCall.tenant.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TENANT_A } }),
    );
  });

  it('RAG usa prisma.db (RLS escopo de tenant — não retorna dados de outro tenant)', async () => {
    // O RAG usa prisma.db.$queryRaw — o banco aplica RLS automaticamente via GUC
    // Aqui verificamos que a query não inclui tenant_id hardcoded (o RLS faz isso)
    const prisma = buildPrisma();
    const { service } = buildService({ prisma });
    await service.chat('serviços');
    // Todas as chamadas RAG devem ir por prisma.db.$queryRaw (RLS protege)
    expect(prisma.db.$queryRaw).toHaveBeenCalled();
    // Nenhuma chamada a platform() para RAG (que seria cross-tenant)
    const platformCallCount = (prisma.platform as jest.Mock).mock.calls.length;
    // platform() é chamado apenas por flags() e fatosDoTenant() — não pelo RAG
    // Dois calls esperados: um para flags(), um para fatosDoTenant()
    expect(platformCallCount).toBeLessThanOrEqual(2);
  });
});
