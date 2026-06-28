import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuLocal, MenuTipo } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContext } from '../../common/tenant/tenant.context';
import { CriarMenuItemDto, AtualizarMenuItemDto } from './menus.dto';

// ---------------------------------------------------------------------------
// Tipos internos

export interface MenuItemPublico {
  id: string;
  label: string;
  tipo: MenuTipo;
  href: string | null;
  icone: string | null;
  ordem: number;
  children: MenuItemPublico[];
}

export interface MenuItemAdmin {
  id: string;
  parentId: string | null;
  local: MenuLocal;
  label: string;
  tipo: MenuTipo;
  href: string | null;
  icone: string | null;
  ordem: number;
  ativo: boolean;
  refTipo: string | null;
  children: MenuItemAdmin[];
}

export interface CriarItemAutoParams {
  local: MenuLocal;
  label: string;
  tipo: MenuTipo;
  href?: string;
  icone?: string;
  refTipo?: string;
  refId?: string;
  parentId?: string;
}

export interface GrupoRota {
  grupo: string;
  rotas: { label: string; href: string }[];
}

// ---------------------------------------------------------------------------

/**
 * Service de menus dinâmicos por tenant.
 * - `prisma.db.*` → acesso com escopo RLS automático.
 * - `prisma.platform()` → apenas em métodos explicitamente cross-tenant
 *   (provisioning), sempre com justificativa.
 */
@Injectable()
export class MenusService {
  constructor(private readonly prisma: PrismaService) {}

  // =========================================================================
  // PÚBLICO — apenas itens ativos, montados como árvore

