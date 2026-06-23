import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { AnthropicService } from './anthropic.service';
import { AntivirusService } from '../storage/antivirus.service';
import { EmbeddingsService } from './embeddings.service';
import { IaConhecimentoService } from './ia-conhecimento.service';
import { AplicConsultaService } from '../aplic/aplic-consulta.service';
import { FERRAMENTAS_FISCAIS, executarFerramentaFiscal, type FerramentaIA } from '../aplic/aplic-bot-tools';

/** Ferramentas extras + executor que o chamador (ex.: bot de atendimento) injeta. */
export interface ChatToolsExtra {
  tools: FerramentaIA[];
  executar: (nome: string, input: Record<string, unknown>) => Promise<unknown>;
  systemAddendum?: string;
}
import {
  montarContexto,
  parseTriagem,
  sistemaChat,
  sistemaTriagem,
  tsqueryOr,
  usuarioTriagem,
} from './ia.prompts';

interface Trecho {
  slug: string;
  titulo: string;
  texto: string;
  url?: string;
  fonte?: string;
}

/**
 * Cache em memória dos fatos institucionais do tenant.
 * TTL de 5 minutos — evita 1 query por mensagem sem desatualizar por muito tempo.
 */
const fatosCache = new Map<string, { texto: string; expiraEm: number }>();
const FATOS_TTL_MS = 5 * 60 * 1_000; // 5 min

/** Cache: o tenant tem dados fiscais (APLIC) importados? Evita count por mensagem. */
const fiscalCache = new Map<string, { tem: boolean; expiraEm: number }>();
const FISCAL_TTL_MS = 5 * 60 * 1_000;

/** Cache: domínios oficiais permitidos na busca web de saúde, por tenant. */
const dominiosSaudeCache = new Map<string, { dominios: string[]; expiraEm: number }>();
const DOMINIOS_TTL_MS = 30 * 60 * 1_000; // 30 min — muda raramente

/**
 * Camada de IA: triagem (sugestão p/ revisão humana), busca (RAG) e chat.
 * Tudo roda no TenantContext (RLS): a recuperação só enxerga conteúdo oficial
 * do próprio tenant — sem vazamento entre prefeituras. Minimização: ao modelo
 * vai só o necessário (assunto/descrição), nunca dados do solicitante.
 *
 * O chat monta contexto em 3 camadas:
 *   1. Fatos institucionais do tenant (sempre no contexto, TTL 5 min)
 *   2. Base de conhecimento curada (fixados + FTS sobre ia_conhecimento)
 *   3. RAG multi-fonte (CMS, serviços, notícias, secretarias, documentos)
 */
@Injectable()
export class IaService {
  private readonly log = new Logger(IaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly anthropic: AnthropicService,
    private readonly antivirus: AntivirusService,
    private readonly embeddings: EmbeddingsService,
    private readonly conhecimento: IaConhecimentoService,
    private readonly aplicConsulta: AplicConsultaService,
  ) {}

  /** O tenant atual tem dados fiscais APLIC importados? (cacheado 5 min). */
  private async temDadosFiscais(tid: string): Promise<boolean> {
    const hit = fiscalCache.get(tid);
    if (hit && hit.expiraEm > Date.now()) return hit.tem;
    let tem = false;
    try {
      tem = (await this.prisma.db.aplicEmpenho.count()) > 0;
    } catch {
      tem = false;
    }
    fiscalCache.set(tid, { tem, expiraEm: Date.now() + FISCAL_TTL_MS });
    return tem;
  }

  /** Instrução adicional ao sistema quando há ferramentas fiscais disponíveis. */
  private fiscalAddendum(): string {
    return (
      '\n\nDADOS FISCAIS (APLIC/TCE-MT): esta entidade tem dados contábeis reais importados. ' +
      'Para QUALQUER pergunta sobre valores de empenho, liquidação, pagamento, credores/fornecedores, ' +
      'gastos por órgão ou situação de um empenho, USE as ferramentas fiscal_* e responda com os números ' +
      'retornados — NUNCA invente cifras. Apresente valores em reais (R$), cite o exercício/ano, e note que ' +
      'credores pessoa física aparecem com CPF mascarado. Se a ferramenta não retornar dados, diga que não há registro.'
    );
  }

  /**
   * Busca web em fontes oficiais de saúde habilitada? Kill-switch global por env
   * (IA_WEB_SEARCH_SAUDE=off desliga). Ligada por padrão.
   */
  private get webSearchSaudeHabilitado(): boolean {
    return (process.env.IA_WEB_SEARCH_SAUDE ?? 'on').toLowerCase() !== 'off';
  }

