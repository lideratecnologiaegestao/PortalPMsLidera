import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { IaService } from '../ia/ia.service';
import { ManifestacoesService } from '../manifestacoes/manifestacoes.service';
import { TramitacaoService } from '../manifestacoes/tramitacao.service';
import { ExpedienteService } from './expediente.service';
import { AtendimentoConversaService, redigirPII } from './atendimento-conversa.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { sanitizarTexto } from '../ia/ia.prompts';
import {
  FERRAMENTAS_OUVIDORIA,
  ouvidoriaAddendum,
  executarFerramentaOuvidoria,
} from './atendimento-bot-tools';

// Intents de falar com atendente
const PALAVRAS_ATENDENTE = [
  'atendente', 'humano', 'falar com', 'quero falar', 'preciso de ajuda humana',
  'pessoa real', 'funcionário', 'servidor', 'transferir', 'transfere', 'atendimento humano',
];

// Intents de consultar protocolo
const PALAVRAS_PROTOCOLO = [
  'protocolo', 'acompanhar', 'consultar', 'minha solicitação', 'meu pedido',
  'esic', 'número de protocolo',
];

// Intent de REGISTRAR (genérico, sem o tipo definido) → manda o menu de tipos.
const PALAVRAS_REGISTRAR = [
  'registrar', 'ocorrência', 'ocorrencia', 'manifestação', 'manifestacao',
  'registrar uma', 'abrir uma',
];
// Tipos específicos já citados → vai direto ao fluxo (não mostra o menu).
const PALAVRAS_TIPO = [
  'denúncia', 'denuncia', 'denunciar', 'reclamação', 'reclamacao', 'reclamar',
  'sugestão', 'sugestao', 'sugerir', 'elogio', 'elogiar', 'solicitação', 'solicitacao',
];

/**
 * Menu de tipos de manifestação (resposta rápida no chat). O `valor` NÃO contém
 * as palavras-gatilho de "registrar" (evita reabrir o menu em loop); ao clicar,
 * a IA recebe o tipo e conduz a coleta + abertura via `abrir_manifestacao`.
 */
const MENU_TIPOS_MANIFESTACAO = [
  { label: '🚨 Denúncia', valor: 'Quero fazer uma denúncia.' },
  { label: '😠 Reclamação', valor: 'Quero fazer uma reclamação.' },
  { label: '💡 Sugestão', valor: 'Quero deixar uma sugestão.' },
  { label: '👏 Elogio', valor: 'Quero deixar um elogio.' },
  { label: '📋 Solicitação', valor: 'Quero fazer uma solicitação.' },
];

/** Regex de identificador de protocolo (ex.: 2024-OUV-00123 ou 2026000001). */
const PROTOCOLO_REGEX = /\b(?:\d{4}-(?:OUV|SIC|ESI|MAN)-?\d{4,}|\d{10})\b/i;

type Intent =
  | 'registrar_manifestacao'
  | 'consultar_protocolo'
  | 'falar_com_atendente'
  | 'faq'
  | 'aguardar_protocolo_input';

/**
 * Orquestra a interação do bot com o visitante quando status='bot'.
 * - Detecta intent
 * - FAQ via IaService.chatMultiturno
 * - Escala para humano via AtendimentoConversaService.escalar
 * - Redigir PII antes de enviar à IA
 */
