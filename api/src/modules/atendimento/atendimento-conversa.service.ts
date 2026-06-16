import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { assinarVisitante } from './visitor-token.util';

// --- FSM ---
type Status = 'bot' | 'aguardando_agente' | 'em_atendimento' | 'encerrada';

const TRANSICOES: Record<Status, Status[]> = {
  bot: ['aguardando_agente', 'encerrada'],
  aguardando_agente: ['em_atendimento', 'bot', 'encerrada'],
  em_atendimento: ['aguardando_agente', 'encerrada'],
  encerrada: [],
};

function validarTransicao(de: Status, para: Status): void {
  if (!TRANSICOES[de]?.includes(para)) {
    throw new UnprocessableEntityException(
      `Transição inválida: ${de} → ${para}.`,
    );
  }
}

// PII regex para redação em logs (NUNCA log com PII)
const PII_REGEXES = [
  /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g,      // CPF
  /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, // CNPJ
  /\b(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g, // telefone
];

export function redigirPII(texto: string): string {
  let s = texto;
  for (const r of PII_REGEXES) s = s.replace(r, '[REDACTED]');
  return s;
}

@Injectable()
export class AtendimentoConversaService {
  // Injetado pelo módulo via setter (evita dependência circular com gateway)
  private gateway?: {
    emitir(conversaId: string, evento: string, payload: unknown): void;
    emitirTenant(tenantId: string, evento: string, payload: unknown): void;
  };

  constructor(private readonly prisma: PrismaService) {}

  setGateway(gw: {
    emitir(conversaId: string, evento: string, payload: unknown): void;
    emitirTenant(tenantId: string, evento: string, payload: unknown): void;
  }) {
    this.gateway = gw;
  }

  // ------------------------------------------------------------------ iniciar

  async iniciar(opts: {
    tenantId: string;
    canal: 'widget' | 'whatsapp';
    visitanteNome?: string;
    visitanteEmail?: string;
    visitanteTelefone?: string;
    visitanteIdentificador?: string;
    secretariaId?: string;
    assunto?: string;
    origemUrl?: string;
  }) {
    const conversa = await TenantContext.run({ tenantId: opts.tenantId }, async () => {
      // Busca saudação do tenant
      const tenant = await this.prisma.db.tenant.findFirst({
        select: {
          atendimentoSaudacao: true,
          atendimentoAvisoLgpd: true,
          atendimentoHumanoAtivo: true,
        },
      });

      const c = await this.prisma.db.atendimentoConversa.create({
        data: {
          tenantId: opts.tenantId,
          canal: opts.canal,
          status: 'bot',
          visitanteNome: opts.visitanteNome,
          visitanteEmail: opts.visitanteEmail,
          visitanteTelefone: opts.visitanteTelefone,
          visitanteIdentificador: opts.visitanteIdentificador,
          secretariaId: opts.secretariaId,
          assunto: opts.assunto,
          origemUrl: opts.origemUrl,
        },
      });

      // Grava saudação do bot se configurada
      if (tenant?.atendimentoSaudacao) {
        await this.prisma.db.atendimentoMensagem.create({
          data: {
            tenantId: opts.tenantId,
            conversaId: c.id,
            autorTipo: 'bot',
            conteudo: tenant.atendimentoSaudacao,
            interno: false,
          },
        });
      }

      // Aviso LGPD como mensagem de sistema
      if (tenant?.atendimentoAvisoLgpd) {
        await this.prisma.db.atendimentoMensagem.create({
          data: {
            tenantId: opts.tenantId,
            conversaId: c.id,
            autorTipo: 'sistema',
            conteudo: tenant.atendimentoAvisoLgpd,
            interno: false,
          },
        });
      }

      await this.gravarEvento(c.id, opts.tenantId, 'iniciada', null, {
        canal: opts.canal,
      });

      return c;
    });

    const token = await assinarVisitante(conversa.id, opts.tenantId);
    return { id: conversa.id, token, status: conversa.status };
  }

  // ------------------------------------------------------------------ mensagens

  async persistirMensagem(
    conversaId: string,
    tenantId: string,
    dados: {
      autorTipo: 'visitante' | 'bot' | 'agente' | 'sistema';
      autorId?: string;
      conteudo: string;
      anexos?: object[];
      interno?: boolean;
    },
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const msg = await this.prisma.db.atendimentoMensagem.create({
        data: {
          tenantId,
          conversaId,
          autorTipo: dados.autorTipo,
          autorId: dados.autorId,
          conteudo: dados.conteudo,
          anexos: (dados.anexos ?? []) as any,
          interno: dados.interno ?? false,
        },
      });

      // Atualiza ultima_atividade_em
      await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { ultimaAtividadeEm: new Date() },
      });

      // Emite no socket (filtro interno — agentes veem tudo)
      if (!dados.interno) {
        this.gateway?.emitir(conversaId, 'atend:mensagem', {
          id: msg.id,
          autorTipo: msg.autorTipo,
          conteudo: msg.conteudo,
          criadoEm: msg.criadoEm,
          interno: false,
        });
      } else {
        // Mensagens internas só para agentes (sala tenant não broadcasta para visitante)
        this.gateway?.emitir(conversaId, 'atend:mensagem', {
          id: msg.id,
          autorTipo: msg.autorTipo,
          conteudo: msg.conteudo,
          criadoEm: msg.criadoEm,
          interno: true,
        });
      }

      return msg;
    });
  }

  async listarMensagens(
    conversaId: string,
    tenantId: string,
    opts: { antes?: string; paraVisitante: boolean },
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const where: Record<string, unknown> = { conversaId };
      if (opts.paraVisitante) where.interno = false;
      if (opts.antes) {
        const ref = await this.prisma.db.atendimentoMensagem.findUnique({
          where: { id: opts.antes },
          select: { criadoEm: true },
        });
        if (ref) where.criadoEm = { lt: ref.criadoEm };
      }
      return this.prisma.db.atendimentoMensagem.findMany({
        where,
        orderBy: { criadoEm: 'desc' },
        take: 50,
      });
    });
  }

  // ------------------------------------------------------------------ inbox admin

  async inbox(opts: {
    tenantId: string;
    userId: string;
    role: string;
    status?: string;
    canal?: string;
    secretariaId?: string;
    tagId?: string;
    q?: string;
    page?: number;
  }) {
    const page = opts.page ?? 1;
    const take = 30;

    // Escopo de secretaria para SERVIDOR
    let escopoSecretariaId: string | undefined;
    if (opts.role === 'servidor') {
      const u = await TenantContext.run({ tenantId: opts.tenantId }, () =>
        this.prisma.db.user.findUnique({
          where: { id: opts.userId },
          select: { secretariaId: true },
        }),
      );
      escopoSecretariaId = u?.secretariaId ?? undefined;
    }

    return TenantContext.run({ tenantId: opts.tenantId }, async () => {
      const where: Record<string, unknown> = {};
      if (opts.status) where.status = opts.status;
      if (opts.canal) where.canal = opts.canal;
      const sec = escopoSecretariaId ?? opts.secretariaId;
      if (sec) where.secretariaId = sec;
      if (opts.tagId) where.tagIds = { has: opts.tagId };
      if (opts.q) {
        where.OR = [
          { visitanteNome: { contains: opts.q, mode: 'insensitive' } },
          { assunto: { contains: opts.q, mode: 'insensitive' } },
          { visitanteEmail: { contains: opts.q, mode: 'insensitive' } },
        ];
      }

      const [items, total] = await Promise.all([
        this.prisma.db.atendimentoConversa.findMany({
          where,
          orderBy: { ultimaAtividadeEm: 'desc' },
          skip: (page - 1) * take,
          take,
          include: {
            agente: { select: { id: true, nome: true } },
          },
        }),
        this.prisma.db.atendimentoConversa.count({ where }),
      ]);

      return { items, total, page, pageSize: take, totalPaginas: Math.ceil(total / take) };
    });
  }

  async detalhe(conversaId: string, tenantId: string) {
    return TenantContext.run({ tenantId }, async () => {
      const conversa = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
        include: {
          agente: { select: { id: true, nome: true } },
          mensagens: { orderBy: { criadoEm: 'asc' } },
          eventos: { orderBy: { criadoEm: 'asc' } },
        },
      });
      if (!conversa) throw new NotFoundException('Conversa não encontrada.');
      return conversa;
    });
  }

  // ------------------------------------------------------------------ máquina de estados

  async assumir(conversaId: string, tenantId: string, agenteId: string) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');
      validarTransicao(c.status as Status, 'em_atendimento');

      const atualizada = await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { status: 'em_atendimento', agenteId, ultimaAtividadeEm: new Date() },
        include: { agente: { select: { id: true, nome: true } } },
      });

      await this.gravarEvento(conversaId, tenantId, 'assumida', agenteId, {});

      this.gateway?.emitir(conversaId, 'atend:status', {
        status: 'em_atendimento',
        agenteId,
        agenteNome: atualizada.agente?.nome,
      });

      return atualizada;
    });
  }

  async atribuir(
    conversaId: string,
    tenantId: string,
    atorId: string,
    dados: { agenteId: string; secretariaId?: string },
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');
      // Atribuir não muda status, só reassigna
      const update: Record<string, unknown> = {
        agenteId: dados.agenteId,
        ultimaAtividadeEm: new Date(),
      };
      if (dados.secretariaId) update.secretariaId = dados.secretariaId;
      // Se estava aguardando, move para em_atendimento
      if (c.status === 'aguardando_agente') {
        update.status = 'em_atendimento';
      }

      const atualizada = await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: update as any,
        include: { agente: { select: { id: true, nome: true } } },
      });

      await this.gravarEvento(conversaId, tenantId, 'atribuida', atorId, {
        agenteId: dados.agenteId,
        secretariaId: dados.secretariaId,
      });

      this.gateway?.emitir(conversaId, 'atend:status', {
        status: atualizada.status,
        agenteId: atualizada.agenteId,
        agenteNome: atualizada.agente?.nome,
      });

      return atualizada;
    });
  }

  async transferir(
    conversaId: string,
    tenantId: string,
    atorId: string,
    secretariaId: string,
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');
      validarTransicao(c.status as Status, 'aguardando_agente');

      const atualizada = await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: {
          status: 'aguardando_agente',
          secretariaId,
          agenteId: null,
          ultimaAtividadeEm: new Date(),
        },
      });

      await this.gravarEvento(conversaId, tenantId, 'transferida', atorId, { secretariaId });

      this.gateway?.emitir(conversaId, 'atend:status', { status: 'aguardando_agente' });
      this.gateway?.emitirTenant(tenantId, 'atend:nova_conversa', {
        conversaId,
        canal: atualizada.canal,
        assunto: atualizada.assunto,
        secretariaId,
      });

      return atualizada;
    });
  }

  async encerrar(
    conversaId: string,
    tenantId: string,
    atorId: string | null,
    mensagemEncerramento?: string,
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');
      if (c.status === 'encerrada') return c; // idempotente

      validarTransicao(c.status as Status, 'encerrada');

      const atualizada = await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { status: 'encerrada', encerradaEm: new Date(), ultimaAtividadeEm: new Date() },
      });

      if (mensagemEncerramento) {
        await this.prisma.db.atendimentoMensagem.create({
          data: {
            tenantId,
            conversaId,
            autorTipo: 'sistema',
            conteudo: mensagemEncerramento,
            interno: false,
          },
        });
      }

      await this.gravarEvento(conversaId, tenantId, 'encerrada', atorId, {});

      this.gateway?.emitir(conversaId, 'atend:encerrada', {
        mensagem: mensagemEncerramento,
      });

      return atualizada;
    });
  }

  async escalar(conversaId: string, tenantId: string, dentroExpediente: boolean) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');

      if (dentroExpediente) {
        validarTransicao(c.status as Status, 'aguardando_agente');
        const atualizada = await this.prisma.db.atendimentoConversa.update({
          where: { id: conversaId },
          data: { status: 'aguardando_agente', ultimaAtividadeEm: new Date() },
        });

        await this.gravarEvento(conversaId, tenantId, 'escalada', null, {});

        // Confirmação visível ao visitante de que está sendo transferido.
        await this.persistirMensagem(conversaId, tenantId, {
          autorTipo: 'sistema',
          conteudo:
            'Você está sendo transferido(a) para um atendente. Aguarde um momento, por favor.',
        });

        this.gateway?.emitir(conversaId, 'atend:status', { status: 'aguardando_agente' });
        this.gateway?.emitirTenant(tenantId, 'atend:nova_conversa', {
          conversaId,
          canal: atualizada.canal,
          assunto: atualizada.assunto,
          secretariaId: atualizada.secretariaId,
        });

        return atualizada;
      } else {
        // Fora do expediente: mantém status 'bot' e ENVIA a mensagem de fora-expediente.
        const tenant = await this.prisma.db.tenant.findFirst({
          select: { atendimentoMensagemForaExp: true },
        });
        const mensagem =
          tenant?.atendimentoMensagemForaExp ??
          'Nosso atendimento está fora do horário. Você pode registrar uma manifestação pela Ouvidoria ou e-SIC, ou deixar sua mensagem que retornaremos no próximo expediente.';
        await this.persistirMensagem(conversaId, tenantId, {
          autorTipo: 'sistema',
          conteudo: mensagem,
        });
        return { foraDoExpediente: true, mensagem };
      }
    });
  }

  // ------------------------------------------------------------------ tags

  async setTags(conversaId: string, tenantId: string, tagIds: string[]) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');
      return this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { tagIds },
      });
    });
  }

  // ------------------------------------------------------------------ transcrição

  async transcricao(conversaId: string, tenantId: string): Promise<string> {
    return TenantContext.run({ tenantId }, async () => {
      const msgs = await this.prisma.db.atendimentoMensagem.findMany({
        where: { conversaId, interno: false },
        orderBy: { criadoEm: 'asc' },
      });

      const linhas = msgs.map((m) => {
        const ts = m.criadoEm.toISOString().replace('T', ' ').slice(0, 19);
        return `[${ts}] ${m.autorTipo.toUpperCase()}: ${m.conteudo}`;
      });

      return linhas.join('\n');
    });
  }

  // ------------------------------------------------------------------ incrementar tentativas bot

  async incrementarBotTentativas(conversaId: string, tenantId: string): Promise<number> {
    return TenantContext.run({ tenantId }, async () => {
      const updated = await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { botTentativas: { increment: 1 } },
        select: { botTentativas: true },
      });
      return updated.botTentativas;
    });
  }

  // ------------------------------------------------------------------ helpers

  private async gravarEvento(
    conversaId: string,
    tenantId: string,
    tipo: string,
    atorId: string | null,
    payload: object,
  ) {
    await this.prisma.db.atendimentoEvento.create({
      data: {
        tenantId,
        conversaId,
        tipo,
        atorId,
        payload: payload as any,
      },
    });
  }
}
