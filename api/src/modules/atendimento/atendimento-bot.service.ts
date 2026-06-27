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
  ouvidoriaAddendumComSecretarias,
  executarFerramentaOuvidoria,
} from './atendimento-bot-tools';
import { destinoCidadao } from './atendimento-destino.util';

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
        }) as { id: string; status: string; canal: 'widget' | 'whatsapp' | 'instagram' | 'messenger' | 'telegram' | string; visitanteTelefone: string | null; visitanteIdentificador?: string | null; visitanteNome?: string | null; assunto?: string | null; botTentativas: number; canalId?: string | null } | null;
        if (!c || c.status !== 'bot') return;

        // Atalho para enviar resposta do bot com roteamento automático (migration 083)
        const responder = (conteudo: string, opcoes?: { label: string; valor: string }[]) =>
          this.enviarRespostaBot(
            conversaId,
            tenantId,
            conteudo,
            c.visitanteTelefone,
            c.visitanteIdentificador,
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
          const sec = await this.classificarSecretariaPorTexto(tenantId, texto, c.assunto ?? undefined);
          await this.escalarComExpediente(conversaId, tenantId, sec);
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
    c: { canal: string; visitanteTelefone: string | null; visitanteIdentificador?: string | null; canalId?: string | null },
  ) {
    try {
      const detalhe = await this.tramitacao.acompanhar(protocolo, chave ?? undefined);
      const resumo = `Protocolo: ${protocolo}\nStatus: ${(detalhe as any).status}\nAssunto: ${(detalhe as any).assunto ?? '(não informado)'}`;
      await this.enviarRespostaBot(
        conversaId,
        tenantId,
        `Encontrei sua solicitação:\n${resumo}\n\nDeseja falar com um atendente para mais detalhes?`,
        c.visitanteTelefone,
        c.visitanteIdentificador,
        c.canal,
        c.canalId,
      );
    } catch {
      await this.enviarRespostaBot(
        conversaId,
        tenantId,
        'Não encontrei o protocolo informado. Verifique os dados e tente novamente, ou fale com um atendente.',
        c.visitanteTelefone,
        c.visitanteIdentificador,
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
    c: { canal: string; visitanteTelefone: string | null; visitanteIdentificador?: string | null; canalId?: string | null; visitanteNome?: string | null; assunto?: string | null },
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

    // Contexto deste atendimento informado pelo PRÓPRIO cidadão no formulário de
    // início (nome/assunto). Sem isso a IA respondia "não tenho acesso ao seu nome"
    // mesmo o cidadão tendo se identificado nesta sessão. (E-mail não entra no
    // prompt — minimização LGPD; serve só para contato.)
    const nomeVisitante = c.visitanteNome?.trim();
    const assuntoVisitante = c.assunto?.trim();
    const ctxPartes: string[] = [];
    if (nomeVisitante) ctxPartes.push(`Nome: ${nomeVisitante}`);
    if (assuntoVisitante) ctxPartes.push(`Assunto: ${assuntoVisitante}`);
    const contextoVisitante = ctxPartes.length
      ? `\n\nDADOS DESTE ATENDIMENTO (informados pelo próprio cidadão agora, no início da conversa): ${ctxPartes.join('; ')}. ` +
        `Você TEM acesso a esses dados desta sessão — use o primeiro nome ao cumprimentar quando fizer sentido e leve o assunto em conta. ` +
        `NUNCA afirme que "não tem acesso" ao nome/assunto que o cidadão já informou aqui. Não invente nem peça de novo dados já fornecidos.`
      : '';

    // Busca secretarias do tenant para roteamento automático (best-effort; sem secretarias → escala genérico).
    let secretariasTenant: { id: string; nome: string }[] = [];
    try {
      secretariasTenant = await this.prisma.db.secretaria.findMany({
        select: { id: true, nome: true },
        orderBy: { nome: 'asc' },
      });
    } catch {
      // sem secretarias → addendum sem lista, escala genérico
    }

    // Ferramentas de ação da ouvidoria, ligadas a ESTA conversa (RLS já ativo).
    const extra = {
      tools: FERRAMENTAS_OUVIDORIA,
      systemAddendum:
        ouvidoriaAddendumComSecretarias(secretariasTenant) + contextoVisitante,
      executar: (nome: string, input: Record<string, unknown>) =>
        executarFerramentaOuvidoria(
          {
            manifestacoes: this.manifestacoes,
            tramitacao: this.tramitacao,
            escalar: (secretariaNome?: string) =>
              this.escalarComExpediente(conversaId, tenantId, secretariaNome),
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
        c.visitanteIdentificador,
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
          c.visitanteIdentificador,
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
          c.visitanteIdentificador,
          c.canal,
          c.canalId,
        );
      }
    }
  }

  private async escalarComExpediente(
    conversaId: string,
    tenantId: string,
    secretariaNome?: string,
  ) {
    const dentro = await this.expediente.dentroDoExpediente(tenantId);
    const secretariaId = secretariaNome
      ? await this.resolverSecretariaId(tenantId, secretariaNome)
      : undefined;
    await this.conversa.escalar(conversaId, tenantId, dentro, secretariaId);
  }

  /**
   * Tenta identificar a secretaria mais adequada para o atendimento a partir do
   * texto da mensagem e do assunto da conversa, sem custo de IA.
   *
   * Estratégia (best-effort, nunca lança):
   *  1. Normaliza (sem acento, minúsculo) o texto+assunto combinados.
   *  2. Remove stopwords irrelevantes do nome das secretarias.
   *  3. Verifica se qualquer TOKEN significativo do nome de uma secretaria aparece
   *     no texto normalizado.
   *  4. Aplica um mapa de ALIASES (buraco→obras, vacina→saude …) para termos do
   *     dia-a-dia que não constam nos nomes oficiais.
   *  5. Retorna o NOME da secretaria encontrada (para `resolverSecretariaId`) ou
   *     undefined quando não há correspondência clara (→ fila genérica).
   *
   * LGPD: não há PII do cidadão no retorno — apenas o nome de secretaria.
   */
  private async classificarSecretariaPorTexto(
    tenantId: string,
    texto: string,
    assunto?: string,
  ): Promise<string | undefined> {
    // Stopwords que não ajudam a identificar a secretaria
    const STOPWORDS = new Set(['secretaria', 'municipal', 'municipio', 'prefeitura', 'de', 'da', 'do', 'e', 'a', 'o', 'em', 'por']);

    // Mapa de aliases de termos do dia-a-dia → token que deve aparecer no nome normalizado da secretaria
    const ALIASES: Array<{ termos: string[]; token: string }> = [
      { termos: ['buraco', 'asfalto', 'iluminacao', 'poste', 'calcada', 'via', 'pavimentacao', 'pavimentação', 'calcada', 'calçada', 'tapa-buraco', 'tapaburaco', 'rua', 'estrada', 'obras'], token: 'obras' },
      { termos: ['vacina', 'vacinacao', 'posto', 'consulta', 'saude', 'remedio', 'upa', 'hospital', 'clinica', 'medico', 'enfermeiro', 'dengue', 'covid', 'saúde'], token: 'saude' },
      { termos: ['escola', 'matricula', 'creche', 'professor', 'educacao', 'aluno', 'ensino', 'pedagogico', 'educação', 'matrícula'], token: 'educacao' },
      { termos: ['iptu', 'imposto', 'tributo', 'certidao', 'divida', 'divida', 'dívida', 'certidão', 'iss', 'itr', 'fiscal'], token: 'fazenda' },
      { termos: ['cras', 'creas', 'bolsa', 'auxilio', 'cadunico', 'cad', 'beneficio', 'assistencia', 'social', 'vulnerabilidade', 'vulnerável', 'auxílio', 'benefício'], token: 'assistencia' },
      { termos: ['meio', 'ambiente', 'arvore', 'poda', 'lixo', 'residuo', 'animal', 'abandono', 'desmatamento', 'queimada', 'resíduos', 'coleta'], token: 'ambiente' },
    ];

    const normalizar = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .trim();

    try {
      const secretarias = await this.prisma.db.secretaria.findMany({ select: { nome: true } });
      if (!secretarias.length) return undefined;

      const textoNorm = normalizar(`${texto} ${assunto ?? ''}`);

      // 1. Match por tokens significativos do nome da secretaria no texto
      for (const sec of secretarias) {
        const tokens = normalizar(sec.nome)
          .split(/\s+/)
          .filter((t) => t.length > 3 && !STOPWORDS.has(t));
        for (const token of tokens) {
          // Garante match de palavra (não apenas substring parcial de palavra maior)
          const regex = new RegExp(`\\b${token}\\b`);
          if (regex.test(textoNorm)) {
            return sec.nome;
          }
        }
      }

      // 2. Match por aliases
      for (const { termos, token } of ALIASES) {
        const aliasRegex = new RegExp(`\\b(${termos.join('|')})\\b`);
        if (aliasRegex.test(textoNorm)) {
          // Procura a secretaria cujo nome normalizado contém o token do alias
          const encontrada = secretarias.find((s) =>
            normalizar(s.nome)
              .split(/\s+/)
              .some((t) => t.includes(token) || token.includes(t)),
          );
          if (encontrada) return encontrada.nome;
        }
      }

      return undefined;
    } catch {
      // best-effort: nunca bloqueia a escalada por falha de classificação
      return undefined;
    }
  }

  /**
   * Resolve nome de secretaria (vindo da IA) para um ID do banco.
   * Normaliza acentos e caixa; aceita match exato ou por `includes`.
   * Nunca lança — retorna undefined quando não há correspondência.
   */
  private async resolverSecretariaId(
    tenantId: string,
    nome: string,
  ): Promise<string | undefined> {
    if (!nome.trim()) return undefined;
    try {
      const secretarias = await TenantContext.run({ tenantId }, () =>
        this.prisma.db.secretaria.findMany({ select: { id: true, nome: true } }),
      );
      const normalizar = (s: string) =>
        s
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .toLowerCase()
          .trim();
      const alvo = normalizar(nome);
      // 1. match exato normalizado
      let encontrada = secretarias.find((s) => normalizar(s.nome) === alvo);
      // 2. fallback: o nome fornecido contém o nome da secretaria ou vice-versa
      if (!encontrada) {
        encontrada = secretarias.find(
          (s) =>
            normalizar(s.nome).includes(alvo) || alvo.includes(normalizar(s.nome)),
        );
      }
      return encontrada?.id;
    } catch {
      // best-effort: nunca bloqueia a escalada por falha de lookup
      return undefined;
    }
  }

  /**
   * Persiste uma resposta do bot E envia por WhatsApp quando a conversa vier de webhook.
   * Roteamento de saída:
   *   - canalId presente → enviar*PorCanal (multi-número Meta)
   *   - canalId ausente  → enviar* (config única, retrocompat)
   *
   * Menus interativos (quando `opcoes` fornecida para canal externo):
   *   - ≤ 3 opções → reply buttons (sendButtons / enviarBotoes)
   *   - 4–10 opções → lista interativa (sendList / enviarLista)
   *   - Fallback automático para texto embutido nos métodos do WhatsappService.
   *   - O widget web continua recebendo `opcoes` via socket (não é alterado).
   *
   * É best-effort: falha no envio WhatsApp não impede a persistência.
   */
  private async enviarRespostaBot(
    conversaId: string,
    tenantId: string,
    conteudo: string,
    telefone: string | null | undefined,
    identificador: string | null | undefined,
    canal: string,
    canalId: string | null | undefined,
    opcoes?: { label: string; valor: string }[],
  ) {
    // Sempre persiste (incluindo opcoes para o widget web)
    await this.conversa.persistirMensagem(conversaId, tenantId, {
      autorTipo: 'bot',
      conteudo,
      ...(opcoes?.length ? { opcoes } : {}),
    });

    // Envio de saída para canais externos (migration 083: messenger + instagram + telegram)
    // destinoCidadao: whatsapp→telefone; messenger/instagram/telegram→PSID/chat_id
    const canalExterno = ['whatsapp', 'instagram', 'messenger', 'telegram'].includes(canal);
    const destino = destinoCidadao({ canal, visitanteTelefone: telefone, visitanteIdentificador: identificador });
    if (canalExterno && destino) {
      try {
        await TenantContext.run({ tenantId }, async () => {
          if (!destino) return;

          // Se há opções, tenta enviar menus interativos; o fallback para texto
          // é tratado internamente pelo WhatsappService (provider sem suporte → texto numerado).
          if (opcoes?.length) {
            // Monta rows/buttons: id = valor (texto que o bot já entende), label truncado a 24 chars
            if (opcoes.length <= 3) {
              // Reply buttons (≤ 3)
              const buttonsPayload = {
                message: conteudo,
                buttons: opcoes.map((o) => ({ id: o.valor, label: o.label.slice(0, 24) })),
              };
              if (canalId) {
                await this.whatsapp.enviarBotoesPorCanal(canalId, destino, buttonsPayload);
              } else if (canal === 'whatsapp') {
                await this.whatsapp.enviarBotoes(destino, buttonsPayload);
              } else {
                // Canal sem canalId não-WhatsApp (raro) → texto simples
                await this.whatsapp.enviar(destino, conteudo);
              }
            } else {
              // Lista interativa (4–10 opções)
              const listaPayload = {
                message: conteudo,
                tituloBotao: 'Escolher',
                rows: opcoes.slice(0, 10).map((o) => ({
                  id: o.valor,
                  label: o.label.slice(0, 24),
                })),
              };
              if (canalId) {
                await this.whatsapp.enviarListaPorCanal(canalId, destino, listaPayload);
              } else if (canal === 'whatsapp') {
                await this.whatsapp.enviarLista(destino, listaPayload);
              } else {
                await this.whatsapp.enviar(destino, conteudo);
              }
            }
          } else {
            // Sem opções — envio de texto simples
            if (canalId) {
              await this.whatsapp.enviarPorCanal(canalId, destino, conteudo);
            } else if (canal === 'whatsapp') {
              await this.whatsapp.enviar(destino, conteudo);
            }
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
