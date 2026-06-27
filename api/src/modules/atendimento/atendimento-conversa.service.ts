import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
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

/**
 * Personaliza a saudação com o primeiro nome informado no início do atendimento.
 * - Se a saudação tiver o placeholder `{nome}`, interpola.
 * - Senão, prefixa um cumprimento pelo nome.
 * - Sem nome, devolve a saudação como está.
 */
export function personalizarSaudacao(saudacao: string, nome?: string | null): string {
  const primeiroNome = nome?.trim().split(/\s+/)[0];
  if (!primeiroNome) return saudacao;
  // 1) Placeholder explícito: o tenant decide onde o nome entra.
  if (/\{nome\}/i.test(saudacao)) return saudacao.replace(/\{nome\}/gi, primeiroNome);
  // 2) Já começa com uma saudação (Olá/Oi)? injeta o nome no vocativo, sem duplicar
  //    o cumprimento. Ex.: "Olá, seja bem-vindo…" → "Olá, Bruno! Seja bem-vindo…".
  const m = saudacao.match(/^(\s*)(olá|ola|oi)\s*[,!.]?\s*/i);
  if (m) {
    const resto = saudacao.slice(m[0].length);
    const restoCap = resto ? resto.charAt(0).toUpperCase() + resto.slice(1) : resto;
    return `Olá, ${primeiroNome}! ${restoCap}`.trim();
  }
  // 3) Sem saudação inicial: prefixa um cumprimento pelo nome.
  return `Olá, ${primeiroNome}! ${saudacao}`;
}

@Injectable()
export class AtendimentoConversaService {
  // Injetado pelo módulo via setter (evita dependência circular com gateway)
  private gateway?: {
    emitir(conversaId: string, evento: string, payload: unknown): void;
    emitirTenant(tenantId: string, evento: string, payload: unknown): void;
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificacoes: NotificacoesService,
  ) {}

  setGateway(gw: {
    emitir(conversaId: string, evento: string, payload: unknown): void;
    emitirTenant(tenantId: string, evento: string, payload: unknown): void;
  }) {
    this.gateway = gw;
  }

  // ------------------------------------------------------------------ iniciar

