import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { StorageService } from '../storage/storage.service';
import { CertificadoPdfService } from './certificado-pdf.service';
import { SignatureService } from '../diario/signature.service';
import { CertificadoDigitalService } from '../certificado-digital/certificado-digital.service';
import {
  AtualizarAulaDto,
  AtualizarCursoDto,
  AtualizarModuloDto,
  AtualizarProvaDto,
  AtualizarTemplateDto,
  CorrigirTentativaDto,
  CriarAulaDto,
  CriarCursoDto,
  CriarModuloDto,
  CriarProvaDto,
  CriarTemplateDto,
  DuvidaDto,
  FeedbackDto,
  PaginaTemplateDto,
  RespostaDuvidaDto,
  SubmeterProvaDto,
  TipoCertificadoDto,
} from './escola.dto';

/** Slug URL-safe (minúsculo, sem acento, hífens). Mesmo padrão de parlamentar. */
function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dateOrNull(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new BadRequestException('Data inválida.');
  return d;
}

/** Código público de certificado: 4 grupos de 4 (ex.: A1B2-C3D4-E5F6-G7H8). */
function gerarCodigo(): string {
  const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const raw = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alfa[raw[i] % alfa.length];
  }
  return out;
}

@Injectable()
export class EscolaService {
  private readonly logger = new Logger(EscolaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly certificadoPdf: CertificadoPdfService,
    private readonly signature: SignatureService,
    private readonly certificado: CertificadoDigitalService,
  ) {}

  /** Hash canônico (SHA-256) dos campos autoritativos do certificado de curso. */
  private hashCertificado(c: {
    codigo: string;
    nomeAluno: string;
    tituloCurso: string;
    cargaHoraria: number | null;
    dataConclusao: Date | null;
    cpf: string | null;
    emitidoEm: Date;
  }): string {
    const canonical = [
      c.codigo,
      c.nomeAluno,
      c.tituloCurso,
      c.cargaHoraria ?? '',
      // date-only: data_conclusao é coluna @db.Date (trunca hora) — normaliza os dois
      // lados (emissão e validação) para o mesmo string, senão o hash nunca confere.
      c.dataConclusao ? c.dataConclusao.toISOString().slice(0, 10) : '',
      c.cpf ?? '',
      c.emitidoEm.toISOString(),
    ].join('|');
    return createHash('sha256').update(canonical).digest('hex');
  }

  // ===================================================== Cursos (público)
  listarPublicos() {
    return this.prisma.db.curso.findMany({
      where: { publicado: true, status: 'publicado' },
      orderBy: [{ ordem: 'asc' }, { titulo: 'asc' }],
      select: {
        id: true, titulo: true, slug: true, resumo: true, capaUrl: true,
        cargaHoraria: true, inicioEm: true, fimEm: true, certificacao: true,
      },
    });
  }

