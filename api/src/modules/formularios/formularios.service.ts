import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { QUEUE_NOTIFICACOES, JOB_NOTIF_EMAIL_RAW } from '../queue/queue.constants';
import { gerarDesafio, validarCaptcha } from './captcha.util';
import { validarEnvio } from './formularios-validacao.util';
import { CAMPO_TIPOS, CampoSchema, AnexoEnvio } from './formularios.types';
import { CriarFormularioDto, AtualizarFormularioDto } from './formularios.dto';
import { validarUploadSeguro } from '../../common/upload/upload-seguranca.util';

// Slugify simples
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Garante slug único por tenant (RLS já filtra pelo tenant ativo no contexto)
async function gerarSlugUnico(
  formularioDb: { findFirst: (args: any) => Promise<any> },
  base: string,
): Promise<string> {
  const slug = slugify(base).slice(0, 80) || 'formulario';
  for (let tentativa = 0; tentativa <= 100; tentativa++) {
    const candidato = tentativa === 0 ? slug : `${slug}-${tentativa}`;
    const existe = await formularioDb.findFirst({
      where: { slug: candidato },
      select: { id: true },
    });
    if (!existe) return candidato;
  }
  return `${slug}-${randomUUID().slice(0, 8)}`;
}

function validarSchema(schema: unknown): CampoSchema[] {
  if (!Array.isArray(schema)) {
    throw new BadRequestException('schema deve ser um array de campos.');
  }
  for (const campo of schema as any[]) {
    if (!campo.tipo || !CAMPO_TIPOS.includes(campo.tipo)) {
      throw new BadRequestException(`Campo com tipo inválido: "${campo.tipo}". Tipos válidos: ${CAMPO_TIPOS.join(', ')}.`);
    }
    if (!campo.nome || typeof campo.nome !== 'string') {
      throw new BadRequestException('Todo campo deve ter um "nome" (string).');
    }
  }
  // Verificar nomes únicos
  const nomes = (schema as CampoSchema[]).map((c) => c.nome);
  const duplicados = nomes.filter((n, i) => nomes.indexOf(n) !== i);
  if (duplicados.length > 0) {
    throw new BadRequestException(`Nomes de campo duplicados: ${duplicados.join(', ')}.`);
  }
  return schema as CampoSchema[];
}

interface UploadedFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const DEFAULT_MAX_MB = 10;

@Injectable()
export class FormulariosService {
  private readonly log = new Logger(FormulariosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    @InjectQueue(QUEUE_NOTIFICACOES) private readonly filaNotif: Queue,
  ) {}

  // ---------------------------------------------------------------- admin CRUD

  async listar(escopoSecretariaId?: string | null) {
    // Escopo null = gestor/servidor sem lotação → lista vazia
    if (escopoSecretariaId === null) return [];

    const where: Record<string, unknown> = {};
    if (escopoSecretariaId !== undefined) where.secretariaId = escopoSecretariaId;

    const rows = await this.prisma.db.formulario.findMany({
      where,
      orderBy: { atualizadoEm: 'desc' },
      select: {
        id: true,
        slug: true,
        titulo: true,
        status: true,
        totalEnvios: true,
        secretariaId: true,
        atualizadoEm: true,
      },
    });
    return rows;
  }

  async criar(dto: CriarFormularioDto, escopoSecretariaId?: string | null) {
    // Escopo null = gestor/servidor sem lotação → 403
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }

    // Escopo uuid = força secretariaId; undefined = respeita dto
    const secretariaId = escopoSecretariaId !== undefined
      ? escopoSecretariaId
      : (dto.secretariaId || null);

