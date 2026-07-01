'use client';

/**
 * CertificadoDesigner — editor VISUAL (drag-drop em canvas) de templates de
 * certificado da Escola Cidadã. Equivalente ao designer do sistema Laravel
 * antigo (/admin/certificados/templates/designer), porém todo client-side.
 *
 * Conceito de coordenadas:
 *   - O certificado tem dimensões em PONTOS (pt): largura × altura.
 *     Default A4 paisagem = 842 × 595 pt.
 *   - A origem fica no canto SUPERIOR-ESQUERDO.
 *   - O canvas na tela é ESCALADO para caber: escala = larguraTela / largura.
 *     Posições em px na tela são convertidas para pt dividindo pela escala;
 *     posições em pt são convertidas para px multiplicando pela escala.
 *
 * Itens posicionáveis (todos com posX/posY em pt):
 *   - textos    → caixa de texto com placeholders {{nome}} {{curso}} {{carga}}
 *                 {{data}} {{codigo}}; fonte/tamanho/cor/alinhamento/negrito.
 *   - fotos     → <img> de uma mídia (logo, assinatura digitalizada).
 *   - elementos → qr (placeholder), assinatura, linha, retangulo.
 *
 * Salvar monta o objeto completo e faz POST (novo) ou PUT (editar) em
 * /api/admin/escola/templates — o backend faz REPLACE atômico dos aninhados.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminApiError, adminPost, adminPut } from '../../../lib/admin-api';
import { Aviso, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import type { TemplateAdmin, TipoCertificadoAdmin } from './tipos';

// ─── Modelo de trabalho do designer (client-side) ────────────────────────────

type ItemKind = 'texto' | 'foto' | 'elemento';

interface ItemTexto {
  uid: string;
  kind: 'texto';
  conteudo: string;
  posX: number;
  posY: number;
  largura: number;
  fonte: string;
  tamanho: number;
  cor: string;
  alinhamento: 'left' | 'center' | 'right';
  negrito: boolean;
}

interface ItemFoto {
  uid: string;
  kind: 'foto';
  url: string;
  storageKey?: string;
  posX: number;
  posY: number;
  largura: number;
  altura: number;
}

interface ItemElemento {
  uid: string;
  kind: 'elemento';
  tipo: 'qr' | 'linha' | 'retangulo' | 'assinatura';
  posX: number;
  posY: number;
  largura: number;
  altura: number;
  cor: string;
  espessura: number;
}

type Item = ItemTexto | ItemFoto | ItemElemento;

const PLACEHOLDERS = [
  { token: '{{nome}}', label: 'Nome' },
  { token: '{{cpf}}', label: 'CPF' },
  { token: '{{rg}}', label: 'RG' },
  { token: '{{curso}}', label: 'Curso' },
  { token: '{{conteudo}}', label: 'Conteúdo programático' },
  { token: '{{carga}}', label: 'Carga horária' },
  { token: '{{data_inicio}}', label: 'Data início' },
  { token: '{{data_conclusao}}', label: 'Data conclusão' },
  { token: '{{data}}', label: 'Data emissão' },
  { token: '{{codigo}}', label: 'Código' },
  { token: '{{pagina}}', label: 'Nº da página' },
  { token: '{{total_paginas}}', label: 'Total de páginas' },
];

const FONTES = ['Helvetica', 'Times-Roman', 'Courier'];

const ALINHAMENTOS: { v: ItemTexto['alinhamento']; l: string }[] = [
  { v: 'left', l: 'Esquerda' },
  { v: 'center', l: 'Centro' },
  { v: 'right', l: 'Direita' },
];

const TIPOS_ELEMENTO: { v: ItemElemento['tipo']; l: string }[] = [
  { v: 'qr', l: 'QR Code' },
  { v: 'assinatura', l: 'Assinatura' },
  { v: 'linha', l: 'Linha' },
  { v: 'retangulo', l: 'Retângulo' },
];

let uidSeq = 0;
function novoUid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${uidSeq}`;
}

function comoNumero(v: number | null | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Uma página de trabalho do designer: fundo próprio + itens. */
interface Pagina {
  uid: string;
  fundoUrl: string;
  itens: Item[];
}

