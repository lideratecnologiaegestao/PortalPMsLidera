/**
 * Unit tests — FormulariosService
 *
 * Cobre:
 *  A) validarSchema: tipos válidos/inválidos, nomes duplicados, campos obrigatórios
 *  B) validarEnvio: campos obrigatórios, formatos (email/cpf/telefone/numero), select/radio, regex, minLength/maxLength
 *  C) captcha: gerarDesafio + validarCaptcha (ok, expirado, assinatura errada, resposta errada)
 *  D) getPublico: 404 se não publicado
 *  E) criar: gera slug único por tenant
 *  F) enviar: anti-spam (honeypot, tempo mínimo, captcha), login obrigatório, múltiplos envios
 *  G) isolamento RLS (documental): service usa this.prisma.db (nunca platform() em leitura)
 */

import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { FormulariosService } from './formularios.service';
import { gerarDesafio, validarCaptcha } from './captcha.util';
import { validarEnvio } from './formularios-validacao.util';

// ─── fixtures ────────────────────────────────────────────────────────────────

const TENANT_A = 'aaaaaaaa-0000-0000-0000-000000000000';
const TENANT_B = 'bbbbbbbb-0000-0000-0000-000000000000';
const FORM_ID = 'form-0000-0000-0000-000000000000';
const ENVIO_ID = 'envio-000-0000-0000-000000000000';
const USER_ID = 'user-0000-0000-0000-000000000000';

const schemaBasico = [
  { id: '1', tipo: 'texto', nome: 'nome', label: 'Nome', obrigatorio: true, largura: 'full' as const },
  { id: '2', tipo: 'email', nome: 'email', label: 'E-mail', obrigatorio: false, largura: 'full' as const },
  { id: '3', tipo: 'cpf', nome: 'cpf', label: 'CPF', obrigatorio: false, largura: 'half' as const },
  { id: '4', tipo: 'select', nome: 'uf', label: 'UF', obrigatorio: false, largura: 'half' as const,
    opcoes: [{ label: 'MT', valor: 'MT' }, { label: 'SP', valor: 'SP' }] },
];

