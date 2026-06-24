/**
 * Validação do JSON `config` de uma campanha (§2 do contrato).
 *
 * Cada capacidade presente no objeto é validada individualmente.
 * Erros retornam BadRequestException com mensagem legível.
 * Ausência de uma capacidade = desabilitada (não é erro).
 *
 * Guard de contraste WCAG AA integrado na capacidade `tema`.
 */

import { BadRequestException } from '@nestjs/common';
import { validarContrasteWcagAA } from './wcag';

// ---------------------------------------------------------------------------
// Tipos auxiliares
// ---------------------------------------------------------------------------

export interface TemaCap {
  corPrimaria: string;
  corPrimariaFg?: string;
  corDestaque?: string;
  corSecundaria?: string;
  aplicarEm?: 'todo' | 'home';
}

export interface FaixaCap {
  mensagem: string;
  link?: string;
  corBg?: string;
  corTexto?: string;
  dismissivel?: boolean;
}

export interface BannerCap {
  imagemUrl: string;
  alt: string;
  link?: string;
  posicao?: 'home_topo' | 'home_secao';
}

export interface PopupCap {
  titulo: string;
  subtitulo?: string;
  descricao: string;
  bullets?: string[];
  imagemUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  frequencia?: 'sempre' | 'dia' | 'sessao';
  paginaAlvo?: string;
  reabrirAposDias?: number;
}

export interface PaginaCap {
  slug: string;
  autoDespublica?: boolean;
}

export interface EfeitoCap {
  nome: 'aedes-overlay' | 'copa-overlay';
  params: Record<string, unknown>;
  /** Escopo de página: vazio/ausente = todas; '/' = só a home; '/rota' = exata/prefixo. */
  paginaAlvo?: string;
  /** Mostra ao visitante um botão para parar o efeito. Default true (acessibilidade). */
  permitirParar?: boolean;
  /** Encerra o efeito automaticamente após N segundos (0/ausente = enquanto na página). */
  duracaoSegundos?: number;
}

export interface SeloCap {
  texto: string;
  cor?: string;
  link?: string;
}

export interface CampanhaConfig {
  tema?: TemaCap;
  faixa?: FaixaCap;
  banner?: BannerCap;
  popup?: PopupCap;
  pagina?: PaginaCap;
  efeito?: EfeitoCap;
  selo?: SeloCap;
}

// ---------------------------------------------------------------------------
// Nomes de efeitos suportados
// ---------------------------------------------------------------------------

const EFEITOS_SUPORTADOS: EfeitoCap['nome'][] = ['aedes-overlay', 'copa-overlay'];

// ---------------------------------------------------------------------------
// Validadores por capacidade
// ---------------------------------------------------------------------------

function validarHex(valor: unknown, campo: string): void {
  if (typeof valor !== 'string' || !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(valor)) {
    throw new BadRequestException(`${campo}: "${String(valor)}" não é uma cor hex válida (#rgb ou #rrggbb).`);
  }
}

function validarHexOpcional(valor: unknown, campo: string): void {
  if (valor !== undefined) validarHex(valor, campo);
}

function validarTema(tema: unknown): TemaCap {
  if (typeof tema !== 'object' || tema === null) {
    throw new BadRequestException('config.tema deve ser um objeto.');
  }
  const t = tema as Record<string, unknown>;

  if (!t.corPrimaria) throw new BadRequestException('config.tema.corPrimaria é obrigatório.');
  validarHex(t.corPrimaria, 'config.tema.corPrimaria');
  validarHexOpcional(t.corPrimariaFg, 'config.tema.corPrimariaFg');
  validarHexOpcional(t.corDestaque, 'config.tema.corDestaque');
  validarHexOpcional(t.corSecundaria, 'config.tema.corSecundaria');

  if (t.aplicarEm !== undefined && !['todo', 'home'].includes(t.aplicarEm as string)) {
    throw new BadRequestException('config.tema.aplicarEm deve ser "todo" ou "home".');
  }

  // Guard de contraste WCAG AA (regra inviolável 3)
  const { corPrimaria, corPrimariaFg } = validarContrasteWcagAA(
    t.corPrimaria as string,
    t.corPrimariaFg as string | undefined,
  );

  return {
    corPrimaria,
    corPrimariaFg,
    corDestaque: t.corDestaque as string | undefined,
    corSecundaria: t.corSecundaria as string | undefined,
    aplicarEm: (t.aplicarEm as 'todo' | 'home' | undefined) ?? 'todo',
  };
}

