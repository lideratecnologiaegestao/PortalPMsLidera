/**
 * Unit tests para svg-sanitizar.util.ts
 *
 * Cobre:
 * - ehSvgValido
 * - sanitizarSvg: remoção de <script>, <foreignObject>, on*, href=javascript:, <use> externo,
 *                 bypass via namespace prefix (svg:script), <image> externo,
 *                 animateTransform, animateMotion.
 *                 PRESERVAÇÃO de <style> com sanitização de CSS perigoso.
 * - extrairCoresUnicas: extração hex, normalização #RGB→#RRGGBB, dedup, limite,
 *                       cores nomeadas CSS em atributos e em <style>.
 * - aplicarSubstituicoesCores: substituição case-insensitive, normalização, dedup, inválidos
 *                              ignorados, substituição de cor nomeada (white → #hex) via
 *                              atributos e CSS em <style>, word-boundary.
 * - aplicarCorBase: define/substitui fill na tag <svg> raiz.
 */
import {
  aplicarCorBase,
  aplicarSubstituicoesCores,
  ehSvgValido,
  extrairCoresUnicas,
  sanitizarSvg,
  SVG_MAX_CORES,
} from './svg-sanitizar.util';

// ──────────────────────────────────────────────────────── ehSvgValido

describe('ehSvgValido', () => {
  it('aceita SVG simples começando com <svg', () => {
    expect(ehSvgValido('<svg xmlns="http://www.w3.org/2000/svg"></svg>')).toBe(true);
  });

  it('aceita SVG precedido por declaração XML', () => {
    expect(ehSvgValido('<?xml version="1.0"?><svg></svg>')).toBe(true);
  });

  it('rejeita string vazia', () => {
    expect(ehSvgValido('')).toBe(false);
  });

  it('rejeita HTML simples', () => {
    expect(ehSvgValido('<html><body>oi</body></html>')).toBe(false);
  });

  it('rejeita texto arbitrário', () => {
    expect(ehSvgValido('não é svg')).toBe(false);
  });
});

// ──────────────────────────────────────────────────────── sanitizarSvg