/** Converte um layout (template legado OU página) na lista de itens do designer. */
function itensDoLayout(t: Pick<TemplateAdmin, 'textos' | 'elementos' | 'fotos'>): Item[] {
  const textos: Item[] = (t.textos ?? []).map((x) => ({
    uid: novoUid('txt'),
    kind: 'texto',
    conteudo: x.conteudo ?? '',
    posX: comoNumero(x.posX, 0),
    posY: comoNumero(x.posY, 0),
    largura: comoNumero(x.largura, 300),
    fonte: x.fonte || 'Helvetica',
    tamanho: comoNumero(x.tamanho, 16),
    cor: x.cor || '#000000',
    alinhamento: (x.alinhamento as ItemTexto['alinhamento']) || 'center',
    negrito: !!x.negrito,
  }));
  const fotos: Item[] = (t.fotos ?? []).map((x) => ({
    uid: novoUid('foto'),
    kind: 'foto',
    url: x.url ?? '',
    storageKey: x.storageKey ?? undefined,
    posX: comoNumero(x.posX, 0),
    posY: comoNumero(x.posY, 0),
    largura: comoNumero(x.largura, 120),
    altura: comoNumero(x.altura, 120),
  }));
  const elementos: Item[] = (t.elementos ?? []).map((x) => {
    const cfg = (x.config ?? {}) as Record<string, unknown>;
    return {
      uid: novoUid('el'),
      kind: 'elemento',
      tipo: (x.tipo as ItemElemento['tipo']) || 'qr',
      posX: comoNumero(x.posX, 0),
      posY: comoNumero(x.posY, 0),
      largura: comoNumero(x.largura, 100),
      altura: comoNumero(x.altura, 100),
      cor: typeof cfg.cor === 'string' ? (cfg.cor as string) : '#000000',
      espessura: comoNumero(cfg.espessura as number, 1),
    };
  });
  return [...textos, ...fotos, ...elementos];
}

/** Constrói as páginas de trabalho a partir do template (multipágina, legado ou novo). */
function paginasDoTemplate(t: TemplateAdmin | null): Pagina[] {
  if (!t) return [{ uid: novoUid('pg'), fundoUrl: '', itens: [] }];
  if (t.paginas?.length) {
    return [...t.paginas]
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((p) => ({ uid: novoUid('pg'), fundoUrl: p.fundoUrl ?? '', itens: itensDoLayout(p) }));
  }
  // Legado (template single-page flat) → uma página.
  return [{ uid: novoUid('pg'), fundoUrl: t.fundoUrl ?? '', itens: itensDoLayout(t) }];
}

// ─── Componente ──────────────────────────────────────────────────────────────

const LARGURA_TELA = 760; // px alvo do canvas; escala = LARGURA_TELA / largura(pt)

interface Props {
  /** Template a editar (com aninhados do GET) ou null para criar um novo. */
  editando: TemplateAdmin | null;
  tipos: TipoCertificadoAdmin[];
  onClose: () => void;
  /** Chamado após salvar com sucesso (para recarregar a lista). */
  onSalvo: () => void;
}