function validarFaixa(faixa: unknown): FaixaCap {
  if (typeof faixa !== 'object' || faixa === null) {
    throw new BadRequestException('config.faixa deve ser um objeto.');
  }
  const f = faixa as Record<string, unknown>;

  if (!f.mensagem || typeof f.mensagem !== 'string') {
    throw new BadRequestException('config.faixa.mensagem é obrigatório e deve ser string.');
  }
  validarHexOpcional(f.corBg, 'config.faixa.corBg');
  validarHexOpcional(f.corTexto, 'config.faixa.corTexto');

  return {
    mensagem: f.mensagem,
    link: f.link as string | undefined,
    corBg: f.corBg as string | undefined,
    corTexto: f.corTexto as string | undefined,
    dismissivel: f.dismissivel !== false, // default true
  };
}

function validarBanner(banner: unknown): BannerCap {
  if (typeof banner !== 'object' || banner === null) {
    throw new BadRequestException('config.banner deve ser um objeto.');
  }
  const b = banner as Record<string, unknown>;

  if (!b.imagemUrl || typeof b.imagemUrl !== 'string') {
    throw new BadRequestException('config.banner.imagemUrl é obrigatório.');
  }
  if (!b.alt || typeof b.alt !== 'string') {
    throw new BadRequestException('config.banner.alt é obrigatório (acessibilidade).');
  }
  if (b.posicao !== undefined && !['home_topo', 'home_secao'].includes(b.posicao as string)) {
    throw new BadRequestException('config.banner.posicao deve ser "home_topo" ou "home_secao".');
  }

  return {
    imagemUrl: b.imagemUrl,
    alt: b.alt,
    link: b.link as string | undefined,
    posicao: (b.posicao as 'home_topo' | 'home_secao' | undefined) ?? 'home_topo',
  };
}

function validarPopup(popup: unknown): PopupCap {
  if (typeof popup !== 'object' || popup === null) {
    throw new BadRequestException('config.popup deve ser um objeto.');
  }
  const p = popup as Record<string, unknown>;

  if (!p.titulo || typeof p.titulo !== 'string') {
    throw new BadRequestException('config.popup.titulo é obrigatório.');
  }
  if (!p.descricao || typeof p.descricao !== 'string') {
    throw new BadRequestException('config.popup.descricao é obrigatório.');
  }
  if (p.bullets !== undefined) {
    if (!Array.isArray(p.bullets) || p.bullets.length > 6) {
      throw new BadRequestException('config.popup.bullets deve ser array com máximo 6 itens.');
    }
  }
  if (
    p.frequencia !== undefined &&
    !['sempre', 'dia', 'sessao'].includes(p.frequencia as string)
  ) {
    throw new BadRequestException('config.popup.frequencia deve ser "sempre", "dia" ou "sessao".');
  }
  if (p.reabrirAposDias !== undefined && typeof p.reabrirAposDias !== 'number') {
    throw new BadRequestException('config.popup.reabrirAposDias deve ser número.');
  }

  return {
    titulo: p.titulo,
    subtitulo: p.subtitulo as string | undefined,
    descricao: p.descricao,
    bullets: p.bullets as string[] | undefined,
    imagemUrl: p.imagemUrl as string | undefined,
    ctaLabel: p.ctaLabel as string | undefined,
    ctaUrl: p.ctaUrl as string | undefined,
    frequencia: (p.frequencia as 'sempre' | 'dia' | 'sessao' | undefined) ?? 'dia',
    paginaAlvo: p.paginaAlvo as string | undefined,
    reabrirAposDias: (p.reabrirAposDias as number | undefined) ?? 7,
  };
}

function validarPagina(pagina: unknown): PaginaCap {
  if (typeof pagina !== 'object' || pagina === null) {
    throw new BadRequestException('config.pagina deve ser um objeto.');
  }
  const pg = pagina as Record<string, unknown>;

  if (!pg.slug || typeof pg.slug !== 'string') {
    throw new BadRequestException('config.pagina.slug é obrigatório.');
  }

  return {
    slug: pg.slug,
    autoDespublica: pg.autoDespublica as boolean | undefined,
  };
}