describe('sanitizarSvg', () => {
  it('remove tag <script> e seu conteúdo', () => {
    const entrada = '<svg><script>alert(1)</script><circle/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('<script');
    expect(saida).not.toContain('alert(1)');
    expect(saida).toContain('<circle');
  });

  it('remove <script> com atributos', () => {
    const entrada = '<svg><script type="text/javascript">evil()</script></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('evil');
  });

  it('remove <foreignObject> e seu conteúdo', () => {
    const entrada = '<svg><foreignObject><div>xss</div></foreignObject><rect/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('foreignObject');
    expect(saida).not.toContain('xss');
    expect(saida).toContain('<rect');
  });

  it('remove <animate>', () => {
    const entrada = '<svg><animate attributeName="href" values="javascript:evil()"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('<animate');
  });

  it('remove <set>', () => {
    const entrada = '<svg><set attributeName="onload" to="evil()"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('<set');
  });

  it('remove <handler>', () => {
    const entrada = '<svg><handler event="click">evil()</handler></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('<handler');
  });

  it('remove atributos on* (onclick, onload, onmouseover)', () => {
    const entrada =
      '<svg><rect onclick="alert(1)" onload="evil()" onmouseover="x()" fill="#ff0000"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('onclick');
    expect(saida).not.toContain('onload');
    expect(saida).not.toContain('onmouseover');
    expect(saida).toContain('fill="#ff0000"');
  });

  it('remove href=javascript:', () => {
    const entrada = '<svg><a href="javascript:alert(1)">clique</a></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('javascript:');
  });

  it('remove xlink:href=javascript:', () => {
    const entrada = '<svg><a xlink:href="javascript:evil()">link</a></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('javascript:');
  });

  it('remove href=data: perigoso', () => {
    const entrada = '<svg><image href="data:image/svg+xml,<script>evil()</script>"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('data:image/svg+xml');
  });

  it('remove <use> com href externo', () => {
    const entrada = '<svg><use href="https://evil.com/sprite.svg#icon"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('evil.com');
  });

  it('mantém <use> com href interno (#id)', () => {
    const entrada = '<svg><use href="#icon"/><symbol id="icon"><rect/></symbol></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<use href="#icon"');
  });

  it('preserva conteúdo legítimo após sanitização', () => {
    const entrada =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<circle cx="50" cy="50" r="40" fill="#ff0000"/>' +
      '</svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('circle');
    expect(saida).toContain('#ff0000');
  });

  it('é case-insensitive para nomes de tags (SCRIPT, ForeignObject)', () => {
    const entrada = '<svg><SCRIPT>alert(1)</SCRIPT><ForeignObject><b>x</b></ForeignObject></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('SCRIPT');
    expect(saida).not.toContain('ForeignObject');
    expect(saida).not.toContain('alert');
    expect(saida).not.toContain('<b>');
  });

  // ── novos casos de hardening ──────────────────────────────────────────────

  it('remove <svg:script> (bypass via namespace prefix)', () => {
    const entrada = '<svg xmlns:svg="http://www.w3.org/2000/svg"><svg:script>evil()</svg:script><rect/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('svg:script');
    expect(saida).not.toContain('evil()');
    expect(saida).toContain('<rect');
  });

  it('remove <x:foreignObject> (bypass via namespace prefix)', () => {
    const entrada = '<svg xmlns:x="http://www.w3.org/1999/xhtml"><x:foreignObject><script>evil()</script></x:foreignObject></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('foreignObject');
    expect(saida).not.toContain('evil');
  });

  // ── <style>: preservação + sanitização CSS ────────────────────────────────

  it('PRESERVA <style> com conteúdo CSS legítimo (fill, cores nomeadas)', () => {
    const entrada = '<svg><style>.fil0 { fill: white } .fil1 { stroke: #ff0000 }</style><rect fill="#ff0000"/></svg>';
    const saida = sanitizarSvg(entrada);
    // <style> deve ser mantido
    expect(saida).toContain('<style');
    // CSS legítimo preservado
    expect(saida).toContain('fill: white');
    expect(saida).toContain('stroke: #ff0000');
    // conteúdo fora do style também preservado
    expect(saida).toContain('<rect');
  });

  it('preserva <style> com CDATA (padrão CorelDRAW)', () => {
    const entrada = '<svg><style><![CDATA[ .fil0 {fill:white} ]]></style><path fill="black"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).toContain('fill:white');
    expect(saida).toContain('<path');
  });

  it('remove url() externo do CSS em <style>, mantém url(#local)', () => {
    const entrada =
      '<svg><style>.a { fill: url(https://evil.com/img.png) } .b { fill: url(#gradiente) }</style></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('evil.com');
    // url(#gradiente) é referência interna — deve ser mantida
    expect(saida).toContain('url(#gradiente)');
  });

  it('remove expression() do CSS em <style> (vetor IE legado)', () => {
    const entrada = '<svg><style>.x { color: expression(evil()) }</style><circle/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('expression');
    expect(saida).toContain('<circle');
  });

  it('remove @import do CSS em <style>', () => {
    const entrada = '<svg><style>@import url("https://evil.com/bad.css"); .x { fill: red }</style></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('@import');
    // CSS legítimo restante é preservado
    expect(saida).toContain('fill: red');
  });

  it('remove javascript: do CSS em <style>', () => {
    const entrada = '<svg><style>.x { fill: javascript:evil() }</style></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('javascript:');
  });

  it('remove -moz-binding e behavior: do CSS em <style>', () => {
    const entrada = '<svg><style>.x { -moz-binding: url(evil.xml); behavior: url(evil.htc) }</style></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('-moz-binding');
    expect(saida).not.toContain('behavior:');
  });

  it('remove url(javascript:) do CSS em <style> via CDATA', () => {
    const entrada = '<svg><style><![CDATA[ .fil0 { fill: url(javascript:evil()) } ]]></style><rect/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('<style');
    expect(saida).not.toContain('javascript:');
    expect(saida).toContain('<rect');
  });

  it('neutraliza <image href="http..."> externo (anti-SSRF)', () => {
    const entrada = '<svg><image href="http://evil.com/track.png" width="1" height="1"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('http://evil.com');
    expect(saida).toContain('data-removido');
    // tag image deve permanecer (apenas href neutralizado)
    expect(saida).toContain('<image');
  });

  it('neutraliza <image xlink:href="https..."> externo', () => {
    const entrada = '<svg><image xlink:href="https://tracker.example/px.gif"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('https://tracker.example');
    expect(saida).toContain('data-removido');
  });

  it('mantém <image href="#interno"> (referência interna)', () => {
    const entrada = '<svg><image href="#logoSymbol" width="50" height="50"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).toContain('href="#logoSymbol"');
  });

  it('remove <animateTransform> (vetor SMIL)', () => {
    const entrada = '<svg><animateTransform attributeName="href" values="javascript:evil()"/><rect/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('animateTransform');
    expect(saida).not.toContain('javascript:evil');
    expect(saida).toContain('<rect');
  });

  it('remove <animateMotion> (vetor SMIL)', () => {
    const entrada = '<svg><animateMotion dur="1s" repeatCount="indefinite"/><circle/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('animateMotion');
    expect(saida).toContain('<circle');
  });

  it('remove <svg:animateTransform> com prefixo de namespace', () => {
    const entrada = '<svg><svg:animateTransform attributeName="x" values="0;100"/></svg>';
    const saida = sanitizarSvg(entrada);
    expect(saida).not.toContain('animateTransform');
  });
});

