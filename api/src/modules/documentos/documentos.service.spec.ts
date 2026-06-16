/**
 * Unit tests — DocumentosService
 *
 * Cobre:
 *  A) Hierarquia de tipos (parentId): validação de mesmo cadastro, auto-ciclo e ciclo de descendência.
 *  B) Nível de acesso por grupo:
 *     - listarCadastros: anônimo só vê público; autenticado sem grupo não vê restrito;
 *       autenticado com grupo vê restrito.
 *     - cadastroPorSlug / listarPublico / exportarPublico / registrarDownload:
 *       restrito sem autorização → NotFoundException.
 *  C) criarCadastro / atualizarCadastro: validação de visibilidade e grupoIds;
 *     lógica de menu (cria quando público, remove quando restrito).
 *  D) listarCadastrosAdmin: inclui visibilidade e grupoIds mapeados.
 *  E) descendentesTipo: BFS correto (acessado indiretamente via listarPublico).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentosService } from './documentos.service';

// ─── fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const ATOR_ID = 'ator-uuid-1234-0000-0000-000000000000';
const CADASTRO_PUB_ID = 'cad-pub-000-0000-0000-000000000000';
const CADASTRO_REST_ID = 'cad-rest-00-0000-0000-000000000000';
const GRUPO_ID = 'grupo-uuid-0000-0000-0000-000000000000';
const USER_ID = 'user-uuid-00-0000-0000-000000000000';
const TIPO_PAI_ID = 'tipo-pai-00-0000-0000-000000000000';
const TIPO_FILHO_ID = 'tipo-filho-0-0000-0000-000000000000';
const TIPO_NETO_ID = 'tipo-neto-0-0000-0000-000000000000';

const mockCadPublico = {
  id: CADASTRO_PUB_ID, tenantId: TENANT_A, slug: 'leis', nome: 'Leis',
  descricao: null, icone: 'file', ordem: 1, visibilidade: 'publico', ativo: true,
};
const mockCadRestrito = {
  id: CADASTRO_REST_ID, tenantId: TENANT_A, slug: 'interno', nome: 'Interno',
  descricao: null, icone: 'lock', ordem: 2, visibilidade: 'restrito', ativo: true,
};

// ─── mock TenantContext (será sobrescrito nos testes que precisam de user/role) ──

let mockCtx: { tenantId?: string; userId?: string; role?: string } = { tenantId: TENANT_A };

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    get: () => mockCtx,
    tenantId: () => mockCtx.tenantId,
  },
}));

// ─── builder do mock do PrismaService ────────────────────────────────────────

const buildPrisma = () => ({
  db: {
    docCadastro: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    docTipo: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    docCadastroGrupo: {
      findMany: jest.fn(),
      createMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    usuarioGrupo: {
      findMany: jest.fn(),
    },
    documento: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    auditLog: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
  platform: jest.fn().mockReturnValue({
    docCadastro: { findFirst: jest.fn().mockResolvedValue(null) },
  }),
  tx: jest.fn(),
});

const buildMenus = () => ({
  acharOuCriarGrupoRls: jest.fn().mockResolvedValue('menu-grupo-id'),
  criarItemAutoRls: jest.fn().mockResolvedValue(undefined),
  removerPorRef: jest.fn().mockResolvedValue(undefined),
  atualizarHrefPorRef: jest.fn().mockResolvedValue(undefined),
  acharOuCriarGrupo: jest.fn().mockResolvedValue('menu-grupo-id'),
  criarItemAuto: jest.fn().mockResolvedValue(undefined),
});

const buildFila = () => ({
  add: jest.fn().mockResolvedValue(undefined),
});

const buildBuscaSync = () => ({
  enqueue: jest.fn().mockResolvedValue(undefined),
});

// ─── helpers ─────────────────────────────────────────────────────────────────

const buildService = (
  prisma: ReturnType<typeof buildPrisma>,
  menus = buildMenus(),
  fila = buildFila(),
  buscaSync = buildBuscaSync(),
) => new DocumentosService(prisma as any, menus as any, fila as any, buscaSync as any);

// ─── suite A: hierarquia de tipos ─────────────────────────────────────────────

describe('A) Hierarquia de tipos', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A };
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('criarTipo sem parentId deve persistir parentId=null', async () => {
    prisma.db.docTipo.findFirst.mockResolvedValue(null); // slug livre
    prisma.db.docTipo.create.mockResolvedValue({ id: 'new-tipo', nome: 'T', parentId: null });

    await service.criarTipo(CADASTRO_PUB_ID, { nome: 'Teste' });

    expect(prisma.db.docTipo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: null }) }),
    );
  });

  it('criarTipo com parentId válido deve persistir parentId', async () => {
    prisma.db.docTipo.findFirst.mockResolvedValue(null); // slug livre
    prisma.db.docTipo.findUnique.mockResolvedValue({ id: TIPO_PAI_ID, cadastroId: CADASTRO_PUB_ID });
    prisma.db.docTipo.findMany.mockResolvedValue([]); // sem filhos (descendentes)
    prisma.db.docTipo.create.mockResolvedValue({ id: 'new-tipo', nome: 'Filho', parentId: TIPO_PAI_ID });

    await service.criarTipo(CADASTRO_PUB_ID, { nome: 'Filho', parentId: TIPO_PAI_ID });

    expect(prisma.db.docTipo.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ parentId: TIPO_PAI_ID }) }),
    );
  });

  it('criarTipo com parentId de outro cadastro deve lançar BadRequestException', async () => {
    prisma.db.docTipo.findUnique.mockResolvedValue({ id: TIPO_PAI_ID, cadastroId: 'outro-cadastro-id' });

    await expect(service.criarTipo(CADASTRO_PUB_ID, { nome: 'X', parentId: TIPO_PAI_ID }))
      .rejects.toThrow(BadRequestException);
  });

  it('atualizarTipo com parentId = próprio id deve lançar BadRequestException (auto-ciclo)', async () => {
    prisma.db.docTipo.findUnique.mockResolvedValue({ id: TIPO_PAI_ID, cadastroId: CADASTRO_PUB_ID });

    await expect(service.atualizarTipo(TIPO_PAI_ID, { parentId: TIPO_PAI_ID }))
      .rejects.toThrow(BadRequestException);
  });

  it('atualizarTipo com parentId sendo descendente deve lançar BadRequestException (ciclo)', async () => {
    // tipoAtual = TIPO_PAI_ID; parentId proposto = TIPO_NETO_ID (descendente)
    prisma.db.docTipo.findUnique
      .mockResolvedValueOnce({ id: TIPO_PAI_ID, cadastroId: CADASTRO_PUB_ID }) // busca tipoAtual
      .mockResolvedValueOnce({ id: TIPO_NETO_ID, cadastroId: CADASTRO_PUB_ID }); // busca parent na validação

    // descendentesTipo de TIPO_PAI_ID: filhos = [TIPO_FILHO_ID]; filhos de TIPO_FILHO_ID = [TIPO_NETO_ID]
    prisma.db.docTipo.findMany.mockResolvedValue([
      { id: TIPO_PAI_ID, parentId: null },
      { id: TIPO_FILHO_ID, parentId: TIPO_PAI_ID },
      { id: TIPO_NETO_ID, parentId: TIPO_FILHO_ID },
    ]);

    await expect(service.atualizarTipo(TIPO_PAI_ID, { parentId: TIPO_NETO_ID }))
      .rejects.toThrow(BadRequestException);
  });

  it('listarTipos deve incluir parentId no select', async () => {
    prisma.db.docTipo.findMany.mockResolvedValue([
      { id: TIPO_PAI_ID, nome: 'Pai', slug: 'pai', ordem: 0, ativo: true, meta: {}, parentId: null },
      { id: TIPO_FILHO_ID, nome: 'Filho', slug: 'filho', ordem: 1, ativo: true, meta: {}, parentId: TIPO_PAI_ID },
    ]);

    const result = await service.listarTipos(CADASTRO_PUB_ID);

    expect(prisma.db.docTipo.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ parentId: true }) }),
    );
    expect(result[1].parentId).toBe(TIPO_PAI_ID);
  });
});

// ─── suite B: nível de acesso por grupo ───────────────────────────────────────

describe('B) Nível de acesso por grupo — listarCadastros', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('anônimo recebe apenas cadastros públicos (sem visibilidade restrito)', async () => {
    mockCtx = { tenantId: TENANT_A }; // sem userId
    prisma.db.docCadastro.findMany.mockResolvedValue([
      { ...mockCadPublico, visibilidade: 'publico' },
    ]);

    const result = await service.listarCadastros();

    // Deve chamar findMany somente com visibilidade: 'publico'
    expect(prisma.db.docCadastro.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ visibilidade: 'publico' }) }),
    );
    expect(result).toHaveLength(1);
    expect(result[0].visibilidade).toBe('publico');
  });

  it('usuário autenticado sem grupo não recebe cadastro restrito sem grupos vinculados', async () => {
    mockCtx = { tenantId: TENANT_A, userId: USER_ID, role: 'cidadao' };

    // Primeira chamada: públicos
    prisma.db.docCadastro.findMany
      .mockResolvedValueOnce([{ ...mockCadPublico }])
      // Segunda: restritos
      .mockResolvedValueOnce([{ ...mockCadRestrito }]);

    // Sem grupos no cadastro restrito
    prisma.db.docCadastroGrupo.findMany.mockResolvedValue([]);
    prisma.db.usuarioGrupo.findMany.mockResolvedValue([]);

    const result = await service.listarCadastros();

    // Só o público deve aparecer
    expect(result.some((c) => c.visibilidade === 'restrito')).toBe(false);
  });

  it('usuário com grupo autorizado recebe cadastro restrito', async () => {
    mockCtx = { tenantId: TENANT_A, userId: USER_ID, role: 'gestor' };

    prisma.db.docCadastro.findMany
      .mockResolvedValueOnce([{ ...mockCadPublico }])
      .mockResolvedValueOnce([{ ...mockCadRestrito }]);

    // Cadastro restrito está vinculado ao GRUPO_ID
    prisma.db.docCadastroGrupo.findMany.mockResolvedValue([{ grupoId: GRUPO_ID }]);
    // Usuário pertence ao GRUPO_ID
    prisma.db.usuarioGrupo.findMany.mockResolvedValue([{ grupoId: GRUPO_ID }]);

    const result = await service.listarCadastros();

    expect(result.some((c) => c.visibilidade === 'restrito')).toBe(true);
  });

  it('admin_prefeitura vê cadastro restrito sem precisar de grupo', async () => {
    mockCtx = { tenantId: TENANT_A, userId: USER_ID, role: 'admin_prefeitura' };

    prisma.db.docCadastro.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...mockCadRestrito }]);

    const result = await service.listarCadastros();

    expect(result.some((c) => c.visibilidade === 'restrito')).toBe(true);
    // Não deve consultar grupos
    expect(prisma.db.docCadastroGrupo.findMany).not.toHaveBeenCalled();
  });
});

describe('B) Nível de acesso — cadastroPorSlug / listarPublico / exportarPublico / registrarDownload', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('cadastroPorSlug em cadastro restrito para anônimo deve lançar NotFoundException', async () => {
    mockCtx = { tenantId: TENANT_A };
    prisma.db.docCadastro.findFirst.mockResolvedValue({ ...mockCadRestrito });

    await expect(service.cadastroPorSlug('interno')).rejects.toThrow(NotFoundException);
  });

  it('cadastroPorSlug em cadastro restrito com usuário autorizado deve funcionar', async () => {
    mockCtx = { tenantId: TENANT_A, userId: USER_ID, role: 'admin_prefeitura' };
    prisma.db.docCadastro.findFirst.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docTipo.findMany.mockResolvedValue([]);

    const result = await service.cadastroPorSlug('interno');
    expect(result.slug).toBe('interno');
  });

  it('listarPublico em cadastro restrito para anônimo deve lançar NotFoundException', async () => {
    mockCtx = { tenantId: TENANT_A };
    prisma.db.docCadastro.findFirst.mockResolvedValue({ ...mockCadRestrito });

    await expect(service.listarPublico('interno', {})).rejects.toThrow(NotFoundException);
  });

  it('exportarPublico em cadastro restrito para anônimo deve lançar NotFoundException', async () => {
    mockCtx = { tenantId: TENANT_A };
    prisma.db.docCadastro.findFirst.mockResolvedValue({ ...mockCadRestrito });

    await expect(service.exportarPublico('interno')).rejects.toThrow(NotFoundException);
  });

  it('registrarDownload em documento de cadastro restrito para anônimo deve lançar NotFoundException', async () => {
    mockCtx = { tenantId: TENANT_A };
    prisma.db.documento.findUnique.mockResolvedValue({
      arquivoUrl: 'https://s3/doc.pdf',
      cadastro: { id: CADASTRO_REST_ID, visibilidade: 'restrito' },
    });

    await expect(service.registrarDownload('doc-id')).rejects.toThrow(NotFoundException);
    // Não deve incrementar downloads
    expect(prisma.db.documento.update).not.toHaveBeenCalled();
  });

  it('registrarDownload em documento público deve incrementar e retornar URL', async () => {
    mockCtx = { tenantId: TENANT_A };
    prisma.db.documento.findUnique.mockResolvedValue({
      arquivoUrl: 'https://s3/doc.pdf',
      cadastro: { id: CADASTRO_PUB_ID, visibilidade: 'publico' },
    });
    prisma.db.documento.update.mockResolvedValue({ arquivoUrl: 'https://s3/doc.pdf' });

    const url = await service.registrarDownload('doc-id');
    expect(url).toBe('https://s3/doc.pdf');
    expect(prisma.db.documento.update).toHaveBeenCalled();
  });
});

// ─── suite C: criarCadastro / atualizarCadastro ───────────────────────────────

describe('C) criarCadastro e atualizarCadastro', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;
  let menus: ReturnType<typeof buildMenus>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A, userId: ATOR_ID, role: 'admin_prefeitura' };
    prisma = buildPrisma();
    menus = buildMenus();
    service = buildService(prisma, menus);
  });

  it('criarCadastro com visibilidade=publico deve criar item de menu', async () => {
    prisma.platform.mockReturnValue({ docCadastro: { findFirst: jest.fn().mockResolvedValue(null) } });
    prisma.db.docCadastro.create.mockResolvedValue({ ...mockCadPublico });
    prisma.db.docCadastroGrupo.createMany.mockResolvedValue({ count: 0 });

    await service.criarCadastro({ nome: 'Leis', visibilidade: 'publico' }, ATOR_ID);

    expect(menus.acharOuCriarGrupoRls).toHaveBeenCalled();
    expect(menus.criarItemAutoRls).toHaveBeenCalled();
  });

  it('criarCadastro com visibilidade=restrito NÃO deve criar item de menu', async () => {
    prisma.platform.mockReturnValue({ docCadastro: { findFirst: jest.fn().mockResolvedValue(null) } });
    prisma.db.docCadastro.create.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docCadastroGrupo.createMany.mockResolvedValue({ count: 0 });

    await service.criarCadastro({ nome: 'Interno', visibilidade: 'restrito' }, ATOR_ID);

    expect(menus.criarItemAutoRls).not.toHaveBeenCalled();
  });

  it('criarCadastro com grupoIds deve criar linhas em docCadastroGrupo', async () => {
    prisma.platform.mockReturnValue({ docCadastro: { findFirst: jest.fn().mockResolvedValue(null) } });
    prisma.db.docCadastro.create.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docCadastroGrupo.createMany.mockResolvedValue({ count: 1 });

    await service.criarCadastro({ nome: 'Interno', visibilidade: 'restrito', grupoIds: [GRUPO_ID] }, ATOR_ID);

    expect(prisma.db.docCadastroGrupo.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ grupoId: GRUPO_ID, cadastroId: CADASTRO_REST_ID }),
        ]),
      }),
    );
  });

  it('criarCadastro com visibilidade inválida deve lançar BadRequestException', async () => {
    await expect(service.criarCadastro({ nome: 'X', visibilidade: 'invalido' as any }, ATOR_ID))
      .rejects.toThrow(BadRequestException);
  });

  it('criarCadastro com grupoIds não-UUID deve lançar BadRequestException', async () => {
    await expect(service.criarCadastro({ nome: 'X', grupoIds: ['nao-e-uuid'] }, ATOR_ID))
      .rejects.toThrow(BadRequestException);
  });

  it('atualizarCadastro de publico para restrito deve remover menu', async () => {
    prisma.db.docCadastro.findUnique.mockResolvedValue({ ...mockCadPublico });
    prisma.db.docCadastro.update.mockResolvedValue({ ...mockCadPublico, visibilidade: 'restrito' });

    await service.atualizarCadastro(CADASTRO_PUB_ID, { visibilidade: 'restrito' }, ATOR_ID);

    expect(menus.removerPorRef).toHaveBeenCalledWith('doc_cadastro', CADASTRO_PUB_ID);
    expect(menus.criarItemAutoRls).not.toHaveBeenCalled();
  });

  it('atualizarCadastro de restrito para publico deve criar menu', async () => {
    prisma.db.docCadastro.findUnique.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docCadastro.update.mockResolvedValue({ ...mockCadRestrito, visibilidade: 'publico' });

    await service.atualizarCadastro(CADASTRO_REST_ID, { visibilidade: 'publico' }, ATOR_ID);

    expect(menus.criarItemAutoRls).toHaveBeenCalled();
    expect(menus.removerPorRef).not.toHaveBeenCalled();
  });

  it('atualizarCadastro com grupoIds deve substituir grupos', async () => {
    prisma.db.docCadastro.findUnique.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docCadastro.update.mockResolvedValue({ ...mockCadRestrito });
    prisma.db.docCadastroGrupo.deleteMany.mockResolvedValue({ count: 1 });
    prisma.db.docCadastroGrupo.createMany.mockResolvedValue({ count: 1 });

    const novoGrupo = 'cccccccc-0000-0000-0000-000000000000';
    await service.atualizarCadastro(CADASTRO_REST_ID, { grupoIds: [novoGrupo] }, ATOR_ID);

    expect(prisma.db.docCadastroGrupo.deleteMany).toHaveBeenCalledWith({ where: { cadastroId: CADASTRO_REST_ID } });
    expect(prisma.db.docCadastroGrupo.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ grupoId: novoGrupo })]) }),
    );
  });
});

// ─── suite D: listarCadastrosAdmin ───────────────────────────────────────────

describe('D) listarCadastrosAdmin', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A, userId: ATOR_ID, role: 'admin_prefeitura' };
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('deve incluir visibilidade e grupoIds no retorno', async () => {
    prisma.db.docCadastro.findMany.mockResolvedValue([
      {
        ...mockCadPublico,
        grupos: [{ grupoId: GRUPO_ID }],
        _count: { documentos: 5, tipos: 3 },
      },
      {
        ...mockCadRestrito,
        grupos: [],
        _count: { documentos: 0, tipos: 0 },
      },
    ]);

    const result = await service.listarCadastrosAdmin();

    expect(result[0].visibilidade).toBe('publico');
    expect(result[0].grupoIds).toEqual([GRUPO_ID]);
    expect(result[1].visibilidade).toBe('restrito');
    expect(result[1].grupoIds).toEqual([]);
    // O array `grupos` cru não deve aparecer
    expect((result[0] as any).grupos).toBeUndefined();
  });
});

// ─── suite E: descendentesTipo (via listarPublico) ───────────────────────────

describe('E) Filtro por descendentes via listarPublico', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A };
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('listarPublico com tipoSlug deve buscar documentos de tipo e descendentes', async () => {
    // Cadastro público
    prisma.db.docCadastro.findFirst.mockResolvedValue({ id: CADASTRO_PUB_ID, visibilidade: 'publico' });
    // Tipo encontrado pelo slug
    prisma.db.docTipo.findFirst.mockResolvedValue({ id: TIPO_PAI_ID });
    // Árvore de tipos: pai → filho → neto
    prisma.db.docTipo.findMany.mockResolvedValue([
      { id: TIPO_PAI_ID, parentId: null },
      { id: TIPO_FILHO_ID, parentId: TIPO_PAI_ID },
      { id: TIPO_NETO_ID, parentId: TIPO_FILHO_ID },
    ]);
    prisma.db.documento.count.mockResolvedValue(0);
    prisma.db.documento.findMany.mockResolvedValue([]);

    await service.listarPublico('leis', { tipoSlug: 'categoria' });

    // O where deve usar tipoId: { in: [...] } com todos os descendentes
    expect(prisma.db.documento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipoId: { in: expect.arrayContaining([TIPO_PAI_ID, TIPO_FILHO_ID, TIPO_NETO_ID]) },
        }),
      }),
    );
  });

  it('listarPublico com tipoSlug inexistente deve não filtrar por tipoId', async () => {
    prisma.db.docCadastro.findFirst.mockResolvedValue({ id: CADASTRO_PUB_ID, visibilidade: 'publico' });
    prisma.db.docTipo.findFirst.mockResolvedValue(null); // slug não encontrado
    prisma.db.documento.count.mockResolvedValue(0);
    prisma.db.documento.findMany.mockResolvedValue([]);

    await service.listarPublico('leis', { tipoSlug: 'inexistente' });

    expect(prisma.db.documento.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.not.objectContaining({ tipoId: expect.anything() }),
      }),
    );
  });
});

// ─── suite F2: reextrairDocumento / reextrairEscaneados ──────────────────────

describe('F2) reextrairDocumento e reextrairEscaneados', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;
  let fila: ReturnType<typeof buildFila>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A, userId: ATOR_ID, role: 'admin_prefeitura' };
    prisma = buildPrisma();
    fila = buildFila();
    service = buildService(prisma, buildMenus(), fila);
  });

  it('reextrairDocumento zera campos e enfileira job com forcar=true', async () => {
    prisma.db.documento.findUnique.mockResolvedValue({ id: 'doc-1', arquivoUrl: 'http://s3/doc.pdf' });
    prisma.db.documento.update.mockResolvedValue({ id: 'doc-1' });

    const resultado = await service.reextrairDocumento('doc-1', ATOR_ID);

    expect(resultado.enfileirado).toBe(true);
    expect(prisma.db.documento.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ conteudoExtraido: null, conteudoIndexadoEm: null }),
      }),
    );
    expect(fila.add).toHaveBeenCalledWith(
      'ia.extrai-texto-documento',
      expect.objectContaining({ documentoId: 'doc-1', forcar: true }),
      expect.any(Object),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ acao: 'DOCUMENTO_REEXTRAIR' }) }),
    );
  });

  it('reextrairDocumento lança NotFoundException se documento não existe', async () => {
    prisma.db.documento.findUnique.mockResolvedValue(null);
    await expect(service.reextrairDocumento('inexistente', ATOR_ID)).rejects.toThrow(NotFoundException);
  });

  it('reextrairDocumento lança BadRequestException se documento sem arquivo', async () => {
    prisma.db.documento.findUnique.mockResolvedValue({ id: 'doc-1', arquivoUrl: null });
    await expect(service.reextrairDocumento('doc-1', ATOR_ID)).rejects.toThrow(BadRequestException);
  });

  it('reextrairEscaneados enfileira documentos sem texto e audita', async () => {
    prisma.tx.mockResolvedValue([{ id: 'doc-scan-1' }, { id: 'doc-scan-2' }]);

    const resultado = await service.reextrairEscaneados();

    expect(resultado.enfileirados).toBe(2);
    expect(fila.add).toHaveBeenCalledTimes(2);
    expect(fila.add).toHaveBeenCalledWith(
      'ia.extrai-texto-documento',
      expect.objectContaining({ documentoId: 'doc-scan-1', forcar: true }),
      expect.any(Object),
    );
    expect(prisma.db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ acao: 'DOCUMENTOS_REEXTRAIR_ESCANEADOS' }),
      }),
    );
  });
});

// ─── suite G: obterDocumentoPublico expõe campos OCR ─────────────────────────

describe('G) obterDocumentoPublico expõe conteudoExtraido e ocrMetodo', () => {
  let service: DocumentosService;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(() => {
    mockCtx = { tenantId: TENANT_A };
    prisma = buildPrisma();
    service = buildService(prisma);
  });

  it('retorna conteudoExtraido e ocrMetodo para documento público', async () => {
    prisma.db.documento.findUnique.mockResolvedValue({
      id: 'doc-pub-1',
      titulo: 'Lei 001',
      numero: '001',
      ano: 2024,
      dataDocumento: null,
      ementa: 'Ementa teste',
      orgao: null,
      situacao: null,
      arquivoUrl: 'http://s3/doc.pdf',
      tags: [],
      downloads: 5,
      ativo: true,
      conteudoExtraido: 'Texto extraído por OCR',
      ocrMetodo: 'tesseract',
      cadastro: { slug: 'leis', nome: 'Leis', visibilidade: 'publico', ativo: true },
      tipo: { nome: 'Lei Ordinária' },
      secretaria: null,
    });

    const resultado = await service.obterDocumentoPublico('doc-pub-1');

    expect(resultado.conteudoExtraido).toBe('Texto extraído por OCR');
    expect(resultado.ocrMetodo).toBe('tesseract');
  });
});

// ─── suite F: isolamento RLS (tenant A não vê dado de tenant B) ───────────────

describe('F) Isolamento RLS — tenant A não acessa dados de tenant B', () => {
  it('o PrismaService usa prisma.db.* e RLS impede vazamento cross-tenant', () => {
    /**
     * Este teste é intencional e documental: o isolamento real é garantido pelo
     * PostgreSQL Row Level Security (policy "tenant_isolation" em cada tabela que
     * filtra por current_setting('app.current_tenant_id')). O PrismaService seta
     * esse GUC antes de cada query via middleware de transação.
     *
     * Aqui verificamos que o DocumentosService *nunca* usa prisma.platform() em
     * operações de leitura pública (que seria cross-tenant) — apenas em helpers de
     * slug e seeding que usam tenantId explícito.
     *
     * O teste de integração completo com dois tenants reais está em:
     *   api/test/documentos-rls.e2e-spec.ts  (container PostGIS na 5433)
     */
    const source = require('fs').readFileSync(
      require('path').join(__dirname, 'documentos.service.ts'),
      'utf-8',
    );

    // Métodos públicos e admin de LEITURA devem usar this.prisma.db (não platform)
    // Verifica que listarCadastros, listarPublico, exportarPublico, registrarDownload,
    // listarCadastrosAdmin, listarTipos usam prisma.db
    expect(source).toContain('this.prisma.db.docCadastro.findMany');
    expect(source).toContain('this.prisma.db.docTipo.findMany');
    expect(source).toContain('this.prisma.db.documento.findMany');

    // platform() só é usado em helpers de slug e semearTenant (cross-tenant explícito)
    const platformCalls = (source.match(/this\.prisma\.platform\(\)/g) ?? []).length;
    expect(platformCalls).toBeGreaterThan(0); // existe (slugUnicoCadastro, semear, migrar)
    // Mas NÃO deve aparecer em métodos de leitura pública
    expect(source).not.toMatch(/listarCadastros[\s\S]{0,200}platform\(\)/);
    expect(source).not.toMatch(/listarPublico[\s\S]{0,200}platform\(\)/);
  });
});
