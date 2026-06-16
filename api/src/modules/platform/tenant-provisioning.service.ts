import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisCacheService } from '../../common/cache/redis-cache.service';
import { ThemeService } from '../theme/theme.service';
import { MenusService } from '../menus/menus.service';
import { SERVICOS_MODELO } from '../servicos/servicos-modelo';
import { CloudflareService } from '../cloudflare/cloudflare.service';
import type { RegistroDominioResultado } from '../cloudflare/cloudflare.types';
import { DocumentosService } from '../documentos/documentos.service';
import { LicitacoesService } from '../licitacoes/licitacoes.service';
import { ConselhosService } from '../conselhos/conselhos.service';
import { ConcursosService } from '../concursos/concursos.service';
import { ContratosService } from '../contratos/contratos.service';
import { ConveniosService } from '../convenios/convenios.service';
import { hashSenha } from '../auth/password';
import type { CriarTenantDto } from './platform.dto';

/**
 * Provisiona um novo tenant de forma atômica e idempotente:
 *   1. Cria o registro na tabela `tenants`.
 *   2. Cria o usuário admin_prefeitura inicial com senha provisória.
 *   3. Semeia conteúdo PNTP Diamante (media_categories, cms_pages/blocks,
 *      transp_documentos e datasets tabulares) usando platform() (cross-tenant).
 *   4. Invalida cache Redis dos hosts do novo tenant.
 *
 * Todos os INSERTs usam this.prisma.platform() para operar cross-tenant com
 * tenantId explícito — sem afetar o contexto RLS das demais requisições.
 */
