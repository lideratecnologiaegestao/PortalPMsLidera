import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { IaService } from '../ia/ia.service';
import { ChatGateway } from './chat.gateway';
import { QUEUE_CHAT, JOB_CHAT_BOT_RESPONDER } from '../queue/queue.constants';

/** E-mail determinístico do bot por tenant (nunca usa autenticação). */
const botEmail = (tenantId: string) => `assistente-ia@${tenantId}.bot`;

/**
 * Serviço do Assistente do Portal — bot IA do chat interno.
 * Responsável por:
 * 1. Garantir a existência do bot user por tenant (get-or-create).
 * 2. Enfileirar JOB_CHAT_BOT_RESPONDER quando um humano envia mensagem
 *    numa conversa em que o bot é participante.
 * 3. Processar a mensagem no worker (chamado pelo ChatBotWorker):
 *    monta histórico → chama IaService.chatMultiturno(interno=true) → persiste.
 */
@Injectable()
export class ChatBotService {
  private readonly log = new Logger(ChatBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ia: IaService,
    private readonly gateway: ChatGateway,
    @InjectQueue(QUEUE_CHAT) private readonly fila: Queue,
  ) {}

  // ------------------------------------------------------------------ bot user

  /**
   * Retorna (ou cria) o usuário bot do tenant. Idempotente.
   * O bot tem role=servidor, isBot=true, ativo=true, sem senha.
   */
  async ensureBotUser(tenantId: string): Promise<{ id: string; nome: string }> {
    const email = botEmail(tenantId);

    // Tenta buscar no escopo do tenant (RLS ativo)
    const existente = await this.prisma.db.user.findFirst({
      where: { email, isBot: true },
      select: { id: true, nome: true },
    });
    if (existente) return existente;

    // Cria o bot user
    const bot = await this.prisma.db.user.create({
      data: {
        tenantId,
        nome: 'Assistente do Portal',
        email,
        role: 'servidor' as any,
        isBot: true,
        ativo: true,
      },
      select: { id: true, nome: true },
    });
    this.log.log(`Bot user criado para tenant ${tenantId}: ${bot.id}`);
    return bot;
  }

  // ------------------------------------------------------------------ fila

  /**
   * Enfileira uma resposta do bot para a mensagem enviada pelo humano.
   * jobId é determinístico (mensagemId) — BullMQ garante idempotência.
   * Não bloqueia o request HTTP; o worker responde de forma assíncrona.
   */
  async enfileirarResposta(
    conversaId: string,
    mensagemId: string,
    tenantId: string,
  ): Promise<void> {
    await this.fila.add(
      JOB_CHAT_BOT_RESPONDER,
      { conversaId, mensagemId, tenantId },
      {
        jobId: `chat-bot-${mensagemId}`, // idempotência
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    );
  }

  // ------------------------------------------------------------------ processamento

  /**
   * Processa a mensagem do humano e gera a resposta do Assistente do Portal.
   * Chamado pelo ChatBotWorker dentro do TenantContext correto.
   */
  async processarMensagem(
    conversaId: string,
    mensagemId: string,
    tenantId: string,
  ): Promise<void> {
    await TenantContext.run({ tenantId }, async () => {
      try {
        // Carrega conversa + participantes
        const conversa = await this.prisma.db.chatConversa.findUnique({
          where: { id: conversaId },
          include: { participantes: true },
        });
        if (!conversa) return;

        // Verifica se algum participante é bot
        const botUserId = await this.encontrarBotParticipante(conversa.participantes, tenantId);
        if (!botUserId) return; // sem bot na conversa — ignora

        // Verifica se a mensagem que disparou o job foi enviada pelo próprio bot (evita loop)
        const msg = await this.prisma.db.chatMensagem.findUnique({
          where: { id: mensagemId },
          select: { autorId: true, conteudo: true },
        });
        if (!msg || msg.autorId === botUserId) return; // bot não responde a si mesmo
        if (!msg.conteudo?.trim()) return; // mensagem vazia (anexo puro)

        // Monta histórico (últimas 10 mensagens, excluindo excluídas)
        const historicoBruto = await this.prisma.db.chatMensagem.findMany({
          where: { conversaId, excluidoEm: null },
          orderBy: { criadoEm: 'asc' },
          take: 20,
          select: { autorId: true, conteudo: true },
        });

        const historico: { papel: 'user' | 'assistant'; texto: string }[] = historicoBruto
          .filter((m) => m.conteudo)
          .slice(-10)
          .map((m) => ({
            papel: m.autorId === botUserId ? 'assistant' : 'user',
            texto: m.conteudo!,
          }));

        // Chama a IA no modo interno (inclui Manual do Sistema, publico=false)
        const resultado = await this.ia.chatMultiturno(
          historico,
          msg.conteudo.trim(),
          tenantId,
          undefined,
          { interno: true },
        );

        // Persiste a resposta como mensagem do bot
        await this.persistirMensagemBot(conversaId, tenantId, botUserId, resultado.resposta);
      } catch (err) {
        this.log.error(
          `Erro ao processar mensagem do bot [conversa=${conversaId}]: ${(err as Error).message}`,
        );
      }
    });
  }

  /**
   * Persiste a resposta do bot como ChatMensagem e emite o evento WebSocket
   * para os clientes conectados na sala `conv:<id>`.
   */
  async persistirMensagemBot(
    conversaId: string,
    tenantId: string,
    botUserId: string,
    conteudo: string,
  ): Promise<void> {
    const msg = await this.prisma.db.chatMensagem.create({
      data: {
        tenantId,
        conversaId,
        autorId: botUserId,
        conteudo,
        anexos: [],
      },
    });
    await this.prisma.db.chatConversa.update({
      where: { id: conversaId },
      data: { atualizadoEm: new Date() },
    });

    // Carrega dados do bot para montar o DTO (mesmo formato do ChatService.toDto)
    const bot = await this.prisma.db.user.findUnique({
      where: { id: botUserId },
      select: { id: true, nome: true, avatarStorageKey: true },
    });
    const dto = {
      id: msg.id,
      conversaId: msg.conversaId,
      autorId: msg.autorId,
      autorNome: bot?.nome ?? 'Assistente do Portal',
      autorAvatar: null,
      conteudo: msg.conteudo,
      excluido: false,
      editado: false,
      respondendoA: null,
      anexos: [],
      criadoEm: msg.criadoEm,
    };
    this.gateway.emitirConversa(conversaId, 'mensagem', dto);
  }

  // ------------------------------------------------------------------ helpers

  /**
   * Encontra o userId do bot entre os participantes da conversa.
   * Retorna null se a conversa não tem bot.
   */
  private async encontrarBotParticipante(
    participantes: { userId: string }[],
    tenantId: string,
  ): Promise<string | null> {
    if (!participantes.length) return null;
    const userIds = participantes.map((p) => p.userId);

    // Verifica qual dos participantes é o bot
    const bot = await this.prisma.db.user.findFirst({
      where: { id: { in: userIds }, isBot: true },
      select: { id: true },
    });
    return bot?.id ?? null;
  }

  /**
   * Verifica se a conversa tem o bot como participante.
   * Usado pelo ChatService para decidir se enfileira o job.
   */
  async conversaTembBot(conversaId: string): Promise<string | null> {
    const participantes = await this.prisma.db.chatParticipante.findMany({
      where: { conversaId },
      select: { userId: true },
    });
    return this.encontrarBotParticipante(participantes, '');
  }
}
