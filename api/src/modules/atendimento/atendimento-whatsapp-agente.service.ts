import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { AtendimentoConversaService } from './atendimento-conversa.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { destinoCidadao } from './atendimento-destino.util';

/**
 * Sessão de atendimento do ouvidor/agente por mensageria (WhatsApp ou Telegram).
 *
 * Fluxo:
 *  1. O webhook (Evolution/Z-API/Meta/Telegram) resolve tenantId+remetente e
 *     chama `tentarRotearComoAgente` ANTES de criar conversa de cidadão.
 *  2. Se o remetente pertencer a um agente verificado do tenant, a mensagem é
 *     tratada como comando (ATENDER, FILA, ENCERRAR, SAIR, AJUDA) ou como
 *     resposta ao cidadão na conversa vinculada.
 *  3. O vínculo de sessão (`atend:wpp-bind:<tenantId>:<userId>`) é guardado no
 *     Redis com TTL de 6 horas, renovável a cada mensagem. O vínculo é
 *     channel-agnostic: o agente pode atender cidadão de qualquer canal.
 *
 * Segurança:
 *  - WhatsApp: só aceita agentes com whatsapp_verificado = true; match robusto BR.
 *  - Telegram: só aceita agentes com telegram_verificado = true; match exato de chat_id.
 *  - Roles aceitas: ouvidor, assistente_ouvidoria, admin_prefeitura.
 *  - Busca é tenant-scoped (TenantContext.run + this.prisma.db).
 *  - Remetente não casado retorna false → fluxo normal de cidadão.
 *
 * LGPD: mensagens de feedback ao ouvidor não expõem dados pessoais do cidadão
 *  (apenas código curto do id + assunto). Logs não contêm PII.
 */

const BIND_TTL_SEGUNDOS = 6 * 60 * 60; // 6 horas

// Roles cujos portadores podem atender pelo WhatsApp
const ROLES_AGENTE = new Set(['ouvidor', 'assistente_ouvidoria', 'admin_prefeitura']);

// Comandos (case-insensitive após normalização)
const CMD_ATENDER    = /^(atender|proximo|proxima|próximo|próxima)$/i;
const CMD_FILA       = /^(fila|lista)$/i;
const CMD_ENCERRAR   = /^(encerrar|finalizar)$/i;
const CMD_SAIR       = /^(sair|liberar)$/i;
const CMD_AJUDA      = /^(ajuda|menu|\?)$/i;
/**
 * TRANSFERIR / ENCAMINHAR / PASSAR
 * Aceita:
 *   - "TRANSFERIR"           → lista secretarias
 *   - "TRANSFERIR <número>"  → resolve pela posição na lista ordenada por nome
 *   - "TRANSFERIR <nome>"    → resolve pelo nome (busca parcial)
 * Mesmo padrão para ENCAMINHAR / PASSAR.
 */
const CMD_TRANSFERIR = /^(transferir|encaminhar|passar)(\s+.+)?$/i;

const TEXTO_AJUDA = [
  'Comandos disponíveis:',
  '  ATENDER — pega o próximo da fila',
  '  FILA — lista atendimentos aguardando',
  '  ENCERRAR — encerra o atendimento atual',
  '  SAIR — devolve o atendimento à fila',
  '  TRANSFERIR — transfere para outra secretaria (TRANSFERIR <número>)',
  '  AJUDA — exibe este menu',
  '',
  'Para responder ao cidadão, basta enviar sua mensagem normalmente enquanto estiver atendendo.',
].join('\n');

/** Chave Redis para o vínculo de sessão do agente. */
function bindKey(tenantId: string, userId: string): string {
  return `atend:wpp-bind:${tenantId}:${userId}`;
}

/** Retorna os primeiros 6 chars do UUID (código curto LGPD-safe). */
function codigoCurto(id: string): string {
  return id.replace(/-/g, '').slice(0, 6).toUpperCase();
}

/** Normaliza número para somente dígitos. */
function normalizarNumero(n: string): string {
  return n.replace(/\D/g, '');
}

/**
 * Compara dois números de telefone BR.
 * Considera: prefixo 55, 9º dígito opcional.
 * Estratégia: extrai sufixo de 8 dígitos (últimos, após DD+9) e compara.
 * Correspondência se os 8 dígitos finais (excluindo 9 ou sem) forem iguais.
 */