@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: RedisCacheService,
    private readonly themeService: ThemeService,
    private readonly menusService: MenusService,
    private readonly cloudflare: CloudflareService,
    private readonly documentos: DocumentosService,
    private readonly licitacoes: LicitacoesService,
    private readonly conselhos: ConselhosService,
    private readonly concursos: ConcursosService,
    private readonly contratos: ContratosService,
    private readonly convenios: ConveniosService,
  ) {}

  /** Domínio base da plataforma (subdomínios são automáticos via curinga CF). */
  private get baseDominio(): string {
    return process.env.PLATFORM_BASE_DOMAIN ?? 'lidera.app.br';
  }

  /** Domínio próprio do cliente (não é um subdomínio da plataforma)? */
  private ehDominioCustom(dominio?: string | null): boolean {
    if (!dominio) return false;
    const d = dominio.toLowerCase();
    return d !== this.baseDominio && !d.endsWith(`.${this.baseDominio}`);
  }

  async provisionar(dto: CriarTenantDto): Promise<{
    tenant: {
      id: string;
      slug: string;
      nome: string;
      uf: string;
      cnpj: string | null;
      municipioIbge: string | null;
      dominio: string | null;
      subdominio: string | null;
      plano: string;
      ativo: boolean;
      iaTriagemHabilitada: boolean;
      iaChatHabilitada: boolean;
      criadoEm: Date;
      atualizadoEm: Date;
    };
    adminEmail: string;
    adminSenha: string;
    /** Dados de validação do domínio próprio (quando aplicável), p/ o cliente provar a posse. */
    dominioCustom: RegistroDominioResultado | null;
  }> {
    // 1. Criar tenant
    const tenant = await this.criarTenant(dto);
    const tenantId = tenant.id;

    // 2. Senha provisória forte (16 bytes → 32 chars hex)
    const adminSenha = randomBytes(8).toString('hex') + randomBytes(4).toString('base64url');
    const senhaHash = hashSenha(adminSenha);

    // Resolve e-mail do admin
    const host = dto.dominio ?? dto.subdominio ?? `${dto.slug}.plataforma`;
    const adminEmail = dto.adminEmail ?? `admin@${host}`;
    const adminNome = dto.adminNome ?? 'Administrador';

    // 3. Criar admin inicial
    await this.prisma.platform().user.create({
      data: {
        tenantId,
        nome: adminNome,
        email: adminEmail,
        senhaHash,
        role: 'admin_prefeitura',
        ativo: true,
      },
    });

    // 4. Provisionar conteúdo PNTP Diamante
    await this.semeiarMediaCategories(tenantId);
    await this.semeiarCms(tenantId, tenant.nome, host);
    await this.semeiarTransparencia(tenantId, host);
    await this.semeiarDatasets(tenantId);

    // 5. Semear conteúdo da home (banners, notícias, secretarias)
    this._secretariasSemeadas = [];
    await this.semeiarHome(tenantId, tenant.nome);
    await this.semeiarServicos(tenantId);

    // 6. Semear menus padrão (cabeçalho + rodapé)
    await this.menusService.semeiarMenus(tenantId);

    // 6b. Criar itens de menu individuais para cada secretaria semeada
    await this.semeiarMenusSecretarias(tenantId);

    // 6c. Semear os Cadastros de Documentos (Leis/Decretos/…, Licitações,
    //     Conselhos, Concursos, Contratos, Convênios) + seus itens de menu.
    //     Cada seeder é idempotente; isolado em try/catch para não quebrar o onboarding.
    await this.semeiarCadastrosDocumentos(tenantId);

    // 7. Aplicar tema padrão (sao-mateus-do-sul) para a home já nascer com visual
    await this.themeService.aplicarModeloParaTenant(tenantId, 'sao-mateus-do-sul');

    // 8. Invalidar cache Redis
    await this.invalidarCacheHosts(tenant);

    // 9. Domínio próprio (ex.: cidade.mt.gov.br) → registra Custom Hostname na
    //    Cloudflare (SSL DV via HTTP) e devolve os dados de validação. Guardado
    //    em try/catch para NUNCA quebrar o onboarding do tenant no banco local.
    let dominioCustom: RegistroDominioResultado | null = null;
    if (this.ehDominioCustom(tenant.dominio) && this.cloudflare.estaConfigurado()) {
      try {
        dominioCustom = await this.cloudflare.registrarDominioCustomizado(tenant.dominio!);
        this.logger.log({
          msg: 'dominio-custom-registrado',
          tenantId,
          hostname: tenant.dominio,
          customHostnameId: dominioCustom.id,
          jaExistia: dominioCustom.jaExistia,
        });

        // Persiste os campos cf_* no tenant via platform() (cross-tenant explícito).
        await this.prisma.platform().tenant.update({
          where: { id: tenantId },
          data: {
            cfCustomHostnameId: dominioCustom.id,
            cfStatus: dominioCustom.status,
            cfValidacao: dominioCustom as any,
            cfAtualizadoEm: new Date(),
          },
        });
      } catch (e) {
        // Falha na Cloudflare não impede o tenant de existir — só fica sem o
        // domínio próprio validado; pode ser reprocessado depois.
        this.logger.error(
          `Falha ao registrar domínio próprio "${tenant.dominio}" na Cloudflare: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }

    this.logger.log({ msg: 'tenant-provisionado', tenantId, slug: dto.slug });

    return { tenant, adminEmail, adminSenha, dominioCustom };
  }

  // ---------- helpers internos ----------

  private async criarTenant(dto: CriarTenantDto) {
    return this.prisma.platform().tenant.create({
      data: {
        slug: dto.slug,
        nome: dto.nome,
        uf: dto.uf.toUpperCase(),
        cnpj: dto.cnpj ?? null,
        municipioIbge: dto.municipioIbge ?? null,
        dominio: dto.dominio ?? null,
        subdominio: dto.subdominio ?? null,
        plano: dto.plano ?? 'padrao',
        ativo: true,
      },
    });
  }

  /**
   * As 11 categorias de mídia padrão (imagens + documentos).
   */
  private async semeiarMediaCategories(tenantId: string): Promise<void> {
    const db = this.prisma.platform();
    const categorias: Array<{ tipo: 'imagem' | 'documento'; nome: string; slug: string }> = [
      { tipo: 'imagem', nome: 'Logos', slug: 'logos' },
      { tipo: 'imagem', nome: 'Brasões', slug: 'brasoes' },
      { tipo: 'imagem', nome: 'Banners', slug: 'banners' },
      { tipo: 'imagem', nome: 'Notícias', slug: 'noticias' },
      { tipo: 'imagem', nome: 'Galeria', slug: 'galeria' },
      { tipo: 'imagem', nome: 'Denúncias', slug: 'denuncias' },
      { tipo: 'documento', nome: 'Editais', slug: 'editais' },
      { tipo: 'documento', nome: 'Leis', slug: 'leis' },
      { tipo: 'documento', nome: 'Contratos', slug: 'contratos' },
      { tipo: 'documento', nome: 'Relatórios', slug: 'relatorios' },
      { tipo: 'documento', nome: 'Protocolos', slug: 'protocolos' },
    ];

    for (const cat of categorias) {
      await db.mediaCategory.upsert({
        where: { tenantId_tipo_slug: { tenantId, tipo: cat.tipo, slug: cat.slug } },
        create: { tenantId, tipo: cat.tipo, nome: cat.nome, slug: cat.slug },
        update: {},
      });
    }
  }

  /**
   * CMS: home + 6 páginas institucionais/LGPD com blocos de texto iniciais.
   */
  private async semeiarCms(
    tenantId: string,
    nomePrefeitura: string,
    host: string,
  ): Promise<void> {
    const db = this.prisma.platform();

    // Página home + bloco hero
    const home = await db.cmsPage.upsert({
      where: { tenantId_slug: { tenantId, slug: 'home' } },
      create: { tenantId, slug: 'home', titulo: 'Início', publicado: true },
      update: { publicado: true },
    });

    const existeHeroBlock = await db.cmsBlock.findFirst({
      where: { tenantId, pageId: home.id, tipo: 'hero' },
    });
    if (!existeHeroBlock) {
      await db.cmsBlock.create({
        data: {
          tenantId,
          pageId: home.id,
          tipo: 'hero',
          conteudo: {
            titulo: `Bem-vindo ao Portal da ${nomePrefeitura}`,
            subtitulo: 'Serviços, transparência e ouvidoria em um só lugar',
            cta: { label: 'Transparência', href: '/transparencia' },
          },
          ordem: 0,
        },
      });
    }

    // Páginas institucionais
    const paginas: Array<{ slug: string; titulo: string }> = [
      { slug: 'institucional/estrutura', titulo: 'Estrutura Organizacional' },
      { slug: 'institucional/contatos', titulo: 'Endereços, Telefones e E-mails' },
      { slug: 'institucional/faq', titulo: 'Perguntas Frequentes' },
      { slug: 'mapa-do-site', titulo: 'Mapa do Site' },
      { slug: 'privacidade/encarregado', titulo: 'Encarregado de Dados (DPO)' },
      { slug: 'privacidade/politica', titulo: 'Política de Privacidade e Proteção de Dados' },
    ];

    for (const pag of paginas) {
      const page = await db.cmsPage.upsert({
        where: { tenantId_slug: { tenantId, slug: pag.slug } },
        create: { tenantId, slug: pag.slug, titulo: pag.titulo, publicado: true },
        update: { publicado: true },
      });

      const existeBloco = await db.cmsBlock.findFirst({
        where: { tenantId, pageId: page.id },
      });
      if (!existeBloco) {
        await db.cmsBlock.create({
          data: {
            tenantId,
            pageId: page.id,
            tipo: 'texto',
            conteudo: {
              titulo: pag.titulo,
              corpo: 'Conteúdo institucional da Prefeitura.',
            },
            ordem: 0,
          },
        });
      }
    }
  }

  /**
   * Documentos de transparência essenciais e obrigatórios (PNTP).
   * Cada documento nasce apontando para um PDF de EXEMPLO que baixa de verdade
   * (`/api/transparencia/modelo/<categoria>`), nunca um link 404. A prefeitura
   * substitui pelo arquivo oficial em Admin > Transparência > Documentos.
   */
  private async semeiarTransparencia(tenantId: string, host: string): Promise<void> {
    const db = this.prisma.platform();
    const ano = new Date().getFullYear();
    const anoAnterior = ano - 1;

    // URL do PDF-modelo servido pela API (link sempre válido para o cidadão).
    const modelo = (categoria: string) =>
      `https://${host}/api/transparencia/modelo/${categoria}.pdf`;

    const documentos: Array<{
      categoria: string;
      exercicio: number;
      titulo: string;
    }> = [
      { categoria: 'ppa', exercicio: ano, titulo: `PPA ${ano}-${ano + 3} e anexos` },
      { categoria: 'ldo', exercicio: ano, titulo: `LDO ${ano} e anexos` },
      { categoria: 'loa', exercicio: ano, titulo: `LOA ${ano} e anexos` },
      { categoria: 'rgf', exercicio: ano, titulo: `Relatório de Gestão Fiscal — 1º quadrimestre/${ano}` },
      { categoria: 'rreo', exercicio: ano, titulo: `Relatório Resumido da Execução Orçamentária — 1º bim/${ano}` },
      { categoria: 'balanco_geral', exercicio: anoAnterior, titulo: `Balanço Geral / Prestação de Contas ${anoAnterior}` },
      { categoria: 'prestacao_contas', exercicio: anoAnterior, titulo: `Prestação de Contas do exercício ${anoAnterior}` },
      { categoria: 'regulamento_lai', exercicio: anoAnterior, titulo: 'Decreto municipal que regulamenta a LAI' },
      { categoria: 'relatorio_estatistico_sic', exercicio: anoAnterior, titulo: `Relatório estatístico de pedidos e-SIC ${anoAnterior}` },
      { categoria: 'carta_servicos', exercicio: ano, titulo: 'Carta de Serviços ao Usuário' },
      { categoria: 'plano_contratacoes', exercicio: ano, titulo: `Plano de Contratações Anual ${ano}` },
      { categoria: 'edital_licitacao', exercicio: ano, titulo: `Edital do Pregão Eletrônico ${ano}-001` },
      { categoria: 'contrato', exercicio: ano, titulo: `Contrato CT-${ano}-001 — íntegra` },
      { categoria: 'concurso', exercicio: ano, titulo: `Edital do Concurso Público 01/${ano}` },
    ];

    for (const doc of documentos) {
      // Idempotente: checa se já existe pelo tenantId + categoria + exercicio + titulo
      const existe = await db.transpDocumento.findFirst({
        where: { tenantId, categoria: doc.categoria, exercicio: doc.exercicio, titulo: doc.titulo },
      });
      if (!existe) {
        await db.transpDocumento.create({
          data: {
            tenantId,
            categoria: doc.categoria,
            exercicio: doc.exercicio,
            titulo: doc.titulo,
            urlExterna: modelo(doc.categoria),
          },
        });
      }
    }
  }

  /**
   * Datasets tabulares (1 registro placeholder cada) + sync_log.
   * A equipe da prefeitura substitui pelos dados reais via ETL.
   */
  private async semeiarDatasets(tenantId: string): Promise<void> {
    const db = this.prisma.platform();
    const ano = new Date().getFullYear();

    // transp_diarias
    const existeDiaria = await db.transpDiaria.findFirst({ where: { tenantId } });
    if (!existeDiaria) {
      await db.transpDiaria.create({
        data: {
          tenantId,
          exercicio: ano,
          documento: `${ano}D0001`,
          beneficiario: 'Servidor Exemplo',
          cargo: 'Secretário Municipal',
          destino: 'Capital do Estado',
          valorTotal: 2400,
          dataInicio: new Date(`${ano}-01-10`),
        },
      });
    }

    // transp_obras
    const existeObra = await db.transpObra.findFirst({ where: { tenantId } });
    if (!existeObra) {
      await db.transpObra.create({
        data: {
          tenantId,
          exercicio: ano,
          identificador: `OBRA-${ano}-01`,
          objeto: 'Pavimentação de Vias Urbanas',
          situacao: 'em_andamento',
          contratada: 'Construtora Exemplo LTDA',
          valorContratado: 800000,
          valorExecutado: 350000,
          bairro: 'Centro',
        },
      });
    }

    // transp_divida_ativa
    const existeDivida = await db.transpDividaAtiva.findFirst({ where: { tenantId } });
    if (!existeDivida) {
      await db.transpDividaAtiva.create({
        data: {
          tenantId,
          exercicio: ano,
          inscricao: 'DA-001',
          inscritoNome: 'Empresa Exemplo LTDA',
          inscritoDoc: '11222333000181',
          natureza: 'IPTU',
          valor: 12500,
        },
      });
    }

    // transp_terceirizados
    const existeTerceirizado = await db.transpTerceirizado.findFirst({ where: { tenantId } });
    if (!existeTerceirizado) {
      await db.transpTerceirizado.create({
        data: {
          tenantId,
          exercicio: ano,
          vinculo: 'terceirizado',
          registro: 'T-001',
          nome: 'Funcionário Exemplo',
          empresa: 'Prestadora de Serviços ME',
          cargo: 'Auxiliar de Serviços Gerais',
          remuneracao: 1800,
        },
      });
    }

    // transp_convenios
    const existeConvenio = await db.transpConvenio.findFirst({ where: { tenantId } });
    if (!existeConvenio) {
      await db.transpConvenio.create({
        data: {
          tenantId,
          exercicio: ano,
          numero: `CV-${ano}-01`,
          tipo: 'recebido',
          participe: 'Governo Estadual',
          objeto: 'Convênio de repasse para infraestrutura',
          valor: 500000,
        },
      });
    }

    // transp_licitacoes
    const existeLicitacao = await db.transpLicitacao.findFirst({ where: { tenantId } });
    if (!existeLicitacao) {
      await db.transpLicitacao.create({
        data: {
          tenantId,
          exercicio: ano,
          numero: `PE-${ano}-001`,
          modalidade: 'Pregão Eletrônico',
          objeto: 'Aquisição de materiais de consumo',
          valorEstimado: 300000,
          situacao: 'homologada',
          dataAbertura: new Date(`${ano}-03-01`),
        },
      });
    }

    // transp_contratos
    const existeContrato = await db.transpContrato.findFirst({ where: { tenantId } });
    if (!existeContrato) {
      await db.transpContrato.create({
        data: {
          tenantId,
          exercicio: ano,
          numero: `CT-${ano}-001`,
          fornecedorNome: 'Fornecedora Exemplo SA',
          fornecedorDoc: '99888777000166',
          objeto: 'Fornecimento de materiais',
          valor: 300000,
        },
      });
    }

    // transp_despesas
    const existeDespesa = await db.transpDespesa.findFirst({ where: { tenantId } });
    if (!existeDespesa) {
      await db.transpDespesa.create({
        data: {
          tenantId,
          exercicio: ano,
          empenho: `${ano}NE000001`,
          orgao: 'Secretaria Municipal de Administração',
          credorNome: 'Fornecedora Exemplo SA',
          credorDoc: '99888777000166',
          valorEmpenhado: 150000,
          valorLiquidado: 120000,
          valorPago: 100000,
          dataEmpenho: new Date(`${ano}-03-15`),
        },
      });
    }

    // transp_receitas
    const existeReceita = await db.transpReceita.findFirst({ where: { tenantId } });
    if (!existeReceita) {
      await db.transpReceita.create({
        data: {
          tenantId,
          exercicio: ano,
          codigo: '1112.04.31',
          descricao: 'IPTU',
          categoria: 'corrente',
          valorPrevisto: 2000000,
          valorArrecadado: 1500000,
          dataLancamento: new Date(`${ano}-01-31`),
        },
      });
    }

    // transp_folha
    const existeFolha = await db.transpFolha.findFirst({ where: { tenantId } });
    if (!existeFolha) {
      await db.transpFolha.create({
        data: {
          tenantId,
          exercicio: ano,
          mes: 1,
          matricula: '00000001',
          nomeServidor: 'Servidor Exemplo',
          cargo: 'Administrador',
          vinculo: 'efetivo',
          orgao: 'Administração',
          remuneracaoBruta: 8000,
          descontos: 1500,
          remuneracaoLiquida: 6500,
        },
      });
    }

    // transp_sync_log — atualidade para todos os datasets
    const datasets = [
      'documentos', 'diarias', 'obras', 'divida-ativa', 'terceirizados',
      'convenios', 'licitacoes', 'contratos', 'despesas', 'receitas', 'folha',
    ];
    for (const dataset of datasets) {
      await db.transpSyncLog.create({
        data: { tenantId, dataset, origem: 'provisioning', registros: 1, status: 'ok' },
      });
    }
  }

  /**
   * Semeia o conteúdo dinâmico da home: banners, notícias e secretarias de exemplo.
   */
  /** Semeia a Carta de Serviços com o modelo padrão (serviços municipais comuns). */
  private async semeiarServicos(tenantId: string): Promise<void> {
    const db = this.prisma.platform();
    if (await db.servico.findFirst({ where: { tenantId }, select: { id: true } })) return;
    const slugify = (t: string) =>
      t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let ordem = 0;
    for (const m of SERVICOS_MODELO) {
      await db.servico.create({
        data: {
          tenantId, titulo: m.titulo, slug: slugify(m.titulo), descricao: m.descricao,
          categoria: m.categoria, orgaoResponsavel: m.orgaoResponsavel, publicoAlvo: m.publicoAlvo ?? null,
          prazoAtendimento: m.prazoAtendimento ?? null, custo: m.custo ?? null, urlExterna: m.urlExterna ?? null,
          etapas: [], publicado: true, destaque: m.destaque ?? false, ordem: ordem++,
        },
      });
    }
    this.logger.log(`Carta de Serviços semeada (${SERVICOS_MODELO.length} serviços) para tenant ${tenantId}`);
  }

  private async semeiarHome(tenantId: string, nomePrefeitura: string): Promise<void> {
    const db = this.prisma.platform();
    const agora = new Date();

    // ----- Banners -----
    const existeBanner = await db.banner.findFirst({ where: { tenantId } });
    if (!existeBanner) {
      const banners = [
        {
          titulo: `Bem-vindo ao Portal da ${nomePrefeitura}`,
          subtitulo: 'Serviços, transparência e ouvidoria em um só lugar',
          ctaLabel: 'Conheça os serviços',
          ordem: 0,
        },
        {
          titulo: 'Transparência Municipal',
          subtitulo: 'Acesse despesas, receitas, licitações e contratos públicos',
          ctaLabel: 'Ver transparência',
          ordem: 1,
        },
        {
          titulo: 'Ouvidoria Digital',
          subtitulo: 'Envie reclamações, sugestões e elogios de forma fácil e segura',
          ctaLabel: 'Abrir manifestação',
          ordem: 2,
        },
      ];
      for (const banner of banners) {
        await db.banner.create({
          data: { tenantId, ...banner, ativo: true },
        });
      }
    }

    // ----- Notícias -----
    const slugs = [
      'boas-vindas-portal',
      'transparencia-premiacao',
      'servicos-digitais-ampliados',
    ];
    for (const slug of slugs) {
      const existe = await db.noticia.findFirst({ where: { tenantId, slug } });
      if (!existe) {
        const noticiasExemplo: Record<string, { titulo: string; resumo: string; categoria: string; autor: string }> = {
          'boas-vindas-portal': {
            titulo: `Portal da ${nomePrefeitura} é lançado`,
            resumo: 'O novo portal digital oferece acesso fácil a todos os serviços e informações da Prefeitura.',
            categoria: 'Institucional',
            autor: 'Comunicação Oficial',
          },
          'transparencia-premiacao': {
            titulo: 'Prefeitura recebe nota máxima em transparência',
            resumo: 'Avaliação do PNTP Diamante reconhece excelência na publicação de dados públicos.',
            categoria: 'Transparência',
            autor: 'Assessoria de Comunicação',
          },
          'servicos-digitais-ampliados': {
            titulo: 'Serviços digitais são ampliados para o cidadão',
            resumo: 'Novos serviços online facilitam o dia a dia dos moradores sem precisar sair de casa.',
            categoria: 'Serviços',
            autor: 'Secretaria de Administração',
          },
        };
        const dados = noticiasExemplo[slug];
        await db.noticia.create({
          data: {
            tenantId,
            slug,
            titulo: dados.titulo,
            resumo: dados.resumo,
            categoria: dados.categoria,
            autor: dados.autor,
            publicado: true,
            publicadoEm: agora,
          },
        });
      }
    }

    // ----- Secretarias -----
    const existeSecretaria = await db.secretaria.findFirst({ where: { tenantId } });
    if (!existeSecretaria) {
      const secretariasBase = [
        {
          nome: 'Secretaria de Saúde',
          sigla: 'SMS',
          slug: 'secretaria-de-saude',
          responsavel: 'Secretário(a) de Saúde',
          descricao: 'Responsável pela saúde pública e atendimentos à população.',
          ordem: 0,
        },
        {
          nome: 'Secretaria de Educação',
          sigla: 'SME',
          slug: 'secretaria-de-educacao',
          responsavel: 'Secretário(a) de Educação',
          descricao: 'Gestão das escolas municipais e políticas de educação.',
          ordem: 1,
        },
        {
          nome: 'Secretaria de Obras',
          sigla: 'SMO',
          slug: 'secretaria-de-obras',
          responsavel: 'Secretário(a) de Obras',
          descricao: 'Infraestrutura urbana, pavimentação e obras públicas.',
          ordem: 2,
        },
        {
          nome: 'Secretaria de Administração',
          sigla: 'SMA',
          slug: 'secretaria-de-administracao',
          responsavel: 'Secretário(a) de Administração',
          descricao: 'Gestão administrativa, recursos humanos e contratos.',
          ordem: 3,
        },
      ];

      // Cria secretarias com slug e guarda os registros para criar menus depois
      for (const secretaria of secretariasBase) {
        const criada = await db.secretaria.create({
          data: { tenantId, ...secretaria, ativo: true },
        });
        this._secretariasSemeadas.push({ id: criada.id, nome: criada.nome, slug: secretaria.slug });
      }
    }
  }

  /**
   * Semeia os Cadastros de Documentos no novo tenant: taxonomias TCE-MT
   * (naturezas de lei, modalidades de licitação, tipos de conselho/concurso…) e
   * o item de menu de cada cadastro sob "Documentos Oficiais". Cada seeder é
   * idempotente e isolado — uma falha não interrompe o provisionamento.
   */
  private async semeiarCadastrosDocumentos(tenantId: string): Promise<void> {
    const seeders: Array<[string, () => Promise<unknown>]> = [
      ['documentos', () => this.documentos.semearTenant(tenantId)],
      ['licitacoes', () => this.licitacoes.semearTenant(tenantId)],
      ['conselhos', () => this.conselhos.semearTenant(tenantId)],
      ['concursos', () => this.concursos.semearTenant(tenantId)],
      ['contratos', () => this.contratos.semearTenant(tenantId)],
      ['convenios', () => this.convenios.semearTenant(tenantId)],
    ];
    for (const [nome, run] of seeders) {
      try {
        await run();
      } catch (e) {
        this.logger.warn({ msg: 'seed-cadastro-falhou', cadastro: nome, erro: (e as Error).message });
      }
    }
  }

  // Armazena temporariamente as secretarias semeadas para uso em semeiarMenusSecretarias
  private _secretariasSemeadas: Array<{ id: string; nome: string; slug: string }> = [];

  /**
   * Cria itens de menu individuais para cada secretaria semeada.
   * O grupo "Secretarias" já foi criado por semeiarMenus; aqui apenas adicionamos
   * os filhos com href=/secretarias/<slug> e refTipo='secretaria'.
   * Usa platform() — cross-tenant com tenantId explícito.
   */
  private async semeiarMenusSecretarias(tenantId: string): Promise<void> {
    if (this._secretariasSemeadas.length === 0) return;

    const db = this.prisma.platform();

    // Acha o grupo "Secretarias" no cabeçalho
    const grupo = await db.menuItem.findFirst({
      where: { tenantId, local: 'cabecalho', refTipo: 'secretarias_root', tipo: 'grupo' },
      select: { id: true },
    });
    if (!grupo) return; // grupo não existe (não deveria acontecer)

    // Cria um item filho para cada secretaria (idempotente por refTipo+refId)
    for (let i = 0; i < this._secretariasSemeadas.length; i++) {
      const sec = this._secretariasSemeadas[i];
      const existe = await db.menuItem.findFirst({
        where: { tenantId, refTipo: 'secretaria', refId: sec.id },
      });
      if (existe) continue;

      await db.menuItem.create({
        data: {
          tenantId,
          local: 'cabecalho',
          parentId: grupo.id,
          label: sec.nome,
          tipo: 'interno',
          href: `/secretarias/${sec.slug}`,
          icone: 'building',
          // ordem 1+ para ficar depois do "Todas as secretarias" (ordem 0)
          ordem: i + 1,
          ativo: true,
          refTipo: 'secretaria',
          refId: sec.id,
        },
      });
    }
  }

  private async invalidarCacheHosts(tenant: {
    dominio: string | null;
    subdominio: string | null;
  }): Promise<void> {
    if (tenant.dominio) {
      await this.cache.del(`tenant:host:${tenant.dominio}`);
    }
    if (tenant.subdominio) {
      await this.cache.del(`tenant:host:${tenant.subdominio}`);
    }
  }
}