const mockForm = {
  id: FORM_ID,
  tenantId: TENANT_A,
  slug: 'contato',
  titulo: 'Contato',
  descricao: null,
  schema: schemaBasico,
  status: 'publicado',
  mensagemConfirmacao: 'Obrigado!',
  redirecionarUrl: null,
  loginObrigatorio: false,
  multiplosEnvios: true,
  captchaHabilitado: false,
  notificarEmails: [],
  notificarCc: [],
  notificarBcc: [],
  totalEnvios: 0,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

// ─── mock TenantContext ───────────────────────────────────────────────────────

let mockCtx: { tenantId?: string; userId?: string; role?: string } = { tenantId: TENANT_A };

jest.mock('../../common/tenant/tenant.context', () => ({
  TenantContext: {
    get: () => mockCtx,
    tenantId: () => mockCtx.tenantId,
  },
}));

// ─── builders de mocks ────────────────────────────────────────────────────────

const buildPrisma = () => ({
  db: {
    formulario: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    formularioEnvio: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  },
  tx: jest.fn(),
});

const buildStorage = () => ({
  put: jest.fn().mockResolvedValue('formularios/test/key.jpg'),
  get: jest.fn(),
});

const buildFila = () => ({
  add: jest.fn().mockResolvedValue(undefined),
});

const buildService = (
  prisma = buildPrisma(),
  storage = buildStorage(),
  fila = buildFila(),
) => new FormulariosService(prisma as any, storage as any, fila as any);

// ─── suite A: validarSchema ───────────────────────────────────────────────────

describe('A) validarSchema (via criar)', () => {
  it('deve aceitar schema vazio []', async () => {
    const prisma = buildPrisma();
    prisma.db.formulario.findFirst.mockResolvedValue(null); // slug livre
    prisma.db.formulario.create.mockResolvedValue({ ...mockForm, schema: [] });
    mockCtx = { tenantId: TENANT_A };

    const service = buildService(prisma);
    await expect(service.criar({ titulo: 'Teste', schema: [] })).resolves.toBeDefined();
  });

  it('deve lançar BadRequestException para schema não-array', async () => {
    const service = buildService();
    mockCtx = { tenantId: TENANT_A };
    await expect(service.criar({ titulo: 'X', schema: { tipo: 'texto' } }))
      .rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException para campo sem nome', async () => {
    const service = buildService();
    mockCtx = { tenantId: TENANT_A };
    await expect(service.criar({ titulo: 'X', schema: [{ tipo: 'texto', label: 'X' }] }))
      .rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException para tipo inválido', async () => {
    const service = buildService();
    mockCtx = { tenantId: TENANT_A };
    await expect(service.criar({ titulo: 'X', schema: [{ tipo: 'invalido', nome: 'x', label: 'X' }] }))
      .rejects.toThrow(BadRequestException);
  });

  it('deve lançar BadRequestException para nomes duplicados', async () => {
    const service = buildService();
    mockCtx = { tenantId: TENANT_A };
    await expect(service.criar({ titulo: 'X', schema: [
      { tipo: 'texto', nome: 'campo', label: 'A', obrigatorio: false, largura: 'full' },
      { tipo: 'email', nome: 'campo', label: 'B', obrigatorio: false, largura: 'full' },
    ]})).rejects.toThrow(BadRequestException);
  });
});

// ─── suite B: validarEnvio ────────────────────────────────────────────────────

describe('B) validarEnvio', () => {
  it('campo obrigatorio vazio → erro', () => {
    const erros = validarEnvio(schemaBasico, { email: '' });
    expect(erros.some((e) => e.campo === 'nome')).toBe(true);
  });

  it('campo obrigatorio preenchido → sem erro para ele', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João' });
    expect(erros.some((e) => e.campo === 'nome')).toBe(false);
  });

  it('email inválido → erro', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João', email: 'nao-e-email' });
    expect(erros.some((e) => e.campo === 'email')).toBe(true);
  });

  it('email válido → sem erro', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João', email: 'a@b.com' });
    expect(erros.some((e) => e.campo === 'email')).toBe(false);
  });

  it('CPF inválido (dígitos errados) → erro', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João', cpf: '000.000.000-00' });
    expect(erros.some((e) => e.campo === 'cpf')).toBe(true);
  });

  it('CPF válido (real) → sem erro', () => {
    // CPF de teste válido: 529.982.247-25
    const erros = validarEnvio(schemaBasico, { nome: 'João', cpf: '529.982.247-25' });
    expect(erros.some((e) => e.campo === 'cpf')).toBe(false);
  });

  it('select com valor fora das opcoes → erro', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João', uf: 'XX' });
    expect(erros.some((e) => e.campo === 'uf')).toBe(true);
  });

  it('select com valor válido → sem erro', () => {
    const erros = validarEnvio(schemaBasico, { nome: 'João', uf: 'MT' });
    expect(erros.some((e) => e.campo === 'uf')).toBe(false);
  });

  it('minLength/maxLength respeitados', () => {
    const schema = [
      { id: '1', tipo: 'texto' as const, nome: 'bio', label: 'Bio', obrigatorio: false, largura: 'full' as const,
        validacao: { minLength: 10, maxLength: 20 } },
    ];
    const curtoDemais = validarEnvio(schema, { bio: 'abc' });
    expect(curtoDemais.some((e) => e.campo === 'bio')).toBe(true);

    const ok = validarEnvio(schema, { bio: 'Ola mundo xyz' });
    expect(ok.some((e) => e.campo === 'bio')).toBe(false);
  });

  it('regex customizada válida → sem erro', () => {
    const schema = [
      { id: '1', tipo: 'texto' as const, nome: 'cep', label: 'CEP', obrigatorio: false, largura: 'full' as const,
        validacao: { regex: '^\\d{5}-\\d{3}$' } },
    ];
    const erros = validarEnvio(schema, { cep: '78000-000' });
    expect(erros.some((e) => e.campo === 'cep')).toBe(false);
  });

  it('regex inválida → não lança exceção (ignora)', () => {
    const schema = [
      { id: '1', tipo: 'texto' as const, nome: 'cep', label: 'CEP', obrigatorio: false, largura: 'full' as const,
        validacao: { regex: '[invalida(' } },
    ];
    expect(() => validarEnvio(schema, { cep: 'qualquer' })).not.toThrow();
  });

  it('campos secao/paragrafo ignorados na validação', () => {
    const schema = [
      { id: '1', tipo: 'secao' as const, nome: 'sec', label: 'Seção', obrigatorio: false, largura: 'full' as const },
      { id: '2', tipo: 'paragrafo' as const, nome: 'par', label: 'Parágrafo', obrigatorio: true, largura: 'full' as const },
    ];
    const erros = validarEnvio(schema, {});
    expect(erros).toHaveLength(0);
  });
});

// ─── suite C: captcha ─────────────────────────────────────────────────────────