export default function CertificadoDesigner({ editando, tipos, onClose, onSalvo }: Props) {
  // Metadados do template
  const [nome, setNome] = useState(editando?.nome ?? '');
  const [typeId, setTypeId] = useState(editando?.typeId ?? '');
  const [largura, setLargura] = useState(comoNumero(editando?.largura, 842));
  const [altura, setAltura] = useState(comoNumero(editando?.altura, 595));
  const [orientacao, setOrientacao] = useState(editando?.orientacao ?? 'paisagem');
  const [padrao, setPadrao] = useState(editando?.padrao ?? false);
  const [ativo, setAtivo] = useState(editando?.ativo ?? true);

  // Páginas (multipágina): cada uma tem seu fundo + itens. `pgAtual` é a página em edição.
  const [paginas, setPaginas] = useState<Pagina[]>(() => paginasDoTemplate(editando));
  const [pgAtual, setPgAtual] = useState(0);
  const [selId, setSelId] = useState<string | null>(null);

  // Ref sempre com a página atual — closures estáveis (drag) apontam à página certa.
  const pgAtualRef = useRef(0);
  useEffect(() => { pgAtualRef.current = pgAtual; }, [pgAtual]);

  // Página corrente + acessores (mantêm o restante do código praticamente intacto).
  const itens = paginas[pgAtual]?.itens ?? [];
  const fundoUrl = paginas[pgAtual]?.fundoUrl ?? '';
  const setItens = useCallback(
    (updater: Item[] | ((arr: Item[]) => Item[])) =>
      setPaginas((ps) =>
        ps.map((p, i) =>
          i === pgAtualRef.current
            ? { ...p, itens: typeof updater === 'function' ? updater(p.itens) : updater }
            : p,
        ),
      ),
    [],
  );
  const setFundoUrl = useCallback(
    (v: string | ((s: string) => string)) =>
      setPaginas((ps) =>
        ps.map((p, i) =>
          i === pgAtualRef.current
            ? { ...p, fundoUrl: typeof v === 'function' ? v(p.fundoUrl) : v }
            : p,
        ),
      ),
    [],
  );

  // Operações de página.
  const addPagina = useCallback(() => {
    setPaginas((ps) => {
      const arr = [...ps, { uid: novoUid('pg'), fundoUrl: '', itens: [] as Item[] }];
      setPgAtual(arr.length - 1);
      return arr;
    });
    setSelId(null);
  }, []);
  const removerPagina = useCallback((idx: number) => {
    setPaginas((ps) => {
      if (ps.length <= 1) return ps; // sempre ≥ 1 página
      const arr = ps.filter((_, i) => i !== idx);
      setPgAtual((cur) => Math.max(0, Math.min(cur, arr.length - 1)));
      return arr;
    });
    setSelId(null);
  }, []);
  const irParaPagina = useCallback((idx: number) => {
    setPgAtual(idx);
    setSelId(null);
  }, []);

  // Pickers de mídia (fundo / foto)
  const [pickerFundo, setPickerFundo] = useState(false);
  const [pickerFotoUid, setPickerFotoUid] = useState<string | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  // Estado de arrasto (ref para não re-renderizar a cada mousemove).
  const dragRef = useRef<{
    uid: string;
    startMouseX: number;
    startMouseY: number;
    startPosX: number;
    startPosY: number;
  } | null>(null);

  const escala = useMemo(() => LARGURA_TELA / Math.max(1, largura), [largura]);

  const selecionado = useMemo(
    () => itens.find((i) => i.uid === selId) ?? null,
    [itens, selId],
  );

  // Quando troca a orientação, ajusta as dimensões padrão A4 correspondentes,
  // a menos que o usuário já tenha valores personalizados muito diferentes.
  function trocarOrientacao(nova: string) {
    setOrientacao(nova);
    if (nova === 'retrato') {
      setLargura(595);
      setAltura(842);
    } else {
      setLargura(842);
      setAltura(595);
    }
  }

  function patch(uid: string, p: Partial<Item>) {
    setItens((arr) =>
      arr.map((it) => (it.uid === uid ? ({ ...it, ...p } as Item) : it)),
    );
  }

  function remover(uid: string) {
    setItens((arr) => arr.filter((it) => it.uid !== uid));
    if (selId === uid) setSelId(null);
  }

  // ── Toolbar: adicionar itens (no centro/canto do canvas em pt) ──────────────
  function addTexto() {
    const it: ItemTexto = {
      uid: novoUid('txt'),
      kind: 'texto',
      conteudo: 'Certificamos que {{nome}}',
      posX: Math.round(largura / 2 - 150),
      posY: Math.round(altura / 2),
      largura: 300,
      fonte: 'Helvetica',
      tamanho: 18,
      cor: '#000000',
      alinhamento: 'center',
      negrito: false,
    };
    setItens((a) => [...a, it]);
    setSelId(it.uid);
  }

  function addElemento(tipo: ItemElemento['tipo']) {
    const base = { posX: 40, posY: 40, cor: '#000000', espessura: 1 };
    const dims =
      tipo === 'qr'
        ? { largura: 100, altura: 100 }
        : tipo === 'linha'
          ? { largura: 200, altura: 1 }
          : tipo === 'assinatura'
            ? { largura: 180, altura: 1 }
            : { largura: 160, altura: 90 }; // retangulo
    const it: ItemElemento = {
      uid: novoUid('el'),
      kind: 'elemento',
      tipo,
      ...base,
      ...dims,
    };
    setItens((a) => [...a, it]);
    setSelId(it.uid);
  }

  function addFoto() {
    const it: ItemFoto = {
      uid: novoUid('foto'),
      kind: 'foto',
      url: '',
      posX: 40,
      posY: 40,
      largura: 120,
      altura: 120,
    };
    setItens((a) => [...a, it]);
    setSelId(it.uid);
    setPickerFotoUid(it.uid); // abre o MediaPicker já para esta foto
  }

  // ── Drag-and-drop no canvas ─────────────────────────────────────────────────
  const onItemMouseDown = useCallback(
    (e: React.MouseEvent, it: Item) => {
      e.stopPropagation();
      e.preventDefault();
      setSelId(it.uid);
      dragRef.current = {
        uid: it.uid,
        startMouseX: e.clientX,
        startMouseY: e.clientY,
        startPosX: it.posX,
        startPosY: it.posY,
      };
    },
    [],
  );

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const d = dragRef.current;
      if (!d) return;
      // delta em px na tela → delta em pt (÷ escala)
      const dxPt = (e.clientX - d.startMouseX) / escala;
      const dyPt = (e.clientY - d.startMouseY) / escala;
      setItens((arr) =>
        arr.map((it) => {
          if (it.uid !== d.uid) return it;
          // clamp considerando a dimensão do item, p/ não arrastá-lo p/ fora do canvas
          const iw = (it as { largura?: number }).largura ?? 0;
          // Texto não tem `altura`; estima 1 linha (tamanho×1.2) para o clamp
          // vertical não deixar a caixa sair pela borda inferior.
          const ih =
            it.kind === 'texto'
              ? Math.max((it as ItemTexto).tamanho * 1.2, 12)
              : (it as { altura?: number }).altura ?? 0;
          const novoX = Math.round(Math.max(0, Math.min(Math.max(0, largura - iw), d.startPosX + dxPt)));
          const novoY = Math.round(Math.max(0, Math.min(Math.max(0, altura - ih), d.startPosY + dyPt)));
          return { ...it, posX: novoX, posY: novoY } as Item;
        }),
      );
    }
    function onUp() {
      dragRef.current = null;
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [escala, largura, altura]);

  // Esc fecha o designer; Delete/Backspace remove o item selecionado.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      const editavel = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (!editavel && selId && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        remover(selId);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  // Trava o scroll do fundo enquanto o designer (full-screen) está aberto.
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, []);

  // ── Salvar ──────────────────────────────────────────────────────────────────
  async function salvar() {
    if (!nome.trim()) {
      setErro('Informe o nome do modelo.');
      return;
    }
    setSalvando(true);
    setErro('');

    // Mapeia os itens de UMA página nos 3 arrays esperados pelo backend.
    const layoutDaPagina = (arr: Item[]) => ({
      textos: arr
        .filter((i): i is ItemTexto => i.kind === 'texto')
        .map((t, idx) => ({
          conteudo: t.conteudo, posX: Math.round(t.posX), posY: Math.round(t.posY),
          largura: Math.round(t.largura), fonte: t.fonte, tamanho: Math.round(t.tamanho),
          cor: t.cor, alinhamento: t.alinhamento, negrito: t.negrito, ordem: idx,
        })),
      fotos: arr
        .filter((i): i is ItemFoto => i.kind === 'foto' && !!i.url)
        .map((f, idx) => ({
          url: f.url, storageKey: f.storageKey, posX: Math.round(f.posX), posY: Math.round(f.posY),
          largura: Math.round(f.largura), altura: Math.round(f.altura), ordem: idx,
        })),
      elementos: arr
        .filter((i): i is ItemElemento => i.kind === 'elemento')
        .map((e, idx) => ({
          tipo: e.tipo, posX: Math.round(e.posX), posY: Math.round(e.posY),
          largura: Math.round(e.largura), altura: Math.round(e.altura),
          config: { cor: e.cor, espessura: e.espessura }, ordem: idx,
        })),
    });

    const paginasBody = paginas.map((pg, pi) => ({
      ordem: pi,
      fundoUrl: pg.fundoUrl || undefined,
      ...layoutDaPagina(pg.itens),
    }));

    const body = {
      nome: nome.trim(),
      typeId: typeId || undefined,
      fundoUrl: paginas[0]?.fundoUrl || undefined, // fundo default/legado (1ª página)
      largura: Math.round(largura),
      altura: Math.round(altura),
      orientacao,
      padrao,
      ativo,
      paginas: paginasBody,
    };

    try {
      if (editando) await adminPut(`/api/admin/escola/templates/${editando.id}`, body);
      else await adminPost('/api/admin/escola/templates', body);
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar o modelo.');
    } finally {
      setSalvando(false);
    }
  }

  // Insere um placeholder no fim do conteúdo do texto selecionado.
  function inserirPlaceholder(token: string) {
    if (!selecionado || selecionado.kind !== 'texto') return;
    patch(selecionado.uid, { conteudo: `${selecionado.conteudo}${token}` } as Partial<Item>);
  }

  const larguraTela = LARGURA_TELA;
  const alturaTela = Math.round(altura * escala);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label={editando ? `Designer do modelo ${editando.nome}` : 'Designer de novo modelo de certificado'}
    >
      {/* Cabeçalho / toolbar */}
      <header className="flex flex-wrap items-center gap-2 border-b border-border bg-bg p-3">
        <h2 className="mr-2 font-heading text-base font-bold">
          {editando ? 'Editar modelo (designer visual)' : 'Novo modelo (designer visual)'}
        </h2>

        <div className="flex flex-wrap gap-1" role="group" aria-label="Adicionar elementos ao certificado">
          <button type="button" className={ui.btnGhost} onClick={addTexto}>
            + Texto
          </button>
          <button type="button" className={ui.btnGhost} onClick={() => addElemento('qr')}>
            + QR Code
          </button>
          <button type="button" className={ui.btnGhost} onClick={() => addElemento('assinatura')}>
            + Assinatura
          </button>
          <button type="button" className={ui.btnGhost} onClick={() => addElemento('linha')}>
            + Linha
          </button>
          <button type="button" className={ui.btnGhost} onClick={() => addElemento('retangulo')}>
            + Retângulo
          </button>
          <button type="button" className={ui.btnGhost} onClick={addFoto}>
            + Imagem
          </button>
        </div>

        {/* Navegação de páginas (certificado multipágina) */}
        <div
          className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5"
          role="group"
          aria-label="Páginas do certificado"
        >
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => irParaPagina(Math.max(0, pgAtual - 1))}
            disabled={pgAtual === 0}
            aria-label="Página anterior"
          >
            ◀
          </button>
          <span className="px-1 text-sm font-semibold tabular-nums" aria-live="polite">
            Pág. {pgAtual + 1}/{paginas.length}
          </span>
          <button
            type="button"
            className={ui.btnGhost}
            onClick={() => irParaPagina(Math.min(paginas.length - 1, pgAtual + 1))}
            disabled={pgAtual >= paginas.length - 1}
            aria-label="Próxima página"
          >
            ▶
          </button>
          <button type="button" className={ui.btnGhost} onClick={addPagina} title="Adicionar página">
            + Página
          </button>
          <button
            type="button"
            className={ui.btnDanger}
            onClick={() => removerPagina(pgAtual)}
            disabled={paginas.length <= 1}
            title="Excluir a página atual"
          >
            Excluir pág.
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Fechar
          </button>
          <button
            type="button"
            className={ui.btn}
            onClick={salvar}
            disabled={salvando}
            aria-busy={salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar modelo'}
          </button>
        </div>
      </header>

      {erro && (
        <div className="px-3 pt-3">
          <Aviso tipo="erro">{erro}</Aviso>
        </div>
      )}

      {/* Corpo: canvas (centro) + painéis */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Painel esquerdo: propriedades do template */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-3" aria-label="Propriedades do modelo">
          <h3 className="mb-2 text-sm font-bold">Modelo</h3>

          <div className="space-y-3">
            <div>
              <label htmlFor="dz-nome" className={ui.label}>
                Nome <span aria-hidden="true">*</span>
              </label>
              <input
                id="dz-nome"
                type="text"
                className={ui.input}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="ex.: Modelo padrão paisagem"
              />
            </div>

            <div>
              <label htmlFor="dz-tipo" className={ui.label}>
                Tipo de certificado
              </label>
              <select
                id="dz-tipo"
                className={ui.input}
                value={typeId ?? ''}
                onChange={(e) => setTypeId(e.target.value)}
              >
                <option value="">Sem tipo específico</option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={ui.label}>Imagem de fundo <span className="font-normal text-fg/55">(página {pgAtual + 1})</span></label>
              <div className="mt-1 flex gap-2">
                <input
                  type="url"
                  className={`flex-1 ${ui.input}`}
                  value={fundoUrl}
                  onChange={(e) => setFundoUrl(e.target.value)}
                  placeholder="https://..."
                  aria-label="URL da imagem de fundo"
                />
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => setPickerFundo(true)}
                  aria-label="Escolher imagem de fundo da biblioteca de mídia"
                >
                  Escolher
                </button>
              </div>
              {fundoUrl && (
                <button
                  type="button"
                  className="mt-1 text-xs text-danger hover:underline"
                  onClick={() => setFundoUrl('')}
                >
                  remover fundo
                </button>
              )}
            </div>

            <div>
              <label htmlFor="dz-orient" className={ui.label}>
                Orientação
              </label>
              <select
                id="dz-orient"
                className={ui.input}
                value={orientacao}
                onChange={(e) => trocarOrientacao(e.target.value)}
              >
                <option value="paisagem">Paisagem</option>
                <option value="retrato">Retrato</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="dz-larg" className={ui.label}>
                  Largura (pt)
                </label>
                <input
                  id="dz-larg"
                  type="number"
                  min={1}
                  className={ui.input}
                  value={largura}
                  onChange={(e) => setLargura(Math.max(1, comoNumero(Number(e.target.value), 842)))}
                />
              </div>
              <div>
                <label htmlFor="dz-alt" className={ui.label}>
                  Altura (pt)
                </label>
                <input
                  id="dz-alt"
                  type="number"
                  min={1}
                  className={ui.input}
                  value={altura}
                  onChange={(e) => setAltura(Math.max(1, comoNumero(Number(e.target.value), 595)))}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 pt-1">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={padrao}
                  onChange={(e) => setPadrao(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Padrão
              </label>
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={ativo}
                  onChange={(e) => setAtivo(e.target.checked)}
                  className="h-4 w-4 rounded border-border accent-primary"
                />
                Ativo
              </label>
            </div>
          </div>

          <p className="mt-4 text-xs text-fg/55">
            Arraste os itens no certificado para posicioná-los. Clique para selecionar e editar à
            direita. Tecla Delete remove o item selecionado.
          </p>
        </aside>

        {/* Canvas central */}
        <div className="flex min-w-0 flex-1 items-start justify-center overflow-auto bg-muted/30 p-6">
          <div
            ref={canvasRef}
            className="relative shadow-lg ring-1 ring-border"
            style={{
              width: larguraTela,
              height: alturaTela,
              backgroundColor: '#ffffff',
              backgroundImage: fundoUrl ? `url("${fundoUrl.replace(/["\\]/g, '\\$&')}")` : undefined,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
            onMouseDown={() => setSelId(null)}
            role="application"
            aria-label="Área de edição do certificado"
          >
            {itens.map((it) => (
              <ItemNoCanvas
                key={it.uid}
                item={it}
                escala={escala}
                selecionado={it.uid === selId}
                onMouseDown={(e) => onItemMouseDown(e, it)}
              />
            ))}
          </div>
        </div>

        {/* Painel direito: propriedades do item selecionado */}
        <aside className="w-72 shrink-0 overflow-y-auto border-l border-border p-3" aria-label="Propriedades do item selecionado">
          <h3 className="mb-2 text-sm font-bold">Item selecionado</h3>

          {!selecionado ? (
            <p className="text-sm text-fg/55">Selecione um item no certificado para editar suas propriedades.</p>
          ) : selecionado.kind === 'texto' ? (
            <PainelTexto item={selecionado} patch={patch} remover={remover} inserir={inserirPlaceholder} />
          ) : selecionado.kind === 'foto' ? (
            <PainelFoto
              item={selecionado}
              patch={patch}
              remover={remover}
              onTrocarImagem={() => setPickerFotoUid(selecionado.uid)}
            />
          ) : (
            <PainelElemento item={selecionado} patch={patch} remover={remover} />
          )}
        </aside>
      </div>

      {/* MediaPicker — fundo */}
      <MediaPicker
        open={pickerFundo}
        onClose={() => setPickerFundo(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) setFundoUrl(asset.urlPublica);
          setPickerFundo(false);
        }}
      />

      {/* MediaPicker — foto/imagem de item */}
      <MediaPicker
        open={pickerFotoUid !== null}
        onClose={() => setPickerFotoUid(null)}
        tipo="imagem"
        onSelect={(asset) => {
          if (pickerFotoUid && asset.urlPublica) {
            patch(pickerFotoUid, { url: asset.urlPublica } as Partial<Item>);
          }
          setPickerFotoUid(null);
        }}
      />
    </div>
  );
}

// ─── Item renderizado no canvas ──────────────────────────────────────────────

function ItemNoCanvas({
  item,
  escala,
  selecionado,
  onMouseDown,
}: {
  item: Item;
  escala: number;
  selecionado: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const left = item.posX * escala;
  const top = item.posY * escala;

  const ring = selecionado ? 'outline outline-2 outline-primary' : 'outline-dashed outline-1 outline-fg/30';
  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    left,
    top,
    cursor: 'move',
  };

  if (item.kind === 'texto') {
    const alignCss =
      item.alinhamento === 'center' ? 'center' : item.alinhamento === 'right' ? 'right' : 'left';
    return (
      <div
        onMouseDown={onMouseDown}
        className={ring}
        style={{
          ...baseStyle,
          width: item.largura * escala,
          color: item.cor,
          fontSize: item.tamanho * escala,
          fontWeight: item.negrito ? 700 : 400,
          textAlign: alignCss,
          lineHeight: 1.2,
          whiteSpace: 'pre-wrap',
          fontFamily:
            item.fonte === 'Times-Roman' ? 'serif' : item.fonte === 'Courier' ? 'monospace' : 'sans-serif',
          userSelect: 'none',
        }}
        title="Arraste para mover"
      >
        {item.conteudo || '(texto vazio)'}
      </div>
    );
  }

  if (item.kind === 'foto') {
    return (
      <div
        onMouseDown={onMouseDown}
        className={ring}
        style={{ ...baseStyle, width: item.largura * escala, height: item.altura * escala }}
        title="Arraste para mover"
      >
        {item.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'contain', pointerEvents: 'none' }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted/50 text-[10px] text-fg/60">
            imagem
          </div>
        )}
      </div>
    );
  }

  // elemento
  const w = item.largura * escala;
  const h = item.altura * escala;
  if (item.tipo === 'qr') {
    return (
      <div
        onMouseDown={onMouseDown}
        className={`${ring} flex items-center justify-center bg-white text-[10px] font-bold text-fg/70`}
        style={{ ...baseStyle, width: w, height: h, border: '1px solid currentColor' }}
        title="QR Code (gerado na emissão)"
      >
        QR
      </div>
    );
  }
  if (item.tipo === 'retangulo') {
    return (
      <div
        onMouseDown={onMouseDown}
        className={ring}
        style={{
          ...baseStyle,
          width: w,
          height: h,
          border: `${Math.max(1, item.espessura * escala)}px solid ${item.cor}`,
        }}
        title="Retângulo"
      />
    );
  }
  // linha ou assinatura → traço horizontal
  return (
    <div
      onMouseDown={onMouseDown}
      className={ring}
      style={{ ...baseStyle, width: w, height: Math.max(8, h) }}
      title={item.tipo === 'assinatura' ? 'Linha de assinatura' : 'Linha'}
    >
      <div
        style={{
          width: '100%',
          borderTop: `${Math.max(1, item.espessura * escala)}px solid ${item.cor}`,
          marginTop: item.tipo === 'assinatura' ? Math.max(4, h - 2) : Math.max(0, h / 2),
        }}
      />
    </div>
  );
}