function validarParamsAedes(params: Record<string, unknown>): void {
  if (params.quantidadeMosquitos !== undefined) {
    const q = params.quantidadeMosquitos as number;
    if (typeof q !== 'number' || q < 1 || q > 8) {
      throw new BadRequestException('efeito aedes-overlay: quantidadeMosquitos deve ser ∈ [1,8].');
    }
  }
  validarHexOpcional(params.corPrimaria, 'efeito aedes-overlay: params.corPrimaria');
  validarHexOpcional(params.corDestaque, 'efeito aedes-overlay: params.corDestaque');
}

function validarParamsCopa(params: Record<string, unknown>): void {
  if (
    params.intensidade !== undefined &&
    !['leve', 'media', 'forte'].includes(params.intensidade as string)
  ) {
    throw new BadRequestException(
      'efeito copa-overlay: params.intensidade deve ser "leve", "media" ou "forte".',
    );
  }
}

function validarEfeito(efeito: unknown): EfeitoCap {
  if (typeof efeito !== 'object' || efeito === null) {
    throw new BadRequestException('config.efeito deve ser um objeto.');
  }
  const e = efeito as Record<string, unknown>;

  if (!e.nome || !EFEITOS_SUPORTADOS.includes(e.nome as EfeitoCap['nome'])) {
    throw new BadRequestException(
      `config.efeito.nome inválido. Suportados: ${EFEITOS_SUPORTADOS.join(', ')}.`,
    );
  }
  const params = (e.params ?? {}) as Record<string, unknown>;

  if (e.nome === 'aedes-overlay') validarParamsAedes(params);
  if (e.nome === 'copa-overlay') validarParamsCopa(params);

  const out: EfeitoCap = { nome: e.nome as EfeitoCap['nome'], params };

  // Escopo de página (ex.: '/' = só a home).
  if (e.paginaAlvo !== undefined && e.paginaAlvo !== null && e.paginaAlvo !== '') {
    if (typeof e.paginaAlvo !== 'string') {
      throw new BadRequestException('config.efeito.paginaAlvo deve ser texto (ex.: "/" para só a home).');
    }
    out.paginaAlvo = e.paginaAlvo.trim();
  }

  // Botão de parar (visitante). Default true.
  if (e.permitirParar !== undefined) out.permitirParar = !!e.permitirParar;

  // Duração automática do efeito (segundos).
  if (e.duracaoSegundos !== undefined && e.duracaoSegundos !== null && e.duracaoSegundos !== '') {
    const d = Number(e.duracaoSegundos);
    if (!Number.isFinite(d) || d < 0 || d > 86_400) {
      throw new BadRequestException('config.efeito.duracaoSegundos deve ser ∈ [0, 86400] (0 = sem limite).');
    }
    out.duracaoSegundos = Math.round(d);
  }

  return out;
}

function validarSelo(selo: unknown): SeloCap {
  if (typeof selo !== 'object' || selo === null) {
    throw new BadRequestException('config.selo deve ser um objeto.');
  }
  const s = selo as Record<string, unknown>;

  if (!s.texto || typeof s.texto !== 'string') {
    throw new BadRequestException('config.selo.texto é obrigatório.');
  }
  validarHexOpcional(s.cor, 'config.selo.cor');

  return {
    texto: s.texto,
    cor: s.cor as string | undefined,
    link: s.link as string | undefined,
  };
}

// ---------------------------------------------------------------------------
// Ponto de entrada principal
// ---------------------------------------------------------------------------

/**
 * Valida e normaliza o objeto `config` de uma campanha.
 * Lança BadRequestException com mensagem legível em caso de erro.
 * Retorna o config normalizado (com defaults aplicados e fg derivado quando necessário).
 */
export function validarConfig(raw: unknown): CampanhaConfig {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('config deve ser um objeto JSON.');
  }

  const c = raw as Record<string, unknown>;
  const result: CampanhaConfig = {};

  if (c.tema !== undefined) result.tema = validarTema(c.tema);
  if (c.faixa !== undefined) result.faixa = validarFaixa(c.faixa);
  if (c.banner !== undefined) result.banner = validarBanner(c.banner);
  if (c.popup !== undefined) result.popup = validarPopup(c.popup);
  if (c.pagina !== undefined) result.pagina = validarPagina(c.pagina);
  if (c.efeito !== undefined) result.efeito = validarEfeito(c.efeito);
  if (c.selo !== undefined) result.selo = validarSelo(c.selo);

  return result;
}