describe('C) captcha.util', () => {
  it('gerarDesafio retorna token e pergunta', () => {
    const { token, pergunta } = gerarDesafio();
    expect(token).toBeTruthy();
    expect(pergunta).toMatch(/Quanto é \d+ \+ \d+/);
  });

  it('validarCaptcha com resposta correta → true', () => {
    // Extrai a resposta do payload do token
    const { token } = gerarDesafio();
    const [payload] = token.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    expect(validarCaptcha(token, data.r)).toBe(true);
  });

  it('validarCaptcha com resposta errada → false', () => {
    const { token } = gerarDesafio();
    const [payload] = token.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    expect(validarCaptcha(token, data.r + 1)).toBe(false);
  });

  it('validarCaptcha com assinatura adulterada → false', () => {
    const { token } = gerarDesafio();
    const [payload, sig] = token.split('.');
    const tampered = `${payload}.${sig.slice(0, -4)}XXXX`;
    const [p] = token.split('.');
    const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
    expect(validarCaptcha(tampered, data.r)).toBe(false);
  });

  it('validarCaptcha com token expirado → false', () => {
    // Monta token com exp no passado
    const r = 7;
    const exp = Date.now() - 1000; // 1 segundo no passado
    const payload = Buffer.from(JSON.stringify({ r, exp })).toString('base64url');
    const { createHmac } = require('crypto');
    const secret = process.env.CAPTCHA_SECRET ?? process.env.AUTH_JWT_SECRET ?? 'dev-secret';
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${payload}.${sig}`;
    expect(validarCaptcha(token, r)).toBe(false);
  });

  it('validarCaptcha com token malformado → false', () => {
    expect(validarCaptcha('nao-e-token', 5)).toBe(false);
  });
});

// ─── suite D: getPublico ──────────────────────────────────────────────────────

describe('D) getPublico', () => {
  it('lança NotFoundException se formulário não existe ou não publicado', async () => {
    const prisma = buildPrisma();
    prisma.db.formulario.findFirst.mockResolvedValue(null);
    mockCtx = { tenantId: TENANT_A };
    const service = buildService(prisma);

    await expect(service.getPublico('slug-inexistente')).rejects.toThrow(NotFoundException);
  });

  it('retorna dados se publicado', async () => {
    const prisma = buildPrisma();
    prisma.db.formulario.findFirst.mockResolvedValue({
      id: FORM_ID, titulo: 'Contato', descricao: null, schema: schemaBasico,
      mensagemConfirmacao: 'Obrigado!', captchaHabilitado: false, loginObrigatorio: false,
    });
    mockCtx = { tenantId: TENANT_A };
    const service = buildService(prisma);

    const result = await service.getPublico('contato');
    expect(result.titulo).toBe('Contato');
  });
});

// ─── suite E: criar (slug único) ─────────────────────────────────────────────

describe('E) criar — slug único por tenant', () => {
  it('gera slug a partir do título', async () => {
    const prisma = buildPrisma();
    // Primeira tentativa livre
    prisma.db.formulario.findFirst.mockResolvedValue(null);
    prisma.db.formulario.create.mockResolvedValue({ ...mockForm, slug: 'formulario-de-contato' });
    mockCtx = { tenantId: TENANT_A };
    const service = buildService(prisma);

    await service.criar({ titulo: 'Formulário de Contato' });
    expect(prisma.db.formulario.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ slug: expect.stringMatching(/formulario-de-contato/) }) }),
    );
  });

  it('adiciona sufixo numérico se slug já existe', async () => {
    const prisma = buildPrisma();
    // Primeiro retorno: slug ocupado; segundo: livre
    prisma.db.formulario.findFirst
      .mockResolvedValueOnce({ id: 'outro-id' }) // 'contato' ocupado
      .mockResolvedValueOnce(null);              // 'contato-1' livre
    prisma.db.formulario.create.mockResolvedValue({ ...mockForm, slug: 'contato-1' });
    mockCtx = { tenantId: TENANT_A };
    const service = buildService(prisma);

    await service.criar({ titulo: 'Contato' });
    const callArgs = prisma.db.formulario.create.mock.calls[0][0];
    expect(callArgs.data.slug).toBe('contato-1');
  });
});

// ─── suite F: enviar — anti-spam e regras de negócio ─────────────────────────

describe('F) enviar', () => {
  let prisma: ReturnType<typeof buildPrisma>;
  let storage: ReturnType<typeof buildStorage>;
  let fila: ReturnType<typeof buildFila>;
  let service: FormulariosService;

  beforeEach(() => {
    prisma = buildPrisma();
    storage = buildStorage();
    fila = buildFila();
    mockCtx = { tenantId: TENANT_A };
    service = buildService(prisma, storage, fila);
    // form publicado sem captcha por padrão
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, captchaHabilitado: false });
    prisma.tx.mockImplementation(async (fn: any) => fn({
      formularioEnvio: { create: jest.fn().mockResolvedValue({ id: ENVIO_ID }) },
      formulario: { update: jest.fn().mockResolvedValue({}) },
    }));
  });

  it('404 se formulário não publicado', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue(null);
    await expect(service.enviar('inexistente', {}, [], '', '')).rejects.toThrow(NotFoundException);
  });

  it('anti-spam: honeypot preenchido → 200 silencioso (não grava)', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, captchaHabilitado: true });
    const result = await service.enviar('contato', { _hp: 'bot', nome: 'X' }, [], '1.1.1.1', 'bot');
    expect(result.ok).toBe(true);
    // tx NÃO foi chamado
    expect(prisma.tx).not.toHaveBeenCalled();
  });

  it('anti-spam: tempo mínimo (< 3s) → 200 silencioso', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, captchaHabilitado: true });
    const tsAgora = Date.now(); // render agora = menos de 3s
    const result = await service.enviar('contato', { _t: String(tsAgora), nome: 'X' }, [], '1.1.1.1', 'ua');
    expect(result.ok).toBe(true);
    expect(prisma.tx).not.toHaveBeenCalled();
  });

  it('anti-spam: captcha inválido → BadRequestException', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, captchaHabilitado: true });
    await expect(
      service.enviar('contato', { _captcha_token: 'invalido', _captcha_resposta: '5', nome: 'X' }, [], '1.1.1.1', 'ua'),
    ).rejects.toThrow(BadRequestException);
  });

  it('anti-spam: captcha válido → grava normalmente', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, captchaHabilitado: true });
    const { token } = gerarDesafio();
    const [payload] = token.split('.');
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));

    const result = await service.enviar(
      'contato',
      { _t: String(Date.now() - 5000), _captcha_token: token, _captcha_resposta: String(data.r), nome: 'João' },
      [], '1.1.1.1', 'ua',
    );
    expect(result.ok).toBe(true);
    expect(prisma.tx).toHaveBeenCalled();
  });

  it('loginObrigatorio sem userId → UnauthorizedException', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, loginObrigatorio: true });
    mockCtx = { tenantId: TENANT_A }; // sem userId
    await expect(service.enviar('contato', { nome: 'X' }, [], '', '')).rejects.toThrow(UnauthorizedException);
  });

  it('multiplosEnvios=false: 409 se cidadão já enviou (autenticado)', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, multiplosEnvios: false });
    prisma.db.formularioEnvio.findFirst.mockResolvedValue({ id: ENVIO_ID });
    mockCtx = { tenantId: TENANT_A, userId: USER_ID };
    await expect(service.enviar('contato', { nome: 'X' }, [], '', '')).rejects.toThrow(ConflictException);
  });

  it('multiplosEnvios=false: 409 se anônimo já enviou (ip nas últimas 24h)', async () => {
    prisma.db.formulario.findFirst.mockResolvedValue({ ...mockForm, multiplosEnvios: false });
    prisma.db.formularioEnvio.findFirst.mockResolvedValue({ id: ENVIO_ID });
    mockCtx = { tenantId: TENANT_A }; // sem userId
    await expect(service.enviar('contato', { nome: 'X' }, [], '2.2.2.2', 'ua')).rejects.toThrow(ConflictException);
  });

  it('campo obrigatorio ausente → BadRequestException com erros', async () => {
    // schema tem 'nome' obrigatório
    await expect(service.enviar('contato', {}, [], '', '')).rejects.toThrow(BadRequestException);
  });

  it('envio válido → { ok: true, mensagem }', async () => {
    const result = await service.enviar('contato', { nome: 'João' }, [], '1.1.1.1', 'browser');
    expect(result.ok).toBe(true);
    expect(result.mensagem).toBe('Obrigado!');
    expect(prisma.tx).toHaveBeenCalled();
  });
});

// ─── suite G: isolamento RLS (documental) ────────────────────────────────────

describe('G) Isolamento RLS — service usa prisma.db (nunca platform() em leitura)', () => {
  it('service utiliza this.prisma.db.formulario e nunca platform() em operações de tenant', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(
      path.join(__dirname, 'formularios.service.ts'),
      'utf-8',
    );

    // Operações de dados devem usar this.prisma.db.*
    expect(source).toContain('this.prisma.db.formulario');
    expect(source).toContain('this.prisma.db.formularioEnvio');

    // platform() não deve aparecer (sem operação cross-tenant justificada no service)
    expect(source).not.toContain('this.prisma.platform()');
  });
});