  /**
   * Domínios oficiais que a busca web de saúde pode acessar:
   * `gov.br` (cobre federal, estadual e municipal *.gov.br) + o portal do tenant.
   * Cacheado por tenant (TTL 30 min). Resolve o host do tenant via platform().
   */
  private async dominiosBuscaSaude(tid: string): Promise<string[]> {
    const hit = dominiosSaudeCache.get(tid);
    if (hit && hit.expiraEm > Date.now()) return hit.dominios;

    const base = process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
    let dominios = ['gov.br'];
    try {
      const t = await this.prisma.platform().tenant.findUnique({
        where: { id: tid },
        select: { dominio: true, subdominio: true },
      });
      const host = t?.dominio ?? (t?.subdominio ? `${t.subdominio}.${base}` : null);
      if (host) dominios = [...dominios, host];
    } catch {
      // degrada para só gov.br
    }
    dominiosSaudeCache.set(tid, { dominios, expiraEm: Date.now() + DOMINIOS_TTL_MS });
    return dominios;
  }

  /** Ferramenta server-side de busca web restrita a domínios oficiais. */
  private ferramentaBuscaSaude(dominios: string[]): Record<string, unknown> {
    return {
      type: 'web_search_20250305',
      name: 'web_search',
      max_uses: 3, // teto de buscas por mensagem (controle de custo)
      allowed_domains: dominios,
    };
  }

  /**
   * Carve-out à regra "responda só pelo contexto": para SAÚDE PÚBLICA/endemias,
   * autoriza usar a busca web em fontes oficiais quando o contexto não cobrir.
   * Mantém o resto fechado e reforça que a IA não dá diagnóstico/prescrição.
   */
  private saudeAddendum(): string {
    return (
      '\n\nSAÚDE PÚBLICA E ENDEMIAS (EXCEÇÃO À REGRA DE CONTEXTO): para perguntas sobre ' +
      'prevenção de doenças, endemias, epidemias ou pandemias (ex.: dengue, Aedes aegypti, zika, ' +
      'chikungunya, febre amarela, COVID-19, sarampo, influenza, vacinação, surtos), se o CONTEXTO ' +
      'acima não cobrir ou estiver incompleto, você PODE e DEVE usar a ferramenta `web_search` para ' +
      'consultar EXCLUSIVAMENTE fontes oficiais de saúde (portais gov.br e órgãos públicos). ' +
      'NÃO anuncie que vai buscar nem narre o processo ("vou buscar", "encontrei"): consulte e ' +
      'responda DIRETO, citando ao final a fonte com o LINK OFICIAL EXATO retornado pela busca (nunca um ' +
      'caminho interno inventado). Use a busca SOMENTE para esses temas de saúde — para qualquer outro ' +
      'assunto, mantenha a regra de responder apenas pelo contexto e orientar à Ouvidoria/Prefeitura. ' +
      'NUNCA forneça diagnóstico, prescrição ou dose de medicamento: oriente procurar a UBS/Unidade ' +
      'de Saúde mais próxima e, em emergência, ligar 192 (SAMU).'
    );
  }

  /** Flags de IA do tenant atual (default false — DPIA: ativação deliberada). */
  private async flags(): Promise<{ triagem: boolean; chat: boolean }> {
    const tid = TenantContext.tenantId();
    if (!tid) return { triagem: false, chat: false };
    const t = await this.prisma
      .platform()
      .tenant.findUnique({
        where: { id: tid },
        select: { iaTriagemHabilitada: true, iaChatHabilitada: true },
      });
    return { triagem: t?.iaTriagemHabilitada ?? false, chat: t?.iaChatHabilitada ?? false };
  }

  /** Sugere classificação de uma manifestação (NÃO aplica — humano decide). */
  async triagem(manifestacaoId: string) {
    if (!(await this.flags()).triagem) {
      throw new ForbiddenException('Triagem por IA não habilitada nesta prefeitura.');
    }
    const m = await this.prisma.db.manifestacao.findUnique({
      where: { id: manifestacaoId },
      select: { canal: true, assunto: true, descricao: true },
    });
    if (!m) throw new NotFoundException('Manifestação não encontrada.');

    const secretarias = await this.prisma.db.$queryRaw<{ nome: string }[]>`
      SELECT nome FROM secretarias WHERE ativo = true ORDER BY nome`;

    const texto = await this.anthropic.completar({
      system: sistemaTriagem(secretarias.map((s) => s.nome)),
      user: usuarioTriagem(m),
      maxTokens: 400,
      cacheSystem: true,
    });
    const sugestao = parseTriagem(texto);

    await this.auditar('IA_TRIAGEM', 'manifestacao', manifestacaoId, {
      prioridade: sugestao.prioridade,
      tipoSugerido: sugestao.tipoSugerido,
    });

    // revisaoHumana = true deixa explícito que é sugestão (LGPD art. 20)
    return { ...sugestao, manifestacaoId, revisaoHumana: true };
  }

  /** Busca semântica (RAG) sobre o conteúdo oficial do tenant, com citações. */
  async busca(perguntaRaw: string) {
    const pergunta = (perguntaRaw ?? '').slice(0, 500); // anti-abuso de tokens/PII
    const trechos = await this.recuperar(pergunta);
    return {
      pergunta,
      resultados: trechos.map((t) => ({
        titulo: t.titulo,
        slug: t.slug,
        url: t.url,
        fonte: t.fonte,
        trecho: t.texto.slice(0, 300),
      })),
    };
  }

