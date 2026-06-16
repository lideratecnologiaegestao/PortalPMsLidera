// Limpeza de HTML Joomla/K2: remove tema/menu/rodape, mantem so o corpo do
// conteudo; sanitiza (allowlist), decodifica e-mails ofuscados, normaliza datas
// pt-BR -> ISO. Reescrita de src/href de midia e feita no importador (precisa
// dos ids de midia re-hospedada).
import * as cheerio from 'cheerio';

const MESES = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/** "Quarta, 10 Junho 2026" / "10/06/2026" -> "2026-06-10" (ou null). */
export function parseDataPtBr(txt) {
  if (!txt) return null;
  const s = txt.trim().toLowerCase();
  let m = s.match(/(\d{1,2})\s+de?\s*([a-zçã]+)\s+de?\s*(\d{4})/) || s.match(/\w+,\s*(\d{1,2})\s+([a-zçã]+)\s+(\d{4})/);
  if (m && MESES[m[2]]) {
    return `${m[3]}-${String(MESES[m[2]]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Decodifica e-mails ofuscados do Joomla (cloaking por JS) -> texto. */
export function decloakEmails($, scope) {
  $(scope).find('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const email = href.replace(/^mailto:/, '').split('?')[0];
    if (email) $(el).replaceWith(email);
  });
  // padrao "email at dominio dot com"
  return $(scope).html();
}

const ALLOW_TAGS = new Set(['p','br','strong','b','em','i','u','ul','ol','li','a','h2','h3','h4','blockquote','table','thead','tbody','tr','td','th','img','figure','figcaption','iframe']);
const ALLOW_ATTR = { a: ['href','title'], img: ['src','alt','title'], iframe: ['src','width','height','allowfullscreen'] };

/**
 * Recebe o HTML cru da pagina e o seletor do corpo K2; devolve { titulo, dataIso,
 * html limpo (so corpo), imagens[], anexos[], iframes[] }. Nao reescreve URLs ainda.
 */
export function limparItemK2(htmlCru, { origem }) {
  const $ = cheerio.load(htmlCru);
  // corpo do item K2: .itemFullText (item) ou .itemIntroText; fallback .item-page
  const corpo = $('.itemFullText').first().length ? $('.itemFullText').first()
    : $('.itemIntroText').first().length ? $('.itemIntroText').first()
    : $('[itemprop="articleBody"], .item-page .article-body, .com-content-article__body').first();
  const scope = corpo.length ? corpo : $('body');

  const titulo = ($('.itemTitle, .item-title, h1, h2.article-title').first().text() || '').trim();
  const dataTxt = ($('.itemDateCreated, .itemDate, time, .create').first().text() || '').trim();
  const dataIso = parseDataPtBr(dataTxt);

  // coleta midias antes de sanitizar; REESCREVE src para ABSOLUTO no proprio HTML
  // (senao o re-hospedador descarta imagens com src relativo).
  const imagens = [];
  scope.find('img').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const absoluto = abs(src, origem);
      $(el).attr('src', absoluto);
      imagens.push({ src: absoluto, alt: ($(el).attr('alt') || $(el).attr('title') || '').trim() });
    }
  });
  const iframes = [];
  scope.find('iframe').each((_, el) => { const s = $(el).attr('src'); if (s) iframes.push(abs(s, origem)); });
  const anexos = [];
  scope.find('a[href]').each((_, el) => {
    const href = abs($(el).attr('href') || '', origem);
    if (/\.(pdf|docx?|odt|xlsx?|pptx?|zip|csv)$/i.test(href)) {
      anexos.push({ href, label: ($(el).text() || '').trim() });
    }
  });

  decloakEmails($, scope);
  sanitizar($, scope);

  return { titulo, dataIso, html: (scope.html() || '').trim(), imagens, iframes, anexos };
}

function abs(u, origem) {
  try { return new URL(u, origem).href; } catch { return u; }
}

/** Remove tags/atributos fora da allowlist (sanitizacao simples server-side). */
function sanitizar($, scope) {
  scope.find('*').each((_, el) => {
    const tag = el.tagName?.toLowerCase();
    if (!tag) return;
    if (!ALLOW_TAGS.has(tag)) { $(el).replaceWith($(el).contents()); return; }
    const permitidos = ALLOW_ATTR[tag] || [];
    for (const a of Object.keys(el.attribs || {})) {
      if (!permitidos.includes(a)) $(el).removeAttr(a);
    }
  });
  // remove scripts/styles residuais
  scope.find('script,style,nav,header,footer,form').remove();
}

/** Texto puro de um HTML (sem tags), normalizado. */
export function texto(html) {
  return cheerio.load(html || '').text().replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
}

const LABELS = 'Nome|Data da Posse|Data de Nascimento|Sexo|Naturalidade|Partido|Telefone|Fone|E-?mail|Endere[çc]o|Hor[aá]rio|CEP|Cargo|Compet';

/** Extrai "Label: valor" de um texto plano (heuristico). */
export function extrairCampo(txt, label) {
  const re = new RegExp(`${label}\\s*:?\\s*(.+?)(?=\\s*(?:${LABELS})\\s*:|$)`, 'i');
  const m = (txt || '').match(re);
  const v = m ? m[1].trim() : null;
  return v && v.length > 1 ? v.slice(0, 200) : null;
}

export function extrairEmail(txt) {
  const m = (txt || '').match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
  return m ? m[0] : null;
}
export function extrairTelefone(txt) {
  // exige DDD entre parenteses para evitar falso-positivo (CPF/concatenacao).
  const m = (txt || '').match(/\(\d{2}\)\s?\d{4,5}[-\s]?\d{3,4}/);
  return m ? m[0].replace(/\s+/g, ' ').trim() : null;
}

export function slugify(t) {
  return (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}
