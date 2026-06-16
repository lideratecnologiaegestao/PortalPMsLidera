/**
 * Utilitário de sanitização e manipulação de SVG.
 *
 * SEGURANÇA — defesa em profundidade (denylist + normalização):
 *
 * A denylist de tags/atributos bloqueia os vetores de XSS mais comuns
 * (scripts inline, event handlers, XSS via foreignObject, etc.). Mesmo assim
 * a camada de serviço adiciona headers HTTP restritivos (CSP + nosniff +
 * Content-Disposition: attachment) ao servir SVG, de modo que um bypass na
 * sanitização ainda não execute código.
 *
 * Tags removidas: script, foreignObject, animate, animatetransform,
 *                 animatemotion, set, discard, handler
 * <style> NÃO é removido, mas seu conteúdo CSS é sanitizado pelo
 *   sanitizarBlocoStyle (remove url() externo, expression(), @import,
 *   javascript:, -moz-binding, behavior:). Os headers de serviço
 *   (CSP default-src 'none'; sandbox + Content-Disposition: attachment)
 *   são a defesa primária; preservar <style> sanitizado é necessário
 *   para SVGs reais exportados do CorelDRAW/Illustrator.
 * Atributos removidos: on* (event handlers), href/xlink:href=javascript:,
 *                      href/xlink:href=data:, src=data: (em qualquer tag)
 * <use> com href externo (fora de #) também é removido.
 * <image> com href/xlink:href externo (não começa com #) é neutralizado.
 * Prefixos de namespace são tratados nas regexes (ex.: <svg:script>).
 */

/** Tamanho máximo aceito para SVG (2 MB). */
export const SVG_MAX_BYTES = 2 * 1024 * 1024;

/** Número máximo de cores únicas retornadas/aceitas. */
export const SVG_MAX_CORES = 50;

// ─────────────────────────────────────────────────────── denylist de tags

/**
 * Tags inteiras (incluindo conteúdo interno) que devem ser eliminadas.
 * Cada entrada é o sufixo do nome da tag, sem prefixo de namespace.
 * A regex de remoção usa `[\w:-]*` antes do nome para casar também
 * formas prefixadas como <svg:script>, <x:foreignObject>, etc.
 *
 * NOTA: <style> foi intencionalmente removido desta lista. O conteúdo CSS
 * de <style> é sanitizado pela função sanitizarBlocoStyle, que remove apenas
 * construções perigosas (url() externo, expression(), @import, javascript:,
 * -moz-binding, behavior:) preservando fill/stroke/cores legítimas.
 */
const TAGS_BANIDAS = [
  'script',
  'foreignobject',
  'animate',
  'animatetransform',
  'animatemotion',
  'set',
  'discard',
  'handler',
];

/**
 * Remove blocos `<tag ...>...</tag>` e `<tag ... />` (case-insensitive).
 * O prefixo `[\w:-]*` antes do nome da tag captura prefixos de namespace
 * (ex.: `svg:script`, `x:foreignObject`) prevenindo bypass por namespace.
 * Usa regex iterativa para lidar com aninhamento simples (SVG real raramente
 * aninha script dentro de script).
 */
function removerTagsBanidas(svg: string): string {
  for (const tag of TAGS_BANIDAS) {
    // bloco com conteúdo: <[prefix:]tag...>...</[prefix:]tag>
    const bloco = new RegExp(
      `<[\\w:-]*${tag}[\\s>/][\\s\\S]*?<\\/[\\w:-]*${tag}\\s*>`,
      'gi',
    );
    // auto-fechado: <[prefix:]tag ... />  ou  <[prefix:]tag ...>  sem conteúdo
    const selfClose = new RegExp(`<[\\w:-]*${tag}[\\s/][^>]*>`, 'gi');
    svg = svg.replace(bloco, '').replace(selfClose, '');
  }
  return svg;
}

// ─────────────────────────────────────────── sanitização de blocos <style>

/**
 * Padrões CSS perigosos removidos do conteúdo de <style>.
 *
 * Remove:
 * - url(...) a menos que seja url(#idlocal) — bloqueia recursos externos e data: URIs
 * - expression(...) — vetor IE legado
 * - @import — importação de folhas de estilo externas
 * - javascript: — esquema perigoso
 * - -moz-binding — vetor XBL do Firefox legado
 * - behavior: — vetor HTC do IE legado
 */