  /** Texto adicional ao system prompt quando o chat é interno (Assistente do Portal). */
  private internoAddendum(): string {
    return (
      '\n\nVocê é o ASSISTENTE DO PORTAL, assistente interno que ENSINA servidores e gestores a ' +
      'operar o painel administrativo. Baseie-se no MANUAL DO SISTEMA e no conteúdo institucional. ' +
      'Dê respostas práticas e passo a passo, citando o caminho no menu (ex.: Conteúdo → Notícias). ' +
      'Se não tiver certeza, oriente a abrir o Manual do Sistema em /admin/manual.'
    );
  }

  /**
   * Chatbot multi-turno para o widget de atendimento omnichannel e para o chat
   * interno dos servidores (Assistente do Portal).
   *
   * - `interno=false` (padrão): cidadão, filtra conteúdos com publico=true.
   * - `interno=true`: servidor, inclui também conteúdos com publico=false (Manual).
   *
   * PII já deve estar redigida pelo chamador.
   * Respeita a flag iaChatHabilitada; levanta ForbiddenException se off.
   */
  async chatMultiturno(
    historico: { papel: 'user' | 'assistant'; texto: string }[],
    perguntaRaw: string,
    tenantId?: string,
    extra?: ChatToolsExtra,
    opts?: { interno?: boolean },
  ): Promise<{ resposta: string; fontes: { titulo: string; slug: string; url?: string }[]; confianca?: number }> {
    const tid = tenantId ?? TenantContext.tenantId();
    if (!tid) throw new Error('Tenant não identificado para chatMultiturno.');
    const interno = opts?.interno ?? false;

    const run = async () => {
      if (!(await this.flags()).chat) {
        throw new ForbiddenException('Assistente de IA não habilitado nesta prefeitura.');
      }
      const pergunta = (perguntaRaw ?? '').slice(0, 500);

      // Monta contexto em 3 camadas (propagando flag interno para incluir conteúdos privados)
      const [fatos, contextoCamadas, trechos] = await this.montarContexto3Camadas(pergunta, interno);
      const confiancaBase = this.calcularConfianca(contextoCamadas);

      const ctxHistorico =
        historico.length > 0
          ? '\n\nHISTÓRICO DA CONVERSA:\n' +
            historico
              .slice(-8) // últimas 8 trocas para evitar prompt gigante
              .map((h) => `${h.papel === 'user' ? 'Visitante' : 'Assistente'}: ${h.texto}`)
              .join('\n')
          : '';

      const user = `${fatos}${contextoCamadas}${ctxHistorico}\n\nPERGUNTA ATUAL: ${pergunta}`;

      // Tools = fiscais (se houver dados) + extras injetadas pelo chamador (bot).
      const temFiscal = await this.temDadosFiscais(tid);
      const tools: FerramentaIA[] = [
        ...(temFiscal ? FERRAMENTAS_FISCAIS : []),
        ...(extra?.tools ?? []),
      ];
      let system = sistemaChat();
      if (temFiscal) system += this.fiscalAddendum();
      if (interno) system += this.internoAddendum();
      if (extra?.systemAddendum) system += extra.systemAddendum;

      // Busca web em fontes oficiais de saúde — só para o cidadão (não no chat
      // interno) e gated por env. Server-side: a Anthropic executa a busca,
      // restrita aos domínios oficiais; o prompt limita o uso a temas de saúde.
      const serverTools: Record<string, unknown>[] = [];
      if (!interno && this.webSearchSaudeHabilitado) {
        serverTools.push(this.ferramentaBuscaSaude(await this.dominiosBuscaSaude(tid)));
        system += this.saudeAddendum();
      }

      const usarFerramentas = tools.length > 0 || serverTools.length > 0;
      const resposta = usarFerramentas
        ? await this.anthropic.completarComFerramentas({
            system,
            user,
            tools,
            serverTools,
            executar: async (nome, input) => {
              if (nome.startsWith('fiscal_')) {
                return executarFerramentaFiscal(this.aplicConsulta, nome, input);
              }
              if (extra?.executar) return extra.executar(nome, input);
              return { erro: `Ferramenta desconhecida: ${nome}` };
            },
            maxTokens: 900,
            // Busca web pode precisar de mais turnos (pause_turn ao paginar).
            maxTurnos: serverTools.length ? 6 : 4,
            cacheSystem: true,
          })
        : await this.anthropic.completar({ system, user, maxTokens: 700, cacheSystem: true });

      const auditAcao = interno ? 'IA_CHAT_INTERNO' : 'IA_CHAT_ATENDIMENTO';
      const auditEntidade = interno ? 'chat_mensagens' : 'atendimento_conversas';
      await this.auditar(auditAcao, auditEntidade, null, {
        fontes: trechos.length,
        tools: tools.length,
        interno,
      });

      return {
        resposta,
        fontes: trechos.map((t) => ({ titulo: t.titulo, slug: t.slug, url: t.url })),
        confianca: confiancaBase,
      };
    };

    if (TenantContext.tenantId() === tid) {
      return run();
    }
    return TenantContext.run({ tenantId: tid }, run);
  }