  async arvorePublica(local: MenuLocal): Promise<MenuItemPublico[]> {
    const rows = await this.prisma.db.menuItem.findMany({
      where: { local, ativo: true },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        parentId: true,
        label: true,
        tipo: true,
        href: true,
        icone: true,
        ordem: true,
      },
    });
    return this.montarArvorePublica(rows);
  }

  // =========================================================================
  // ADMIN — todos os itens (incl. inativos), montados como árvore

  async arvoreAdmin(local: MenuLocal): Promise<MenuItemAdmin[]> {
    const rows = await this.prisma.db.menuItem.findMany({
      where: { local },
      orderBy: { ordem: 'asc' },
      select: {
        id: true,
        parentId: true,
        local: true,
        label: true,
        tipo: true,
        href: true,
        icone: true,
        ordem: true,
        ativo: true,
        refTipo: true,
      },
    });
    return this.montarArvoreAdmin(rows);
  }

  async criar(dto: CriarMenuItemDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // Valida: grupo não tem href; outros requerem href
    if (dto.tipo === 'grupo' && dto.href) {
      // silenciosamente ignora href para grupos
      dto.href = undefined;
    }
    if (dto.tipo !== 'grupo' && !dto.href) {
      throw new BadRequestException(
        'href é obrigatório para tipo interno ou externo.',
      );
    }

    // Valida parentId: deve existir, pertencer ao mesmo tenant e mesmo local
    if (dto.parentId) {
      const pai = await this.prisma.db.menuItem.findUnique({
        where: { id: dto.parentId },
        select: { id: true, local: true },
      });
      if (!pai) {
        throw new BadRequestException('parentId não encontrado neste tenant.');
      }
      if (pai.local !== dto.local) {
        throw new BadRequestException(
          'O item pai deve pertencer ao mesmo local (cabecalho/rodape).',
        );
      }
    }

    const item = await this.prisma.db.menuItem.create({
      data: {
        tenantId,
        local: dto.local as MenuLocal,
        parentId: dto.parentId ?? null,
        label: dto.label,
        tipo: dto.tipo as MenuTipo,
        href: dto.href ?? null,
        icone: dto.icone ?? null,
        ordem: dto.ordem ?? 0,
        ativo: dto.ativo ?? true,
      },
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'MENU_ITEM_CRIADO',
        entidade: 'menu_items',
        entidadeId: item.id,
        dados: { local: item.local, label: item.label, tipo: item.tipo },
      },
    });

    return item;
  }

  async atualizar(id: string, dto: AtualizarMenuItemDto, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    // Garante existência no tenant via RLS
    const atual = await this.prisma.db.menuItem.findUnique({
      where: { id },
      select: { id: true, local: true },
    });
    if (!atual) throw new NotFoundException('Item de menu não encontrado.');

    // Valida parentId
    if (dto.parentId !== undefined && dto.parentId !== null) {
      // Anti-ciclo: item não pode ser pai de si mesmo
      if (dto.parentId === id) {
        throw new BadRequestException(
          'Um item não pode ser pai de si mesmo.',
        );
      }

      const pai = await this.prisma.db.menuItem.findUnique({
        where: { id: dto.parentId },
        select: { id: true, local: true },
      });
      if (!pai) {
        throw new BadRequestException('parentId não encontrado neste tenant.');
      }
      if (pai.local !== atual.local) {
        throw new BadRequestException(
          'O item pai deve pertencer ao mesmo local (cabecalho/rodape).',
        );
      }

      // Anti-ciclo: parentId não pode ser descendente de id
      const eDescendente = await this.verificarDescendente(id, dto.parentId);
      if (eDescendente) {
        throw new BadRequestException(
          'O item pai não pode ser um descendente do item atual (ciclo).',
        );
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.parentId !== undefined) data.parentId = dto.parentId;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.tipo !== undefined) data.tipo = dto.tipo;
    if (dto.href !== undefined) data.href = dto.href;
    if (dto.icone !== undefined) data.icone = dto.icone;
    if (dto.ordem !== undefined) data.ordem = dto.ordem;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;

    const atualizado = await this.prisma.db.menuItem.update({
      where: { id },
      data: data as any,
    });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'MENU_ITEM_ATUALIZADO',
        entidade: 'menu_items',
        entidadeId: id,
        dados: { campos: Object.keys(data) },
      },
    });

    return atualizado;
  }

  async excluir(id: string, atorId?: string) {
    const tenantId = TenantContext.tenantId()!;

    const item = await this.prisma.db.menuItem.findUnique({
      where: { id },
      select: { id: true, label: true },
    });
    if (!item) throw new NotFoundException('Item de menu não encontrado.');

    // Filhos caem por cascade FK no banco
    await this.prisma.db.menuItem.delete({ where: { id } });

    await this.prisma.db.auditLog.create({
      data: {
        tenantId,
        atorId: atorId ?? null,
        acao: 'MENU_ITEM_EXCLUIDO',
        entidade: 'menu_items',
        entidadeId: id,
        dados: { label: item.label },
      },
    });

    return { excluido: true };
  }

  /**
   * Rotas internas disponíveis para seleção no admin, agrupadas.
   * Inclui páginas CMS e secretarias ativas do tenant dinamicamente.
   */
  async rotasInternas(): Promise<GrupoRota[]> {
    // Busca páginas CMS do tenant (RLS garante isolamento)
    const cmsPages = await this.prisma.db.cmsPage.findMany({
      select: { titulo: true, slug: true },
      orderBy: { titulo: 'asc' },
    });

    // Busca secretarias ativas com slug para gerar rotas individuais
    const secretarias = await this.prisma.db.secretaria.findMany({
      where: { ativo: true },
      select: { nome: true, slug: true },
      orderBy: { ordem: 'asc' },
    });

    return [
      {
        grupo: 'Geral',
        rotas: [
          { label: 'Início', href: '/' },
          { label: 'Busca', href: '/busca' },
          { label: 'Minha conta', href: '/painel' },
          { label: 'Assistente', href: '/assistente' },
        ],
      },
      {
        grupo: 'Módulos',
        rotas: [
          { label: 'Transparência', href: '/transparencia' },
          { label: 'Serviços', href: '/servicos' },
          { label: 'Diário Oficial', href: '/diario' },
          { label: 'Notícias', href: '/noticias' },
          { label: 'Secretarias', href: '/secretarias' },
          { label: 'O Prefeito / A Prefeita', href: '/institucional/prefeito' },
          { label: 'Estrutura organizacional', href: '/institucional/estrutura' },
          { label: 'Galeria', href: '/galeria' },
          { label: 'Ouvidoria', href: '/ouvidoria' },
          { label: 'e-SIC', href: '/esic' },
        ],
      },
      {
        grupo: 'Transparência',
        rotas: [
          { label: 'Visão geral', href: '/transparencia' },
          { label: 'Receitas', href: '/transparencia/receitas' },
          { label: 'Despesas', href: '/transparencia/despesas' },
          { label: 'Folha de Pagamento', href: '/transparencia/folha' },
          { label: 'Diárias', href: '/transparencia/diarias' },
          { label: 'Obras', href: '/transparencia/obras' },
          { label: 'Dívida Ativa', href: '/transparencia/divida-ativa' },
          { label: 'Terceirizados', href: '/transparencia/terceirizados' },
          { label: 'Convênios', href: '/transparencia/convenios' },
          { label: 'Licitações', href: '/transparencia/licitacoes' },
          { label: 'Contratos', href: '/transparencia/contratos' },
          { label: 'Documentos e Planejamento', href: '/transparencia/documentos' },
          { label: 'Dados Abertos', href: '/transparencia/dados-abertos' },
        ],
      },
      {
        grupo: 'Secretarias',
        rotas: secretarias
          .filter((s) => !!s.slug)
          .map((s) => ({
            label: s.nome,
            href: '/secretarias/' + s.slug,
          })),
      },
      {
        grupo: 'Páginas (CMS)',
        rotas: cmsPages.map((p) => ({
          label: p.titulo,
          href: '/' + p.slug,
        })),
      },
    ];
  }

  // =========================================================================
  // Métodos reutilizáveis (hooks de auto-cadastro)

  /**
   * Cria um item de menu de forma idempotente.
   * Se já existe item com mesmo refTipo+refId, não duplica.
   * Usa prisma.platform() pois pode ser chamado a partir do provisioning
   * (cross-tenant, com tenantId explícito).
   */
  async criarItemAuto(
    tenantId: string,
    params: CriarItemAutoParams,
  ): Promise<void> {
    const db = this.prisma.platform();

    // Idempotência por refTipo+refId
    if (params.refTipo && params.refId) {
      const existe = await db.menuItem.findFirst({
        where: { tenantId, refTipo: params.refTipo, refId: params.refId },
      });
      if (existe) return;
    }

    await db.menuItem.create({
      data: {
        tenantId,
        local: params.local,
        parentId: params.parentId ?? null,
        label: params.label,
        tipo: params.tipo,
        href: params.href ?? null,
        icone: params.icone ?? null,
        ordem: 0,
        ativo: true,
        refTipo: params.refTipo ?? null,
        refId: params.refId ?? null,
      },
    });
  }

  /**
   * Remove o item de menu vinculado a uma referência (ex.: secretaria excluída).
   * Usa prisma.db para operar com RLS do tenant atual.
   */
  async removerPorRef(refTipo: string, refId: string): Promise<void> {
    await this.prisma.db.menuItem.deleteMany({
      where: { refTipo, refId },
    });
  }

  /**
   * Atualiza o href do item de menu vinculado a uma referência.
   * Chamado quando o slug de uma secretaria é alterado.
   * Usa prisma.db (RLS do tenant ativo).
   */
  async atualizarHrefPorRef(refTipo: string, refId: string, href: string): Promise<void> {
    await this.prisma.db.menuItem.updateMany({
      where: { refTipo, refId },
      data: { href },
    });
  }

  /**
   * Upsert do item de menu da página do Prefeito sob o grupo "A Prefeitura".
   * Auto-curativo: acha o grupo por refTipo OU label (e fixa o refTipo se faltar),
   * cria o grupo se não existir, e cria/atualiza o item singleton
   * (refTipo='prefeito_page'). O `label` vem com o gênero do titular atual
   * ("O Prefeito" / "A Prefeita"). Usa prisma.db (RLS do tenant ativo).
   */
  async sincronizarPrefeito(label: string, href = '/institucional/prefeito'): Promise<void> {
    const tenantId = TenantContext.tenantId()!;
    let grupo = await this.prisma.db.menuItem.findFirst({
      where: { local: 'cabecalho', tipo: 'grupo', OR: [{ refTipo: 'a_prefeitura_root' }, { label: 'A Prefeitura' }] },
      select: { id: true, refTipo: true },
    });
    if (!grupo) {
      grupo = await this.prisma.db.menuItem.create({
        data: { tenantId, local: 'cabecalho', label: 'A Prefeitura', tipo: 'grupo', ordem: 1, ativo: true, refTipo: 'a_prefeitura_root' },
        select: { id: true, refTipo: true },
      });
    } else if (!grupo.refTipo) {
      await this.prisma.db.menuItem.update({ where: { id: grupo.id }, data: { refTipo: 'a_prefeitura_root' } });
    }

    const item = await this.prisma.db.menuItem.findFirst({
      where: { local: 'cabecalho', refTipo: 'prefeito_page' },
      select: { id: true },
    });
    if (item) {
      await this.prisma.db.menuItem.update({
        where: { id: item.id },
        data: { label, href, parentId: grupo.id, ativo: true },
      });
    } else {
      await this.prisma.db.menuItem.create({
        data: { tenantId, local: 'cabecalho', parentId: grupo.id, label, tipo: 'interno', href, icone: 'user', ordem: 0, ativo: true, refTipo: 'prefeito_page' },
      });
    }
  }

  /**
   * Acha ou cria um item do tipo 'grupo' identificado por refTipo.
   * Retorna o id do grupo.
   * Usa prisma.platform() pois pode ser chamado a partir de hooks cross-tenant.
   */
  async acharOuCriarGrupo(
    tenantId: string,
    local: MenuLocal,
    label: string,
    refTipo: string,
  ): Promise<string> {
    const db = this.prisma.platform();

    const existente = await db.menuItem.findFirst({
      where: { tenantId, local, refTipo, tipo: 'grupo' },
      select: { id: true },
    });
    if (existente) return existente.id;

    const grupo = await db.menuItem.create({
      data: {
        tenantId,
        local,
        parentId: null,
        label,
        tipo: 'grupo',
        href: null,
        ordem: 99,
        ativo: true,
        refTipo,
        refId: null,
      },
    });
    return grupo.id;
  }

  /**
   * Versão para uso em contexto RLS (tenant já definido no contexto).
   * Cria item idempotente via prisma.db (RLS automático).
   */
  async criarItemAutoRls(params: CriarItemAutoParams): Promise<void> {
    // Idempotência por refTipo+refId
    if (params.refTipo && params.refId) {
      const existe = await this.prisma.db.menuItem.findFirst({
        where: { refTipo: params.refTipo, refId: params.refId },
      });
      if (existe) return;
    }

    const tenantId = TenantContext.tenantId()!;
    await this.prisma.db.menuItem.create({
      data: {
        tenantId,
        local: params.local,
        parentId: params.parentId ?? null,
        label: params.label,
        tipo: params.tipo,
        href: params.href ?? null,
        icone: params.icone ?? null,
        ordem: 0,
        ativo: true,
        refTipo: params.refTipo ?? null,
        refId: params.refId ?? null,
      },
    });
  }

  /**
   * Acha ou cria um grupo via RLS (contexto de tenant ativo).
   * Retorna o id do grupo.
   */
  async acharOuCriarGrupoRls(
    local: MenuLocal,
    label: string,
    refTipo: string,
  ): Promise<string> {
    const existente = await this.prisma.db.menuItem.findFirst({
      where: { local, refTipo, tipo: 'grupo' },
      select: { id: true },
    });
    if (existente) return existente.id;

    const tenantId = TenantContext.tenantId()!;
    const grupo = await this.prisma.db.menuItem.create({
      data: {
        tenantId,
        local,
        parentId: null,
        label,
        tipo: 'grupo',
        href: null,
        ordem: 99,
        ativo: true,
        refTipo,
        refId: null,
      },
    });
    return grupo.id;
  }

  // =========================================================================
  // Provisioning cross-tenant (chamado pelo TenantProvisioningService)

  /**
   * Semeia os menus padrão para um novo tenant.
   * Usa prisma.platform() — cross-tenant com tenantId explícito.
   */
  async semeiarMenus(tenantId: string): Promise<void> {
    const db = this.prisma.platform();

    // Checa se já foi semeado (idempotente)
    const existe = await db.menuItem.findFirst({ where: { tenantId } });
    if (existe) return;

    // -----------------------------------------------------------------------
    // CABEÇALHO

    // Raízes do cabeçalho (ordem crescente)
    const inicio = await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', label: 'Início', tipo: 'interno',
        href: '/', ordem: 0, ativo: true, refTipo: 'menu_inicio',
      },
    });

    const aPrefeitura = await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', label: 'A Prefeitura', tipo: 'grupo',
        ordem: 1, ativo: true, refTipo: 'a_prefeitura_root',
      },
    });

    // Filhos de "A Prefeitura"
    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'cabecalho', parentId: aPrefeitura.id, label: 'O Prefeito(a)', tipo: 'interno', href: '/institucional/prefeito', icone: 'user', ordem: 0, ativo: true, refTipo: 'prefeito_page' },
        { tenantId, local: 'cabecalho', parentId: aPrefeitura.id, label: 'Estrutura Organizacional', tipo: 'interno', href: '/institucional/estrutura', ordem: 1, ativo: true },
        { tenantId, local: 'cabecalho', parentId: aPrefeitura.id, label: 'Contatos', tipo: 'interno', href: '/institucional/contatos', ordem: 2, ativo: true },
        { tenantId, local: 'cabecalho', parentId: aPrefeitura.id, label: 'Perguntas Frequentes', tipo: 'interno', href: '/institucional/faq', ordem: 3, ativo: true },
      ],
    });

    const secretariasGrupo = await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', label: 'Secretarias', tipo: 'grupo',
        ordem: 2, ativo: true, refTipo: 'secretarias_root',
      },
    });

    // Filho "Todas as secretarias"
    await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', parentId: secretariasGrupo.id,
        label: 'Todas as secretarias', tipo: 'interno', href: '/secretarias',
        ordem: 0, ativo: true,
      },
    });

    // Transparência como grupo (dropdown) com todos os conjuntos do PNTP
    const transpCab = await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', label: 'Transparência', tipo: 'grupo',
        ordem: 3, ativo: true,
      },
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Visão geral', tipo: 'interno', href: '/transparencia', ordem: 0, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Receitas', tipo: 'interno', href: '/transparencia/receitas', ordem: 1, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Despesas', tipo: 'interno', href: '/transparencia/despesas', ordem: 2, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Execução da despesa', tipo: 'interno', href: '/transparencia/execucao', ordem: 3, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Folha de Pagamento', tipo: 'interno', href: '/transparencia/folha', ordem: 4, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Licitações', tipo: 'interno', href: '/transparencia/licitacoes', ordem: 5, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Contratos', tipo: 'interno', href: '/transparencia/contratos', ordem: 6, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Obras', tipo: 'interno', href: '/transparencia/obras', ordem: 7, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Documentos e Planejamento', tipo: 'interno', href: '/transparencia/documentos', ordem: 8, ativo: true },
        { tenantId, local: 'cabecalho', parentId: transpCab.id, label: 'Dados Abertos', tipo: 'interno', href: '/transparencia/dados-abertos', ordem: 9, ativo: true },
      ],
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'cabecalho', label: 'Serviços', tipo: 'interno', href: '/servicos', ordem: 4, ativo: true },
        { tenantId, local: 'cabecalho', label: 'Diário Oficial', tipo: 'interno', href: '/diario', ordem: 5, ativo: true },
        { tenantId, local: 'cabecalho', label: 'Notícias', tipo: 'interno', href: '/noticias', ordem: 6, ativo: true },
        { tenantId, local: 'cabecalho', label: 'Galeria', tipo: 'interno', href: '/galeria', ordem: 7, ativo: true },
      ],
    });

    const ouvidoriaGrupo = await db.menuItem.create({
      data: {
        tenantId, local: 'cabecalho', label: 'Ouvidoria', tipo: 'grupo',
        ordem: 7, ativo: true,
      },
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'cabecalho', parentId: ouvidoriaGrupo.id, label: 'Ouvidoria', tipo: 'interno', href: '/ouvidoria', ordem: 0, ativo: true },
        { tenantId, local: 'cabecalho', parentId: ouvidoriaGrupo.id, label: 'e-SIC', tipo: 'interno', href: '/esic', ordem: 1, ativo: true },
      ],
    });

    // -----------------------------------------------------------------------
    // RODAPÉ — 3 colunas como grupos

    const portalGrupo = await db.menuItem.create({
      data: {
        tenantId, local: 'rodape', label: 'Portal', tipo: 'grupo',
        ordem: 0, ativo: true,
      },
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'rodape', parentId: portalGrupo.id, label: 'Início', tipo: 'interno', href: '/', ordem: 0, ativo: true },
        { tenantId, local: 'rodape', parentId: portalGrupo.id, label: 'Notícias', tipo: 'interno', href: '/noticias', ordem: 1, ativo: true },
        { tenantId, local: 'rodape', parentId: portalGrupo.id, label: 'Mapa do Site', tipo: 'interno', href: '/mapa-do-site', ordem: 2, ativo: true },
      ],
    });

    const servicosGrupo = await db.menuItem.create({
      data: {
        tenantId, local: 'rodape', label: 'Serviços', tipo: 'grupo',
        ordem: 1, ativo: true,
      },
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'rodape', parentId: servicosGrupo.id, label: 'Serviços', tipo: 'interno', href: '/servicos', ordem: 0, ativo: true },
        { tenantId, local: 'rodape', parentId: servicosGrupo.id, label: 'Diário Oficial', tipo: 'interno', href: '/diario', ordem: 1, ativo: true },
        { tenantId, local: 'rodape', parentId: servicosGrupo.id, label: 'Ouvidoria', tipo: 'interno', href: '/ouvidoria', ordem: 2, ativo: true },
        { tenantId, local: 'rodape', parentId: servicosGrupo.id, label: 'e-SIC — Acesso à Informação', tipo: 'interno', href: '/esic', ordem: 3, ativo: true },
      ],
    });

    const transpGrupo = await db.menuItem.create({
      data: {
        tenantId, local: 'rodape', label: 'Transparência', tipo: 'grupo',
        ordem: 2, ativo: true,
      },
    });

    await db.menuItem.createMany({
      data: [
        { tenantId, local: 'rodape', parentId: transpGrupo.id, label: 'Portal da Transparência', tipo: 'interno', href: '/transparencia', ordem: 0, ativo: true },
        { tenantId, local: 'rodape', parentId: transpGrupo.id, label: 'Documentos e Planejamento', tipo: 'interno', href: '/transparencia/documentos', ordem: 1, ativo: true },
        { tenantId, local: 'rodape', parentId: transpGrupo.id, label: 'Dados Abertos', tipo: 'interno', href: '/transparencia/dados-abertos', ordem: 2, ativo: true },
      ],
    });

    // (Coluna "Cidadão" mesclada em "Serviços" — Ouvidoria/e-SIC acima — para
    // manter o rodapé em 3 colunas de menu + a identidade.)
  }

  // =========================================================================
  // Helpers privados

  private montarArvorePublica(
    rows: Array<{
      id: string;
      parentId: string | null;
      label: string;
      tipo: MenuTipo;
      href: string | null;
      icone: string | null;
      ordem: number;
    }>,
  ): MenuItemPublico[] {
    const map = new Map<string, MenuItemPublico>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        label: r.label,
        tipo: r.tipo,
        href: r.href,
        icone: r.icone,
        ordem: r.ordem,
        children: [],
      });
    }

    const raizes: MenuItemPublico[] = [];
    for (const r of rows) {
      const node = map.get(r.id)!;
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(node);
      } else {
        raizes.push(node);
      }
    }
    return raizes;
  }

  private montarArvoreAdmin(
    rows: Array<{
      id: string;
      parentId: string | null;
      local: MenuLocal;
      label: string;
      tipo: MenuTipo;
      href: string | null;
      icone: string | null;
      ordem: number;
      ativo: boolean;
      refTipo: string | null;
    }>,
  ): MenuItemAdmin[] {
    const map = new Map<string, MenuItemAdmin>();
    for (const r of rows) {
      map.set(r.id, {
        id: r.id,
        parentId: r.parentId,
        local: r.local,
        label: r.label,
        tipo: r.tipo,
        href: r.href,
        icone: r.icone,
        ordem: r.ordem,
        ativo: r.ativo,
        refTipo: r.refTipo,
        children: [],
      });
    }

    const raizes: MenuItemAdmin[] = [];
    for (const r of rows) {
      const node = map.get(r.id)!;
      if (r.parentId && map.has(r.parentId)) {
        map.get(r.parentId)!.children.push(node);
      } else {
        raizes.push(node);
      }
    }
    return raizes;
  }

  /**
   * Verifica se `candidatoId` é descendente de `ancestralId`.
   * Usado para prevenir ciclos no PUT.
   */
  private async verificarDescendente(
    ancestralId: string,
    candidatoId: string,
  ): Promise<boolean> {
    // BFS/DFS: carrega todos os filhos do ancestral e verifica se candidatoId está entre eles
    const filhos = await this.prisma.db.menuItem.findMany({
      where: { parentId: ancestralId },
      select: { id: true },
    });

    for (const filho of filhos) {
      if (filho.id === candidatoId) return true;
      if (await this.verificarDescendente(filho.id, candidatoId)) return true;
    }
    return false;
  }
}