function sanitizarConteudoCss(css: string): string {
  let out = css;

  // url(...) — mantém APENAS url(#id) (referências internas SVG)
  // Remove qualquer outro url(...), incluindo url(javascript:), url(data:), url(https://...)
  out = out.replace(/url\s*\(\s*(?!['"]?#)['"]?[^)]*['"]?\s*\)/gi, 'url(removed)');

  // expression(...) — vetor IE legado
  out = out.replace(/expression\s*\([^)]*\)/gi, '');

  // @import — importação de recursos externos
  out = out.replace(/@import\b[^;]*/gi, '');

  // javascript: em qualquer valor de propriedade
  out = out.replace(/javascript\s*:/gi, '');

  // -moz-binding: — vetor XBL
  out = out.replace(/-moz-binding\s*:[^;]*/gi, '');

  // behavior: — vetor HTC do IE
  out = out.replace(/behavior\s*:[^;]*/gi, '');

  return out;
}

/**
 * Sanitiza todos os blocos <style>...</style> no SVG.
 * Preserva a tag <style> mas remove do conteúdo CSS apenas construções perigosas.
 * Suporta CDATA: <style><![CDATA[ ... ]]></style>
 *
 * A regex casa especificamente a tag de elemento <style> (nome da tag "style",
 * possivelmente com prefixo de namespace como "svg:style"), NÃO atributos
 * style="..." de outros elementos.
 *
 * Regex de abertura: <(prefixo?)style(atributos-opcionais)>
 * - [\w:-]* captura prefixos como "svg:"
 * - (?:\s[^>]*)? captura atributos opcionais com espaço antes
 * - > fecha a tag de abertura
 */
function sanitizarBlocosStyle(svg: string): string {
  // ABERTURA:   <[\w:-]*style(?:\s[^>]*)?>
  //   [\w:-]*   = prefixo opcional (ex.: "svg:", "")
  //   style     = nome da tag literal
  //   (?:\s[^>]*)? = atributos opcionais (ex.: " type=\"text/css\"") — começa com espaço
  //   >         = fecha a abertura
  // CONTEÚDO:  [\s\S]*?  (não guloso)
  // FECHAMENTO: <\/[\w:-]*style\s*>
  const REGEX_STYLE = /(<[\w:-]*style(?:\s[^>]*)?>)([\s\S]*?)(<\/[\w:-]*style\s*>)/gi;

  return svg.replace(REGEX_STYLE, (_match, abertura, conteudo, fechamento) => {
    // Detecta e desembrulha CDATA
    const temCdata = /^\s*<!\[CDATA\[/i.test(conteudo);
    let cssRaw = conteudo;
    if (temCdata) {
      // Extrai o conteúdo entre <![CDATA[ e ]]>
      cssRaw = conteudo.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');
    }

    const cssSanitizado = sanitizarConteudoCss(cssRaw);

    // Re-embrulha em CDATA se estava assim originalmente
    const novoConteudo = temCdata ? `<![CDATA[${cssSanitizado}]]>` : cssSanitizado;

    return abertura + novoConteudo + fechamento;
  });
}

// ─────────────────────────────────────────────────── remoção de atributos

/**
 * Remove atributos `on*=` (event handlers).
 * Ex.: onclick="...", onload='...', onmouseover=`...`
 */
function removerEventHandlers(svg: string): string {
  // Captura on[qualquer-coisa]= seguido de valor entre aspas/apóstrofo ou sem aspas
  return svg.replace(/\bon\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]*)/gi, '');
}

/**
 * Remove href e xlink:href que apontem para javascript: ou data:
 * e src=data: em qualquer atributo.
 */