  /** Chatbot: responde com base no conteúdo oficial recuperado + citações. */
  async chat(perguntaRaw: string) {
    if (!(await this.flags()).chat) {
      throw new ForbiddenException('Assistente de IA não habilitado nesta prefeitura.');
    }
    const pergunta = (perguntaRaw ?? '').slice(0, 500); // anti-abuso de tokens/PII

    // Monta contexto em 3 camadas
    const [fatos, contextoCamadas, trechos] = await this.montarContexto3Camadas(pergunta);
    const confiancaBase = this.calcularConfianca(contextoCamadas);

    const tid = TenantContext.tenantId()!;
    const user = `${fatos}${contextoCamadas}\n\nPERGUNTA: ${pergunta}`;

    const temFiscal = await this.temDadosFiscais(tid);
    const tools = temFiscal ? FERRAMENTAS_FISCAIS : [];
    let system = sistemaChat();
    if (temFiscal) system += this.fiscalAddendum();

    // Busca web em fontes oficiais de saúde (cidadão; gated por env).
    const serverTools: Record<string, unknown>[] = [];
    if (this.webSearchSaudeHabilitado) {
      serverTools.push(this.ferramentaBuscaSaude(await this.dominiosBuscaSaude(tid)));
      system += this.saudeAddendum();
    }

    const resposta = tools.length > 0 || serverTools.length > 0
      ? await this.anthropic.completarComFerramentas({
          system,
          user,
          tools,
          serverTools,
          executar: (nome, input) => executarFerramentaFiscal(this.aplicConsulta, nome, input),
          maxTokens: 800,
          maxTurnos: serverTools.length ? 6 : 4,
          cacheSystem: true,
        })
      : await this.anthropic.completar({ system, user, maxTokens: 700, cacheSystem: true });

    await this.auditar('IA_CHAT', 'cms', null, { fontes: trechos.length });

    return {
      resposta,
      fontes: trechos.map((t) => ({ titulo: t.titulo, slug: t.slug, url: t.url })),
      confianca: confiancaBase,
    };
  }

  /**
   * OCR de um documento (Anthropic vision). DPIA: NÃO persiste a imagem nem o
   * texto extraído aqui — quem consome decide a retenção (com expurgo). Gated
   * pela flag de triagem do tenant. Minimização: alerte que o texto pode conter
   * dado de terceiros.
   */
  async ocr(buffer: Buffer, mimetype: string) {
    if (!(await this.flags()).triagem) {
      throw new ForbiddenException('OCR por IA não habilitado nesta prefeitura.');
    }
    if (!(await this.antivirus.limpo(buffer))) {
      throw new ForbiddenException('Documento reprovado na varredura antivírus.');
    }
    const texto = await this.anthropic.ocr(buffer.toString('base64'), mimetype);
    await this.auditar('IA_OCR', 'documento', null, { bytes: buffer.length });
    return { texto, aviso: 'Texto extraído por IA — revise antes de usar; pode conter dados de terceiros.' };
  }

  // ================================================================ CAMADA 1

  /**
   * Camada 1: Fatos institucionais do tenant (sempre no contexto).
   * Dados PÚBLICOS e INSTITUCIONAIS: nome, UF, secretarias, DPO.
   * SEM PII de cidadão. Cacheado por tenant com TTL de 5 min.
   * LGPD: apenas informação institucional pública — base legal: interesse legítimo / cumprimento de obrigação.
   */
  private async fatosDoTenant(): Promise<string> {
    const tid = TenantContext.tenantId();
    if (!tid) return '';

    const cached = fatosCache.get(tid);
    if (cached && cached.expiraEm > Date.now()) return cached.texto;

    try {
      // Tenant: via platform() — o tenant em si é dado cross-tenant permitido (é o próprio registro)
      const tenant = await this.prisma.platform().tenant.findUnique({
        where: { id: tid },
        select: { nome: true, uf: true, dpoNome: true, dpoEmail: true },
      });
      if (!tenant) return '';

      // Secretarias: via RLS (prisma.db)
      const secretarias = await this.prisma.db.$queryRaw<{
        nome: string;
        responsavel: string | null;
        horario: string | null;
        telefone: string | null;
        email: string | null;
      }[]>`
        SELECT nome, responsavel, horario, telefone, email
        FROM secretarias
        WHERE ativo = true
        ORDER BY ordem ASC, nome ASC`;

      const linhas: string[] = [
        `Esta é a Prefeitura de ${tenant.nome} (${tenant.uf}).`,
        '',
      ];

      if (tenant.dpoNome || tenant.dpoEmail) {
        linhas.push('ENCARREGADO DE DADOS (DPO/LGPD):');
        if (tenant.dpoNome) linhas.push(`  Nome: ${tenant.dpoNome}`);
        if (tenant.dpoEmail) linhas.push(`  E-mail: ${tenant.dpoEmail}`);
        linhas.push('');
      }

      if (secretarias.length > 0) {
        linhas.push('SECRETARIAS E ÓRGÃOS:');
        for (const s of secretarias) {
          const partes: string[] = [`  • ${s.nome}`];
          if (s.responsavel) partes.push(`Responsável: ${s.responsavel}`);
          if (s.horario) partes.push(`Horário: ${s.horario}`);
          if (s.telefone) partes.push(`Telefone: ${s.telefone}`);
          if (s.email) partes.push(`E-mail: ${s.email}`);
          linhas.push(partes.join(' | '));
        }
      }

      const texto = linhas.join('\n');
      fatosCache.set(tid, { texto, expiraEm: Date.now() + FATOS_TTL_MS });
      return texto;
    } catch (e) {
      this.log.warn(`Falha ao buscar fatos do tenant ${tid}: ${String(e)}`);
      return '';
    }
  }

