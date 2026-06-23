/**
 * Unit tests para ComentariosService.
 * Cobre: listar aprovados, criar (validações + auditoria + moderação automática),
 * aprovar/reprovar, escopo de secretaria (ADR-0005 Fase 4) e isolamento de
 * tenant (RLS via mock).
 *
 * ComentarioModeradorService é mockado para isolar o ComentariosService.
 */
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ComentariosService } from './comentarios.service';

// Fixtures
const TENANT_A = 'tenant-aaaa-0000-0000-0000-000000000000';
const TENANT_B = 'tenant-bbbb-0000-0000-0000-000000000000';
const SEC_A    = 'sec-aaaa-0000-0000-0000-000000000000';
const SEC_B    = 'sec-bbbb-0000-0000-0000-000000000000';
const NOTICIA_ID = 'noticia-uuid-1';
const USER_ID    = 'user-uuid-1';
const COMENT_ID  = 'coment-uuid-1';

const mockNoticia = {
  id: NOTICIA_ID,
  tenantId: TENANT_A,
  titulo: 'Notícia Teste',
  publicado: true,
  secretariaId: SEC_A,
};

const mockComentario = {
  id: COMENT_ID,
  tenantId: TENANT_A,
  noticiaId: NOTICIA_ID,
  autorUserId: USER_ID,
  autorNome: 'João Silva',
  conteudo: 'Ótima notícia!',
  status: 'pendente',
  moderadoPor: null,
  moderadoEm: null,
  ip: '1.2.3.4',
  criadoEm: new Date(),
  moderadoPorIa: false,
  moderacaoMotivo: null,
  moderacaoCategoria: null,
  noticia: { titulo: 'Notícia Teste', secretariaId: SEC_A },
};

/**
 * Constrói um mock mínimo do PrismaService.
 * listarAdmin usa $queryRawUnsafe — mockamos com stub que retorna dados previsíveis.
 */
const buildPrisma = () => ({
  db: {
    noticia: {
      findFirst: jest.fn().mockResolvedValue(mockNoticia),
      findUnique: jest.fn().mockResolvedValue(mockNoticia),
    },
    noticiaComentario: {
      findMany: jest.fn().mockResolvedValue([mockComentario]),
      findUnique: jest.fn().mockResolvedValue({
        ...mockComentario,
        noticia: { titulo: 'Notícia Teste', secretariaId: SEC_A },
      }),
      create: jest.fn().mockResolvedValue(mockComentario),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ ...mockComentario, ...data }),
      ),
      updateMany: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({ count: 1, ...data }),
      ),
      count: jest.fn().mockResolvedValue(1),
      // SQL cru usado em buscarComEscopo e listarAdmin
      $queryRawUnsafe: jest.fn().mockResolvedValue([{
        id: COMENT_ID,
        noticiaId: NOTICIA_ID,
        secretariaId: SEC_A,
        noticiaTitulo: 'Notícia Teste',
        autorNome: 'João Silva',
        conteudo: 'Ótima notícia!',
        criadoEm: new Date(),
        status: 'pendente',
        moderadoPorIa: false,
        moderacaoMotivo: null,
        moderacaoCategoria: null,
      }]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ nome: 'João Silva' }),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
    $queryRawUnsafe: jest.fn()
      .mockResolvedValueOnce([{
        id: COMENT_ID,
        noticiaId: NOTICIA_ID,
        noticiaTitulo: 'Notícia Teste',
        autorNome: 'João Silva',
        conteudo: 'Ótima notícia!',
        criadoEm: new Date(),
        status: 'pendente',
        moderadoPorIa: false,
        moderacaoMotivo: null,
        moderacaoCategoria: null,
      }])
      .mockResolvedValueOnce([{ total: BigInt(1) }]),
  },
});

/** Mock do ComentarioModeradorService — sempre retorna 'pendente' por padrão. */
const buildModerador = (
  resultado: { decisao: 'reprovar' | 'pendente'; categoria: string; motivo: string | null } = {
    decisao: 'pendente',
    categoria: 'ok',
    motivo: null,
  },
) => ({
  avaliar: jest.fn().mockResolvedValue(resultado),
});

// Mock TenantContext — o mock retorna TENANT_A (isolamento de tenant)
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: { tenantId: () => TENANT_A },
}));