// ──────────────────────────────────────────────── extrairCoresUnicas

describe('extrairCoresUnicas', () => {
  it('extrai cores de 6 dígitos', () => {
    const svg = '<rect fill="#ff0000" stroke="#00FF00"/>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('#FF0000');
    expect(cores).toContain('#00FF00');
  });

  it('normaliza cores de 3 dígitos (#RGB → #RRGGBB)', () => {
    const svg = '<rect fill="#fff"/>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('#FFFFFF');
    expect(cores).not.toContain('#fff');
    expect(cores).not.toContain('#FFF');
  });

  it('normaliza #000 → #000000', () => {
    const svg = '<rect fill="#000"/>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('#000000');
  });

  it('faz deduplicação (mesma cor em formatos diferentes conta 1)', () => {
    const svg = '<rect fill="#FFFFFF" stroke="#fff"/>';
    const cores = extrairCoresUnicas(svg);
    const contagem = cores.filter((c) => c === '#FFFFFF').length;
    expect(contagem).toBe(1);
  });

  it('retorna array ordenado', () => {
    const svg = '<rect fill="#ff0000"/><rect fill="#00ff00"/><rect fill="#0000ff"/>';
    const cores = extrairCoresUnicas(svg);
    const ordenado = [...cores].sort();
    expect(cores).toEqual(ordenado);
  });

  it('respeita o limite de SVG_MAX_CORES', () => {
    // Gera 60 cores diferentes
    const partes: string[] = [];
    for (let i = 0; i < 60; i++) {
      const hex = i.toString(16).padStart(2, '0');
      partes.push(`<rect fill="#${hex}0000"/>`);
    }
    const svg = '<svg>' + partes.join('') + '</svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores.length).toBeLessThanOrEqual(SVG_MAX_CORES);
  });

  it('retorna vazio para SVG sem cores (hex ou nomeadas)', () => {
    const svg = '<svg><rect fill="none"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toHaveLength(0);
  });

  // ── cores nomeadas CSS ────────────────────────────────────────────────────

  it('extrai cor nomeada "white" de atributo fill', () => {
    const svg = '<svg><path fill="white"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('white');
  });

  it('extrai cor nomeada "black" de atributo stroke', () => {
    const svg = '<svg><rect stroke="black"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('black');
  });

  it('extrai cor nomeada "white" de <style> com CDATA (caso CorelDRAW)', () => {
    const svg = '<svg><style><![CDATA[ .fil0 {fill:white} ]]></style><path class="fil0"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('white');
  });

  it('extrai cor nomeada de <style> sem CDATA', () => {
    const svg = '<svg><style>.fil0 { fill: blue } .fil1 { stroke: red }</style></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('blue');
    expect(cores).toContain('red');
  });

  it('NÃO extrai "none", "currentColor", "transparent", "inherit"', () => {
    const svg =
      '<svg><rect fill="none" stroke="currentColor"/>' +
      '<path fill="transparent"/><circle fill="inherit"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).not.toContain('none');
    expect(cores).not.toContain('currentColor');
    expect(cores).not.toContain('transparent');
    expect(cores).not.toContain('inherit');
  });

  it('não detecta cor nomeada dentro de palavras (ex.: "whitespace" não extrai "white")', () => {
    // "whitespace" não é um valor de propriedade de cor
    const svg = '<svg><rect id="whitespace-layout"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).not.toContain('white');
  });

  it('extrai tanto hex quanto cor nomeada do mesmo SVG', () => {
    const svg = '<svg><path fill="white"/><rect fill="#ff0000"/></svg>';
    const cores = extrairCoresUnicas(svg);
    expect(cores).toContain('white');
    expect(cores).toContain('#FF0000');
  });
});