  // ================================================================ CAMADA 2 + 3

  /**
   * Monta o contexto completo em 3 camadas para o prompt do bot.
   * Retorna [blocoFatos, blocoContexto, trechosRAG].
   * @param interno quando true inclui conteúdos com publico=false (Manual do Sistema).
   */
  private async montarContexto3Camadas(
    pergunta: string,
    interno = false,
  ): Promise<[string, string, Trecho[]]> {
    // Paralelo: busca as 3 fontes simultaneamente
    const [fatosTexto, fixadosList, matchList, trechos] = await Promise.all([
      this.fatosDoTenant(),
      this.conhecimento.fixados(),
      this.conhecimento.buscar(pergunta),
      this.recuperar(pergunta, interno),
    ]);

    // ---- bloco de fatos (camada 1) ----
    const blocoFatos = fatosTexto
      ? `INFORMAÇÕES OFICIAIS DA ENTIDADE:\n${fatosTexto}\n\n`
      : '';

    // ---- bloco de conhecimento curado (camada 2) ----
    // Deduplicar fixados + matches por pergunta
    const vistos = new Set<string>();
    const itensConhecimento: { pergunta: string; resposta: string }[] = [];
    for (const item of [...fixadosList, ...matchList]) {
      const chave = item.pergunta;
      if (!vistos.has(chave)) {
        vistos.add(chave);
        itensConhecimento.push(item);
      }
    }

    const blocoConhecimento =
      itensConhecimento.length > 0
        ? 'RESPOSTAS OFICIAIS CADASTRADAS (prioridade máxima — use estas respostas preferencialmente):\n' +
          itensConhecimento
            .map((it, i) => `[K${i + 1}] P: ${it.pergunta}\nR: ${it.resposta}`)
            .join('\n\n') +
          '\n\n'
        : '';

    // ---- bloco de RAG multi-fonte (camada 3) ----
    const blocoRag = trechos.length > 0
      ? `CONTEÚDO DO PORTAL (cite o número entre colchetes):\n${montarContexto(trechos)}\n\n`
      : '';

    const blocoContexto = blocoConhecimento + blocoRag;

    return [blocoFatos, blocoContexto, trechos];
  }

  /**
   * Calcula confiança baseada em presença de camadas:
   * - Conhecimento curado match → 0.95
   * - Apenas RAG → 0.8
   * - Sem nenhum → 0.2
   */
  private calcularConfianca(blocoContexto: string): number {
    if (blocoContexto.includes('RESPOSTAS OFICIAIS CADASTRADAS')) return 0.95;
    if (blocoContexto.includes('CONTEÚDO DO PORTAL')) return 0.8;
    return 0.2;
  }

  // ================================================================ RAG MULTI-FONTE (Camada 3)

  /**
   * RAG multi-fonte sobre o conteúdo publicado do tenant (RLS isola) +
   * acervo GLOBAL da plataforma (legislação federal, normas públicas).
   *
   * Busca em paralelo:
   *   - Tenant: FTS multi-fonte + busca vetorial em ia_chunks.
   *   - Global: FTS em ia_conteudos_global + busca vetorial em ia_chunks_global.
   *
   * Os resultados são mesclados via mesclarTrechos (2:1 lexical:semântico),
   * deduplicados por url+título, limitados a 8 trechos.
   * Cada fonte global tem try/catch próprio — degrada para 0 sem derrubar o chat.
   *
   * @param interno quando true inclui conteúdos internos (publico=false) na busca.
   */
  private async recuperar(pergunta: string, interno = false): Promise<Trecho[]> {
    const q = pergunta.trim().slice(0, 200);

    // Embeda a pergunta UMA vez e compartilha entre as duas buscas vetoriais
    // (tenant + global) — evita 2 chamadas ao provedor por mensagem (importante
    // no rate-limit do Voyage). FTS roda em paralelo com o embedding.
    const vecP: Promise<number[] | null> = this.embeddings.configurado
      ? this.embeddings
          .embed([q])
          .then((v) => v?.[0] ?? null)
          .catch(() => null)
      : Promise.resolve(null);

    // BUSCA HÍBRIDA TENANT + GLOBAL em paralelo
    const [vec, fts, vecGlobal, ftsGlobal] = await Promise.all([
      this.recuperarVetorial(vecP),
      this.recuperarFts(q, interno),
      this.recuperarVetorialGlobal(vecP),
      this.recuperarFtsGlobal(q),
    ]);

    // Mescla tenant (FTS prioridade) + global (adicionado após os do tenant)
    const ftsTotal = [...fts, ...ftsGlobal];
    const vecTotal = [...vec, ...vecGlobal];

    const merged = this.mesclarTrechos(ftsTotal, vecTotal, 8);
    if (merged.length > 0) return merged;

    // Fallback substring apenas no CMS (cobre termos sem stem)
    const termo = `%${q.replace(/[%_]/g, ' ').slice(0, 80)}%`;
    const fallback = await this.prisma.db.$queryRaw<Trecho[]>`
      SELECT p.slug, p.titulo, left(b.conteudo::text, 600) AS texto,
             '/'||p.slug AS url, 'cms' AS fonte
      FROM cms_pages p
      JOIN cms_blocks b ON b.page_id = p.id
      WHERE p.publicado = true
        AND (p.titulo ILIKE ${termo} OR b.conteudo::text ILIKE ${termo})
      LIMIT 5`;
    return fallback;
  }

