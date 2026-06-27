import type { FerramentaIA } from '../aplic/aplic-bot-tools';
import type { ManifestacoesService } from '../manifestacoes/manifestacoes.service';
import type { TramitacaoService } from '../manifestacoes/tramitacao.service';

/**
 * Ferramentas de AÇÃO que o bot do atendimento pode acionar em linguagem natural
 * para o cidadão (ouvidoria). Diferente das tools fiscais (read-only), estas
 * EXECUTAM ações: abrir manifestação, consultar protocolo e chamar um humano.
 *
 * Guardrails (também reforçados no systemAddendum): o bot deve confirmar um
 * resumo antes de abrir; nunca inventa protocolo/chave (vêm da tool); denúncia é
 * anônima por padrão; dados de identificação só quando o cidadão optar por se
 * identificar. Tudo roda no TenantContext da conversa (RLS).
 */
export const FERRAMENTAS_OUVIDORIA: FerramentaIA[] = [
  {
    name: 'abrir_manifestacao',
    description:
      'Registra uma manifestação de ouvidoria em nome do cidadão e devolve o NÚMERO DE PROTOCOLO e a CHAVE de acompanhamento. Use quando o cidadão quer REGISTRAR/RELATAR algo (denunciar, reclamar, sugerir, elogiar ou solicitar). Antes de chamar, confirme com o cidadão um resumo do que será registrado. Classifique o tipo a partir do relato (triagem). Denúncia deve ser anônima por padrão; só peça nome/e-mail se o cidadão quiser ser identificado.',
    input_schema: {
      type: 'object',
      properties: {
        tipo: {
          type: 'string',
          enum: ['denuncia', 'reclamacao', 'sugestao', 'elogio', 'solicitacao'],
          description: 'Tipo da manifestação, classificado a partir do relato (triagem).',
        },
        assunto: { type: 'string', description: 'Título curto e objetivo (até ~120 caracteres).' },
        descricao: { type: 'string', description: 'Relato completo com os detalhes informados pelo cidadão.' },
        anonima: { type: 'boolean', description: 'true = anônima (padrão para denúncia). false = identificada (requer nome).' },
        nome: { type: 'string', description: 'Nome do cidadão — somente se NÃO for anônima.' },
        email: { type: 'string', description: 'E-mail do cidadão — somente se NÃO for anônima.' },
      },
      required: ['tipo', 'assunto', 'descricao', 'anonima'],
    },
  },
  {
    name: 'consultar_protocolo',
    description:
      'Consulta o ANDAMENTO de uma manifestação pelo número de protocolo e chave de acompanhamento. Use quando o cidadão quer saber o status de um protocolo já existente. Se faltar protocolo ou chave, peça ao cidadão.',
    input_schema: {
      type: 'object',
      properties: {
        protocolo: { type: 'string', description: 'Número do protocolo (ex.: 2026000001).' },
        chave: { type: 'string', description: 'Chave de acompanhamento (ex.: AB3KM-QWE79). Obrigatória para manifestação anônima.' },
      },
      required: ['protocolo'],
    },
  },
  {
    name: 'chamar_ouvidor',
    description:
      'Transfere o atendimento para um ATENDENTE HUMANO (chat humanizado). Use SOMENTE quando o cidadão PEDIR EXPLICITAMENTE para falar com uma pessoa/atendente humano. NÃO use para responder dúvidas (responda você mesmo, inclusive temas de saúde) nem para relatos a registrar (use `abrir_manifestacao`). ' +
      'Informe o parâmetro `secretaria` com o nome EXATO de uma das secretarias da lista fornecida no contexto (ex.: "Secretaria de Saúde") quando o assunto pertencer claramente a uma área específica — isso roteia o cidadão diretamente para os atendentes daquela secretaria. Se estiver em dúvida, NÃO invente: deixe `secretaria` vazio para cair na fila geral da ouvidoria.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Motivo resumido da transferência.' },
        secretaria: {
          type: 'string',
          description:
            'Nome da secretaria/área mais adequada para atender, escolhida EXATAMENTE da lista "SECRETARIAS DISPONÍVEIS PARA ENCAMINHAMENTO" fornecida no contexto do sistema. ' +
            'Use o nome completo como aparece na lista (ex.: "Secretaria de Saúde", "Assistência Social", "Secretaria de Obras"). ' +
            'Deixe vazio se não houver correspondência clara — nunca invente um nome que não esteja na lista.',
        },
      },
    },
  },
];

