import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PerfilService } from './perfil.service';
import { hashSenha } from './password';

// ──────────────────────────────────────────────────────────────────────────────
// Helpers / stubs
// ──────────────────────────────────────────────────────────────────────────────

/** Cria um stub de PrismaService configurável por teste. */
function makePrismaStub(overrides: Partial<{
  userFindUnique: jest.Mock;
  userUpdate: jest.Mock;
  auditLogCreate: jest.Mock;
}> = {}) {
  const userFindUnique = overrides.userFindUnique ?? jest.fn();
  const userUpdate = overrides.userUpdate ?? jest.fn();
  const auditLogCreate = overrides.auditLogCreate ?? jest.fn().mockResolvedValue({});

  return {
    db: {
      user: { findUnique: userFindUnique, update: userUpdate },
      auditLog: { create: auditLogCreate },
    },
  } as any;
}

// ──────────────────────────────────────────────────────────────────────────────
// TenantContext stub (AsyncLocalStorage não funciona em testes isolados)
// ──────────────────────────────────────────────────────────────────────────────
jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    tenantId: () => 'tenant-abc',
    get: () => ({ tenantId: 'tenant-abc' }),
  },
}));

// ──────────────────────────────────────────────────────────────────────────────
// Fixture de usuário
// ──────────────────────────────────────────────────────────────────────────────
const USER_ID = 'user-uuid-1';
const SENHA_CORRETA = 'Senha@Forte123';

function makeUser(extras: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    nome: 'João Silva',
    email: 'joao@prefeitura.gov.br',
    role: 'servidor',
    mfaHabilitado: false,
    govbrNivel: null,
    senhaHash: hashSenha(SENHA_CORRETA),
    ...extras,
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// GET /perfil
// ──────────────────────────────────────────────────────────────────────────────
describe('PerfilService.obter', () => {
  it('retorna o perfil do usuário com os campos corretos', async () => {
    const user = makeUser();
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
    });
    const service = new PerfilService(prisma);

    const result = await service.obter(USER_ID);

    expect(result).toEqual({
      id: USER_ID,
      nome: 'João Silva',
      email: 'joao@prefeitura.gov.br',
      role: 'servidor',
      mfaHabilitado: false,
      govbrNivel: null,
    });
  });

  it('lança NotFoundException se o usuário não existir (RLS bloqueou)', async () => {
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(null),
    });
    const service = new PerfilService(prisma);

    await expect(service.obter(USER_ID)).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /perfil — troca de senha
// ──────────────────────────────────────────────────────────────────────────────
describe('PerfilService.atualizar — troca de senha', () => {
  it('aceita nova senha quando senhaAtual está correta', async () => {
    const user = makeUser();
    const userUpdate = jest.fn().mockResolvedValue({
      ...user,
      senhaHash: undefined, // update retorna sem senhaHash (select não inclui)
    });
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate,
    });
    const service = new PerfilService(prisma);

    const result = await service.atualizar(USER_ID, {
      senhaAtual: SENHA_CORRETA,
      novaSenha: 'NovaSenha@456',
    });

    // update foi chamado e recebeu um senhaHash novo
    expect(userUpdate).toHaveBeenCalledTimes(1);
    const updateData = userUpdate.mock.calls[0][0].data;
    expect(typeof updateData.senhaHash).toBe('string');
    expect(updateData.senhaHash).toContain(':'); // formato salt:dk

    // resultado tem o shape correto
    expect(result).toMatchObject({ id: USER_ID, role: 'servidor' });
  });

  it('lança UnauthorizedException quando senhaAtual está incorreta', async () => {
    const user = makeUser();
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
    });
    const service = new PerfilService(prisma);

    await expect(
      service.atualizar(USER_ID, {
        senhaAtual: 'SenhaErrada!',
        novaSenha: 'NovaSenha@456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('lança BadRequestException quando novaSenha é enviada sem senhaAtual', async () => {
    const user = makeUser();
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
    });
    const service = new PerfilService(prisma);

    await expect(
      service.atualizar(USER_ID, {
        novaSenha: 'NovaSenha@456',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('não altera senha quando novaSenha não é enviada', async () => {
    const user = makeUser();
    const userUpdate = jest.fn().mockResolvedValue({ ...user });
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate,
    });
    const service = new PerfilService(prisma);

    await service.atualizar(USER_ID, { nome: 'Novo Nome' });

    const updateData = userUpdate.mock.calls[0][0].data;
    expect(updateData.senhaHash).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// PATCH /perfil — atualização de nome e e-mail
// ──────────────────────────────────────────────────────────────────────────────
describe('PerfilService.atualizar — nome e e-mail', () => {
  it('atualiza nome e registra auditoria', async () => {
    const user = makeUser();
    const updatedUser = { ...user, nome: 'José Souza' };
    const auditLogCreate = jest.fn().mockResolvedValue({});
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate: jest.fn().mockResolvedValue(updatedUser),
      auditLogCreate,
    });
    const service = new PerfilService(prisma);

    const result = await service.atualizar(USER_ID, { nome: 'José Souza' });

    expect(result.nome).toBe('José Souza');
    expect(auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          acao: 'PERFIL_ATUALIZADO',
          entidade: 'user',
          entidadeId: USER_ID,
          dados: { campos: ['nome'] },
        }),
      }),
    );
  });

  it('lança ConflictException se e-mail já existe no tenant (P2002)', async () => {
    const user = makeUser();
    const p2002 = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate: jest.fn().mockRejectedValue(p2002),
    });
    const service = new PerfilService(prisma);

    await expect(
      service.atualizar(USER_ID, { email: 'outro@prefeitura.gov.br' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('não chama update nem auditoria quando nada mudou', async () => {
    const user = makeUser();
    const userUpdate = jest.fn();
    const auditLogCreate = jest.fn();
    const prisma = makePrismaStub({
      // segunda chamada (dentro de obter()) retorna o mesmo usuário
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate,
      auditLogCreate,
    });
    const service = new PerfilService(prisma);

    // nome e e-mail idênticos → nada a alterar
    await service.atualizar(USER_ID, {
      nome: user.nome,
      email: user.email,
    });

    expect(userUpdate).not.toHaveBeenCalled();
    expect(auditLogCreate).not.toHaveBeenCalled();
  });

  it('auditoria inclui todos os campos alterados', async () => {
    const user = makeUser();
    const updatedUser = { ...user, nome: 'Novo', email: 'novo@pref.gov.br' };
    const auditLogCreate = jest.fn().mockResolvedValue({});
    const prisma = makePrismaStub({
      userFindUnique: jest.fn().mockResolvedValue(user),
      userUpdate: jest.fn().mockResolvedValue(updatedUser),
      auditLogCreate,
    });
    const service = new PerfilService(prisma);

    await service.atualizar(USER_ID, {
      nome: 'Novo',
      email: 'novo@pref.gov.br',
      senhaAtual: SENHA_CORRETA,
      novaSenha: 'OutraSenha@789',
    });

    const dados = auditLogCreate.mock.calls[0][0].data.dados;
    expect(dados.campos).toEqual(expect.arrayContaining(['nome', 'email', 'senha']));
    expect(dados.campos).toHaveLength(3);
  });
});