  /**
   * Camada 4 (semântica): busca vetorial sobre ia_chunks (pgvector), com LIMIAR
   * de distância coseno. O limiar descarta chunks irrelevantes (ex.: planilhas
   * financeiras, decretos sem relação) que, sem ele, preencheriam o top-k e
   * esconderiam o conteúdo certo. Degrada para [] sem chave/corpus.
   * RLS isola o tenant via TenantContext; o literal vetorial é só números (sem injeção).
   */
  private async recuperarVetorial(vecP: Promise<number[] | null>): Promise<Trecho[]> {
    try {
      const vec = await vecP;
      if (!vec) return [];
      const vlit = `[${vec.join(',')}]`;
      return await this.prisma.db.$queryRawUnsafe<Trecho[]>(
        `SELECT titulo, url, left(trecho, 600) AS texto, '' AS slug, fonte
         FROM ia_chunks
         WHERE (embedding <=> '${vlit}'::vector) < 0.6
         ORDER BY embedding <=> '${vlit}'::vector
         LIMIT 6`,
      );
    } catch {
      return [];
    }
  }

  /**
   * Camada 3 (lexical): FTS multi-fonte em paralelo (CMS, serviços, notícias,
   * secretarias, documentos, conteudos). Usa tsquery em OR (recall) — perguntas
   * conversacionais não casam com AND. Cada fonte degrada individualmente.
   * @param interno quando true inclui conteúdos internos (publico=false).
   */
  private async recuperarFts(q: string, interno = false): Promise<Trecho[]> {
    const expr = tsqueryOr(q);
    if (!expr) return [];
    const [cms, servicos, noticias, secretariasRows, documentos, conteudos] = await Promise.all([
      this.recuperarCms(expr),
      this.recuperarServicos(expr),
      this.recuperarNoticias(expr),
      this.recuperarSecretarias(expr),
      this.recuperarDocumentos(expr),
      this.recuperarConteudos(expr, interno),
    ]);
    return [...cms, ...servicos, ...noticias, ...secretariasRows, ...documentos, ...conteudos];
  }

  /**
   * Mescla a lista lexical (prioridade) com a semântica, num intercalado 2:1
   * (precisão lexical primeiro, recall semântico em seguida), deduplicando por
   * url+título e limitando ao top N. Garante que a página institucional certa
   * (forte no FTS) entre mesmo com milhares de chunks de documentos no vetorial.
   */
  private mesclarTrechos(lexical: Trecho[], semantico: Trecho[], limite: number): Trecho[] {
    const out: Trecho[] = [];
    const vistos = new Set<string>();
    const chave = (t: Trecho) => `${t.url ?? ''}|${t.titulo ?? ''}`;
    const push = (t: Trecho) => {
      const k = chave(t);
      if (vistos.has(k) || out.length >= limite) return;
      vistos.add(k);
      out.push(t);
    };
    let i = 0;
    let j = 0;
    while ((i < lexical.length || j < semantico.length) && out.length < limite) {
      if (i < lexical.length) push(lexical[i++]);
      if (i < lexical.length) push(lexical[i++]);
      if (j < semantico.length) push(semantico[j++]);
    }
    return out;
  }