describe('ComentariosService', () => {
  let service: ComentariosService;
  let mockPrisma: ReturnType<typeof buildPrisma>;
  let mockMod: ReturnType<typeof buildModerador>;

  beforeEach(() => {
    mockPrisma = buildPrisma();
    mockMod = buildModerador();
    service = new ComentariosService(mockPrisma as any, mockMod as any);
  });

  // ---------------------------------------------------------------- público

  describe('listarAprovados', () => {
    it('deve buscar somente notícias publicadas antes de listar', async () => {
      await service.listarAprovados(NOTICIA_ID);
      expect(mockPrisma.db.noticia.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ publicado: true }) }),
      );
    });

    it('deve lançar NotFoundException se notícia não existe / não publicada', async () => {
      mockPrisma.db.noticia.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.listarAprovados(NOTICIA_ID)).rejects.toThrow(NotFoundException);
    });

    it('deve filtrar somente comentários aprovados', async () => {
      await service.listarAprovados(NOTICIA_ID);
      expect(mockPrisma.db.noticiaComentario.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'aprovado' }),
          select: expect.not.objectContaining({ ip: true }),
        }),
      );
    });

    it('não deve incluir ip ou autorUserId no select (LGPD)', async () => {
      await service.listarAprovados(NOTICIA_ID);
      const chamada = (mockPrisma.db.noticiaComentario.findMany as jest.Mock).mock.calls[0][0];
      expect(chamada.select).toBeDefined();
      expect(chamada.select).not.toHaveProperty('ip');
      expect(chamada.select).not.toHaveProperty('autorUserId');
      expect(chamada.select).toHaveProperty('id');
      expect(chamada.select).toHaveProperty('autorNome');
      expect(chamada.select).toHaveProperty('conteudo');
      expect(chamada.select).toHaveProperty('criadoEm');
    });
  });

  // ---------------------------------------------------------------- criar (sem moderação automática)

  describe('criar — fluxo normal (moderação retorna pendente)', () => {
    const opts = {
      noticiaId: NOTICIA_ID,
      conteudo: 'Comentário de teste legítimo.',
      autorUserId: USER_ID,
      ip: '1.2.3.4',
    };

    it('deve criar comentário com status pendente e tenantId correto', async () => {
      await service.criar(opts);
      expect(mockPrisma.db.noticiaComentario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: TENANT_A,
            status: 'pendente',
            noticiaId: NOTICIA_ID,
          }),
        }),
      );
    });

    it('deve retornar { ok: true, status: "pendente" }', async () => {
      const result = await service.criar(opts);
      expect(result).toEqual({ ok: true, status: 'pendente' });
    });

    it('deve usar o nome real do banco (não do cliente)', async () => {
      mockPrisma.db.user.findUnique = jest.fn().mockResolvedValue({ nome: 'Nome Real' });
      await service.criar(opts);
      const chamada = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.autorNome).toBe('Nome Real');
    });

    it('deve chamar o moderador com o conteúdo e tenantId', async () => {
      await service.criar(opts);
      expect(mockMod.avaliar).toHaveBeenCalledWith(opts.conteudo, TENANT_A);
    });

    it('deve auditar a criação com COMENTARIO_CRIADO', async () => {
      await service.criar(opts);
      const chamadas = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls;
      const acoes = chamadas.map((c: any[]) => c[0].data.acao);
      expect(acoes).toContain('COMENTARIO_CRIADO');
    });

    it('NÃO deve auditar COMENTARIO_AUTO_REPROVADO quando moderação retorna pendente', async () => {
      await service.criar(opts);
      const chamadas = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls;
      const acoes = chamadas.map((c: any[]) => c[0].data.acao);
      expect(acoes).not.toContain('COMENTARIO_AUTO_REPROVADO');
    });

    it('deve gravar moderadoPorIa=false quando pendente', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.moderadoPorIa).toBe(false);
    });

    it('deve lançar BadRequestException para conteúdo vazio', async () => {
      await expect(service.criar({ ...opts, conteudo: '' })).rejects.toThrow(BadRequestException);
    });

    it('deve lançar BadRequestException para conteúdo acima de 2000 chars', async () => {
      await expect(service.criar({ ...opts, conteudo: 'x'.repeat(2001) })).rejects.toThrow(BadRequestException);
    });

    it('deve lançar UnauthorizedException se usuário não existe no banco', async () => {
      mockPrisma.db.user.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.criar(opts)).rejects.toThrow(UnauthorizedException);
    });

    it('deve lançar NotFoundException se notícia não está publicada', async () => {
      mockPrisma.db.noticia.findFirst = jest.fn().mockResolvedValue(null);
      await expect(service.criar(opts)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------------------------------------------------------------- criar — moderação auto-reprova

  describe('criar — moderação automática reprova', () => {
    const opts = {
      noticiaId: NOTICIA_ID,
      conteudo: '<script>alert(1)</script>',
      autorUserId: USER_ID,
      ip: '1.2.3.4',
    };

    beforeEach(() => {
      mockMod = buildModerador({
        decisao: 'reprovar',
        categoria: 'codigo_malicioso',
        motivo: 'Conteúdo contém código malicioso ou tentativa de injeção.',
      });
      service = new ComentariosService(mockPrisma as any, mockMod as any);
    });

    it('deve criar o comentário com status "reprovado"', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.status).toBe('reprovado');
    });

    it('deve retornar { ok: true, status: "reprovado" }', async () => {
      const result = await service.criar(opts);
      expect(result).toEqual({ ok: true, status: 'reprovado' });
    });

    it('deve gravar moderadoPorIa=true', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.moderadoPorIa).toBe(true);
    });

    it('deve gravar moderacaoCategoria correta', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.moderacaoCategoria).toBe('codigo_malicioso');
    });

    it('deve gravar moderacaoMotivo', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.moderacaoMotivo).toBeTruthy();
    });

    it('deve gravar moderadoEm (timestamp da criação automática)', async () => {
      await service.criar(opts);
      const data = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0].data;
      expect(data.moderadoEm).toBeInstanceOf(Date);
    });

    it('deve auditar COMENTARIO_CRIADO E COMENTARIO_AUTO_REPROVADO', async () => {
      await service.criar(opts);
      const chamadas = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls;
      const acoes = chamadas.map((c: any[]) => c[0].data.acao);
      expect(acoes).toContain('COMENTARIO_CRIADO');
      expect(acoes).toContain('COMENTARIO_AUTO_REPROVADO');
    });

    it('o motivo de reprovação NÃO deve ser exposto na resposta ao cidadão', async () => {
      const result = await service.criar(opts);
      // A resposta pública só tem ok + status, nunca motivo/categoria
      expect(result).not.toHaveProperty('motivo');
      expect(result).not.toHaveProperty('categoria');
      expect(result).not.toHaveProperty('moderacaoMotivo');
    });
  });

  // ---------------------------------------------------------------- moderação humana (aprovar/reprovar)

  describe('aprovar', () => {
    it('deve atualizar status para aprovado e auditar', async () => {
      // buscarComEscopo usa $queryRawUnsafe — precisa do mock no db raiz
      mockPrisma.db.$queryRawUnsafe = jest.fn().mockResolvedValue([{
        id: COMENT_ID,
        noticiaId: NOTICIA_ID,
        secretariaId: SEC_A,
      }]);
      await service.aprovar(COMENT_ID, 'moderador-id');
      expect(mockPrisma.db.noticiaComentario.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'aprovado' }),
        }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'COMENTARIO_APROVADO' }),
        }),
      );
    });
  });

  describe('reprovar (humano)', () => {
    it('deve atualizar status para reprovado e auditar', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn().mockResolvedValue([{
        id: COMENT_ID,
        noticiaId: NOTICIA_ID,
        secretariaId: SEC_A,
      }]);
      await service.reprovar(COMENT_ID, 'moderador-id');
      expect(mockPrisma.db.noticiaComentario.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'reprovado' }),
        }),
      );
      expect(mockPrisma.db.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acao: 'COMENTARIO_REPROVADO' }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------- escopo de secretaria (ADR-0005 Fase 4)

  describe('escopo de secretaria', () => {
    it('listarAdmin: escopo null retorna lista vazia (gestor sem lotação)', async () => {
      const result = await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: null });
      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
      // não deve chamar o banco
      expect(mockPrisma.db.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it('listarAdmin: escopo undefined (admin) usa SQL sem filtro de secretaria', async () => {
      // stub para os 2 calls do listarAdmin (items + total)
      mockPrisma.db.$queryRawUnsafe = jest.fn()
        .mockResolvedValueOnce([{
          id: COMENT_ID, noticiaId: NOTICIA_ID, noticiaTitulo: 'T',
          autorNome: 'J', conteudo: 'C', criadoEm: new Date(),
          status: 'pendente', moderadoPorIa: false,
          moderacaoMotivo: null, moderacaoCategoria: null,
        }])
        .mockResolvedValueOnce([{ total: BigInt(1) }]);
      const result = await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: undefined });
      expect(result.total).toBe(1);
      // Verifica que a query NÃO contém filtro de secretaria (escopo admin = sem restrição)
      const sql: string = (mockPrisma.db.$queryRawUnsafe as jest.Mock).mock.calls[0][0];
      expect(sql).not.toContain('secretaria_id');
    });

    it('listarAdmin: escopo por secretaria inclui filtro na query SQL', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ total: BigInt(0) }]);
      await service.listarAdmin({ page: 1, pageSize: 10, escopoSecretariaId: SEC_A });
      const sql: string = (mockPrisma.db.$queryRawUnsafe as jest.Mock).mock.calls[0][0];
      expect(sql).toContain('secretaria_id');
    });

    it('listarAdmin: resultado inclui campos de moderação IA', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn()
        .mockResolvedValueOnce([{
          id: COMENT_ID, noticiaId: NOTICIA_ID, noticiaTitulo: 'T',
          autorNome: 'J', conteudo: 'C', criadoEm: new Date(),
          status: 'reprovado', moderadoPorIa: true,
          moderacaoMotivo: 'Código malicioso', moderacaoCategoria: 'codigo_malicioso',
        }])
        .mockResolvedValueOnce([{ total: BigInt(1) }]);
      const result = await service.listarAdmin({ page: 1, pageSize: 10 });
      expect(result.items[0]).toHaveProperty('moderadoPorIa', true);
      expect(result.items[0]).toHaveProperty('moderacaoMotivo', 'Código malicioso');
      expect(result.items[0]).toHaveProperty('moderacaoCategoria', 'codigo_malicioso');
    });

    it('aprovar: gestor sem lotação (null) deve lançar ForbiddenException', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn().mockResolvedValue([{
        id: COMENT_ID, noticiaId: NOTICIA_ID, secretariaId: SEC_A,
      }]);
      await expect(service.aprovar(COMENT_ID, 'mod-id', null)).rejects.toThrow(ForbiddenException);
    });

    it('aprovar: gestor de SEC_A não pode moderar comentário de notícia de SEC_B', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn().mockResolvedValue([{
        id: COMENT_ID, noticiaId: NOTICIA_ID, secretariaId: SEC_B,
      }]);
      await expect(service.aprovar(COMENT_ID, 'mod-id', SEC_A)).rejects.toThrow(ForbiddenException);
    });

    it('aprovar: admin sem escopo (undefined) pode moderar qualquer comentário', async () => {
      mockPrisma.db.$queryRawUnsafe = jest.fn().mockResolvedValue([{
        id: COMENT_ID, noticiaId: NOTICIA_ID, secretariaId: SEC_A,
      }]);
      await expect(service.aprovar(COMENT_ID, 'mod-id', undefined)).resolves.toEqual(
        expect.objectContaining({ ok: true }),
      );
    });
  });

  // ---------------------------------------------------------------- isolamento RLS (tenant)

  describe('isolamento de tenant (RLS)', () => {
    it('tenantId do contexto (TENANT_A) é inserido na criação — nunca TENANT_B', async () => {
      await service.criar({
        noticiaId: NOTICIA_ID,
        conteudo: 'Comentário legítimo.',
        autorUserId: USER_ID,
        ip: undefined,
      });
      const chamada = (mockPrisma.db.noticiaComentario.create as jest.Mock).mock.calls[0][0];
      expect(chamada.data.tenantId).toBe(TENANT_A);
      expect(chamada.data.tenantId).not.toBe(TENANT_B);
    });

    it('audit_log também recebe tenantId do contexto (TENANT_A)', async () => {
      await service.criar({
        noticiaId: NOTICIA_ID,
        conteudo: 'Comentário legítimo.',
        autorUserId: USER_ID,
        ip: undefined,
      });
      const chamadaAudit = (mockPrisma.db.auditLog.create as jest.Mock).mock.calls[0][0];
      expect(chamadaAudit.data.tenantId).toBe(TENANT_A);
    });
  });
});