// ─── Painéis de propriedades ─────────────────────────────────────────────────

function LinhaNum({
  id,
  label,
  value,
  onChange,
  min = 0,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        className={ui.input}
        value={value}
        onChange={(e) => onChange(comoNumero(Number(e.target.value), value))}
      />
    </div>
  );
}

function BotaoRemover({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className={`${ui.btnDanger} w-full justify-center`} onClick={onClick}>
      Remover item
    </button>
  );
}

function PainelTexto({
  item,
  patch,
  remover,
  inserir,
}: {
  item: ItemTexto;
  patch: (uid: string, p: Partial<Item>) => void;
  remover: (uid: string) => void;
  inserir: (token: string) => void;
}) {
  const set = (p: Partial<ItemTexto>) => patch(item.uid, p as Partial<Item>);
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="px-conteudo" className={ui.label}>
          Conteúdo
        </label>
        <textarea
          id="px-conteudo"
          className={`${ui.input} min-h-[72px]`}
          value={item.conteudo}
          onChange={(e) => set({ conteudo: e.target.value })}
        />
        <div className="mt-1 flex flex-wrap gap-1" role="group" aria-label="Inserir variável no texto">
          {PLACEHOLDERS.map((p) => (
            <button
              key={p.token}
              type="button"
              className="rounded border border-border px-2 py-0.5 text-xs hover:bg-muted"
              onClick={() => inserir(p.token)}
              title={`Inserir ${p.token}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="px-fonte" className={ui.label}>
            Fonte
          </label>
          <select
            id="px-fonte"
            className={ui.input}
            value={item.fonte}
            onChange={(e) => set({ fonte: e.target.value })}
          >
            {FONTES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <LinhaNum
          id="px-tamanho"
          label="Tamanho (pt)"
          min={1}
          value={item.tamanho}
          onChange={(v) => set({ tamanho: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="px-cor" className={ui.label}>
            Cor
          </label>
          <input
            id="px-cor"
            type="color"
            className="h-9 w-full rounded border border-border"
            value={item.cor}
            onChange={(e) => set({ cor: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor="px-align" className={ui.label}>
            Alinhamento
          </label>
          <select
            id="px-align"
            className={ui.input}
            value={item.alinhamento}
            onChange={(e) => set({ alinhamento: e.target.value as ItemTexto['alinhamento'] })}
          >
            {ALINHAMENTOS.map((a) => (
              <option key={a.v} value={a.v}>
                {a.l}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm font-semibold">
        <input
          type="checkbox"
          checked={item.negrito}
          onChange={(e) => set({ negrito: e.target.checked })}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Negrito
      </label>

      <div className="grid grid-cols-3 gap-2">
        <LinhaNum id="px-larg" label="Largura" value={item.largura} onChange={(v) => set({ largura: v })} />
        <LinhaNum id="px-x" label="Pos. X" value={item.posX} onChange={(v) => set({ posX: v })} />
        <LinhaNum id="px-y" label="Pos. Y" value={item.posY} onChange={(v) => set({ posY: v })} />
      </div>

      <BotaoRemover onClick={() => remover(item.uid)} />
    </div>
  );
}

function PainelFoto({
  item,
  patch,
  remover,
  onTrocarImagem,
}: {
  item: ItemFoto;
  patch: (uid: string, p: Partial<Item>) => void;
  remover: (uid: string) => void;
  onTrocarImagem: () => void;
}) {
  const set = (p: Partial<ItemFoto>) => patch(item.uid, p as Partial<Item>);
  return (
    <div className="space-y-3">
      <div>
        <label className={ui.label}>Imagem</label>
        <button type="button" className={`${ui.btnGhost} mt-1 w-full justify-center`} onClick={onTrocarImagem}>
          {item.url ? 'Trocar imagem' : 'Escolher imagem'}
        </button>
        {item.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt="Pré-visualização da imagem do certificado"
            className="mt-2 max-h-24 rounded border border-border object-contain"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LinhaNum id="pf-larg" label="Largura (pt)" min={1} value={item.largura} onChange={(v) => set({ largura: v })} />
        <LinhaNum id="pf-alt" label="Altura (pt)" min={1} value={item.altura} onChange={(v) => set({ altura: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LinhaNum id="pf-x" label="Pos. X" value={item.posX} onChange={(v) => set({ posX: v })} />
        <LinhaNum id="pf-y" label="Pos. Y" value={item.posY} onChange={(v) => set({ posY: v })} />
      </div>

      <BotaoRemover onClick={() => remover(item.uid)} />
    </div>
  );
}

function PainelElemento({
  item,
  patch,
  remover,
}: {
  item: ItemElemento;
  patch: (uid: string, p: Partial<Item>) => void;
  remover: (uid: string) => void;
}) {
  const set = (p: Partial<ItemElemento>) => patch(item.uid, p as Partial<Item>);
  const ehLinha = item.tipo === 'linha' || item.tipo === 'assinatura';
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="pe-tipo" className={ui.label}>
          Tipo
        </label>
        <select
          id="pe-tipo"
          className={ui.input}
          value={item.tipo}
          onChange={(e) => set({ tipo: e.target.value as ItemElemento['tipo'] })}
        >
          {TIPOS_ELEMENTO.map((t) => (
            <option key={t.v} value={t.v}>
              {t.l}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LinhaNum id="pe-larg" label="Largura (pt)" min={1} value={item.largura} onChange={(v) => set({ largura: v })} />
        <LinhaNum
          id="pe-alt"
          label="Altura (pt)"
          min={ehLinha ? 0 : 1}
          value={item.altura}
          onChange={(v) => set({ altura: v })}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <LinhaNum id="pe-x" label="Pos. X" value={item.posX} onChange={(v) => set({ posX: v })} />
        <LinhaNum id="pe-y" label="Pos. Y" value={item.posY} onChange={(v) => set({ posY: v })} />
      </div>

      {item.tipo !== 'qr' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="pe-cor" className={ui.label}>
              Cor
            </label>
            <input
              id="pe-cor"
              type="color"
              className="h-9 w-full rounded border border-border"
              value={item.cor}
              onChange={(e) => set({ cor: e.target.value })}
            />
          </div>
          <LinhaNum
            id="pe-esp"
            label="Espessura"
            min={1}
            value={item.espessura}
            onChange={(v) => set({ espessura: v })}
          />
        </div>
      )}

      <p className="text-xs text-fg/55">
        {item.tipo === 'qr'
          ? 'O QR Code é gerado automaticamente na emissão com o código de validação.'
          : item.tipo === 'assinatura'
            ? 'Linha de assinatura: o nome/cargo do signatário é composto no PDF.'
            : 'A cor e espessura são guardadas em config e aplicadas no PDF.'}
      </p>

      <BotaoRemover onClick={() => remover(item.uid)} />
    </div>
  );
}