function removerHrefsPerigosos(svg: string): string {
  // javascript: ou data: em href / xlink:href / src
  return svg.replace(
    /(?:xlink:href|href|src)\s*=\s*["']?\s*(?:javascript|data)\s*:/gi,
    'data-removido=',
  );
}

/**
 * Remove `<use>` cujo href/xlink:href aponte para recurso externo
 * (não começa com '#'). Referências internas (#id) são seguras.
 */
function removerUseExterno(svg: string): string {
  return svg.replace(/<use\s[^>]*>/gi, (match) => {
    // Extrai o valor de href ou xlink:href
    const hrefMatch = match.match(/(?:xlink:href|href)\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return match; // sem href → mantém (uso interno válido)
    const href = hrefMatch[1].trim();
    if (href.startsWith('#')) return match; // referência interna → ok
    return ''; // externo → remove
  });
}

/**
 * Neutraliza `<image>` cujo href/xlink:href aponte para recurso externo
 * (não começa com '#'). Bloqueia SSRF do browser e rastreamento via pixel.
 * Referências internas (#id) são mantidas; a tag completa é mantida mas o
 * href externo é substituído por data-removido para não quebrar a estrutura.
 */
function removerImagensExternas(svg: string): string {
  return svg.replace(/<image\s[^>]*>/gi, (match) => {
    const hrefMatch = match.match(/(?:xlink:href|href)\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) return match; // sem href → mantém
    const href = hrefMatch[1].trim();
    if (href.startsWith('#')) return match; // referência interna → ok
    // href externo: neutraliza substituindo o atributo
    return match.replace(/(?:xlink:href|href)\s*=\s*["'][^"']*["']/gi, 'data-removido=""');
  });
}

// ───────────────────────────────────────────────────── API pública

/**
 * Verifica se a string parece um SVG válido (começa com `<svg` ou `<?xml...`
 * seguido de `<svg`). Não valida o XML completo — é uma checagem rápida.
 */
export function ehSvgValido(conteudo: string): boolean {
  const inicio = conteudo.trimStart().substring(0, 512);
  return (
    /^<svg[\s>]/i.test(inicio) ||
    (/^<\?xml/i.test(inicio) && /<svg[\s>]/i.test(inicio))
  );
}

/**
 * Sanitiza um SVG removendo vetores de XSS conhecidos.
 * Não lança exceção — retorna a string limpa (pode ser string vazia se o SVG
 * for completamente inválido após a sanitização).
 *
 * Pipeline de sanitização:
 * 1. Remove tags banidas (incluindo prefixos de namespace)
 * 2. Sanitiza conteúdo CSS de blocos <style> (remove construções perigosas)
 * 3. Remove event handlers (on*)
 * 4. Remove hrefs com esquemas perigosos (javascript:, data:)
 * 5. Remove <use> com href externo
 * 6. Neutraliza <image> com href externo (anti-SSRF/rastreamento)
 */
export function sanitizarSvg(svg: string): string {
  let out = svg;
  out = removerTagsBanidas(out);
  out = sanitizarBlocosStyle(out);
  out = removerEventHandlers(out);
  out = removerHrefsPerigosos(out);
  out = removerUseExterno(out);
  out = removerImagensExternas(out);
  return out;
}

// ──────────────────────────────────────────────────── extração de cores

/**
 * Normaliza uma cor hex de 3 dígitos (#RGB) para 6 dígitos (#RRGGBB).
 * Cores de 6 dígitos são retornadas em letras maiúsculas sem modificação
 * (além do uppercase).
 */
function normalizarHex(hex: string): string {
  const h = hex.replace('#', '').toUpperCase();
  if (h.length === 3) {
    return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return '#' + h;
}

/**
 * Lista curada de nomes de cores CSS aceitos para extração.
 * Excluídos: none, currentColor, transparent, inherit (sem cor real).
 */
const CORES_NOMEADAS_CSS = new Set([
  'white', 'black', 'red', 'green', 'blue', 'yellow',
  'gray', 'grey', 'silver', 'maroon', 'navy', 'olive',
  'purple', 'teal', 'aqua', 'fuchsia', 'lime', 'orange',
  // cores comuns adicionais
  'cyan', 'magenta', 'pink', 'brown', 'gold', 'coral',
  'salmon', 'violet', 'indigo', 'tan', 'beige', 'ivory',
  'lavender', 'khaki', 'crimson', 'turquoise', 'sienna',
  'chocolate', 'tomato', 'orchid', 'plum', 'wheat',
]);

/**
 * Propriedades CSS de cor em que nomes de cores são válidos.
 * Usadas para extrair cores nomeadas de atributos e de blocos <style>.
 */
const PROPS_COR = ['fill', 'stroke', 'stop-color', 'color', 'flood-color'];

/**
 * Extrai cores nomeadas CSS de atributos SVG.
 * Ex.: fill="white" → "white"
 */
function extrairCoresNomeadasDeAtributos(svg: string): Set<string> {
  const encontradas = new Set<string>();
  // Atributos: fill="white", stroke='red', etc.
  const propPattern = PROPS_COR.join('|');
  // Captura: fill="white", fill='white', fill=white (sem aspas)
  const atribRegex = new RegExp(
    `(?:${propPattern})\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([\\w-]+))`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = atribRegex.exec(svg)) !== null) {
    const valor = (m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase();
    if (CORES_NOMEADAS_CSS.has(valor)) {
      encontradas.add(valor);
    }
  }
  return encontradas;
}

/**
 * Extrai cores nomeadas CSS de blocos <style> (incluindo CDATA).
 * Ex.: .fil0 { fill: white } → "white"
 */
function extrairCoresNomeadasDeStyle(svg: string): Set<string> {
  const encontradas = new Set<string>();
  // Captura o conteúdo de todos os blocos <style>
  // Construído via new RegExp para evitar ambiguidade de caracteres invisíveis.
  // Padrão: <(prefixo?)style(atributos-opcionais?)>(CONTEUDO)</prefixo?style>
  // grupo 1 = conteúdo CSS (pode incluir CDATA)
  const REGEX_STYLE_CAPTURE = new RegExp(
    '<[\\w:-]*style(?:\\s[^>]*)?>([\\s\\S]*?)<\\/[\\w:-]*style\\s*>',
    'gi',
  );
  let styleMatch: RegExpExecArray | null;
  while ((styleMatch = REGEX_STYLE_CAPTURE.exec(svg)) !== null) {
    let css = styleMatch[1];
    // Remove CDATA wrapper se presente
    css = css.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '');

    const propPattern = PROPS_COR.join('|');
    // Captura: fill: white, fill:white, fill : white
    const cssCorRegex = new RegExp(
      `(?:${propPattern})\\s*:\\s*([\\w-]+)`,
      'gi',
    );
    let m: RegExpExecArray | null;
    while ((m = cssCorRegex.exec(css)) !== null) {
      const valor = m[1].trim().toLowerCase();
      if (CORES_NOMEADAS_CSS.has(valor)) {
        encontradas.add(valor);
      }
    }
  }
  return encontradas;
}

/**
 * Extrai cores únicas do SVG (máx. `SVG_MAX_CORES`).
 *
 * Detecta:
 * - Cores hexadecimais (#RGB e #RRGGBB) normalizadas para #RRGGBB maiúsculo.
 * - Cores nomeadas CSS (lista curada) que apareçam como valor de propriedades
 *   fill/stroke/stop-color/color/flood-color em atributos ou em blocos <style>.
 *   Retornadas no nome original em minúsculas (ex.: "white", "black").
 *
 * Exclui: none, currentColor, transparent, inherit.
 * Retorna array ordenado, sem duplicatas.
 */
export function extrairCoresUnicas(svg: string): string[] {
  const vistas = new Set<string>();

  // 1. Cores hex
  const hexRegex = /#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
  let match: RegExpExecArray | null;
  while ((match = hexRegex.exec(svg)) !== null) {
    const norm = normalizarHex(match[0]);
    vistas.add(norm);
    if (vistas.size >= SVG_MAX_CORES) break;
  }

  // 2. Cores nomeadas CSS em atributos
  if (vistas.size < SVG_MAX_CORES) {
    for (const nome of extrairCoresNomeadasDeAtributos(svg)) {
      vistas.add(nome);
      if (vistas.size >= SVG_MAX_CORES) break;
    }
  }

  // 3. Cores nomeadas CSS em blocos <style>
  if (vistas.size < SVG_MAX_CORES) {
    for (const nome of extrairCoresNomeadasDeStyle(svg)) {
      vistas.add(nome);
      if (vistas.size >= SVG_MAX_CORES) break;
    }
  }

  return Array.from(vistas).sort();
}

// ──────────────────────────────────────────────── substituição de cores

/**
 * Valida que uma string é uma cor hex de 3 ou 6 dígitos.
 */
function ehHexValido(cor: string): boolean {
  return /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(cor);
}

/**
 * Valida que uma string é um nome de cor CSS da lista curada.
 */
function ehNomeCorValido(cor: string): boolean {
  return CORES_NOMEADAS_CSS.has(cor.toLowerCase());
}

/**
 * Escapa caracteres especiais para uso seguro em regex.
 */
function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Aplica um mapa de substituições de cor no SVG.
 *
 * Chaves suportadas:
 * - Hex (#RRGGBB ou #RGB): substituição case-insensitive com word-boundary (\b).
 * - Nome CSS (ex.: "white"): substituição SOMENTE quando for valor de propriedade
 *   de cor (fill:white, fill="white", stroke:white, etc.) usando word-boundary —
 *   NUNCA substitui "white" dentro de outras palavras ou ids.
 *
 * O valor `para` deve sempre ser hex (#RRGGBB ou #RGB).
 *
 * - Normaliza chaves e valores hex (#RGB → #RRGGBB) antes de aplicar.
 * - Ignora pares com chave inválida (nem hex nem nome curado) ou valor hex inválido.
 *
 * @param svg           Conteúdo SVG sanitizado.
 * @param substituicoes Mapa { "#RRGGBB"|"nome": "#RRGGBB" } (máx. SVG_MAX_CORES entradas).
 */
export function aplicarSubstituicoesCores(
  svg: string,
  substituicoes: Record<string, string>,
): string {
  let out = svg;

  for (const [de, para] of Object.entries(substituicoes)) {
    if (!ehHexValido(para)) continue; // valor de destino sempre deve ser hex

    const paraNorm = normalizarHex(para);

    if (ehHexValido(de)) {
      // ── caso hex → hex ──────────────────────────────────────────────────────
      const deNorm = normalizarHex(de);
      if (deNorm === paraNorm) continue; // noop

      // Corresponde à forma normalizada E à forma abreviada de 3 dígitos
      // Ex.: #FFFFFF e #FFF (ambas representam branco)
      const deAbrev =
        deNorm[1] === deNorm[2] &&
        deNorm[3] === deNorm[4] &&
        deNorm[5] === deNorm[6]
          ? `#${deNorm[1]}${deNorm[3]}${deNorm[5]}`
          : null;

      const alternativas = deAbrev
        ? `(?:${escaparRegex(deNorm)}|${escaparRegex(deAbrev)})`
        : escaparRegex(deNorm);

      const regex = new RegExp(`${alternativas}\\b`, 'gi');
      out = out.replace(regex, paraNorm);
    } else if (ehNomeCorValido(de)) {
      // ── caso nome CSS → hex ─────────────────────────────────────────────────
      // Substitui SOMENTE quando "de" aparece como valor de propriedade de cor.
      // Padrões cobertos:
      //   Atributo:  fill="white"  fill='white'
      //   CSS:       fill: white;  fill:white
      // O word-boundary \b garante que "white" dentro de "white-space" NÃO é substituído.
      const nomeLower = de.toLowerCase();
      const nomeEsc = escaparRegex(nomeLower);
      const propPattern = PROPS_COR.join('|');

      // Atributo: fill="white" ou fill='white'
      const atribRegex = new RegExp(
        `((?:${propPattern})\\s*=\\s*["'])${nomeEsc}\\b(["'])`,
        'gi',
      );
      out = out.replace(atribRegex, `$1${paraNorm}$2`);

      // CSS em <style>: fill: white ou fill:white
      const cssRegex = new RegExp(
        `((?:${propPattern})\\s*:\\s*)${nomeEsc}\\b`,
        'gi',
      );
      out = out.replace(cssRegex, `$1${paraNorm}`);
    }
    // Ignora pares com chave inválida (nem hex nem nome curado)
  }

  return out;
}

/**
 * Define ou substitui o atributo `fill` no elemento `<svg>` raiz.
 * Recolore elementos com cor herdada/implícita (ex.: linhas pretas padrão
 * em SVGs exportados do CorelDRAW sem atributo fill explícito).
 *
 * @param svg     Conteúdo SVG (já sanitizado).
 * @param corBase Cor hex (#RRGGBB ou #RGB) a aplicar como fill na raiz.
 * @returns SVG com fill="<corBase>" na tag <svg> raiz.
 */
export function aplicarCorBase(svg: string, corBase: string): string {
  const corNorm = normalizarHex(corBase);
  return svg.replace(
    /(<svg\b[^>]*?)(\s*\/?>)/i,
    (_match, antes, fechamento) => {
      // Remove fill existente na tag svg raiz se houver
      const semFill = antes.replace(/\s+fill\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
      return `${semFill} fill="${corNorm}"${fechamento}`;
    },
  );
}