  async cursoPublicoPorSlug(slugOrId: string) {
    const c = await this.prisma.db.curso.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }], publicado: true },
      include: {
        modulos: {
          orderBy: { ordem: 'asc' },
          include: {
            aulas: {
              orderBy: { ordem: 'asc' },
              select: { id: true, titulo: true, duracaoMin: true, ordem: true },
            },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Curso não encontrado.');
    return c;
  }

  // ============================================ Validação pública de certificado
  async validarCertificado(codigo: string) {
    // RLS não bloqueia leitura por código (índice único global); usa platform()
    // para resolver cross-tenant sem expor dados sensíveis (snapshot mínimo).
    const cert = await this.prisma.platform().cursoCertificado.findUnique({
      where: { codigo },
      select: {
        tenantId: true, codigo: true, nomeAluno: true, tituloCurso: true,
        cargaHoraria: true, dataConclusao: true, cpf: true, emitidoEm: true,
        hash: true, assinatura: true, algoritmo: true, carimboTempo: true, assinaturaSerie: true,
      },
    });
    if (!cert) return { valido: false };

    // Verificação criptográfica da assinatura (quando o certificado foi assinado).
    type Situacao = 'nao_assinado' | 'confere' | 'nao_confere' | 'certificado_renovado' | 'sem_certificado_atual';
    let assinatura = {
      assinado: false,
      confere: false,
      situacao: 'nao_assinado' as Situacao,
      algoritmo: null as string | null,
      carimboTempo: null as Date | null,
      titular: null as string | null,
    };
    if (cert.hash && cert.assinatura) {
      const recalculado = this.hashCertificado({
        codigo: cert.codigo, nomeAluno: cert.nomeAluno, tituloCurso: cert.tituloCurso,
        cargaHoraria: cert.cargaHoraria, dataConclusao: cert.dataConclusao, cpf: cert.cpf,
        emitidoEm: cert.emitidoEm,
      });
      const hashConfere = recalculado === cert.hash;
      const cred = await this.certificado.credencialDe(cert.tenantId);
      const serieAtual = cred?.cert?.serialNumber ?? null;
      let situacao: Situacao;
      let confere: boolean;
      if (!cred) {
        // Órgão não tem certificado ativo para reconfirmar (mas foi assinado).
        situacao = 'sem_certificado_atual';
        confere = false;
      } else if (cert.assinaturaSerie && serieAtual && cert.assinaturaSerie !== serieAtual) {
        // Certificado RENOVADO desde a emissão — não reconfirmável com o atual, mas NÃO é adulteração.
        situacao = 'certificado_renovado';
        confere = false;
      } else {
        confere = hashConfere && this.signature.conferir(cert.hash, cert.assinatura, cred);
        situacao = confere ? 'confere' : 'nao_confere';
      }
      assinatura = {
        assinado: true,
        confere,
        situacao,
        algoritmo: cert.algoritmo,
        carimboTempo: cert.carimboTempo,
        titular: cred?.titular ?? null,
      };
    }

    // Resposta pública — NÃO expõe CPF nem dados sensíveis.
    return {
      valido: true,
      certificado: {
        codigo: cert.codigo, nomeAluno: cert.nomeAluno, tituloCurso: cert.tituloCurso,
        cargaHoraria: cert.cargaHoraria, emitidoEm: cert.emitidoEm,
      },
      assinatura,
    };
  }

  // ===================================================== Cursos (professor/admin)
  async listarGestao(opts: { page: number; pageSize: number }) {
    const [items, total] = await Promise.all([
      this.prisma.db.curso.findMany({
        orderBy: [{ ordem: 'asc' }, { criadoEm: 'desc' }],
        skip: (opts.page - 1) * opts.pageSize, take: opts.pageSize,
      }),
      this.prisma.db.curso.count(),
    ]);
    return { items, total, page: opts.page, pageSize: opts.pageSize };
  }

  async buscarCurso(id: string) {
    const c = await this.prisma.db.curso.findFirst({
      where: { OR: [{ id }, { slug: id }] },
      include: {
        modulos: { orderBy: { ordem: 'asc' }, include: { aulas: { orderBy: { ordem: 'asc' } } } },
        provas: { orderBy: { ordem: 'asc' } },
      },
    });
    if (!c) throw new NotFoundException('Curso não encontrado.');
    return c;
  }

  async criarCurso(dto: CriarCursoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const slug = await this.slugUnicoCurso(dto.slug ? slugify(dto.slug) : slugify(dto.titulo), tenantId);
    const c = await this.prisma.db.curso.create({
      data: {
        tenantId, titulo: dto.titulo, slug, resumo: dto.resumo, descricao: dto.descricao,
        conteudoProgramatico: dto.conteudoProgramatico,
        capaUrl: dto.capaUrl, capaStorageKey: dto.capaStorageKey, cargaHoraria: dto.cargaHoraria,
        inicioEm: dateOrNull(dto.inicioEm), fimEm: dateOrNull(dto.fimEm),
        certificacao: dto.certificacao ?? true, notaMinima: dto.notaMinima ?? 70,
        templateId: dto.templateId || null, status: dto.status || 'rascunho',
        publicado: dto.publicado ?? false, ordem: dto.ordem ?? 0,
      },
    });
    await this.audit(tenantId, atorId, 'CURSO_CRIADO', 'cursos', c.id, { titulo: c.titulo, slug });
    return c;
  }

  async atualizarCurso(id: string, dto: AtualizarCursoDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const anterior = await this.buscarCurso(id);
    const data: Record<string, unknown> = {};
    for (const c of ['titulo', 'resumo', 'descricao', 'conteudoProgramatico', 'capaUrl', 'capaStorageKey',
      'cargaHoraria', 'certificacao', 'notaMinima', 'templateId', 'status', 'publicado', 'ordem'] as const) {
      if ((dto as any)[c] !== undefined) (data as any)[c] = (dto as any)[c];
    }
    if (dto.inicioEm !== undefined) data.inicioEm = dateOrNull(dto.inicioEm);
    if (dto.fimEm !== undefined) data.fimEm = dateOrNull(dto.fimEm);
    if (dto.slug) {
      const cand = slugify(dto.slug);
      if (cand !== (anterior.slug ?? '')) data.slug = await this.slugUnicoCurso(cand, tenantId, anterior.id);
    }
    data.atualizadoEm = new Date();
    const c = await this.prisma.db.curso.update({ where: { id: anterior.id }, data: data as any });
    await this.audit(tenantId, atorId, 'CURSO_ATUALIZADO', 'cursos', anterior.id, { campos: Object.keys(data) });
    return c;
  }

  async excluirCurso(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const c = await this.buscarCurso(id);
    await this.prisma.db.curso.delete({ where: { id: c.id } });
    await this.audit(tenantId, atorId, 'CURSO_EXCLUIDO', 'cursos', c.id, { titulo: c.titulo });
    return { excluido: true };
  }

  // ===================================================== Módulos (professor)
  async criarModulo(cursoId: string, dto: CriarModuloDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.cursoModulo.create({
      data: { tenantId, cursoId, titulo: dto.titulo, descricao: dto.descricao, ordem: dto.ordem ?? 0 },
    });
  }
  atualizarModulo(id: string, dto: AtualizarModuloDto) {
    const data: Record<string, unknown> = {};
    for (const c of ['titulo', 'descricao', 'ordem'] as const) if (dto[c] !== undefined) (data as any)[c] = dto[c];
    data.atualizadoEm = new Date();
    return this.prisma.db.cursoModulo.update({ where: { id }, data: data as any });
  }
  excluirModulo(id: string) {
    return this.prisma.db.cursoModulo.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ===================================================== Aulas (professor)
  async criarAula(cursoId: string, dto: CriarAulaDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.cursoAula.create({
      data: {
        tenantId, cursoId, moduloId: dto.moduloId, titulo: dto.titulo,
        conteudo: dto.conteudo ?? {}, videoUrl: dto.videoUrl, storageKey: dto.storageKey,
        duracaoMin: dto.duracaoMin, ordem: dto.ordem ?? 0,
      },
    });
  }
  atualizarAula(id: string, dto: AtualizarAulaDto) {
    const data: Record<string, unknown> = {};
    for (const c of ['titulo', 'conteudo', 'videoUrl', 'storageKey', 'duracaoMin', 'ordem'] as const) {
      if (dto[c] !== undefined) (data as any)[c] = dto[c];
    }
    data.atualizadoEm = new Date();
    return this.prisma.db.cursoAula.update({ where: { id }, data: data as any });
  }
  excluirAula(id: string) {
    return this.prisma.db.cursoAula.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  /** Aula completa (para o aluno inscrito assistir). */
  async aulaParaAluno(aulaId: string, userId: string) {
    const aula = await this.prisma.db.cursoAula.findUnique({ where: { id: aulaId } });
    if (!aula) throw new NotFoundException('Aula não encontrada.');
    await this.garantirInscrito(aula.cursoId, userId);
    const concluida = await this.prisma.db.cursoAulaConclusao.findFirst({
      where: { aulaId, userId }, select: { id: true },
    });
    return { ...aula, concluida: !!concluida };
  }

  // ===================================================== Provas (professor)
  async criarProva(cursoId: string, dto: CriarProvaDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.cursoProva.create({
      data: {
        tenantId, cursoId, moduloId: dto.moduloId || null, titulo: dto.titulo,
        descricao: dto.descricao, notaMinima: dto.notaMinima ?? 70,
        tempoLimiteMin: dto.tempoLimiteMin, maxTentativas: dto.maxTentativas ?? 1,
        embaralhar: dto.embaralhar ?? false, ativa: dto.ativa ?? true, ordem: dto.ordem ?? 0,
        questoes: dto.questoes?.length
          ? {
              create: dto.questoes.map((q) => ({
                tenantId, enunciado: q.enunciado, tipo: q.tipo || 'objetiva',
                peso: q.peso ?? 1, ordem: q.ordem ?? 0,
                opcoes: q.opcoes?.length
                  ? { create: q.opcoes.map((o) => ({ tenantId, texto: o.texto, correta: o.correta ?? false, ordem: o.ordem ?? 0 })) }
                  : undefined,
              })),
            }
          : undefined,
      },
      include: { questoes: { include: { opcoes: true } } },
    });
  }
  atualizarProva(id: string, dto: AtualizarProvaDto) {
    const data: Record<string, unknown> = {};
    for (const c of ['titulo', 'moduloId', 'descricao', 'notaMinima', 'tempoLimiteMin',
      'maxTentativas', 'embaralhar', 'ativa', 'ordem'] as const) {
      if ((dto as any)[c] !== undefined) (data as any)[c] = (dto as any)[c];
    }
    data.atualizadoEm = new Date();
    return this.prisma.db.cursoProva.update({ where: { id }, data: data as any });
  }
  excluirProva(id: string) {
    return this.prisma.db.cursoProva.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ===================================================== Inscrição (aluno)
  async inscrever(slugOrId: string, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const curso = await this.prisma.db.curso.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }], publicado: true },
      select: { id: true, titulo: true },
    });
    if (!curso) throw new NotFoundException('Curso não encontrado.');
    const existente = await this.prisma.db.cursoInscricao.findFirst({
      where: { cursoId: curso.id, userId },
    });
    if (existente) return existente;
    const insc = await this.prisma.db.cursoInscricao.create({
      data: { tenantId, cursoId: curso.id, userId, status: 'ativa', progresso: 0 },
    });
    await this.audit(tenantId, userId, 'CURSO_INSCRICAO', 'curso_inscricoes', insc.id, { cursoId: curso.id });
    return insc;
  }

  async meusCursos(userId: string) {
    const inscricoes = await this.prisma.db.cursoInscricao.findMany({
      where: { userId }, orderBy: { inscritoEm: 'desc' },
      include: { curso: { select: { id: true, titulo: true, slug: true, capaUrl: true, cargaHoraria: true } } },
    });
    return inscricoes;
  }

  /** Marca aula como concluída e recalcula progresso da inscrição. */
  async concluirAula(aulaId: string, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const aula = await this.prisma.db.cursoAula.findUnique({ where: { id: aulaId } });
    if (!aula) throw new NotFoundException('Aula não encontrada.');
    await this.garantirInscrito(aula.cursoId, userId);
    const ja = await this.prisma.db.cursoAulaConclusao.findFirst({ where: { aulaId, userId } });
    if (!ja) {
      await this.prisma.db.cursoAulaConclusao.create({
        data: { tenantId, aulaId, cursoId: aula.cursoId, userId },
      });
    }
    const progresso = await this.recalcularProgresso(aula.cursoId, userId);
    return { concluida: true, progresso };
  }

  // ===================================================== Prova (aluno)
  /** Busca a prova SEM expor o gabarito (campo `correta` removido). */
  async iniciarProva(provaId: string, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const prova = await this.prisma.db.cursoProva.findUnique({
      where: { id: provaId },
      include: { questoes: { orderBy: { ordem: 'asc' }, include: { opcoes: { orderBy: { ordem: 'asc' } } } } },
    });
    if (!prova || !prova.ativa) throw new NotFoundException('Prova não encontrada.');
    await this.garantirInscrito(prova.cursoId, userId);

    const feitas = await this.prisma.db.cursoTentativaProva.count({ where: { provaId, userId } });
    if (feitas >= prova.maxTentativas) {
      throw new ForbiddenException('Número máximo de tentativas atingido.');
    }
    const tentativa = await this.prisma.db.cursoTentativaProva.create({
      data: {
        tenantId, provaId, cursoId: prova.cursoId, userId,
        numero: feitas + 1, status: 'em_andamento', heartbeatEm: new Date(),
      },
    });
    // Remove gabarito antes de enviar ao aluno.
    const questoes = prova.questoes.map((q) => ({
      id: q.id, enunciado: q.enunciado, tipo: q.tipo, peso: q.peso, ordem: q.ordem,
      opcoes: q.opcoes.map((o) => ({ id: o.id, texto: o.texto, ordem: o.ordem })),
    }));
    return {
      tentativaId: tentativa.id,
      prova: {
        id: prova.id, titulo: prova.titulo, descricao: prova.descricao,
        tempoLimiteMin: prova.tempoLimiteMin, notaMinima: prova.notaMinima,
      },
      questoes,
    };
  }

  /** Heartbeat de presença durante a prova. */
  async heartbeatProva(tentativaId: string, userId: string) {
    const t = await this.prisma.db.cursoTentativaProva.findUnique({ where: { id: tentativaId } });
    if (!t || t.userId !== userId) throw new NotFoundException('Tentativa não encontrada.');
    await this.prisma.db.cursoTentativaProva.update({
      where: { id: tentativaId }, data: { heartbeatEm: new Date() },
    });
    return { ok: true };
  }

  /** Submissão: corrige objetivas automaticamente; dissertativas aguardam professor. */
  async submeterProva(dto: SubmeterProvaDto, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const tentativa = await this.prisma.db.cursoTentativaProva.findUnique({
      where: { id: dto.tentativaId },
      include: { prova: { include: { questoes: { include: { opcoes: true } } } } },
    });
    if (!tentativa || tentativa.userId !== userId) throw new NotFoundException('Tentativa não encontrada.');
    if (tentativa.status !== 'em_andamento') throw new BadRequestException('Tentativa já finalizada.');

    const questoes = tentativa.prova.questoes;
    const respostasPorQuestao = new Map(dto.respostas.map((r) => [r.questaoId, r]));
    let pesoObjetivoAcertado = 0;
    let pesoObjetivoTotal = 0;
    let temDissertativa = false;

    for (const q of questoes) {
      const peso = Number(q.peso ?? 1);
      const resp = respostasPorQuestao.get(q.id);
      if (q.tipo === 'dissertativa') {
        temDissertativa = true;
        await this.prisma.db.cursoTentativaQuestao.create({
          data: {
            tenantId, tentativaId: tentativa.id, questaoId: q.id,
            respostaTexto: resp?.respostaTexto ?? null, correta: null, nota: null,
          },
        });
      } else {
        pesoObjetivoTotal += peso;
        const correta = q.opcoes.find((o) => o.correta);
        const acertou = !!resp?.opcaoId && correta?.id === resp.opcaoId;
        if (acertou) pesoObjetivoAcertado += peso;
        await this.prisma.db.cursoTentativaQuestao.create({
          data: {
            tenantId, tentativaId: tentativa.id, questaoId: q.id,
            opcaoId: resp?.opcaoId ?? null, correta: acertou,
            nota: acertou ? peso : 0,
          },
        });
      }
    }

    const notaObjetiva = pesoObjetivoTotal > 0 ? (pesoObjetivoAcertado / pesoObjetivoTotal) * 100 : 0;
    const data: Record<string, unknown> = {
      finalizadaEm: new Date(),
      notaObjetiva,
    };
    if (temDissertativa) {
      data.status = 'aguardando_correcao';
    } else {
      const aprovado = notaObjetiva >= Number(tentativa.prova.notaMinima);
      data.status = aprovado ? 'aprovado' : 'reprovado';
      data.nota = notaObjetiva;
    }
    await this.prisma.db.cursoTentativaProva.update({ where: { id: tentativa.id }, data: data as any });

    // Se aprovado e sem dissertativa, tenta emitir certificado.
    if (!temDissertativa && data.status === 'aprovado') {
      await this.tentarEmitirCertificado(tentativa.cursoId, userId);
    }
    return { status: data.status, notaObjetiva, aguardandoCorrecao: temDissertativa };
  }

  async resultadoTentativa(tentativaId: string, userId: string) {
    const t = await this.prisma.db.cursoTentativaProva.findUnique({
      where: { id: tentativaId },
      include: { questoes: true },
    });
    if (!t || t.userId !== userId) throw new NotFoundException('Tentativa não encontrada.');
    return t;
  }

  // ===================================================== Correção (professor)
  listarCorrecoesPendentes() {
    return this.prisma.db.cursoTentativaProva.findMany({
      where: { status: 'aguardando_correcao' },
      orderBy: { finalizadaEm: 'asc' },
      include: {
        prova: { select: { id: true, titulo: true, notaMinima: true } },
        questoes: true,
      },
    });
  }

  async corrigirTentativa(tentativaId: string, dto: CorrigirTentativaDto, professorId?: string) {
    const tenantId = TenantContext.tenantId()!;
    const tentativa = await this.prisma.db.cursoTentativaProva.findUnique({
      where: { id: tentativaId },
      include: { prova: { include: { questoes: true } }, questoes: true },
    });
    if (!tentativa) throw new NotFoundException('Tentativa não encontrada.');
    if (tentativa.status !== 'aguardando_correcao') {
      throw new BadRequestException('Tentativa não está aguardando correção.');
    }

    for (const c of dto.correcoes) {
      await this.prisma.db.cursoTentativaQuestao.update({
        where: { id: c.tentativaQuestaoId },
        data: { nota: c.nota, feedback: c.feedback ?? null, correta: c.nota > 0 },
      });
    }

    // Recalcula nota final ponderada por peso da questão.
    const respostas = await this.prisma.db.cursoTentativaQuestao.findMany({
      where: { tentativaId },
    });
    const pesos = new Map(tentativa.prova.questoes.map((q) => [q.id, Number(q.peso ?? 1)]));
    let pesoTotal = 0;
    let notaPonderada = 0;
    for (const r of respostas) {
      const peso = pesos.get(r.questaoId) ?? 1;
      pesoTotal += peso;
      // nota da questão: objetiva grava peso/0; dissertativa grava nota dada (0..peso).
      notaPonderada += Number(r.nota ?? 0);
    }
    const notaFinal = pesoTotal > 0 ? (notaPonderada / pesoTotal) * 100 : 0;
    const aprovado = notaFinal >= Number(tentativa.prova.notaMinima);
    await this.prisma.db.cursoTentativaProva.update({
      where: { id: tentativaId },
      data: {
        nota: notaFinal, status: aprovado ? 'aprovado' : 'reprovado',
        corrigidaEm: new Date(), corrigidaPor: professorId ?? null,
      },
    });
    await this.audit(tenantId, professorId, 'PROVA_CORRIGIDA', 'curso_tentativas_prova', tentativaId, { notaFinal, aprovado });

    if (aprovado) await this.tentarEmitirCertificado(tentativa.cursoId, tentativa.userId);
    return { notaFinal, aprovado };
  }

  // ===================================================== Certificados
  /** Emite certificado se aprovado e curso certificável; idempotente. */
  private async tentarEmitirCertificado(cursoId: string, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const curso = await this.prisma.db.curso.findUnique({
      where: { id: cursoId },
      select: {
        id: true, titulo: true, cargaHoraria: true, certificacao: true, templateId: true,
        inicioEm: true, fimEm: true, conteudoProgramatico: true,
      },
    });
    if (!curso || !curso.certificacao) return null;

    const ja = await this.prisma.db.cursoCertificado.findFirst({ where: { cursoId, userId } });
    if (ja) return ja;

    // Identidade vem do CADASTRO DE CIDADÃO (users): nome/CPF/RG.
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { nome: true, cpf: true, rg: true },
    });
    const inscricao = await this.prisma.db.cursoInscricao.findFirst({ where: { cursoId, userId } });

    const codigo = await this.codigoUnicoCertificado();
    // A emissão automática ocorre no momento em que o aluno concluiu → `agora` é a
    // data real de conclusão (a inscrição.concluidoEm ainda é null aqui; ela é
    // gravada logo abaixo). Prioriza a conclusão do aluno, cai p/ fim do curso.
    const agora = new Date();
    const nomeAluno = user?.nome ?? 'Aluno';
    const cargaHoraria = curso.cargaHoraria ?? null;
    const dataConclusao = inscricao?.concluidoEm ?? curso.fimEm ?? agora;
    const cpf = user?.cpf ?? null;

    // Assinatura digital na EMISSÃO (imutável): assina o hash canônico com o
    // certificado do órgão (ou env/stub como fallback). Se não houver assinatura
    // configurada, emite sem assinatura (não bloqueia a emissão).
    const hash = this.hashCertificado({
      codigo, nomeAluno, tituloCurso: curso.titulo, cargaHoraria, dataConclusao, cpf, emitidoEm: agora,
    });
    let assinatura: string | null = null;
    let algoritmo: string | null = null;
    let carimboTempo: Date | null = null;
    let assinaturaSerie: string | null = null;
    try {
      const cred = await this.certificado.credencial();
      const s = this.signature.assinar(hash, cred);
      assinatura = s.assinatura;
      algoritmo = s.algoritmo;
      carimboTempo = s.carimboTempo;
      assinaturaSerie = s.serie;
    } catch (e) {
      this.logger.warn(`Certificado ${codigo} emitido sem assinatura digital: ${(e as Error).message}`);
    }

    const cert = await this.prisma.db.cursoCertificado.create({
      data: {
        tenantId, cursoId, userId, inscricaoId: inscricao?.id ?? null,
        templateId: curso.templateId || null, codigo,
        nomeAluno, tituloCurso: curso.titulo,
        cargaHoraria,
        // snapshots imutáveis na emissão (fonte: curso + inscrição + cidadão)
        dataInicio: curso.inicioEm ?? null,
        dataConclusao,
        conteudoProgramatico: curso.conteudoProgramatico ?? null,
        cpf,
        rg: user?.rg ?? null,
        emitidoEm: agora,
        hash, assinatura, algoritmo, carimboTempo, assinaturaSerie,
        // pdf_url/qr_url ficam null: geração assíncrona/on-demand (ver spec §4).
      },
    });
    if (inscricao) {
      await this.prisma.db.cursoInscricao.update({
        where: { id: inscricao.id },
        data: { status: 'concluida', aprovado: true, progresso: 100, concluidoEm: agora },
      });
    }
    await this.audit(tenantId, userId, 'CERTIFICADO_EMITIDO', 'curso_certificados', cert.id, { codigo, cursoId });
    return cert;
  }

  async meusCertificados(userId: string) {
    // Minimização: a listagem não precisa de cpf/rg/conteúdo (só o PDF usa).
    return this.prisma.db.cursoCertificado.findMany({
      where: { userId },
      orderBy: { emitidoEm: 'desc' },
      select: {
        id: true, codigo: true, nomeAluno: true, tituloCurso: true, cargaHoraria: true,
        emitidoEm: true, dataInicio: true, dataConclusao: true, pdfStorageKey: true, qrUrl: true,
      },
    });
  }

  /**
   * Download do PDF do certificado do próprio aluno. Idempotente: se o PDF já
   * foi gerado (pdfStorageKey), apenas lê do storage; senão renderiza a partir
   * do template (placeholders + QR de validação pública), salva e grava o
   * ponteiro. Retorna { buffer, filename } para o controller streamar.
   */
  async certificadoParaDownload(id: string, userId: string): Promise<{ buffer: Buffer; filename: string }> {
    const cert = await this.prisma.db.cursoCertificado.findUnique({ where: { id } });
    if (!cert || cert.userId !== userId) throw new NotFoundException('Certificado não encontrado.');

    const filename = `certificado-${cert.codigo}.pdf`;

    // Já gerado: serve direto do storage (idempotente).
    if (cert.pdfStorageKey) {
      const { buffer } = await this.storage.get(cert.pdfStorageKey);
      return { buffer, filename };
    }

    // Carrega o template com páginas (layout aninhado) quando houver; senão usa padrão.
    const template = cert.templateId
      ? await this.prisma.db.certificateTemplate.findUnique({
          where: { id: cert.templateId },
          include: this.templateInclude,
        })
      : null;

    const urlValidacao = await this.urlValidacaoPublica(cert.codigo);

    const buffer = await this.certificadoPdf.gerarPdf(
      {
        codigo: cert.codigo,
        nomeAluno: cert.nomeAluno,
        tituloCurso: cert.tituloCurso,
        cargaHoraria: cert.cargaHoraria,
        templateId: cert.templateId,
        emitidoEm: cert.emitidoEm,
        dataInicio: cert.dataInicio,
        dataConclusao: cert.dataConclusao,
        conteudoProgramatico: cert.conteudoProgramatico,
        cpf: cert.cpf,
        rg: cert.rg,
      },
      template as any,
      urlValidacao,
    );

    const tenantId = TenantContext.tenantId()!;
    const key = await this.storage.put('certificados', buffer, 'application/pdf');
    await this.prisma.db.cursoCertificado.update({
      where: { id: cert.id },
      data: { pdfStorageKey: key, pdfUrl: urlValidacao, qrUrl: urlValidacao },
    });
    await this.audit(tenantId, userId, 'CERTIFICADO_PDF_GERADO', 'curso_certificados', cert.id, { codigo: cert.codigo });

    return { buffer, filename };
  }

  /**
   * URL pública de validação do certificado (entra no QR e em qr_url).
   * O QR é escaneado por uma pessoa → deve abrir a PÁGINA WEB de validação
   * (`/validar/:codigo`), não o endpoint JSON da API. O host precisa ser o que
   * o nginx realmente roteia para esta prefeitura: domínio próprio (se houver) ou
   * o `subdominio` (ex.: prefserranova.lidera.app.br) — nunca o `slug`, que não
   * está no server_name. Mesmo padrão de host público do diário.
   */
  private async urlValidacaoPublica(codigo: string): Promise<string> {
    const tenantId = TenantContext.tenantId();
    const base = process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
    let host = `portal.${base}`;
    if (tenantId) {
      const tenant = await this.prisma.platform().tenant.findUnique({
        where: { id: tenantId },
        select: { dominio: true, subdominio: true, slug: true },
      });
      const sub = tenant?.subdominio ?? tenant?.slug ?? 'portal';
      host = tenant?.dominio ?? `${sub}.${base}`;
    }
    return `https://${host}/validar/${codigo}`;
  }

  // ===================================================== Fórum (aluno/professor)
  async listarDuvidas(aulaId: string) {
    return this.prisma.db.cursoAulaDuvida.findMany({
      where: { aulaId }, orderBy: { criadoEm: 'desc' },
      include: { respostas: { orderBy: { criadoEm: 'asc' } } },
    });
  }
  async criarDuvida(dto: DuvidaDto, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const aula = await this.prisma.db.cursoAula.findUnique({ where: { id: dto.aulaId } });
    if (!aula) throw new NotFoundException('Aula não encontrada.');
    await this.garantirInscrito(aula.cursoId, userId);
    return this.prisma.db.cursoAulaDuvida.create({
      data: { tenantId, aulaId: dto.aulaId, cursoId: aula.cursoId, userId, titulo: dto.titulo, mensagem: dto.mensagem },
    });
  }
  async responderDuvida(duvidaId: string, dto: RespostaDuvidaDto, userId: string, role: string) {
    const tenantId = TenantContext.tenantId()!;
    const duvida = await this.prisma.db.cursoAulaDuvida.findUnique({ where: { id: duvidaId } });
    if (!duvida) throw new NotFoundException('Dúvida não encontrada.');
    const doProfessor = role === 'professor' || role === 'gestor' || role === 'admin_prefeitura' || role === 'super_admin';
    return this.prisma.db.cursoAulaResposta.create({
      data: { tenantId, duvidaId, userId, mensagem: dto.mensagem, doProfessor },
    });
  }

  // ===================================================== Feedback (aluno)
  async enviarFeedback(slugOrId: string, dto: FeedbackDto, userId: string) {
    const tenantId = TenantContext.tenantId()!;
    const curso = await this.prisma.db.curso.findFirst({
      where: { OR: [{ slug: slugOrId }, { id: slugOrId }] }, select: { id: true },
    });
    if (!curso) throw new NotFoundException('Curso não encontrado.');
    await this.garantirInscrito(curso.id, userId);
    const existente = await this.prisma.db.cursoFeedback.findFirst({ where: { cursoId: curso.id, userId } });
    if (existente) {
      return this.prisma.db.cursoFeedback.update({
        where: { id: existente.id }, data: { nota: dto.nota, comentario: dto.comentario },
      });
    }
    return this.prisma.db.cursoFeedback.create({
      data: { tenantId, cursoId: curso.id, userId, nota: dto.nota, comentario: dto.comentario },
    });
  }

  // ===================================================== Templates (admin)
  /** include padrão: páginas ordenadas, cada uma com seus itens ordenados. */
  private readonly templateInclude = {
    paginas: {
      orderBy: { ordem: 'asc' },
      include: {
        textos: { orderBy: { ordem: 'asc' } },
        elementos: { orderBy: { ordem: 'asc' } },
        fotos: { orderBy: { ordem: 'asc' } },
      },
    },
    // Relações flat (mesmas linhas via templateId): mantêm compatibilidade com o
    // editor simplificado e as contagens da lista (Certificados.tsx), que leem
    // template.textos/elementos/fotos. O designer visual usa `paginas`.
    textos: { orderBy: { ordem: 'asc' } },
    elementos: { orderBy: { ordem: 'asc' } },
    fotos: { orderBy: { ordem: 'asc' } },
  } as any;

  listarTemplates() {
    return this.prisma.db.certificateTemplate.findMany({
      orderBy: { criadoEm: 'desc' },
      include: this.templateInclude,
    });
  }

  /** Normaliza o DTO em ≥1 página. Sem `paginas`, os arrays flat viram 1 página. */
  private paginasDoDto(dto: CriarTemplateDto | AtualizarTemplateDto): PaginaTemplateDto[] {
    if (dto.paginas?.length) return dto.paginas;
    if (dto.textos?.length || dto.elementos?.length || dto.fotos?.length) {
      return [{ fundoUrl: dto.fundoUrl, fundoStorageKey: dto.fundoStorageKey,
                textos: dto.textos, elementos: dto.elementos, fotos: dto.fotos }];
    }
    return [{ fundoUrl: dto.fundoUrl, fundoStorageKey: dto.fundoStorageKey }];
  }

  /** Nested write `paginas: { deleteMany, create }` — REPLACE atômico das páginas + itens. */
  private nestedPaginas(paginas: PaginaTemplateDto[], tenantId: string, templateId: string) {
    return {
      deleteMany: {},
      create: paginas.map((pg, i) => ({
        tenantId,
        ordem: pg.ordem ?? i,
        fundoUrl: pg.fundoUrl ?? null,
        fundoStorageKey: pg.fundoStorageKey ?? null,
        textos: {
          create: (pg.textos ?? []).map((t) => ({
            tenantId, templateId, conteudo: t.conteudo, posX: t.posX ?? 0, posY: t.posY ?? 0,
            largura: t.largura, fonte: t.fonte || 'Helvetica', tamanho: t.tamanho ?? 16,
            cor: t.cor || '#000000', alinhamento: t.alinhamento || 'center',
            negrito: t.negrito ?? false, ordem: t.ordem ?? 0,
          })),
        },
        elementos: {
          create: (pg.elementos ?? []).map((e) => ({
            tenantId, templateId, tipo: e.tipo || 'qr', posX: e.posX ?? 0, posY: e.posY ?? 0,
            largura: e.largura, altura: e.altura, config: e.config ?? {}, ordem: e.ordem ?? 0,
          })),
        },
        fotos: {
          create: (pg.fotos ?? []).map((f) => ({
            tenantId, templateId, url: f.url, storageKey: f.storageKey, posX: f.posX ?? 0,
            posY: f.posY ?? 0, largura: f.largura, altura: f.altura, ordem: f.ordem ?? 0,
          })),
        },
      })),
    };
  }

  async criarTemplate(dto: CriarTemplateDto) {
    const tenantId = TenantContext.tenantId()!;
    // Cria o template vazio e reaproveita o REPLACE atômico de páginas (já sabe o id).
    const tpl = await this.prisma.db.certificateTemplate.create({
      data: {
        tenantId, typeId: dto.typeId || null, nome: dto.nome,
        fundoUrl: dto.fundoUrl, fundoStorageKey: dto.fundoStorageKey,
        largura: dto.largura ?? 842, altura: dto.altura ?? 595,
        orientacao: dto.orientacao || 'paisagem', padrao: dto.padrao ?? false, ativo: dto.ativo ?? true,
      },
    });
    return this.prisma.db.certificateTemplate.update({
      where: { id: tpl.id },
      data: { paginas: this.nestedPaginas(this.paginasDoDto(dto), tenantId, tpl.id) } as any,
      include: this.templateInclude,
    });
  }

  async atualizarTemplate(id: string, dto: AtualizarTemplateDto) {
    const tenantId = TenantContext.tenantId()!;
    const data: Record<string, unknown> = {};
    for (const c of ['nome', 'typeId', 'fundoUrl', 'fundoStorageKey', 'largura', 'altura',
      'orientacao', 'padrao', 'ativo'] as const) {
      if ((dto as any)[c] !== undefined) (data as any)[c] = (dto as any)[c];
    }
    data.atualizadoEm = new Date();
    // Só toca nas páginas quando algo de layout veio (paginas OU arrays flat).
    // undefined em tudo = não mexe no layout (ex.: renomear/definir padrão).
    const mexeuLayout =
      dto.paginas !== undefined || dto.textos !== undefined ||
      dto.elementos !== undefined || dto.fotos !== undefined;
    if (mexeuLayout) {
      const paginas = this.paginasDoDto(dto);
      data.paginas = this.nestedPaginas(paginas, tenantId, id);
      // O fundo é por página agora: mantém o escalar legado coerente com a 1ª
      // página e zera o storage-key legado (senão o PDF reexibiria o fundo antigo).
      data.fundoUrl = paginas[0]?.fundoUrl ?? null;
      data.fundoStorageKey = null;
    }
    const tpl = await this.prisma.db.certificateTemplate.update({
      where: { id },
      data: data as any,
      include: this.templateInclude,
    });
    // Editor simplificado (metadados, sem layout): propaga a troca de fundo à
    // página 0, senão ficaria só no escalar legado e não apareceria no PDF.
    if (!mexeuLayout && dto.fundoUrl !== undefined) {
      await this.prisma.db.certificatePage.updateMany({
        where: { templateId: id, ordem: 0 },
        data: { fundoUrl: dto.fundoUrl || null, fundoStorageKey: dto.fundoStorageKey ?? null },
      });
      return this.prisma.db.certificateTemplate.findUnique({
        where: { id }, include: this.templateInclude,
      });
    }
    return tpl;
  }
  excluirTemplate(id: string) {
    return this.prisma.db.certificateTemplate.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // tipos de certificado
  listarTiposCertificado() {
    return this.prisma.db.certificateType.findMany({ orderBy: [{ ordem: 'asc' }, { nome: 'asc' }] });
  }
  async criarTipoCertificado(dto: TipoCertificadoDto) {
    const tenantId = TenantContext.tenantId()!;
    return this.prisma.db.certificateType.create({
      data: { tenantId, nome: dto.nome, descricao: dto.descricao, ativo: dto.ativo ?? true, ordem: dto.ordem ?? 0 },
    });
  }
  excluirTipoCertificado(id: string) {
    return this.prisma.db.certificateType.delete({ where: { id } }).then(() => ({ excluido: true }));
  }

  // ===================================================== helpers
  private async garantirInscrito(cursoId: string, userId: string) {
    const insc = await this.prisma.db.cursoInscricao.findFirst({
      where: { cursoId, userId, status: { in: ['ativa', 'concluida'] } },
      select: { id: true },
    });
    if (!insc) throw new ForbiddenException('Você não está inscrito neste curso.');
    return insc;
  }

  private async recalcularProgresso(cursoId: string, userId: string): Promise<number> {
    const [total, feitas, inscricao] = await Promise.all([
      this.prisma.db.cursoAula.count({ where: { cursoId } }),
      this.prisma.db.cursoAulaConclusao.count({ where: { cursoId, userId } }),
      this.prisma.db.cursoInscricao.findFirst({ where: { cursoId, userId } }),
    ]);
    const progresso = total > 0 ? Math.round((feitas / total) * 100) : 0;
    if (inscricao) {
      await this.prisma.db.cursoInscricao.update({ where: { id: inscricao.id }, data: { progresso } });
    }
    return progresso;
  }

  private async audit(tenantId: string, atorId: string | undefined, acao: string, entidade: string, entidadeId: string, dados: any) {
    await this.prisma.db.auditLog.create({
      data: { tenantId, atorId: atorId ?? null, acao, entidade, entidadeId, dados },
    });
  }

  private async slugUnicoCurso(base: string, tenantId: string, excludeId?: string): Promise<string> {
    const db = this.prisma.platform();
    const existe = await db.curso.findFirst({
      where: { tenantId, slug: base, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existe) return base;
    return `${base}-${randomBytes(2).toString('hex')}`;
  }

  private async codigoUnicoCertificado(): Promise<string> {
    const db = this.prisma.platform();
    for (let i = 0; i < 6; i++) {
      const codigo = gerarCodigo();
      const existe = await db.cursoCertificado.findUnique({ where: { codigo }, select: { id: true } });
      if (!existe) return codigo;
    }
    throw new BadRequestException('Não foi possível gerar código de certificado.');
  }
}
