/**
 * Utilitário de segurança para uploads.
 *
 * Regras:
 * - Bloqueia extensões perigosas (executáveis, scripts, web shells).
 * - Detecta dupla-extensão (ex.: "arquivo.pdf.exe").
 * - Valida tamanho máximo.
 * - Opcionalmente exige que a extensão/MIME esteja em uma lista permitida.
 *
 * NÃO bloqueia: pdf, imagens, office, zip, texto, áudio/vídeo comuns.
 */

import { BadRequestException } from '@nestjs/common';

/** Extensões executáveis e scripts que NUNCA devem ser aceitos. */
export const EXTENSOES_PERIGOSAS = new Set([
  // Windows executáveis
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif',
  // Scripts Windows
  'vbs', 'vbe', 'js', 'jse', 'ws', 'wsf', 'wsh', 'ps1', 'psm1', 'psd1',
  // Scripts Unix
  'sh', 'bash', 'zsh', 'fish',
  // JVM/runtime
  'jar', 'class',
  // macOS
  'app', 'dmg', 'pkg',
  // Linux packages
  'deb', 'rpm',
  // Mobile
  'apk', 'ipa',
  // Web shells / server-side scripts
  'php', 'php3', 'php4', 'php5', 'phtml', 'phar',
  'asp', 'aspx', 'ashx', 'asmx',
  'jsp', 'jspx', 'jsw', 'jsv', 'jspf',
  'cgi', 'pl', 'py', 'rb', 'lua',
  // Bibliotecas nativas (podem ser carregadas por processo)
  'dll', 'so', 'dylib',
  // Vetores de XSS/injeção quando servidos diretamente
  'html', 'htm', 'xhtml', 'shtml',
  // SVG pode conter <script> (bloquear upload; imagens inline via CSS são ok)
  'svg',
  // XML pode conter XXE
  'xsl', 'xslt',
  // HTA (HTML Application — executa no Windows)
  'hta',
  // Outros
  'mht', 'mhtml',
]);

/** MIMEs permitidos para documentos administrativos. */
export const MIME_PERMITIDOS_DOC: ReadonlySet<string> = new Set([
  'application/pdf',
  // Word
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  // ODT
  'application/vnd.oasis.opendocument.text',
  // Excel
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  // ODS
  'application/vnd.oasis.opendocument.spreadsheet',
  // PowerPoint
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // ODP
  'application/vnd.oasis.opendocument.presentation',
  // Texto/CSV
  'text/plain',
  'text/csv',
  'application/csv',
  // ZIP (anexos compactados)
  'application/zip',
  'application/x-zip-compressed',
  // Áudio/vídeo
  'audio/mpeg',
  'audio/ogg',
  'video/mp4',
  'video/webm',
]);

/** MIMEs permitidos para imagens. */
export const MIME_PERMITIDOS_IMAGEM: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

export interface OpcoesValidacao {
  /** Lista de extensões ou MIMEs adicionalmente exigidos (além do bloqueio). */
  permitidos?: string[];
  /** Tamanho máximo em bytes (default: 25 MB). */
  maxBytes?: number;
}

/**
 * Valida se o arquivo pode ser aceito com segurança.
 *
 * Lança `BadRequestException` se:
 * - A extensão (qualquer segmento após o primeiro ponto) está em `EXTENSOES_PERIGOSAS`.
 * - O arquivo excede `maxBytes`.
 * - `opts.permitidos` foi informado e a extensão/MIME não está na lista.
 *
 * @param file - Objeto com os campos obrigatórios do arquivo.
 * @param opts - Opções adicionais de validação.
 */
export function validarUploadSeguro(
  file: { originalname: string; mimetype: string; size: number },
  opts?: OpcoesValidacao,
): void {
  const maxBytes = opts?.maxBytes ?? DEFAULT_MAX_BYTES;

  // --- tamanho ---
  if (file.size > maxBytes) {
    throw new BadRequestException(
      `Arquivo excede o tamanho máximo permitido (${Math.round(maxBytes / 1024 / 1024)} MB).`,
    );
  }

  // --- extensões ---
  const nome = (file.originalname || '').trim();
  const partes = nome.split('.');

  // arquivo sem extensão: partes.length === 1 → sem extensão, aceito (deixa
  // a camada de MIME permitidos decidir se opts.permitidos for informado).
  const extensoes: string[] = partes.length > 1 ? partes.slice(1).map((e) => e.toLowerCase()) : [];

  // Detecta dupla-extensão: verifica TODOS os segmentos (exceto o primeiro, que
  // é o nome). Se qualquer um for perigoso, rejeita.
  for (const ext of extensoes) {
    if (EXTENSOES_PERIGOSAS.has(ext)) {
      throw new BadRequestException('Tipo de arquivo não permitido por segurança.');
    }
  }

  // --- lista de permitidos (allowlist adicional) ---
  if (opts?.permitidos && opts.permitidos.length > 0) {
    const extFinal = extensoes[extensoes.length - 1] ?? '';
    const mime = file.mimetype.toLowerCase();
    const listaLower = opts.permitidos.map((p) => p.toLowerCase());
    const ok = listaLower.includes(extFinal) || listaLower.includes(mime);
    if (!ok) {
      throw new BadRequestException(
        `Tipo de arquivo não permitido. Tipos aceitos: ${opts.permitidos.join(', ')}.`,
      );
    }
  }
}