  /**
   * FTS no CMS (páginas + blocos). Usa `ts_headline` para extrair a PASSAGEM
   * ao redor do match (não os primeiros N chars) — assim um fato no meio do
   * texto (ex.: "25 de março de 1902" na página da história, ~pos 1500) chega
   * ao modelo. As marcações <b> do headline são removidas (ruído no prompt).
   */
  private async recuperarCms(q: string): Promise<Trecho[]> {
    try {
      // Páginas institucionais são curtas; mandamos uma janela ampla (até ~2000
      // chars) para NÃO truncar fatos no meio do texto (ex.: "25 de março de
      // 1902" fica ~pos 1500 da página de história). Concatena os blocos da
      // página por ordem para preservar a narrativa.
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT p.slug, p.titulo,
               left(string_agg(b.conteudo::text, ' ' ORDER BY b.ordem), 2000) AS texto,
               '/'||p.slug AS url, 'cms' AS fonte
        FROM cms_pages p
        JOIN cms_blocks b ON b.page_id = p.id
        WHERE p.publicado = true
          AND to_tsvector('portuguese', p.titulo || ' ' || b.conteudo::text)
              @@ to_tsquery('portuguese', ${q})
        GROUP BY p.id, p.slug, p.titulo
        ORDER BY max(ts_rank(
          to_tsvector('portuguese', p.titulo || ' ' || b.conteudo::text),
          to_tsquery('portuguese', ${q})
        )) DESC
        LIMIT 3`;
    } catch {
      return [];
    }
  }

  /** Remove as marcações <b>…</b> do ts_headline (deixa o texto limpo p/ o LLM). */
  private limparHeadline(s: string): string {
    return (s ?? '').replace(/<\/?b>/g, '');
  }

  /** FTS em Serviços publicados. */
  private async recuperarServicos(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT slug,
               titulo,
               left(
                 coalesce(descricao,'') || ' ' ||
                 coalesce(requisitos,'') || ' ' ||
                 coalesce(canais_atendimento,'') || ' ' ||
                 coalesce(prazo_atendimento,''),
                 600
               ) AS texto,
               '/servicos/'||slug AS url,
               'servicos' AS fonte
        FROM servicos
        WHERE publicado = true
          AND to_tsvector('portuguese',
                titulo || ' ' ||
                coalesce(descricao,'') || ' ' ||
                coalesce(requisitos,'') || ' ' ||
                coalesce(canais_atendimento,'') || ' ' ||
                coalesce(prazo_atendimento,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' ||
            coalesce(descricao,'') || ' ' ||
            coalesce(requisitos,'') || ' ' ||
            coalesce(canais_atendimento,'') || ' ' ||
            coalesce(prazo_atendimento,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Notícias publicadas. */
  private async recuperarNoticias(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT slug,
               titulo,
               left(coalesce(conteudo, resumo, ''), 600) AS texto,
               '/noticias/'||slug AS url,
               'noticias' AS fonte
        FROM noticias
        WHERE publicado = true
          AND to_tsvector('portuguese',
                titulo || ' ' || coalesce(conteudo, '') || ' ' || coalesce(resumo, '')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' || coalesce(conteudo, '') || ' ' || coalesce(resumo, '')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Secretarias ativas (slug como identificador no campo slug). */
  private async recuperarSecretarias(q: string): Promise<Trecho[]> {
    try {
      return await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          coalesce(slug, id::text) AS slug,
          nome AS titulo,
          left(
            coalesce(descricao,'') || ' ' ||
            coalesce(sobre,'') || ' ' ||
            coalesce(competencias,'') || ' ' ||
            case when responsavel is not null then 'Responsável: '||responsavel else '' end || ' ' ||
            case when horario is not null then 'Horário: '||horario else '' end || ' ' ||
            case when telefone is not null then 'Telefone: '||telefone else '' end || ' ' ||
            case when email is not null then 'E-mail: '||email else '' end,
            600
          ) AS texto,
          case when slug is not null then '/secretarias/'||slug else '/secretarias' end AS url,
          'secretarias' AS fonte
        FROM secretarias
        WHERE ativo = true
          AND to_tsvector('portuguese',
                nome || ' ' ||
                coalesce(descricao,'') || ' ' ||
                coalesce(sobre,'') || ' ' ||
                coalesce(competencias,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            nome || ' ' ||
            coalesce(descricao,'') || ' ' ||
            coalesce(sobre,'') || ' ' ||
            coalesce(competencias,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
    } catch {
      return [];
    }
  }

  /** FTS em Documentos ativos (usa ementa + conteudo_extraido). */
  private async recuperarDocumentos(q: string): Promise<Trecho[]> {
    try {
      const rows = await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          slug,
          titulo,
          ts_headline('portuguese',
            coalesce(ementa,'') || ' ' || coalesce(conteudo_extraido,''),
            to_tsquery('portuguese', ${q}),
            'MaxFragments=3, MaxWords=55, MinWords=18, FragmentDelimiter= … ') AS texto,
          coalesce(arquivo_url, '/documentos') AS url,
          'documentos' AS fonte
        FROM documentos
        WHERE ativo = true
          AND to_tsvector('portuguese',
                titulo || ' ' || coalesce(ementa,'') || ' ' || coalesce(conteudo_extraido,'')
              ) @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(
          to_tsvector('portuguese',
            titulo || ' ' || coalesce(ementa,'') || ' ' || coalesce(conteudo_extraido,'')
          ),
          to_tsquery('portuguese', ${q})
        ) DESC
        LIMIT 2`;
      return rows.map((r) => ({ ...r, texto: this.limparHeadline(r.texto) }));
    } catch {
      return [];
    }
  }

