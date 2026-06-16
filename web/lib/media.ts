/**
 * Client helpers para a Biblioteca de Midia.
 * Fala exclusivamente com a API (fronteira de camadas).
 * Usa credentials:'include' (cookie de sessao HttpOnly).
 */

import { apiBase } from './auth-shared';
import { adminGet, adminPost, adminPut, adminDelete, qs } from './admin-api';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type MediaTipo = 'imagem' | 'documento' | 'video' | 'audio' | 'outro';
export type MediaVisibilidade = 'publico' | 'restrito';

export interface MediaCategoria {
  id: string;
  tipo: MediaTipo;
  nome: string;
  slug: string;
  descricao?: string | null;
}

export interface MediaAsset {
  id: string;
  tipo: MediaTipo;
  /** slug da categoria */
  categoria: string;
  visibilidade: MediaVisibilidade;
  nomeOriginal: string;
  mime: string;
  ext: string;
  tamanhoBytes: number;
  largura?: number | null;
  altura?: number | null;
  altText?: string | null;
  criadoEm: string;
  /** URL publica mascarada — null quando restrito */
  urlPublica: string | null;
}

export interface ListaMidiaFiltros {
  tipo?: MediaTipo | '';
  categoria?: string;
  q?: string;
  page?: number;
}

export interface ListaMidiaResposta {
  page: number;
  total: number;
  items: MediaAsset[];
}

export interface AtualizarMidiaDto {
  altText?: string;
  categoriaId?: string;
}

// ─── Helpers de listagem/detalhe ─────────────────────────────────────────────

export function listarMidia(filtros: ListaMidiaFiltros = {}): Promise<ListaMidiaResposta> {
  const path = `/api/midia${qs({
    tipo: filtros.tipo ?? '',
    categoria: filtros.categoria ?? '',
    q: filtros.q ?? '',
    page: filtros.page ?? 1,
  })}`;
  return adminGet<ListaMidiaResposta>(path);
}

export function getMidia(id: string): Promise<MediaAsset> {
  return adminGet<MediaAsset>(`/api/midia/${id}`);
}

export function listarCategorias(tipo?: MediaTipo | ''): Promise<MediaCategoria[]> {
  const path = `/api/midia/categorias${tipo ? qs({ tipo }) : ''}`;
  return adminGet<MediaCategoria[]>(path);
}

export function atualizarMidia(id: string, dto: AtualizarMidiaDto): Promise<MediaAsset> {
  return adminPut<MediaAsset>(`/api/midia/${id}`, dto);
}

export function excluirMidia(id: string): Promise<void> {
  return adminDelete<void>(`/api/midia/${id}`);
}

// ─── Upload (multipart — nao seta Content-Type manual) ───────────────────────

export interface UploadMidiaDados {
  categoriaId: string;
  visibilidade: MediaVisibilidade;
  altText?: string;
}

export async function uploadMidia(
  file: File,
  dados: UploadMidiaDados,
): Promise<MediaAsset> {
  const form = new FormData();
  form.append('file', file);
  form.append('categoriaId', dados.categoriaId);
  form.append('visibilidade', dados.visibilidade);
  if (dados.altText) form.append('altText', dados.altText);

  const res = await fetch(`${apiBase}/api/midia`, {
    method: 'POST',
    body: form,
    credentials: 'include',
    // NAO definir Content-Type — o browser inclui o boundary automaticamente
  });

  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) {
        msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
      }
    } catch {
      // corpo nao-JSON
    }
    throw new Error(msg);
  }

  return res.json() as Promise<MediaAsset>;
}

// ─── SVG — editor de cores ───────────────────────────────────────────────────

export interface SvgConteudo {
  /** Marcacao SVG ja sanitizada pelo backend. */
  conteudo: string;
  /** Lista de cores unicas encontradas no arquivo (hex, rgb, named…). */
  coresUnicas: string[];
}

export interface RecolorirSvgDto {
  /** Mapeamento { corOriginal: novaCor } — apenas as cores alteradas. */
  substituicoes: Record<string, string>;
  /**
   * Cor base aplicada como fill no elemento <svg> raiz.
   * Serve para recolorir tracos/linhas de brasoes e icones moncromaticos
   * que usam fill="currentColor" ou nao declaram fill explicito (herdam preto).
   * Valor hex ou CSS valido (ex.: "#1351b4").
   */
  corBase?: string;
  categoriaId: string;
  visibilidade: MediaVisibilidade;
  altText?: string;
}

/** Busca o conteudo SVG sanitizado e as cores unicas do arquivo. */
export function getSvgConteudo(id: string): Promise<SvgConteudo> {
  return adminGet<SvgConteudo>(`/api/midia/${id}/svg-conteudo`);
}

/**
 * Cria uma copia recolorida do SVG.
 * Retorna o novo MediaAsset criado pelo backend.
 */
export function recolorirSvg(id: string, dto: RecolorirSvgDto): Promise<MediaAsset> {
  return adminPost<MediaAsset>(`/api/midia/${id}/recolorir`, dto);
}

// ─── Utilitarios ─────────────────────────────────────────────────────────────

/** Retorna um rotulo/icone textual por extensao para documentos e outros tipos. */
export function iconePorExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, '');
  const mapa: Record<string, string> = {
    pdf: 'PDF',
    doc: 'DOC',
    docx: 'DOC',
    xls: 'XLS',
    xlsx: 'XLS',
    csv: 'CSV',
    ppt: 'PPT',
    pptx: 'PPT',
    zip: 'ZIP',
    rar: 'RAR',
    mp4: 'MP4',
    webm: 'VID',
    mov: 'VID',
    mp3: 'MP3',
    wav: 'AUD',
    ogg: 'AUD',
    txt: 'TXT',
    svg: 'SVG',
    png: 'PNG',
    jpg: 'JPG',
    jpeg: 'JPG',
    gif: 'GIF',
    webp: 'IMG',
  };
  return mapa[e] ?? (ext.toUpperCase().slice(0, 4) || 'ARQ');
}

/** Formata bytes em KB ou MB legivel. */
export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
