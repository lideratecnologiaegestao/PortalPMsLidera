import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { IaService } from '../ia/ia.service';
import { TramitacaoService } from '../manifestacoes/tramitacao.service';
import { ExpedienteService } from './expediente.service';
import { AtendimentoConversaService, redigirPII } from './atendimento-conversa.service';
import { sanitizarTexto } from '../ia/ia.prompts';

// Intents de falar com atendente
const PALAVRAS_ATENDENTE = [
  'atendente', 'humano', 'falar com', 'quero falar', 'preciso de ajuda humana',
  'pessoa real', 'funcionário', 'servidor', 'transferir', 'transfere', 'atendimento humano',
];

// Intents de consultar protocolo
const PALAVRAS_PROTOCOLO = [
  'protocolo', 'acompanhar', 'consultar', 'minha solicitação', 'meu pedido',
  'esic', 'ouvidoria', 'número de protocolo',
];

/** Regex de identificador de protocolo (ex.: 2024-OUV-00123 ou similar). */
const PROTOCOLO_REGEX = /\b\d{4}-(?:OUV|SIC|ESI|MAN)-?\d{4,}\b/i;

type Intent = 'consultar_protocolo' | 'falar_com_atendente' | 'faq' | 'aguardar_protocolo_input';

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
    private readonly tramitacao: TramitacaoService,
    private readonly expediente: ExpedienteService,
    private readonly conversa: AtendimentoConversaService,
  ) {}

  async processarMensagem(conversaId: string, mensagemId: string, tenantId: string) {
    await TenantContext.run({ tenantId }, async () => {
      try {
        const c = await this.prisma.db.atendimentoConversa.findUnique({
          where: { id: conversaId },
        });
        if (!c || c.status !== 'bot') return;

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
          await this.conversa.persistirMensagem(conversaId, tenantId, {
            autorTipo: 'bot',
            conteudo: 'O atendimento está temporariamente indisponível. Por favor, tente novamente mais tarde.',
          });
          return;
        }

        // 2. Detectar intent
        const intent = this.detectarIntent(texto, c);

        if (intent === 'falar_com_atendente') {
          await this.escalarComExpediente(conversaId, tenantId);
          return;
        }

        if (intent === 'consultar_protocolo') {
          // Verifica se já tem protocolo no texto
          const match = PROTOCOLO_REGEX.exec(texto);
          if (match) {
            await this.resolverProtocolo(conversaId, tenantId, match[0], null);
          } else {
            // Pede o protocolo
            await this.conversa.persistirMensagem(conversaId, tenantId, {
              autorTipo: 'bot',
              conteudo:
                'Para acompanhar sua manifestação, informe o número do protocolo e a chave de acompanhamento (formato: 2024-OUV-00123 / CHAVE-123).',
            });
          }
          return;
        }

        if (intent === 'aguardar_protocolo_input') {
          // Tenta extrair protocolo e chave de formato: PROTOCOLO CHAVE ou PROTOCOLO / CHAVE
          const partes = texto.split(/[\s/|,]+/);
          const protocolo = partes.find((p) => PROTOCOLO_REGEX.test(p));
          const chave = partes.find((p) => /^[A-Z0-9]{5}-[A-Z0-9]{5}$/i.test(p));
          if (protocolo) {
            await this.resolverProtocolo(conversaId, tenantId, protocolo, chave ?? null);
          } else {
            await this.conversa.persistirMensagem(conversaId, tenantId, {
              autorTipo: 'bot',
              conteudo: 'Não consegui identificar o protocolo. Por favor, informe no formato: 2024-OUV-00123.',
            });
          }
          return;
        }

        // 3. FAQ via IA
        await this.responderFaq(conversaId, tenantId, texto, c.botTentativas);
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

    // Iniciar consulta de protocolo
    if (PALAVRAS_PROTOCOLO.some((w) => lower.includes(w)) || PROTOCOLO_REGEX.test(texto)) {
      return 'consultar_protocolo';
    }

    // Se a mensagem anterior foi um pedido de protocolo, tentar parsear
    if (c.botTentativas > 0) {
      // Heurística: se parecer uma sequência de identificadores, tentar como protocolo
      if (/\d{4}/.test(texto) || /[A-Z0-9]{5}-[A-Z0-9]{5}/i.test(texto)) {
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
  ) {
    try {
      const detalhe = await this.tramitacao.acompanhar(protocolo, chave ?? undefined);
      const resumo = `Protocolo: ${protocolo}\nStatus: ${(detalhe as any).status}\nAssunto: ${(detalhe as any).assunto ?? '(não informado)'}`;
      await this.conversa.persistirMensagem(conversaId, tenantId, {
        autorTipo: 'bot',
        conteudo: `Encontrei sua solicitação:\n${resumo}\n\nDeseja falar com um atendente para mais detalhes?`,
      });
    } catch {
      await this.conversa.persistirMensagem(conversaId, tenantId, {
        autorTipo: 'bot',
        conteudo:
          'Não encontrei o protocolo informado. Verifique os dados e tente novamente, ou fale com um atendente.',
      });
    }
  }

  private async responderFaq(
    conversaId: string,
    tenantId: string,
    texto: string,
    tentativas: number,
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

    // Redigir PII antes de enviar à IA
    const perguntaSegura = sanitizarTexto(redigirPII(texto));

    try {
      const resultado = await this.ia.chatMultiturno(
        historicoFormatado,
        perguntaSegura,
        tenantId,
      );

      await this.conversa.persistirMensagem(conversaId, tenantId, {
        autorTipo: 'bot',
        conteudo: resultado.resposta,
      });

      // Incrementa tentativas
      const novasTentativas = await this.conversa.incrementarBotTentativas(conversaId, tenantId);

      // ≥2 falhas/baixa confiança → oferece escalar
      if (novasTentativas >= 2 && (!resultado.confianca || resultado.confianca < 0.5)) {
        await this.conversa.persistirMensagem(conversaId, tenantId, {
          autorTipo: 'bot',
          conteudo:
            'Posso transferi-lo(a) para um atendente humano se preferir. Deseja ser atendido(a) por uma pessoa?',
        });
      }
    } catch (err) {
      this.log.warn(`IA indisponível [conversa=${conversaId}]: ${(err as Error).message}`);
      const novasTentativas = await this.conversa.incrementarBotTentativas(conversaId, tenantId);

      if (novasTentativas >= 2) {
        await this.escalarComExpediente(conversaId, tenantId);
      } else {
        await this.conversa.persistirMensagem(conversaId, tenantId, {
          autorTipo: 'bot',
          conteudo:
            'Desculpe, não consegui processar sua solicitação. Gostaria de falar com um atendente?',
        });
      }
    }
  }

  private async escalarComExpediente(conversaId: string, tenantId: string) {
    const dentro = await this.expediente.dentroDoExpediente(tenantId);
    await this.conversa.escalar(conversaId, tenantId, dentro);
  }
}