  /**
   * FTS em conteúdos longos de conhecimento (ia_conteudos).
   * Usa a coluna `busca` (tsvector GENERATED) e ts_headline para extrair
   * passagem ao redor do match. Filtra ativo=true, vigência válida.
   *
   * - `interno=false` (padrão, cidadão): filtra publico=true.
   * - `interno=true` (servidor): inclui também publico=false (Manual do Sistema).
   *
   * Retorna até 2 resultados ordenados por relevância.
   */
  private async recuperarConteudos(q: string, interno = false): Promise<Trecho[]> {
    try {
      if (interno) {
        // Inclui conteúdos internos (publico=false) — Manual do Sistema para servidores
        const rows = await this.prisma.db.$queryRaw<Trecho[]>`
          SELECT
            id::text AS slug,
            titulo,
            ts_headline('portuguese',
              conteudo,
              to_tsquery('portuguese', ${q}),
              'MaxFragments=3, MaxWords=55, MinWords=18, FragmentDelimiter= … ') AS texto,
            '/admin/manual' AS url,
            'conteudo' AS fonte
          FROM ia_conteudos
          WHERE ativo = true
            AND (vigencia_inicio IS NULL OR vigencia_inicio <= now())
            AND (vigencia_fim   IS NULL OR vigencia_fim   >= now())
            AND busca @@ to_tsquery('portuguese', ${q})
          ORDER BY ts_rank(busca, to_tsquery('portuguese', ${q})) DESC
          LIMIT 3`;
        return rows.map((r) => ({ ...r, texto: this.limparHeadline(r.texto) }));
      }

      // Padrão: apenas conteúdos públicos (cidadão/widget)
      const rows = await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          id::text AS slug,
          titulo,
          ts_headline('portuguese',
            conteudo,
            to_tsquery('portuguese', ${q}),
            'MaxFragments=3, MaxWords=55, MinWords=18, FragmentDelimiter= … ') AS texto,
          '/assistente' AS url,
          'conteudo' AS fonte
        FROM ia_conteudos
        WHERE ativo = true
          AND publico = true
          AND (vigencia_inicio IS NULL OR vigencia_inicio <= now())
          AND (vigencia_fim   IS NULL OR vigencia_fim   >= now())
          AND busca @@ to_tsquery('portuguese', ${q})
        ORDER BY ts_rank(busca, to_tsquery('portuguese', ${q})) DESC
        LIMIT 2`;
      return rows.map((r) => ({ ...r, texto: this.limparHeadline(r.texto) }));
    } catch {
      return [];
    }
  }

  // ================================================================ RAG GLOBAL (acervo da plataforma)

  /**
   * FTS no acervo GLOBAL (ia_conteudos_global) — legislação federal, normas.
   * Usa `busca` tsvector GENERATED e ts_headline para extrair a passagem relevante.
   * A RLS desta tabela tem SELECT USING true — funciona em qualquer sessão.
   * Retorna até 2 resultados com fonte='Legislação' para citação no prompt.
   */
  private async recuperarFtsGlobal(q: string): Promise<Trecho[]> {
    const expr = tsqueryOr(q);
    if (!expr) return [];
    try {
      const rows = await this.prisma.db.$queryRaw<Trecho[]>`
        SELECT
          id::text AS slug,
          titulo,
          ts_headline('portuguese',
            conteudo,
            to_tsquery('portuguese', ${expr}),
            'MaxFragments=3, MaxWords=55, MinWords=18, FragmentDelimiter= … ') AS texto,
          coalesce(fonte_url, '/assistente') AS url,
          'Legislação' AS fonte
        FROM ia_conteudos_global
        WHERE ativo = true
          AND busca @@ to_tsquery('portuguese', ${expr})
        ORDER BY ts_rank(busca, to_tsquery('portuguese', ${expr})) DESC
        LIMIT 2`;
      return rows.map((r) => ({ ...r, texto: this.limparHeadline(r.texto) }));
    } catch {
      return [];
    }
  }

  /**
   * Busca vetorial no corpus GLOBAL (ia_chunks_global).
   * Reutiliza o vetor da pergunta já gerado para a busca do tenant quando o
   * modelo global coincidir (caso comum), evitando embed duplo.
   * Limiar de distância coseno: < 0.6 (mesmo do tenant — consistência).
   * A RLS tem SELECT USING true — funciona em qualquer sessão.
   * Retorna até 4 chunks com fonte='Legislação'.
   */
  private async recuperarVetorialGlobal(vecP: Promise<number[] | null>): Promise<Trecho[]> {
    try {
      const vec = await vecP;
      if (!vec) return [];
      const vlit = `[${vec.join(',')}]`;
      return await this.prisma.db.$queryRawUnsafe<Trecho[]>(
        `SELECT titulo, coalesce(url, '/assistente') AS url,
                left(texto, 600) AS texto, '' AS slug, 'Legislação' AS fonte
         FROM ia_chunks_global
         WHERE (embedding <=> '${vlit}'::vector) < 0.6
         ORDER BY embedding <=> '${vlit}'::vector
         LIMIT 4`,
      );
    } catch {
      return [];
    }
  }

  // ================================================================ AUDITORIA

  private async auditar(
    acao: string,
    entidade: string,
    entidadeId: string | null,
    dados: Record<string, unknown>,
  ) {
    await this.prisma.db.auditLog.create({
      data: {
        tenantId: TenantContext.tenantId() ?? null,
        atorId: TenantContext.get().userId ?? null,
        acao,
        entidade,
        entidadeId,
        dados: dados as object,
      },
    });
  }
}
