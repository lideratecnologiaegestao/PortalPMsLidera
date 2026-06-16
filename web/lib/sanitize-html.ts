/**
 * Sanitizador minimalista de HTML para uso no preview do admin (client-side).
 *
 * Objetivo: remover vetores óbvios de XSS antes de exibir HTML digitado pelo
 * administrador no painel (preview dos blocos). Não substitui validação no
 * backend — a API é responsável por sanitizar o conteúdo antes de gravar.
 *
 * Remove:
 * - Tags <script> e <style> (e conteúdo interno)
 * - Atributos de evento (on*)
 * - href/src com javascript: ou data: (exceto data: em src de imagem legítima)
 * - Atributo srcdoc
 * - Tags <iframe>, <object>, <embed>, <base>
 *
 * NÃO usa DOMParser (não disponível em SSR). Opera só em string.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  let out = html;

  // Remove blocos <script...>...</script> (case-insensitive, DOTALL)
  out = out.replace(/<script[\s\S]*?<\/script>/gi, '');

  // Remove blocos <style...>...</style>
  out = out.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Remove tags proibidas (autoclosing e com conteúdo — o conteúdo é preservado
  // pela regex seguinte que limpa apenas a tag, mas para iframe/object o conteúdo
  // nunca deve aparecer; basta remover a tag completa)
  out = out.replace(/<\/?(iframe|object|embed|base|form|input|button|textarea|select)\b[^>]*>/gi, '');

  // Remove atributos de evento (on*)
  out = out.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  // Remove href="javascript:..." e href="data:..."
  out = out.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, 'href="#"');
  out = out.replace(/href\s*=\s*(?:"data:[^"]*"|'data:[^']*'|data:[^\s>]*)/gi, 'href="#"');

  // Remove src="javascript:..."
  out = out.replace(/src\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*'|javascript:[^\s>]*)/gi, '');

  // Remove atributo srcdoc
  out = out.replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  return out;
}