    const tenantId = TenantContext.tenantId()!;
    const schema = dto.schema ? validarSchema(dto.schema) : [];
    const slug = await gerarSlugUnico(this.prisma.db.formulario, dto.titulo);
    return this.prisma.db.formulario.create({
      data: {
        tenantId,
        slug,
        titulo: dto.titulo,
        descricao: dto.descricao ?? null,
        schema: schema as any,
        secretariaId,
      },
    });
  }

  async obterPorId(id: string, escopoSecretariaId?: string | null) {
    const form = await this.prisma.db.formulario.findUnique({ where: { id } });
    if (!form) throw new NotFoundException('Formulário não encontrado.');
    // Escopo null = sem lotação
    if (escopoSecretariaId === null) {
      throw new ForbiddenException('Sem secretaria de lotação definida; solicite vínculo de secretaria.');
    }
    // Escopo uuid = só pode acessar formulários da sua secretaria
    if (escopoSecretariaId !== undefined && form.secretariaId !== escopoSecretariaId) {
      throw new ForbiddenException('Acesso negado: formulário pertence a outra secretaria.');
    }
    return form;
  }

  async atualizar(id: string, dto: AtualizarFormularioDto, escopoSecretariaId?: string | null) {
    await this.obterPorId(id, escopoSecretariaId); // verifica existência, RLS e escopo
    const schema = dto.schema !== undefined ? validarSchema(dto.schema) : undefined;

    let secretariaId: string | null | undefined;
    if (dto.secretariaId !== undefined) {
      // Escopo uuid: não pode mover formulário para fora da sua secretaria
      if (escopoSecretariaId !== undefined && dto.secretariaId !== escopoSecretariaId) {
        throw new ForbiddenException('Não é permitido alterar a secretaria para fora do seu escopo.');
      }
      secretariaId = dto.secretariaId || null;
    }

    return this.prisma.db.formulario.update({
      where: { id },
      data: {
        ...(dto.titulo !== undefined && { titulo: dto.titulo }),
        ...(dto.descricao !== undefined && { descricao: dto.descricao }),
        ...(schema !== undefined && { schema: schema as any }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.mensagemConfirmacao !== undefined && { mensagemConfirmacao: dto.mensagemConfirmacao }),
        ...(dto.redirecionarUrl !== undefined && { redirecionarUrl: dto.redirecionarUrl }),
        ...(dto.loginObrigatorio !== undefined && { loginObrigatorio: dto.loginObrigatorio }),
        ...(dto.multiplosEnvios !== undefined && { multiplosEnvios: dto.multiplosEnvios }),
        ...(dto.captchaHabilitado !== undefined && { captchaHabilitado: dto.captchaHabilitado }),
        ...(dto.notificarEmails !== undefined && { notificarEmails: dto.notificarEmails }),
        ...(dto.notificarCc !== undefined && { notificarCc: dto.notificarCc }),
        ...(dto.notificarBcc !== undefined && { notificarBcc: dto.notificarBcc }),
        ...(secretariaId !== undefined && { secretariaId }),
      },
    });
  }

  async remover(id: string, escopoSecretariaId?: string | null) {
    await this.obterPorId(id, escopoSecretariaId); // verifica escopo antes de excluir
    await this.prisma.db.formulario.delete({ where: { id } });
    return { ok: true };
  }

  // ---------------------------------------------------------------- captcha público

  captcha() {
    return gerarDesafio();
  }

  // ---------------------------------------------------------------- público

  async getPublico(slug: string) {
    const form = await this.prisma.db.formulario.findFirst({
      where: { slug, status: 'publicado' },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        schema: true,
        mensagemConfirmacao: true,
        redirecionarUrl: true,
        captchaHabilitado: true,
        loginObrigatorio: true,
      },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado ou não publicado.');
    return form;
  }

  // ---------------------------------------------------------------- enviar

  async enviar(
    slug: string,
    body: Record<string, unknown>,
    files: UploadedFile[],
    ip: string,
    userAgent: string,
  ) {
    files = Array.isArray(files) ? files : []; // sem multipart, o interceptor não popula files
    const tenantId = TenantContext.tenantId()!;
    const userId = TenantContext.get().userId;

    const form = await this.prisma.db.formulario.findFirst({
      where: { slug, status: 'publicado' },
    });
    if (!form) throw new NotFoundException('Formulário não encontrado ou não publicado.');

    const schema = Array.isArray(form.schema) ? (form.schema as unknown as CampoSchema[]) : [];

    // ---- anti-spam ----
    if (form.captchaHabilitado) {
      // 1. Honeypot: _hp deve vir VAZIO → resposta 200 silenciosa
      if (body['_hp'] && String(body['_hp']).length > 0) {
        this.log.warn(`[anti-spam] honeypot ativado: form=${form.id} ip=${ip}`);
        return { ok: true, mensagem: form.mensagemConfirmacao ?? 'Recebido com sucesso.' };
      }

      // 2. Tempo mínimo: _t (epoch ms do render) → < 3000ms → spam silencioso
      const tsRender = Number(body['_t']);
      if (tsRender && Date.now() - tsRender < 3000) {
        this.log.warn(`[anti-spam] tempo mínimo: form=${form.id} ip=${ip}`);
        return { ok: true, mensagem: form.mensagemConfirmacao ?? 'Recebido com sucesso.' };
      }

      // 3. Desafio captcha
      const captchaToken = String(body['_captcha_token'] ?? '');
      const captchaResposta = String(body['_captcha_resposta'] ?? '');
      if (!validarCaptcha(captchaToken, captchaResposta)) {
        throw new BadRequestException('Verificação anti-spam falhou.');
      }
    }

    // ---- login obrigatório ----
    if (form.loginObrigatorio && !userId) {
      throw new UnauthorizedException('Este formulário exige autenticação.');
    }

    // ---- múltiplos envios ----
    if (!form.multiplosEnvios) {
      if (userId) {
        const ja = await this.prisma.db.formularioEnvio.findFirst({
          where: { formularioId: form.id, cidadaoId: userId },
          select: { id: true },
        });
        if (ja) throw new ConflictException('Você já enviou este formulário.');
      } else {
        // anônimo: verifica ip nas últimas 24h
        const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const ja = await this.prisma.db.formularioEnvio.findFirst({
          where: {
            formularioId: form.id,
            ip,
            criadoEm: { gte: desde },
          },
          select: { id: true },
        });
        if (ja) throw new ConflictException('Você já enviou este formulário.');
      }
    }

    // ---- validar campos ----
    // Extrai apenas chaves sem prefixo _
    const dados: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if (!k.startsWith('_')) dados[k] = v;
    }

    const erros = validarEnvio(schema, dados);
    if (erros.length > 0) {
      throw new BadRequestException({ message: 'Dados inválidos.', erros });
    }

    // ---- processar uploads ----
    const anexos: AnexoEnvio[] = [];
    const envioId = randomUUID();

    for (const file of files) {
      // Bloqueia extensões perigosas/scripts ANTES de qualquer outro processamento.
      validarUploadSeguro(file);

      // encontrar o campo upload correspondente
      const campoUpload = schema.find(
        (c) => c.tipo === 'upload' && c.nome === file.fieldname,
      );

      const maxMb = campoUpload?.maxTamanhoMb ?? DEFAULT_MAX_MB;
      const maxBytes = maxMb * 1024 * 1024;

      if (file.size > maxBytes) {
        throw new BadRequestException(
          `Arquivo "${file.originalname}" excede o limite de ${maxMb}MB.`,
        );
      }

      // validar accept se configurado
      if (campoUpload?.accept) {
        const tiposAceitos = campoUpload.accept.split(',').map((t) => t.trim());
        const mimeOk = tiposAceitos.some((t) => {
          if (t.endsWith('/*')) return file.mimetype.startsWith(t.slice(0, -1));
          return t === file.mimetype;
        });
        if (!mimeOk) {
          throw new BadRequestException(
            `Tipo de arquivo não permitido: "${file.originalname}" (${file.mimetype}).`,
          );
        }
      }

      const prefixo = `formularios/${form.id}/${envioId}`;
      const key = await this.storage.put(
        prefixo,
        file.buffer,
        file.mimetype,
      );

      anexos.push({
        campo: file.fieldname,
        nome: file.originalname.slice(0, 200),
        mime: file.mimetype,
        storageKey: key,
        tamanho: file.size,
      });

      // registra o storageKey nos dados para referência
      dados[file.fieldname] = { storageKey: key, nome: file.originalname };
    }

    // ---- gravar envio + incrementar totalEnvios (transação) ----
    await this.prisma.tx(async (tx) => {
      await tx.formularioEnvio.create({
        data: {
          id: envioId,
          tenantId,
          formularioId: form.id,
          dados: dados as any,
          anexos: anexos as any,
          cidadaoId: userId ?? null,
          ip,
          userAgent: userAgent.slice(0, 500),
        },
      });
      await tx.formulario.update({
        where: { id: form.id },
        data: { totalEnvios: { increment: 1 } },
      });
    });

    // ---- notificação (best-effort) ----
    if (form.notificarEmails?.length) {
      const campos = schema.filter((c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo');
      const resumo = campos
        .map((c) => `${c.label}: ${dados[c.nome] ?? ''}`)
        .join('\n');

      const payload = {
        tenantId,
        assunto: `Novo envio: ${form.titulo}`,
        destinatarios: form.notificarEmails,
        cc: form.notificarCc ?? [],
        bcc: form.notificarBcc ?? [],
        corpo: `Novo envio recebido no formulário "${form.titulo}".\n\n${resumo}\n\nEnviado em: ${new Date().toISOString()}`,
        formularioId: form.id,
        envioId,
        anexos: anexos.map((a) => ({ nome: a.nome, storageKey: a.storageKey })),
      };

      try {
        await this.filaNotif.add(
          JOB_NOTIF_EMAIL_RAW,
          payload,
          {
            jobId: `form-envio-${envioId}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: 100,
            removeOnFail: 500,
          },
        );
      } catch (err) {
        // best-effort: não falha o envio do cidadão
        this.log.warn(`Falha ao enfileirar notificação do envio ${envioId}: ${(err as Error).message}`);
      }
    }

    return { ok: true, mensagem: form.mensagemConfirmacao ?? 'Recebido com sucesso.' };
  }

  // ---------------------------------------------------------------- admin envios

  async listarEnvios(
    formularioId: string,
    opts: {
      q?: string;
      de?: string;
      ate?: string;
      page?: number;
      pageSize?: number;
    },
    escopoSecretariaId?: string | null,
  ) {
    await this.obterPorId(formularioId, escopoSecretariaId);

    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const where: Prisma.FormularioEnvioWhereInput = { formularioId };
    if (opts.de || opts.ate) {
      where.criadoEm = {
        ...(opts.de && { gte: new Date(opts.de) }),
        ...(opts.ate && { lte: new Date(opts.ate) }),
      };
    }

    // Quando há filtro textual, buscamos todos os registros do período e
    // filtramos em memória via JSON.stringify (jsonb → text ILIKE).
    // Adequado para painéis admin onde o volume de envios por formulário é controlado.
    if (opts.q) {
      const todos = await this.prisma.db.formularioEnvio.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        include: { cidadao: { select: { id: true, nome: true } } },
      });
      const q = opts.q.toLowerCase();
      const filtrados = todos.filter((e) =>
        JSON.stringify(e.dados).toLowerCase().includes(q),
      );
      const paginados = filtrados.slice(skip, skip + pageSize);
      return {
        total: filtrados.length,
        page,
        pageSize,
        items: paginados.map((e) => ({
          ...e,
          temAnexos: Array.isArray(e.anexos) && (e.anexos as any[]).length > 0,
        })),
      };
    }

    const [total, items] = await Promise.all([
      this.prisma.db.formularioEnvio.count({ where }),
      this.prisma.db.formularioEnvio.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        skip,
        take: pageSize,
        include: {
          cidadao: { select: { id: true, nome: true } },
        },
      }),
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((e) => ({
        ...e,
        temAnexos: Array.isArray(e.anexos) && (e.anexos as any[]).length > 0,
      })),
    };
  }

  async obterEnvio(formularioId: string, envioId: string, escopoSecretariaId?: string | null) {
    await this.obterPorId(formularioId, escopoSecretariaId);
    const envio = await this.prisma.db.formularioEnvio.findFirst({
      where: { id: envioId, formularioId },
      include: { cidadao: { select: { id: true, nome: true } } },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado.');
    return envio;
  }

  async atualizarEnvio(formularioId: string, envioId: string, dto: { lido?: boolean }, escopoSecretariaId?: string | null) {
    await this.obterEnvio(formularioId, envioId, escopoSecretariaId);
    return this.prisma.db.formularioEnvio.update({
      where: { id: envioId },
      data: { ...(dto.lido !== undefined && { lido: dto.lido }) },
    });
  }

  async removerEnvio(formularioId: string, envioId: string, escopoSecretariaId?: string | null) {
    await this.obterEnvio(formularioId, envioId, escopoSecretariaId);
    await this.prisma.db.formularioEnvio.delete({ where: { id: envioId } });
    await this.prisma.db.formulario.update({
      where: { id: formularioId },
      data: { totalEnvios: { decrement: 1 } },
    });
    return { ok: true };
  }

  async listarEnviosParaExport(
    formularioId: string,
    opts: { q?: string; de?: string; ate?: string },
    escopoSecretariaId?: string | null,
  ) {
    await this.obterPorId(formularioId, escopoSecretariaId);
    const where: Prisma.FormularioEnvioWhereInput = { formularioId };
    if (opts.de || opts.ate) {
      where.criadoEm = {
        ...(opts.de && { gte: new Date(opts.de) }),
        ...(opts.ate && { lte: new Date(opts.ate) }),
      };
    }
    const todos = await this.prisma.db.formularioEnvio.findMany({
      where,
      orderBy: { criadoEm: 'desc' },
    });
    if (!opts.q) return todos;
    const q = opts.q.toLowerCase();
    return todos.filter((e) => JSON.stringify(e.dados).toLowerCase().includes(q));
  }

  // ---------------------------------------------------------------- anexo download

  async getAnexo(envioId: string, idx: number) {
    const envio = await this.prisma.db.formularioEnvio.findUnique({
      where: { id: envioId },
    });
    if (!envio) throw new NotFoundException('Envio não encontrado.');

    const anexos = Array.isArray(envio.anexos) ? (envio.anexos as unknown as AnexoEnvio[]) : [];
    const anexo = anexos[idx];
    if (!anexo) throw new NotFoundException(`Anexo ${idx} não encontrado.`);

    const obj = await this.storage.get(anexo.storageKey);
    return { buffer: obj.buffer, mime: obj.mime || anexo.mime, nome: anexo.nome };
  }
}