@Injectable()
export class AtendimentoBotService {
  private readonly log = new Logger(AtendimentoBotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ia: IaService,
    private readonly manifestacoes: ManifestacoesService,
    private readonly tramitacao: TramitacaoService,
    private readonly expediente: ExpedienteService,
    private readonly conversa: AtendimentoConversaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  async processarMensagem(conversaId: string, mensagemId: string, tenantId: string) {
    await TenantContext.run({ tenantId }, async () => {
      try {
        const c = await this.prisma.db.atendimentoConversa.findUnique({
          where: { id: conversaId },
        }) as { id: string; status: string; canal: 'widget' | 'whatsapp' | 'instagram' | 'messenger' | 'telegram' | string; visitanteTelefone: string | null; botTentativas: number; canalId?: string | null } | null;
        if (!c || c.status !== 'bot') return;

        // Atalho para enviar resposta do bot com roteamento WhatsApp automático (migration 081)
        const responder = (conteudo: string, opcoes?: { label: string; valor: string }[]) =>
          this.enviarRespostaBot(
            conversaId,
            tenantId,
            conteudo,
            c.visitanteTelefone,
            c.canal,
            c.canalId,
            opcoes,
          );

        const tenant = await this.prisma.db.tenant.findFirst({
          select: {
            iaChatWidgetAtivo: true,
            iaChatHabilitada: true,
            atendimentoHumanoAtivo: true,
          },
        });

        const msg = await this.prisma.db.atendimentoMensagem.findUnique({
          where: { id: mensagemId },
        });
        if (!msg) return;

        const texto = msg.conteudo.trim();

        // 1. Se IA desabilitada mas atendimento humano ativo → escala direto
        const iaAtiva = tenant?.iaChatWidgetAtivo && tenant?.iaChatHabilitada;
        if (!iaAtiva && tenant?.atendimentoHumanoAtivo) {
          await this.escalarComExpediente(conversaId, tenantId);
          return;
        }
        // Se atendimento humano está desligado, o bot não processa nada
        if (!tenant?.atendimentoHumanoAtivo) {
          await responder('O atendimento está temporariamente indisponível. Por favor, tente novamente mais tarde.');
          return;
        }

        // 2. Detectar intent
        const intent = this.detectarIntent(texto, c);

        if (intent === 'falar_com_atendente') {
          await this.escalarComExpediente(conversaId, tenantId);
          return;
        }

        if (intent === 'registrar_manifestacao') {
          await responder(
            'Claro! Que tipo de manifestação você deseja registrar? Toque em uma das opções abaixo — ou descreva o caso que eu identifico para você. 😊',
            MENU_TIPOS_MANIFESTACAO,
          );
          return;
        }

        if (intent === 'consultar_protocolo') {
          // Verifica se já tem protocolo no texto
          const match = PROTOCOLO_REGEX.exec(texto);
          if (match) {
            await this.resolverProtocolo(conversaId, tenantId, match[0], null, c);
          } else {
            // Pede o protocolo
            await responder(
              'Para acompanhar sua manifestação, informe o número do protocolo e a chave de acompanhamento (ex.: protocolo 2026000001 e chave AB3KM-QWE79).',
            );
          }
          return;
        }

        if (intent === 'aguardar_protocolo_input') {
          // Tenta extrair protocolo e chave de formato: PROTOCOLO CHAVE ou PROTOCOLO / CHAVE
          const partes = texto.split(/[\s/|,]+/);
          const protocolo = partes.find((p) => PROTOCOLO_REGEX.test(p));
          const chave = partes.find((p) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(p));
          if (protocolo) {
            await this.resolverProtocolo(conversaId, tenantId, protocolo, chave ?? null, c);
          } else {
            await responder('Não consegui identificar o protocolo. Informe o número (ex.: 2026000001) e a chave (ex.: AB3KM-QWE79).');
          }
          return;
        }

        // 3. FAQ via IA
        await this.responderFaq(conversaId, tenantId, texto, c.botTentativas, c);
      } catch (err) {
        this.log.error(
          `Erro ao processar mensagem bot [conversa=${conversaId}]: ${(err as Error).message}`,
        );
        // Em caso de erro → escala
        try {
          await this.escalarComExpediente(conversaId, tenantId);
        } catch {
          // best-effort
        }
      }
    });
  }

  private detectarIntent(texto: string, c: { botTentativas: number }): Intent {
    const lower = texto.toLowerCase();

    // Falar com atendente
    if (PALAVRAS_ATENDENTE.some((w) => lower.includes(w))) {
      return 'falar_com_atendente';
    }

    // Registrar manifestação SEM tipo definido → manda o menu de tipos.
    // Se o cidadão já disse o tipo (ex.: "quero denunciar"), pula o menu e vai ao fluxo.
    const querRegistrar = PALAVRAS_REGISTRAR.some((w) => lower.includes(w));
    const jaTemTipo = PALAVRAS_TIPO.some((w) => lower.includes(w));
    if (querRegistrar && !jaTemTipo && !PROTOCOLO_REGEX.test(texto)) {
      return 'registrar_manifestacao';
    }

    // Iniciar consulta de protocolo
    if (PALAVRAS_PROTOCOLO.some((w) => lower.includes(w)) || PROTOCOLO_REGEX.test(texto)) {
      return 'consultar_protocolo';
    }

    // Se a mensagem anterior foi um pedido de protocolo, tentar parsear.
    // ATENÇÃO: exigir o FORMATO real de protocolo (10 dígitos / XXXX-OUV-NNNN)
    // ou de chave (AAAAA-BBBBB). NÃO basta "4 dígitos" — um ANO citado numa
    // pergunta histórica (ex.: "o que houve em 1902?") casava \d{4} e era
    // erroneamente tratado como número de protocolo, sequestrando a pergunta.
    if (c.botTentativas > 0) {
      if (PROTOCOLO_REGEX.test(texto) || /\b[A-Z0-9]{5}-[A-Z0-9]{5}\b/i.test(texto)) {
        return 'aguardar_protocolo_input';
      }
    }

    return 'faq';
  }

  private async resolverProtocolo(
    conversaId: string,
    tenantId: string,
    protocolo: string,
    chave: string | null,
    c: { canal: string; visitanteTelefone: string | null; canalId?: string | null },
  ) {
    try {
      const detalhe = await this.tramitacao.acompanhar(protocolo, chave ?? undefined);
      const resumo = `Protocolo: ${protocolo}\nStatus: ${(detalhe as any).status}\nAssunto: ${(detalhe as any).assunto ?? '(não informado)'}`;
      await this.enviarRespostaBot(
        conversaId,
        tenantId,
        `Encontrei sua solicitação:\n${resumo}\n\nDeseja falar com um atendente para mais detalhes?`,
        c.visitanteTelefone,
        c.canal,
        c.canalId,
      );
    } catch {
      await this.enviarRespostaBot(
        conversaId,
        tenantId,
        'Não encontrei o protocolo informado. Verifique os dados e tente novamente, ou fale com um atendente.',
        c.visitanteTelefone,
        c.canal,
        c.canalId,
      );
    }
  }

  private async responderFaq(
    conversaId: string,
    tenantId: string,
    texto: string,
    tentativas: number,
    c: { canal: string; visitanteTelefone: string | null; canalId?: string | null },
  ) {
    // Recupera histórico (até 10 mensagens) para passar à IA
    const historico = await this.prisma.db.atendimentoMensagem.findMany({
      where: { conversaId, interno: false },
      orderBy: { criadoEm: 'asc' },
      take: 20,
    });

    const historicoFormatado: Array<{ papel: 'user' | 'assistant'; texto: string }> =
      historico
        .filter((m) => m.autorTipo === 'visitante' || m.autorTipo === 'bot')
        .slice(-10) // últimas 10 trocas
        .map((m) => ({
          papel: m.autorTipo === 'visitante' ? 'user' : 'assistant',
          texto: m.conteudo,
        }));

    // Redigir PII antes de enviar à IA.
    // OBS: o que o cidadão escolher se identificar (nome/e-mail para manifestação
    // não-anônima) é coletado pelo próprio fluxo de tool — aqui mascaramos para o RAG.
    const perguntaSegura = sanitizarTexto(redigirPII(texto));

    // Ferramentas de ação da ouvidoria, ligadas a ESTA conversa (RLS já ativo).
    const extra = {
      tools: FERRAMENTAS_OUVIDORIA,
      systemAddendum: ouvidoriaAddendum(),
      executar: (nome: string, input: Record<string, unknown>) =>
        executarFerramentaOuvidoria(
          {
            manifestacoes: this.manifestacoes,
            tramitacao: this.tramitacao,
            escalar: () => this.escalarComExpediente(conversaId, tenantId),
            vincular: (manifestacaoId: string, protocolo: string) =>
              this.vincularManifestacao(conversaId, tenantId, manifestacaoId, protocolo),
          },
          nome,
          input,
        ),
    };

    try {
      const resultado = await this.ia.chatMultiturno(
        historicoFormatado,
        perguntaSegura,
        tenantId,
        extra,
      );

      await this.enviarRespostaBot(
        conversaId,
        tenantId,
        resultado.resposta,
        c.visitanteTelefone,
        c.canal,
        c.canalId,
      );

      // Incrementa tentativas
      const novasTentativas = await this.conversa.incrementarBotTentativas(conversaId, tenantId);

      // ≥2 falhas/baixa confiança → oferece escalar
      if (novasTentativas >= 2 && (!resultado.confianca || resultado.confianca < 0.5)) {
        await this.enviarRespostaBot(
          conversaId,
          tenantId,
          'Posso transferi-lo(a) para um atendente humano se preferir. Deseja ser atendido(a) por uma pessoa?',
          c.visitanteTelefone,
          c.canal,
          c.canalId,
        );
      }
    } catch (err) {
      this.log.warn(`IA indisponível [conversa=${conversaId}]: ${(err as Error).message}`);
      const novasTentativas = await this.conversa.incrementarBotTentativas(conversaId, tenantId);

      if (novasTentativas >= 2) {
        await this.escalarComExpediente(conversaId, tenantId);
      } else {
        await this.enviarRespostaBot(
          conversaId,
          tenantId,
          'Desculpe, não consegui processar sua solicitação. Gostaria de falar com um atendente?',
          c.visitanteTelefone,
          c.canal,
          c.canalId,
        );
      }
    }
  }

  private async escalarComExpediente(conversaId: string, tenantId: string) {
    const dentro = await this.expediente.dentroDoExpediente(tenantId);
    await this.conversa.escalar(conversaId, tenantId, dentro);
  }

  /**
   * Persiste uma resposta do bot E envia por WhatsApp quando a conversa vier de webhook.
   * Roteamento de saída (migration 081):
   *   - canalId presente → enviarPorCanal (multi-número Meta)
   *   - canalId ausente  → enviar (config única, retrocompat)
   * É best-effort: falha no envio WhatsApp não impede a persistência.
   */
  private async enviarRespostaBot(
    conversaId: string,
    tenantId: string,
    conteudo: string,
    telefone: string | null | undefined,
    canal: string,
    canalId: string | null | undefined,
    opcoes?: { label: string; valor: string }[],
  ) {
    await this.conversa.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'bot',
      conteudo,
      ...(opcoes?.length ? { opcoes } : {}),
    });