/** Instrução adicional ao prompt do sistema quando as tools de ouvidoria estão ativas. */
export function ouvidoriaAddendum(): string {
  return (
    '\n\nATENDIMENTO DE OUVIDORIA (AÇÕES): você pode AGIR pelo cidadão usando ferramentas. ' +
    'Quando o cidadão quiser registrar uma denúncia, reclamação, sugestão, elogio ou solicitação, ' +
    'colete o essencial em linguagem natural, CONFIRME um resumo e então use `abrir_manifestacao`. ' +
    'Denúncias são ANÔNIMAS por padrão — não peça dados pessoais a menos que o cidadão queira se identificar. ' +
    'Ao registrar, informe ao cidadão o PROTOCOLO e a CHAVE retornados e oriente a guardá-los (a chave não é recuperável). ' +
    'Para status de um protocolo, use `consultar_protocolo`. ' +
    'Use `chamar_ouvidor` SOMENTE quando o cidadão pedir explicitamente para falar com uma pessoa/atendente — ' +
    'nunca para responder dúvidas (responda você mesmo, inclusive temas de saúde) nem para relatos (use `abrir_manifestacao`). ' +
    'Ao usar `chamar_ouvidor`, use o parâmetro `secretaria` para informar a área responsável pelo caso ' +
    '(ex.: assuntos de saúde/UBS → Secretaria de Saúde; benefício social/CRAS/CREAS → Assistência Social; ' +
    'buraco/iluminação → Secretaria de Obras). ' +
    'Use exatamente o nome que aparece na lista de secretarias disponíveis do contexto; se não houver correspondência, deixe vazio. ' +
    'NUNCA invente protocolo, chave ou status — use sempre as ferramentas. Seja acolhedor e claro.'
  );
}

/**
 * Retorna o addendum com a lista de secretarias injetada.
 * Chamado em `responderFaq` quando há secretarias disponíveis no tenant.
 */
export function ouvidoriaAddendumComSecretarias(secretarias: { nome: string }[]): string {
  const base = ouvidoriaAddendum();
  if (!secretarias.length) return base;
  const lista = secretarias.map((s) => s.nome).join('; ');
  return (
    base +
    `\n\nSECRETARIAS DISPONÍVEIS PARA ENCAMINHAMENTO: ${lista}. ` +
    'Use exatamente um desses nomes no parâmetro `secretaria` da tool `chamar_ouvidor` (ou deixe vazio se não houver correspondência clara).'
  );
}

/** Contexto que a execução das tools de ouvidoria precisa (ligado à conversa atual). */
export interface CtxOuvidoriaBot {
  manifestacoes: ManifestacoesService;
  tramitacao: TramitacaoService;
  /**
   * Escala a conversa para um atendente humano (com regra de expediente).
   * @param secretariaNome Nome da secretaria informado pela IA; o service resolve para id.
   *                       Se ausente ou inválido, escala para a fila geral (ouvidoria).
   */
  escalar: (secretariaNome?: string) => Promise<void>;
  /** Vincula a manifestação recém-aberta à conversa (cross-link no painel). */
  vincular: (manifestacaoId: string, protocolo: string) => Promise<void>;
}

/** Executa uma tool de ouvidoria no contexto da conversa (já dentro do TenantContext). */
export async function executarFerramentaOuvidoria(
  ctx: CtxOuvidoriaBot,
  nome: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (nome) {
    case 'abrir_manifestacao': {
      const anonima = input.anonima !== false; // default anônima
      const tipo = String(input.tipo ?? 'solicitacao');
      const assunto = String(input.assunto ?? '').trim().slice(0, 160) || 'Manifestação via atendimento';
      const descricao = String(input.descricao ?? '').trim();
      if (!descricao) return { ok: false, erro: 'Descreva o relato antes de registrar.' };
      const nomeCidadao = !anonima && input.nome ? String(input.nome).trim() : undefined;
      const emailCidadao = !anonima && input.email ? String(input.email).trim() : undefined;

      const r = await ctx.manifestacoes.registrar({
        canal: 'ouvidoria',
        tipo: tipo as never,
        assunto,
        descricao,
        anonima,
        solicitanteNome: nomeCidadao,
        solicitanteEmail: emailCidadao,
      } as never);

      await ctx.vincular(r.id, r.protocolo).catch(() => undefined);

      return {
        ok: true,
        protocolo: r.protocolo,
        chave: r.chave,
        instrucao:
          'Manifestação registrada. Informe ao cidadão o protocolo e a chave acima e oriente a guardá-los para acompanhar em /acompanhar. A chave não pode ser recuperada depois.',
      };
    }

    case 'consultar_protocolo': {
      const protocolo = String(input.protocolo ?? '').trim();
      const chave = input.chave ? String(input.chave).trim() : undefined;
      if (!protocolo) return { ok: false, erro: 'Informe o número do protocolo.' };
      try {
        const d = (await ctx.tramitacao.acompanhar(protocolo, chave)) as Record<string, unknown>;
        return {
          ok: true,
          protocolo,
          status: d.status ?? null,
          assunto: d.assunto ?? null,
          prazo: d.prazoEm ?? null,
        };
      } catch {
        return { ok: false, erro: 'Protocolo/chave não encontrados ou inválidos. Confira os dados com o cidadão.' };
      }
    }

    case 'chamar_ouvidor': {
      const secretariaNome = input.secretaria ? String(input.secretaria).trim() : undefined;
      await ctx.escalar(secretariaNome || undefined);
      return {
        ok: true,
        instrucao:
          'Transferência iniciada. Avise o cidadão que um atendente assumirá em instantes; fora do horário, o retorno é no próximo expediente.',
      };
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` };
  }
}