  async iniciar(opts: {
    tenantId: string;
    canal: 'widget' | 'whatsapp' | 'instagram' | 'messenger' | 'telegram';
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

      // Grava saudação do bot se configurada (personalizada pelo nome quando houver)
      if (tenant?.atendimentoSaudacao) {
        await this.prisma.db.atendimentoMensagem.create({
          data: {
            tenantId: opts.tenantId,
            conversaId: c.id,
            autorTipo: 'bot',
            conteudo: personalizarSaudacao(tenant.atendimentoSaudacao, opts.visitanteNome),
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

  /**
   * Variante de `iniciar` que também persiste `canalId` (multi-número Meta, migration 081).
   * Usado pelo WhatsappMetaCanalWebhookController para vincular a conversa ao canal de origem,
   * de modo que as respostas saiam pelo mesmo número que originou o contato.
   */
  async iniciarComCanal(opts: {
    tenantId: string;
    canal: 'widget' | 'whatsapp' | 'instagram' | 'messenger' | 'telegram';
    canalId: string;
    visitanteNome?: string;
    visitanteEmail?: string;
    visitanteTelefone?: string;
    visitanteIdentificador?: string;
    secretariaId?: string;
    assunto?: string;
    origemUrl?: string;
  }) {
    const conversa = await TenantContext.run({ tenantId: opts.tenantId }, async () => {
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
          canalId: opts.canalId,
          status: 'bot',
          visitanteNome: opts.visitanteNome,
          visitanteEmail: opts.visitanteEmail,
          visitanteTelefone: opts.visitanteTelefone,
          visitanteIdentificador: opts.visitanteIdentificador,
          secretariaId: opts.secretariaId,
          assunto: opts.assunto,
          origemUrl: opts.origemUrl,
        } as any,
      });

      if (tenant?.atendimentoSaudacao) {
        await this.prisma.db.atendimentoMensagem.create({
          data: {
            tenantId: opts.tenantId,
            conversaId: c.id,
            autorTipo: 'bot',
            conteudo: personalizarSaudacao(tenant.atendimentoSaudacao, opts.visitanteNome),
            interno: false,
          },
        });
      }

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
        canalId: opts.canalId,
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
      /** Botões de resposta rápida (transientes — só vão no socket, não persistem). */
      opcoes?: { label: string; valor: string }[];
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
          ...(dados.opcoes?.length ? { opcoes: dados.opcoes } : {}),
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

  /**
   * Roles que têm acesso ao canal 'ouvidoria' (ADR-0005).
   * Qualquer outro papel só enxerga canais não-ouvidoria.
   */
  private static readonly ROLES_OUVIDORIA = new Set(['ouvidor', 'assistente_ouvidoria', 'super_admin']);

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

      // ADR-0005: filtra canal 'ouvidoria' para papéis sem acesso à ouvidoria.
      const podeVerOuvidoria = AtendimentoConversaService.ROLES_OUVIDORIA.has(opts.role);
      if (opts.canal) {
        // Se o papel não pode ver ouvidoria e o filtro pede exatamente 'ouvidoria', retorna vazio.
        if (!podeVerOuvidoria && opts.canal === 'ouvidoria') {
          return { items: [], total: 0, page, pageSize: take, totalPaginas: 0 };
        }
        where.canal = opts.canal;
      } else if (!podeVerOuvidoria) {
        // Sem filtro de canal: exclui 'ouvidoria' da listagem.
        where.canal = { not: 'ouvidoria' };
      }

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
      // LOCK ATÔMICO: "o primeiro a assumir trava". O UPDATE condicional só altera
      // a linha se ela ainda estiver `aguardando_agente` — uma única transação
      // vence a corrida; os demais recebem count=0. Evita dois atendentes na mesma
      // conversa (o findUnique+update anterior tinha janela de corrida).
      const r = await this.prisma.db.atendimentoConversa.updateMany({
        where: { id: conversaId, status: 'aguardando_agente' },
        data: { status: 'em_atendimento', agenteId, ultimaAtividadeEm: new Date() },
      });

      if (r.count === 0) {
        // Não travou: ou não existe, ou já foi assumida por alguém.
        const atual = await this.prisma.db.atendimentoConversa.findUnique({
          where: { id: conversaId },
          select: { id: true, status: true, agenteId: true },
        });
        if (!atual) throw new NotFoundException('Conversa não encontrada.');
        // Idempotente: o PRÓPRIO agente reassumindo a sua conversa em andamento.
        if (!(atual.status === 'em_atendimento' && atual.agenteId === agenteId)) {
          throw new ConflictException(
            'Este atendimento já foi assumido por outro atendente.',
          );
        }
      }

      const atualizada = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
        include: { agente: { select: { id: true, nome: true } } },
      });

      // Só gera evento/emite quando ESTE agente foi quem travou agora.
      if (r.count > 0) {
        await this.gravarEvento(conversaId, tenantId, 'assumida', agenteId, {});
        this.gateway?.emitir(conversaId, 'atend:status', {
          status: 'em_atendimento',
          agenteId,
          agenteNome: atualizada?.agente?.nome,
        });
      }

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

      // Notifica agente atribuído (fire-and-forget, LGPD-safe)
      void this.notificacoes
        .avisarAgente(tenantId, dados.agenteId, { conversaId, canal: atualizada.canal })
        .catch(() => undefined);

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

      // Notifica atendentes da secretaria destino (fire-and-forget, LGPD-safe)
      void this.notificacoes
        .avisarAtendentesSecretaria(tenantId, secretariaId, { conversaId, canal: atualizada.canal })
        .catch(() => undefined);

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

  async escalar(
    conversaId: string,
    tenantId: string,
    dentroExpediente: boolean,
    secretariaId?: string,
  ) {
    return TenantContext.run({ tenantId }, async () => {
      const c = await this.prisma.db.atendimentoConversa.findUnique({
        where: { id: conversaId },
      });
      if (!c) throw new NotFoundException('Conversa não encontrada.');

      if (dentroExpediente) {
        validarTransicao(c.status as Status, 'aguardando_agente');

        // Valida se a secretaria existe antes de usá-la (evita gravar id inválido)
        let secretariaResolvida: string | undefined;
        if (secretariaId) {
          const sec = await this.prisma.db.secretaria.findUnique({
            where: { id: secretariaId },
            select: { id: true },
          });
          secretariaResolvida = sec?.id;
        }

        const dataUpdate: Record<string, unknown> = {
          status: 'aguardando_agente',
          ultimaAtividadeEm: new Date(),
        };
        if (secretariaResolvida) {
          dataUpdate.secretariaId = secretariaResolvida;
        }

        const atualizada = await this.prisma.db.atendimentoConversa.update({
          where: { id: conversaId },
          data: dataUpdate as any,
        });

        await this.gravarEvento(conversaId, tenantId, 'escalada', null, {
          ...(secretariaResolvida ? { secretariaId: secretariaResolvida } : {}),
        });

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

        if (secretariaResolvida) {
          // Roteamento para secretaria específica: notifica atendentes daquela secretaria
          void this.notificacoes
            .avisarAtendentesSecretaria(tenantId, secretariaResolvida, {
              conversaId,
              canal: atualizada.canal,
            })
            .catch(() => undefined);
        } else {
          // Fila geral: notifica ouvidores via WhatsApp + e-mail (fire-and-forget, LGPD-safe)
          void this.notificacoes
            .avisarOuvidoresAtendimento(tenantId, { conversaId, canal: atualizada.canal })
            .catch(() => undefined);
        }

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