function telefonesCorrespondem(a: string, b: string): boolean {
  const na = normalizarNumero(a);
  const nb = normalizarNumero(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Sufixo de 8 dígitos para comparação (dígitos finais mais estáveis)
  const sufA = na.slice(-8);
  const sufB = nb.slice(-8);
  if (sufA.length < 8 || sufB.length < 8) return false;
  return sufA === sufB;
}

@Injectable()
export class AtendimentoWhatsappAgenteService {
  private readonly log = new Logger(AtendimentoWhatsappAgenteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisCacheService,
    private readonly conversaService: AtendimentoConversaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  /**
   * Ponto de entrada dos webhooks de mensageria (WhatsApp ou Telegram).
   *
   * Retorna `true` se a mensagem foi tratada como AGENTE (o webhook deve parar
   * aqui); `false` se deve seguir o fluxo normal de cidadão.
   *
   * @param tenantId    ID do tenant resolvido pelo webhook
   * @param remetente   Número (WhatsApp) ou chat_id string (Telegram) do remetente
   * @param texto       Texto da mensagem
   * @param canalId     ID do canal (Meta multi-número / Telegram canal), se houver
   * @param canalTipo   'whatsapp' (default) ou 'telegram'
   */
  async tentarRotearComoAgente(
    tenantId: string,
    remetente: string,
    texto: string,
    canalId?: string | null,
    canalTipo: 'whatsapp' | 'telegram' = 'whatsapp',
  ): Promise<boolean> {
    // 1. Identificar agente dentro do escopo do tenant
    const agente = await TenantContext.run({ tenantId }, () =>
      this.identificarAgente(tenantId, remetente, canalTipo),
    );

    if (!agente) return false; // remetente não é de um agente verificado → fluxo de cidadão

    // 2. Processar dentro do TenantContext
    try {
      await TenantContext.run({ tenantId }, () =>
        this.processarMensagemAgente(tenantId, agente, texto.trim(), canalId ?? null, remetente),
      );
    } catch (e) {
      // Best-effort: nunca derruba o webhook
      this.log.error(
        `[agente] Erro ao processar mensagem do agente ${agente.id} canal=${canalTipo} (tenant ${tenantId}): ${(e as Error).message}`,
      );
    }

    return true; // consumida como mensagem de agente
  }

  // ------------------------------------------------------------------ identificação

  private async identificarAgente(
    tenantId: string,
    remetente: string,
    canalTipo: 'whatsapp' | 'telegram',
  ): Promise<{ id: string; nome: string; role: string } | null> {
    if (canalTipo === 'telegram') {
      return this.identificarAgenteTelegram(remetente);
    }
    return this.identificarAgenteWhatsapp(remetente);
  }

  /** Identifica agente pelo número de WhatsApp verificado (match robusto BR). */
  private async identificarAgenteWhatsapp(
    numeroRemetente: string,
  ): Promise<{ id: string; nome: string; role: string } | null> {
    // Busca todos os contatos WhatsApp verificados de usuários com role de atendimento
    const contatos = await this.prisma.db.userContato.findMany({
      where: { whatsappVerificado: true, whatsapp: { not: null } },
      select: { userId: true, whatsapp: true },
    });

    for (const c of contatos) {
      if (!c.whatsapp) continue;
      if (!telefonesCorrespondem(c.whatsapp, numeroRemetente)) continue;

      const user = await this.prisma.db.user.findUnique({
        where: { id: c.userId },
        select: { id: true, nome: true, role: true },
      });

      if (!user || !ROLES_AGENTE.has(user.role)) continue;

      return { id: user.id, nome: user.nome, role: user.role };
    }

    return null;
  }

  /**
   * Identifica agente pelo chat_id do Telegram.
   * Anti-spoofing: só aceita contatos com telegram_verificado = true.
   * Match por igualdade exata (chat_id é numérico único, sem ambiguidade de formato).
   */
  private async identificarAgenteTelegram(
    chatId: string,
  ): Promise<{ id: string; nome: string; role: string } | null> {
    const contatos = await this.prisma.db.userContato.findMany({
      where: { telegramVerificado: true, telegramChatId: { not: null } },
      select: { userId: true, telegramChatId: true },
    });

    for (const c of contatos) {
      if (!c.telegramChatId) continue;
      // Comparação exata: chat_id é estável e único (sem variações de formato)
      if (String(c.telegramChatId) !== String(chatId)) continue;

      const user = await this.prisma.db.user.findUnique({
        where: { id: c.userId },
        select: { id: true, nome: true, role: true },
      });

      if (!user || !ROLES_AGENTE.has(user.role)) continue;

      return { id: user.id, nome: user.nome, role: user.role };
    }

    return null;
  }

  // ------------------------------------------------------------------ processamento

  private async processarMensagemAgente(
    tenantId: string,
    agente: { id: string; nome: string; role: string },
    texto: string,
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    const normalizado = this.normalizarComando(texto);

    if (CMD_ATENDER.test(normalizado)) {
      await this.cmdAtender(tenantId, agente, canalId, numeroRemetente);
      return;
    }

    if (CMD_FILA.test(normalizado)) {
      await this.cmdFila(tenantId, agente, canalId, numeroRemetente);
      return;
    }

    if (CMD_ENCERRAR.test(normalizado)) {
      await this.cmdEncerrar(tenantId, agente, canalId, numeroRemetente);
      return;
    }

    if (CMD_SAIR.test(normalizado)) {
      await this.cmdSair(tenantId, agente, canalId, numeroRemetente);
      return;
    }

    if (CMD_AJUDA.test(normalizado)) {
      await this.responderAgente(canalId, numeroRemetente, TEXTO_AJUDA, tenantId);
      return;
    }

    if (CMD_TRANSFERIR.test(normalizado)) {
      await this.cmdTransferir(tenantId, agente, texto.trim(), canalId, numeroRemetente);
      return;
    }

    // Texto comum → tenta encaminhar como resposta ao cidadão
    await this.encaminharParaCidadao(tenantId, agente, texto, canalId, numeroRemetente);
  }

  // ------------------------------------------------------------------ comandos

  private async cmdAtender(
    tenantId: string,
    agente: { id: string; nome: string },
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    // Pega o PRIMEIRO da fila que ainda estiver livre. Como o assumir() agora é
    // um lock atômico, dois atendentes que digitarem ATENDER ao mesmo tempo não
    // pegam a mesma conversa: o perdedor recebe ConflictException e tentamos a
    // próxima da fila (até algumas tentativas).
    const ignorar = new Set<string>();
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const proxima = await this.prisma.db.atendimentoConversa.findFirst({
        where: {
          tenantId,
          status: 'aguardando_agente',
          ...(ignorar.size ? { id: { notIn: Array.from(ignorar) } } : {}),
        },
        orderBy: { iniciadaEm: 'asc' },
        select: { id: true, assunto: true },
      });

      if (!proxima) {
        await this.responderAgente(
          canalId,
          numeroRemetente,
          'Nao ha atendimentos na fila agora.',
          tenantId,
        );
        return;
      }

      try {
        await this.conversaService.assumir(proxima.id, tenantId, agente.id);
      } catch (e) {
        if (e instanceof ConflictException) {
          // Outro atendente travou essa primeiro — tenta a próxima.
          ignorar.add(proxima.id);
          continue;
        }
        throw e;
      }

      // Vínculo no Redis (TTL 6h)
      await this.redis.set(bindKey(tenantId, agente.id), proxima.id, BIND_TTL_SEGUNDOS);

      const codigo = codigoCurto(proxima.id);
      const assunto = proxima.assunto?.slice(0, 60) || '—';
      await this.responderAgente(
        canalId,
        numeroRemetente,
        `Voce assumiu o atendimento ${codigo} (assunto: ${assunto}).\nEnvie suas mensagens. ENCERRAR finaliza, SAIR devolve a fila, FILA lista.`,
        tenantId,
      );
      return;
    }

    // Esgotou as tentativas (fila muito disputada nesse instante)
    await this.responderAgente(
      canalId,
      numeroRemetente,
      'A fila está sendo atendida por outros agentes agora. Digite FILA para ver ou ATENDER de novo.',
      tenantId,
    );
  }

  private async cmdFila(
    tenantId: string,
    _agente: { id: string },
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    const conversas = await this.prisma.db.atendimentoConversa.findMany({
      where: { tenantId, status: 'aguardando_agente' },
      orderBy: { iniciadaEm: 'asc' },
      select: { id: true, assunto: true, iniciadaEm: true },
      take: 10,
    });

    if (conversas.length === 0) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'A fila esta vazia.',
        tenantId,
      );
      return;
    }

    const now = Date.now();
    const linhas = conversas.map((c) => {
      const espera = Math.round((now - c.iniciadaEm.getTime()) / 60000);
      const assunto = (c.assunto ?? '—').slice(0, 40);
      return `• ${codigoCurto(c.id)} — ${assunto} (${espera} min)`;
    });

    const total = await this.prisma.db.atendimentoConversa.count({
      where: { tenantId, status: 'aguardando_agente' },
    });

    await this.responderAgente(
      canalId,
      numeroRemetente,
      `Fila (${total} aguardando):\n${linhas.join('\n')}`,
      tenantId,
    );
  }

  private async cmdEncerrar(
    tenantId: string,
    agente: { id: string },
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    const conversaId = await this.redis.get<string>(bindKey(tenantId, agente.id));

    if (!conversaId) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo nenhuma conversa. Digite ATENDER para pegar o proximo da fila.',
        tenantId,
      );
      return;
    }

    // Verificar que a conversa ainda pertence a este agente e está em atendimento
    const conversa = await this.prisma.db.atendimentoConversa.findUnique({
      where: { id: conversaId },
      select: { status: true, agenteId: true },
    });

    if (!conversa || conversa.status === 'encerrada') {
      await this.redis.del(bindKey(tenantId, agente.id));
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'O atendimento ja estava encerrado.',
        tenantId,
      );
      return;
    }

    await this.conversaService.encerrar(conversaId, tenantId, agente.id, 'Atendimento encerrado pelo agente.');
    await this.redis.del(bindKey(tenantId, agente.id));

    await this.responderAgente(
      canalId,
      numeroRemetente,
      'Atendimento encerrado. Digite ATENDER para pegar o proximo.',
      tenantId,
    );
  }

  private async cmdSair(
    tenantId: string,
    agente: { id: string },
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    const conversaId = await this.redis.get<string>(bindKey(tenantId, agente.id));

    if (!conversaId) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo nenhuma conversa.',
        tenantId,
      );
      return;
    }

    const conversa = await this.prisma.db.atendimentoConversa.findUnique({
      where: { id: conversaId },
      select: { status: true, agenteId: true },
    });

    if (!conversa || conversa.status === 'encerrada') {
      await this.redis.del(bindKey(tenantId, agente.id));
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'O atendimento ja estava encerrado ou nao existe.',
        tenantId,
      );
      return;
    }

    if (conversa.status !== 'em_atendimento') {
      await this.redis.del(bindKey(tenantId, agente.id));
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Nao foi possivel liberar: conversa nao esta em atendimento.',
        tenantId,
      );
      return;
    }

    // Transição em_atendimento → aguardando_agente (desatribui o agente)
    await this.prisma.db.atendimentoConversa.update({
      where: { id: conversaId },
      data: { status: 'aguardando_agente', agenteId: null, ultimaAtividadeEm: new Date() },
    });

    await this.redis.del(bindKey(tenantId, agente.id));

    await this.responderAgente(
      canalId,
      numeroRemetente,
      'Atendimento devolvido a fila. Digite ATENDER para pegar o proximo.',
      tenantId,
    );
  }

  // ------------------------------------------------------------------ transferir

  private async cmdTransferir(
    tenantId: string,
    agente: { id: string; nome: string },
    textoOriginal: string,
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    // Requer vínculo ativo com conversa em_atendimento
    const conversaId = await this.redis.get<string>(bindKey(tenantId, agente.id));
    if (!conversaId) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo ninguem. Digite ATENDER para pegar o proximo.',
        tenantId,
      );
      return;
    }

    const conversa = await this.prisma.db.atendimentoConversa.findUnique({
      where: { id: conversaId },
      select: { status: true, agenteId: true },
    });

    if (!conversa || conversa.status !== 'em_atendimento' || conversa.agenteId !== agente.id) {
      await this.redis.del(bindKey(tenantId, agente.id));
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo ninguem (vinculo expirado ou encerrado). Digite ATENDER para pegar o proximo.',
        tenantId,
      );
      return;
    }

    // Carrega secretarias do tenant ordenadas por nome (estável — índice=posição na lista)
    const secretarias = await this.prisma.db.secretaria.findMany({
      select: { id: true, nome: true },
      orderBy: { nome: 'asc' },
    });

    if (secretarias.length === 0) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Nao ha secretarias cadastradas para transferencia.',
        tenantId,
      );
      return;
    }

    // Extrai argumento após o verbo (TRANSFERIR, ENCAMINHAR, PASSAR)
    const match = textoOriginal.match(/^(?:transferir|encaminhar|passar)\s*(.*)/i);
    const argumento = match ? match[1].trim() : '';

    if (!argumento) {
      // Sem argumento → lista secretarias numeradas
      const linhas = secretarias.map((s, i) => `${i + 1}. ${s.nome}`);
      await this.responderAgente(
        canalId,
        numeroRemetente,
        `Para qual secretaria transferir? Responda TRANSFERIR <numero>:\n${linhas.join('\n')}`,
        tenantId,
      );
      return;
    }

    // Tenta resolver pelo número
    const numero = parseInt(argumento, 10);
    let secretaria: { id: string; nome: string } | undefined;

    if (!isNaN(numero) && numero >= 1 && numero <= secretarias.length) {
      secretaria = secretarias[numero - 1];
    } else {
      // Busca por nome (parcial, case-insensitive, sem acentos)
      const normalizado = this.normalizarComando(argumento).toLowerCase();
      secretaria = secretarias.find((s) =>
        this.normalizarComando(s.nome).toLowerCase().includes(normalizado),
      );
    }

    if (!secretaria) {
      const linhas = secretarias.map((s, i) => `${i + 1}. ${s.nome}`);
      await this.responderAgente(
        canalId,
        numeroRemetente,
        `Secretaria nao encontrada. Escolha pelo numero:\n${linhas.join('\n')}`,
        tenantId,
      );
      return;
    }

    // Executa a transferência via FSM e limpa o vínculo Redis
    await this.conversaService.transferir(conversaId, tenantId, agente.id, secretaria.id);
    await this.redis.del(bindKey(tenantId, agente.id));

    await this.responderAgente(
      canalId,
      numeroRemetente,
      `Atendimento transferido para ${secretaria.nome}. ✅`,
      tenantId,
    );
  }

  // ------------------------------------------------------------------ encaminhar ao cidadão

  private async encaminharParaCidadao(
    tenantId: string,
    agente: { id: string; nome: string },
    texto: string,
    canalId: string | null,
    numeroRemetente: string,
  ): Promise<void> {
    const conversaId = await this.redis.get<string>(bindKey(tenantId, agente.id));

    if (!conversaId) {
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo ninguem. Digite ATENDER para pegar o proximo da fila ou FILA para ver quem aguarda.',
        tenantId,
      );
      return;
    }

    // Verificar que a conversa ainda está em atendimento com este agente
    const conversa = await this.prisma.db.atendimentoConversa.findUnique({
      where: { id: conversaId },
      select: {
        status: true,
        agenteId: true,
        canal: true,
        visitanteTelefone: true,
        visitanteIdentificador: true,
        canalId: true,
      },
    });

    if (!conversa || conversa.status !== 'em_atendimento' || conversa.agenteId !== agente.id) {
      // Vínculo inválido ou conversa encerrada — limpa Redis e orienta
      await this.redis.del(bindKey(tenantId, agente.id));
      await this.responderAgente(
        canalId,
        numeroRemetente,
        'Voce nao esta atendendo ninguem (vinculo expirado ou encerrado). Digite ATENDER para pegar o proximo.',
        tenantId,
      );
      return;
    }

    // Persiste a mensagem do agente (emite Socket.IO automaticamente via conversaService)
    await this.conversaService.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'agente',
      autorId: agente.id,
      conteudo: texto.slice(0, 5000),
    });

    // Entrega ao cidadão no canal de origem
    try {
      if (['whatsapp', 'instagram', 'messenger', 'telegram'].includes(conversa.canal)) {
        // destinoCidadao: whatsapp→telefone; messenger/instagram/telegram→PSID/chat_id
        const destino = destinoCidadao(conversa);

        if (destino) {
          if (conversa.canalId) {
            await this.whatsapp.enviarPorCanal(conversa.canalId, destino, texto).catch(() => undefined);
          } else if (conversa.canal === 'whatsapp') {
            await this.whatsapp.enviar(destino, texto).catch(() => undefined);
          }
        }
      }
    } catch {
      // best-effort: não derruba se entrega ao cidadão falhar
    }

    // Renova o TTL do vínculo
    await this.redis.set(bindKey(tenantId, agente.id), conversaId, BIND_TTL_SEGUNDOS);
  }

  // ------------------------------------------------------------------ helpers

  /** Responde ao ouvidor pelo WhatsApp que originou sua mensagem. */
  private async responderAgente(
    canalId: string | null,
    numeroRemetente: string,
    texto: string,
    tenantId: string,
  ): Promise<void> {
    try {
      if (canalId) {
        await this.whatsapp.enviarPorCanal(canalId, numeroRemetente, texto);
      } else {
        await this.whatsapp.enviar(numeroRemetente, texto);
      }
    } catch (e) {
      this.log.warn(
        `[agente] Falha ao responder agente ${numeroRemetente.slice(-4)} (tenant ${tenantId}): ${(e as Error).message}`,
      );
    }
  }

  /**
   * Normaliza um comando: remove acentos, trim, uppercase.
   * Permite que "próximo", "próxima" etc. sejam capturados.
   */
  private normalizarComando(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // remove diacríticos
      .trim();
  }
}