    // Envio de saída para canais externos (migration 083: messenger + telegram)
    // Telegram usa visitanteIdentificador (chat_id) como destino — visitanteTelefone pode ser null.
    const canalExterno = ['whatsapp', 'instagram', 'messenger', 'telegram'].includes(canal);
    if (canalExterno && (telefone || canal === 'telegram')) {
      try {
        await TenantContext.run({ tenantId }, async () => {
          if (canalId) {
            // Para Telegram, o destino é o visitanteIdentificador (chat_id), não o telefone.
            // O WhatsappService.enviarPorCanal usa o segundo argumento como "to" — para Telegram
            // o TelegramProvider.sendText recebe o chat_id diretamente.
            // Para obter o identificador correto, consultamos a conversa.
            let destino = telefone;
            if (canal === 'telegram' && !destino) {
              const conv = await this.prisma.db.atendimentoConversa.findUnique({
                where: { id: conversaId },
                select: { visitanteIdentificador: true },
              });
              destino = conv?.visitanteIdentificador ?? null;
            }
            if (destino) {
              await this.whatsapp.enviarPorCanal(canalId, destino, conteudo);
            }
          } else if (canal === 'whatsapp' && telefone) {
            // Fallback retrocompat somente para WhatsApp sem canalId
            await this.whatsapp.enviar(telefone, conteudo);
          }
        });
      } catch (e) {
        // best-effort — não falha o fluxo do bot por falha de envio
        this.log.warn(
          `Bot: falha ao enviar resposta [canal=${canal}, conversa=${conversaId}]: ${(e as Error).message}`,
        );
      }
    }
  }

  /**
   * Cross-link: liga a manifestação aberta pelo bot à conversa (para o ouvidor
   * saltar do chat para a manifestação no painel) e registra uma nota interna
   * (visível só à equipe). O protocolo/chave para o cidadão é redigido pela IA
   * na resposta — aqui não duplicamos a chave.
   */
  private async vincularManifestacao(
    conversaId: string,
    tenantId: string,
    manifestacaoId: string,
    protocolo: string,
  ) {
    await TenantContext.run({ tenantId }, async () => {
      await this.prisma.db.atendimentoConversa.update({
        where: { id: conversaId },
        data: { manifestacaoId, manifestacaoProtocolo: protocolo },
      });
    });
    await this.conversa.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'sistema',
      interno: true,
      conteudo: `Manifestação de ouvidoria aberta pelo assistente — protocolo ${protocolo}.`,
    });
  }
}