// ──────────────────────────────────────────── aplicarSubstituicoesCores

describe('aplicarSubstituicoesCores', () => {
  it('substitui cor de 6 dígitos por outra', () => {
    const svg = '<rect fill="#ff0000"/>';
    const resultado = aplicarSubstituicoesCores(svg, { '#ff0000': '#0000ff' });
    expect(resultado).toContain('#0000FF');
    expect(resultado).not.toContain('#ff0000');
    expect(resultado).not.toContain('#FF0000');
  });

  it('substituição é case-insensitive (chave minúscula, valor no SVG maiúsculo)', () => {
    const svg = '<rect fill="#FF0000"/>';
    const resultado = aplicarSubstituicoesCores(svg, { '#ff0000': '#0000ff' });
    expect(resultado).toContain('#0000FF');
    expect(resultado).not.toContain('#FF0000');
  });

  it('normaliza chave #RGB antes de substituir', () => {
    const svg = '<rect fill="#fff"/>';
    // Chave em formato curto → deve encontrar #fff no SVG
    const resultado = aplicarSubstituicoesCores(svg, { '#fff': '#000000' });
    expect(resultado).toContain('#000000');
  });

  it('ignora par com chave que não é hex nem nome de cor válido', () => {
    const svg = '<rect fill="#ff0000"/>';
    // "vermelho123" não é hex nem nome de cor curado
    const resultado = aplicarSubstituicoesCores(svg, { 'vermelho123': '#0000ff' });
    // SVG não é alterado
    expect(resultado).toBe(svg);
  });

  it('ignora par com valor hex inválido', () => {
    const svg = '<rect fill="#ff0000"/>';
    const resultado = aplicarSubstituicoesCores(svg, { '#ff0000': 'azul' });
    expect(resultado).toBe(svg);
  });

  it('substitui todas as ocorrências da cor no SVG', () => {
    const svg = '<rect fill="#ff0000"/><circle stroke="#ff0000"/>';
    const resultado = aplicarSubstituicoesCores(svg, { '#ff0000': '#00ff00' });
    expect(resultado).not.toContain('#ff0000');
    expect(resultado).not.toContain('#FF0000');
    const matches = resultado.match(/#00FF00/gi) ?? [];
    expect(matches.length).toBe(2);
  });

  it('aplica múltiplas substituições', () => {
    const svg = '<rect fill="#ff0000" stroke="#0000ff"/>';
    const resultado = aplicarSubstituicoesCores(svg, {
      '#ff0000': '#00ff00',
      '#0000ff': '#ffff00',
    });
    expect(resultado).toContain('#00FF00');
    expect(resultado).toContain('#FFFF00');
    expect(resultado).not.toContain('#ff0000');
    expect(resultado).not.toContain('#0000ff');
  });

  it('ignora substituição noop (mesma cor de → para)', () => {
    const svg = '<rect fill="#ff0000"/>';
    const resultado = aplicarSubstituicoesCores(svg, { '#ff0000': '#FF0000' });
    // Resultado pode ter a cor em qualquer case — o importante é que o SVG não está corrompido
    expect(resultado).toMatch(/#[Ff]{2}0000/);
  });

  // ── substituição de cor nomeada (ex.: "white") ────────────────────────────

  it('substitui cor nomeada "white" em atributo fill por hex', () => {
    const svg = '<svg><path fill="white"/></svg>';
    const resultado = aplicarSubstituicoesCores(svg, { 'white': '#003366' });
    expect(resultado).toContain('fill="#003366"');
    expect(resultado).not.toContain('fill="white"');
  });

  it('substitui cor nomeada "white" em atributo stroke por hex', () => {
    const svg = '<svg><rect stroke="white"/></svg>';
    const resultado = aplicarSubstituicoesCores(svg, { 'white': '#003366' });
    expect(resultado).toContain('stroke="#003366"');
    expect(resultado).not.toContain('stroke="white"');
  });

  it('substitui cor nomeada "white" em CSS de <style> por hex', () => {
    const svg = '<svg><style>.fil0 { fill: white }</style></svg>';
    const resultado = aplicarSubstituicoesCores(svg, { 'white': '#003366' });
    expect(resultado).toContain('fill: #003366');
    expect(resultado).not.toContain('fill: white');
  });

  it('substitui "white" em <style> com CDATA (caso CorelDRAW)', () => {
    const svg = '<svg><style><![CDATA[ .fil0 {fill:white} ]]></style><path class="fil0"/></svg>';
    const resultado = aplicarSubstituicoesCores(svg, { 'white': '#003366' });
    expect(resultado).toContain('fill:#003366');
    expect(resultado).not.toContain('fill:white');
  });

  it('NÃO substitui "white" dentro de outros contextos (word-boundary)', () => {
    // "white-space" é uma propriedade CSS, "whiteboard" é id — "white" não deve ser substituído
    const svg = '<svg><rect id="whiteboard" style="white-space:nowrap"/></svg>';
    // Usando fill como propriedade de cor para testar o boundary
    const svgComFill = '<svg><rect id="whiteboard" fill="white"/></svg>';
    const resultado = aplicarSubstituicoesCores(svgComFill, { 'white': '#003366' });
    // fill="white" deve ser substituído
    expect(resultado).toContain('fill="#003366"');
    // O id "whiteboard" NÃO deve ser alterado
    expect(resultado).toContain('id="whiteboard"');
  });

  it('substitui cor nomeada com chave em maiúsculas (case-insensitive)', () => {
    const svg = '<svg><path fill="white"/></svg>';
    const resultado = aplicarSubstituicoesCores(svg, { 'WHITE': '#003366' });
    expect(resultado).toContain('fill="#003366"');
  });
});

// ──────────────────────────────────────────────────── aplicarCorBase

describe('aplicarCorBase', () => {
  it('adiciona fill na tag <svg> raiz quando não existe', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>';
    const resultado = aplicarCorBase(svg, '#003366');
    expect(resultado).toContain('fill="#003366"');
  });

  it('substitui fill existente na tag <svg> raiz', () => {
    const svg = '<svg fill="black" xmlns="http://www.w3.org/2000/svg"><path/></svg>';
    const resultado = aplicarCorBase(svg, '#003366');
    expect(resultado).toContain('fill="#003366"');
    expect(resultado).not.toContain('fill="black"');
  });

  it('normaliza cor #RGB para #RRGGBB', () => {
    const svg = '<svg><path/></svg>';
    const resultado = aplicarCorBase(svg, '#036');
    expect(resultado).toContain('fill="#003366"');
  });

  it('preserva outros atributos da tag <svg>', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect/></svg>';
    const resultado = aplicarCorBase(svg, '#ff0000');
    expect(resultado).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(resultado).toContain('viewBox="0 0 100 100"');
    expect(resultado).toContain('fill="#FF0000"');
  });

  it('não modifica elementos filhos (apenas o <svg> raiz)', () => {
    const svg = '<svg><rect fill="black"/><path fill="blue"/></svg>';
    const resultado = aplicarCorBase(svg, '#ffffff');
    // Os filhos mantêm seus próprios fills
    expect(resultado).toContain('fill="black"');
    expect(resultado).toContain('fill="blue"');
  });

  it('caso real CorelDRAW: <style> com white + paths sem fill → recolore implícitos', () => {
    // SVG exportado do CorelDRAW: cores nomeadas em <style>, paths sem fill (herdam)
    const svgCorel =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<style><![CDATA[ .fil0 {fill:white} ]]></style>' +
      '<g><path class="fil0"/><path/></g>' +
      '</svg>';

    // Passo 1: substituir cor nomeada white → hex específico
    const aposNome = aplicarSubstituicoesCores(svgCorel, { 'white': '#003366' });
    expect(aposNome).toContain('fill:#003366');

    // Passo 2: aplicar corBase para recolorir paths sem fill (preto implícito)
    const final = aplicarCorBase(aposNome, '#003366');
    // O SVG raiz agora herda a cor para paths sem fill explícito
    expect(final).toMatch(/^<svg[^>]*fill="#003366"/i);
  });
});
