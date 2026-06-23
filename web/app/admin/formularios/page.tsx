'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react';
import {
  AdminApiError,
  adminDelete,
  adminGet,
  adminPatch,
  adminPost,
  adminPut,
  qs,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import { apiBase } from '../../../lib/auth-shared';
import { useSessaoAdmin } from '../../../lib/session-context';
import { escopoRestrito } from '../../../lib/roles';
import {
  CampoFormulario,
  FormularioDetalhe,
  FormularioResumo,
  LarguraCampo,
  OpcaoCampo,
  TipoCampo,
  TIPO_LABEL,
  ValidacaoCampo,
  gerarIdCampo,
  labelToNome,
  EnvioResumo,
  EnvioDetalhe,
  PaginaEnvios,
  AnexoEnvio,
} from '../../../lib/formularios';

// ─── Constantes ───────────────────────────────────────────────────────────────

const TIPOS_PALETA: TipoCampo[] = [
  'texto',
  'textarea',
  'email',
  'telefone',
  'cpf',
  'numero',
  'data',
  'select',
  'radio',
  'checkbox',
  'upload',
  'secao',
  'paragrafo',
];

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho',
  publicado: 'Publicado',
  encerrado: 'Encerrado',
};

const STATUS_CLASS: Record<string, string> = {
  rascunho: 'bg-muted text-fg/60',
  publicado: 'bg-success/20 text-success',
  encerrado: 'bg-danger/10 text-danger',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function campoVazio(tipo: TipoCampo): CampoFormulario {
  const label = TIPO_LABEL[tipo];
  return {
    id: gerarIdCampo(),
    tipo,
    label,
    nome: labelToNome(label) + '_' + gerarIdCampo().substring(0, 4),
    obrigatorio: false,
    largura: 'full',
  };
}

function formatarData(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─── Painel de Propriedades do Campo ─────────────────────────────────────────

function PainelPropriedades({
  campo,
  todosNomes,
  onChange,
  onFechar,
}: {
  campo: CampoFormulario;
  todosNomes: string[];
  onChange: (c: CampoFormulario) => void;
  onFechar: () => void;
}) {
  const idBase = useId();

  function set<K extends keyof CampoFormulario>(k: K, v: CampoFormulario[K]) {
    onChange({ ...campo, [k]: v } as CampoFormulario);
  }

  function setValidacao(k: keyof ValidacaoCampo, v: ValidacaoCampo[keyof ValidacaoCampo]) {
    onChange({ ...campo, validacao: { ...(campo.validacao ?? {}), [k]: v || undefined } } as CampoFormulario);
  }

  function nomeUnico(nome: string) {
    return !todosNomes.filter((n) => n !== campo.nome).includes(nome);
  }

  function adicionarOpcao() {
    const opcoes = [...(campo.opcoes ?? []), { label: '', valor: '' }];
    onChange({ ...campo, opcoes });
  }

  function removerOpcao(idx: number) {
    const opcoes = (campo.opcoes ?? []).filter((_, i) => i !== idx);
    onChange({ ...campo, opcoes });
  }

  function setOpcao(idx: number, k: keyof OpcaoCampo, v: string) {
    const opcoes = (campo.opcoes ?? []).map((o, i) =>
      i === idx ? { ...o, [k]: v } : o,
    );
    onChange({ ...campo, opcoes });
  }

  const comOpcoes = ['select', 'radio', 'checkbox'].includes(campo.tipo);
  const ehUpload = campo.tipo === 'upload';
  const ehEstatico = campo.tipo === 'secao' || campo.tipo === 'paragrafo';

  return (
    <aside
      className="flex flex-col gap-4 overflow-y-auto rounded border border-border bg-bg p-4"
      aria-label="Propriedades do campo"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Propriedades: {TIPO_LABEL[campo.tipo]}</h3>
        <button
          type="button"
          onClick={onFechar}
          className="rounded p-1 text-fg/50 hover:bg-muted"
          aria-label="Fechar painel de propriedades"
        >
          ✕
        </button>
      </div>

      {/* Label */}
      <div>
        <label htmlFor={`${idBase}-label`} className={ui.label}>
          {ehEstatico ? 'Conteúdo' : 'Rótulo (label)'} <span aria-hidden="true">*</span>
        </label>
        {ehEstatico && campo.tipo === 'paragrafo' ? (
          <textarea
            id={`${idBase}-label`}
            className={`${ui.input} mt-1 min-h-[80px] resize-y`}
            value={campo.label}
            onChange={(e) => set('label', e.target.value)}
            aria-required="true"
          />
        ) : (
          <input
            id={`${idBase}-label`}
            className={`${ui.input} mt-1`}
            value={campo.label}
            onChange={(e) => set('label', e.target.value)}
            required
            aria-required="true"
          />
        )}
      </div>

      {/* Nome (chave snake) */}
      {!ehEstatico && (
        <div>
          <label htmlFor={`${idBase}-nome`} className={ui.label}>
            Nome (chave interna)
          </label>
          <input
            id={`${idBase}-nome`}
            className={`${ui.input} mt-1 font-mono text-xs`}
            value={campo.nome}
            onChange={(e) => {
              const v = e.target.value.replace(/[^a-z0-9_]/g, '').substring(0, 60);
              set('nome', v);
            }}
            pattern="[a-z0-9_]+"
            aria-describedby={`${idBase}-nome-desc`}
          />
          {!nomeUnico(campo.nome) && (
            <p id={`${idBase}-nome-desc`} className="mt-1 text-xs text-danger" role="alert">
              Este nome já está em uso por outro campo.
            </p>
          )}
        </div>
      )}

      {/* Placeholder */}
      {!ehEstatico && campo.tipo !== 'data' && campo.tipo !== 'checkbox' && (
        <div>
          <label htmlFor={`${idBase}-placeholder`} className={ui.label}>
            Placeholder
          </label>
          <input
            id={`${idBase}-placeholder`}
            className={`${ui.input} mt-1`}
            value={campo.placeholder ?? ''}
            onChange={(e) => set('placeholder', e.target.value || undefined)}
          />
        </div>
      )}

      {/* Ajuda */}
      {!ehEstatico && (
        <div>
          <label htmlFor={`${idBase}-ajuda`} className={ui.label}>
            Texto de ajuda
          </label>
          <input
            id={`${idBase}-ajuda`}
            className={`${ui.input} mt-1`}
            value={campo.ajuda ?? ''}
            onChange={(e) => set('ajuda', e.target.value || undefined)}
          />
        </div>
      )}

      {/* Obrigatório + largura */}
      {!ehEstatico && (
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
              checked={campo.obrigatorio}
              onChange={(e) => set('obrigatorio', e.target.checked)}
            />
            <span className="text-sm font-semibold">Obrigatório</span>
          </label>

          <div>
            <label htmlFor={`${idBase}-largura`} className={ui.label}>
              Largura
            </label>
            <select
              id={`${idBase}-largura`}
              className={`${ui.input} mt-1`}
              value={campo.largura}
              onChange={(e) => set('largura', e.target.value as LarguraCampo)}
            >
              <option value="full">Largura total</option>
              <option value="half">Meia largura</option>
            </select>
          </div>
        </div>
      )}

      {/* Opções (select / radio / checkbox) */}
      {comOpcoes && (
        <fieldset className="space-y-2">
          <legend className={ui.label}>Opções</legend>
          {(campo.opcoes ?? []).map((op, idx) => (
            <div key={idx} className="flex gap-2 items-center">
              <input
                className={`${ui.input} flex-1`}
                placeholder="Label"
                value={op.label}
                onChange={(e) => setOpcao(idx, 'label', e.target.value)}
                aria-label={`Opção ${idx + 1} — rótulo`}
              />
              <input
                className={`${ui.input} w-28 font-mono text-xs`}
                placeholder="valor"
                value={op.valor}
                onChange={(e) => setOpcao(idx, 'valor', e.target.value.replace(/\s+/g, '_'))}
                aria-label={`Opção ${idx + 1} — valor`}
              />
              <button
                type="button"
                className={ui.btnDanger}
                onClick={() => removerOpcao(idx)}
                aria-label={`Remover opção ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" className={ui.btnGhost} onClick={adicionarOpcao}>
            + Adicionar opção
          </button>
        </fieldset>
      )}

      {/* Validação */}
      {!ehEstatico && !ehUpload && (
        <fieldset className="space-y-2 rounded border border-border p-3">
          <legend className={ui.label}>Validação</legend>
          {(campo.tipo === 'texto' || campo.tipo === 'textarea') && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor={`${idBase}-minLen`} className="text-xs font-semibold">
                  Mín. caracteres
                </label>
                <input
                  id={`${idBase}-minLen`}
                  type="number"
                  min={0}
                  className={`${ui.input} mt-1`}
                  value={campo.validacao?.minLength ?? ''}
                  onChange={(e) =>
                    setValidacao('minLength', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>
              <div>
                <label htmlFor={`${idBase}-maxLen`} className="text-xs font-semibold">
                  Máx. caracteres
                </label>
                <input
                  id={`${idBase}-maxLen`}
                  type="number"
                  min={0}
                  className={`${ui.input} mt-1`}
                  value={campo.validacao?.maxLength ?? ''}
                  onChange={(e) =>
                    setValidacao('maxLength', e.target.value ? Number(e.target.value) : undefined)
                  }
                />
              </div>
            </div>
          )}
          <div>
            <label htmlFor={`${idBase}-regex`} className="text-xs font-semibold">
              Regex personalizado
            </label>
            <input
              id={`${idBase}-regex`}
              className={`${ui.input} mt-1 font-mono text-xs`}
              placeholder="^[A-Z].*"
              value={campo.validacao?.regex ?? ''}
              onChange={(e) => setValidacao('regex', e.target.value || undefined)}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-msg`} className="text-xs font-semibold">
              Mensagem de erro
            </label>
            <input
              id={`${idBase}-msg`}
              className={`${ui.input} mt-1`}
              value={campo.validacao?.mensagem ?? ''}
              onChange={(e) => setValidacao('mensagem', e.target.value || undefined)}
            />
          </div>
        </fieldset>
      )}

      {/* Upload */}
      {ehUpload && (
        <fieldset className="space-y-2 rounded border border-border p-3">
          <legend className={ui.label}>Configuração de upload</legend>
          <div>
            <label htmlFor={`${idBase}-accept`} className="text-xs font-semibold">
              Tipos aceitos (MIME / extensão)
            </label>
            <input
              id={`${idBase}-accept`}
              className={`${ui.input} mt-1 font-mono text-xs`}
              placeholder="image/*,.pdf"
              value={campo.accept ?? ''}
              onChange={(e) => set('accept', e.target.value || undefined)}
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-maxMb`} className="text-xs font-semibold">
              Tamanho máximo (MB)
            </label>
            <input
              id={`${idBase}-maxMb`}
              type="number"
              min={1}
              className={`${ui.input} mt-1`}
              value={campo.maxTamanhoMb ?? ''}
              onChange={(e) =>
                set('maxTamanhoMb', e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
              checked={campo.multiplos ?? false}
              onChange={(e) => set('multiplos', e.target.checked || undefined)}
            />
            <span className="text-sm font-semibold">Permitir múltiplos arquivos</span>
          </label>
        </fieldset>
      )}
    </aside>
  );
}

// ─── Item do Canvas ───────────────────────────────────────────────────────────

function ItemCanvas({
  campo,
  idx,
  total,
  selecionado,
  onSelecionar,
  onMover,
  onRemover,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  campo: CampoFormulario;
  idx: number;
  total: number;
  selecionado: boolean;
  onSelecionar: () => void;
  onMover: (de: number, para: number) => void;
  onRemover: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, idx: number) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>, idx: number) => void;
  onDrop: (e: DragEvent<HTMLDivElement>, idx: number) => void;
}) {
  const ehEstatico = campo.tipo === 'secao' || campo.tipo === 'paragrafo';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, idx)}
      onDragOver={(e) => onDragOver(e, idx)}
      onDrop={(e) => onDrop(e, idx)}
      className={[
        'group relative flex items-center gap-2 rounded border p-3 transition-colors cursor-grab active:cursor-grabbing',
        selecionado
          ? 'border-primary bg-primary/5 shadow-sm'
          : 'border-border bg-bg hover:border-primary/50',
      ].join(' ')}
      role="listitem"
    >
      {/* Handle de arrastar */}
      <span
        className="text-fg/30 group-hover:text-fg/60 select-none"
        aria-hidden="true"
        title="Arraste para reordenar"
      >
        ⠿
      </span>

      {/* Info do campo */}
      <button
        type="button"
        className="flex-1 text-left"
        onClick={onSelecionar}
        aria-pressed={selecionado}
        aria-label={`Editar campo: ${campo.label}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold line-clamp-1">{campo.label || '(sem rótulo)'}</span>
          {!ehEstatico && campo.obrigatorio && (
            <span className="text-danger text-xs font-bold" title="Obrigatório">*</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`${ui.badge} bg-secondary/10 text-secondary`}>{TIPO_LABEL[campo.tipo]}</span>
          {!ehEstatico && (
            <span className="text-xs text-fg/50 font-mono">{campo.nome}</span>
          )}
        </div>
      </button>

      {/* Botões de controle acessíveis */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <button
          type="button"
          disabled={idx === 0}
          onClick={() => onMover(idx, idx - 1)}
          className="rounded p-1 text-fg/50 hover:bg-muted disabled:opacity-30"
          aria-label={`Mover campo ${campo.label} para cima`}
          title="Mover para cima"
        >
          ↑
        </button>
        <button
          type="button"
          disabled={idx === total - 1}
          onClick={() => onMover(idx, idx + 1)}
          className="rounded p-1 text-fg/50 hover:bg-muted disabled:opacity-30"
          aria-label={`Mover campo ${campo.label} para baixo`}
          title="Mover para baixo"
        >
          ↓
        </button>
        <button
          type="button"
          onClick={onRemover}
          className="rounded p-1 text-danger hover:bg-danger/10"
          aria-label={`Remover campo ${campo.label}`}
          title="Remover"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── Construtor Visual ────────────────────────────────────────────────────────

interface ConfigForm {
  titulo: string;
  descricao: string;
  status: string;
  mensagemConfirmacao: string;
  redirecionarUrl: string;
  loginObrigatorio: boolean;
  multiplosEnvios: boolean;
  captchaHabilitado: boolean;
  notificarEmails: string;
  notificarCc: string;
  notificarBcc: string;
}

function ConstrutorFormulario({
  formulario,
  onSalvo,
  onVoltar,
}: {
  formulario: FormularioDetalhe;
  onSalvo: () => void;
  onVoltar: () => void;
}) {
  const idBase = useId();
  const [schema, setSchema] = useState<CampoFormulario[]>(formulario.schema ?? []);
  const [campoCampoSelecionado, setCampoCampoSelecionado] = useState<string | null>(null);
  const [aba, setAba] = useState<'campos' | 'config'>('campos');
  const [config, setConfig] = useState<ConfigForm>({
    titulo: formulario.titulo,
    descricao: formulario.descricao ?? '',
    status: formulario.status,
    mensagemConfirmacao: formulario.mensagemConfirmacao ?? '',
    redirecionarUrl: formulario.redirecionarUrl ?? '',
    loginObrigatorio: formulario.loginObrigatorio,
    multiplosEnvios: formulario.multiplosEnvios,
    captchaHabilitado: formulario.captchaHabilitado,
    notificarEmails: (formulario.notificarEmails ?? []).join(', '),
    notificarCc: (formulario.notificarCc ?? []).join(', '),
    notificarBcc: (formulario.notificarBcc ?? []).join(', '),
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [copiado, setCopiado] = useState(false);

  // Drag-drop: referência ao índice sendo arrastado
  const dragIdxRef = useRef<number | null>(null);
  // Tipo sendo arrastado da paleta
  const dragTipoRef = useRef<TipoCampo | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const campoSelecionado = schema.find((c) => c.id === campoCampoSelecionado) ?? null;
  const todosNomes = schema.map((c) => c.nome);

  // ── Drag-drop da PALETA → canvas ──────────────────────────────────────────

  function handlePaletteDragStart(tipo: TipoCampo) {
    dragTipoRef.current = tipo;
    dragIdxRef.current = null;
  }

  // ── Drag-drop REORDENAR ──────────────────────────────────────────────────

  function handleItemDragStart(e: DragEvent<HTMLDivElement>, idx: number) {
    dragIdxRef.current = idx;
    dragTipoRef.current = null;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleItemDragOver(e: DragEvent<HTMLDivElement>, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTipoRef.current ? 'copy' : 'move';
    setDragOverIdx(idx);
  }

  function handleCanvasDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = dragTipoRef.current ? 'copy' : 'move';
  }

  function handleItemDrop(e: DragEvent<HTMLDivElement>, paraIdx: number) {
    e.preventDefault();
    setDragOverIdx(null);

    if (dragTipoRef.current) {
      // Arrastar da paleta → inserir no índice
      const novo = campoVazio(dragTipoRef.current);
      dragTipoRef.current = null;
      setSchema((prev) => {
        const next = [...prev];
        next.splice(paraIdx, 0, novo);
        return next;
      });
      setCampoCampoSelecionado(novo.id);
      return;
    }

    if (dragIdxRef.current === null || dragIdxRef.current === paraIdx) return;
    const deIdx = dragIdxRef.current;
    dragIdxRef.current = null;

    setSchema((prev) => {
      const next = [...prev];
      const removed = next.splice(deIdx, 1);
      const item = removed[0];
      if (!item) return next;
      next.splice(paraIdx, 0, item);
      return next;
    });
  }

  function handleCanvasDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOverIdx(null);

    if (dragTipoRef.current) {
      // Soltar no canvas vazio ou no final
      const novo = campoVazio(dragTipoRef.current);
      dragTipoRef.current = null;
      setSchema((prev) => [...prev, novo]);
      setCampoCampoSelecionado(novo.id);
      return;
    }

    dragIdxRef.current = null;
  }

  // ── Manipular schema ─────────────────────────────────────────────────────

  function adicionarCampo(tipo: TipoCampo) {
    const novo = campoVazio(tipo);
    setSchema((prev) => [...prev, novo]);
    setCampoCampoSelecionado(novo.id);
  }

  function atualizarCampo(campo: CampoFormulario) {
    setSchema((prev) => prev.map((c) => (c.id === campo.id ? campo : c)));
  }

  function removerCampo(id: string) {
    setSchema((prev) => prev.filter((c) => c.id !== id));
    if (campoCampoSelecionado === id) setCampoCampoSelecionado(null);
  }

  function moverCampo(de: number, para: number) {
    setSchema((prev) => {
      const next = [...prev];
      const removed = next.splice(de, 1);
      const item = removed[0];
      if (!item) return next;
      next.splice(para, 0, item);
      return next;
    });
  }

  // ── Salvar ───────────────────────────────────────────────────────────────

  function emailsArray(s: string): string[] {
    return s
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async function salvar() {
    if (!config.titulo.trim()) {
      setErro('O título do formulário é obrigatório.');
      setAba('config');
      return;
    }
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      await adminPut(`/api/admin/formularios/${formulario.id}`, {
        titulo: config.titulo.trim(),
        descricao: config.descricao.trim() || undefined,
        schema,
        status: config.status,
        mensagemConfirmacao: config.mensagemConfirmacao.trim() || undefined,
        redirecionarUrl: config.redirecionarUrl.trim() || undefined,
        loginObrigatorio: config.loginObrigatorio,
        multiplosEnvios: config.multiplosEnvios,
        captchaHabilitado: config.captchaHabilitado,
        notificarEmails: emailsArray(config.notificarEmails),
        notificarCc: emailsArray(config.notificarCc),
        notificarBcc: emailsArray(config.notificarBcc),
      });
      setMsgOk('Formulário salvo com sucesso.');
      onSalvo();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar formulário.');
    } finally {
      setSalvando(false);
    }
  }

  async function copiarSlug() {
    const url = `${window.location.origin}/formularios/${formulario.slug}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onVoltar} className={ui.btnGhost} aria-label="Voltar para lista">
            ← Voltar
          </button>
          <h2 className="font-heading text-lg font-bold">
            {config.titulo || 'Novo formulário'}
          </h2>
          <span className={`${ui.badge} ${STATUS_CLASS[config.status] ?? 'bg-muted text-fg/60'}`}>
            {STATUS_LABEL[config.status] ?? config.status}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {formulario.status === 'publicado' && (
            <button type="button" onClick={copiarSlug} className={ui.btnGhost}>
              {copiado ? 'Copiado!' : 'Copiar URL pública'}
            </button>
          )}
          <button type="button" onClick={salvar} disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar formulário'}
          </button>
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

      {/* Abas */}
      <div className="flex gap-1 border-b border-border" role="tablist" aria-label="Seções do construtor">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'campos'}
          onClick={() => setAba('campos')}
          className={[
            'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
            aba === 'campos'
              ? 'border-primary text-primary'
              : 'border-transparent text-fg/60 hover:text-fg',
          ].join(' ')}
        >
          Campos ({schema.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'config'}
          onClick={() => setAba('config')}
          className={[
            'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
            aba === 'config'
              ? 'border-primary text-primary'
              : 'border-transparent text-fg/60 hover:text-fg',
          ].join(' ')}
        >
          Configuração
        </button>
      </div>

      {/* ABA: CAMPOS */}
      {aba === 'campos' && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr_300px] gap-4 min-h-[500px]">
          {/* Paleta */}
          <aside aria-label="Paleta de tipos de campo" className="flex flex-col gap-1 rounded border border-border bg-bg p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-fg/50 mb-2">
              Tipos de campo
            </h3>
            {TIPOS_PALETA.map((tipo) => (
              <div
                key={tipo}
                draggable
                onDragStart={() => handlePaletteDragStart(tipo)}
                className="flex items-center gap-2 rounded border border-border/50 bg-bg px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing hover:border-primary/60 hover:bg-primary/5 transition-colors select-none"
                role="button"
                tabIndex={0}
                aria-label={`Adicionar campo ${TIPO_LABEL[tipo]}`}
                onClick={() => adicionarCampo(tipo)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    adicionarCampo(tipo);
                  }
                }}
              >
                <span className="text-fg/40 select-none" aria-hidden="true">⠿</span>
                {TIPO_LABEL[tipo]}
              </div>
            ))}
            <p className="mt-3 text-xs text-fg/50">
              Arraste para o canvas ou clique para adicionar ao final.
            </p>
          </aside>

          {/* Canvas */}
          <div
            className={[
              'flex flex-col gap-2 rounded border-2 border-dashed p-3 min-h-[400px] transition-colors',
              schema.length === 0 ? 'border-border/50 bg-muted/20' : 'border-border',
            ].join(' ')}
            onDragOver={handleCanvasDragOver}
            onDrop={handleCanvasDrop}
            aria-label="Canvas do formulário — arraste campos aqui"
            role="list"
          >
            {schema.length === 0 && (
              <p className="m-auto text-sm text-fg/50 text-center">
                Arraste um tipo da paleta ou clique em um para adicionar campos.
              </p>
            )}
            {schema.map((campo, idx) => (
              <div
                key={campo.id}
                className={dragOverIdx === idx ? 'ring-2 ring-primary ring-offset-1 rounded' : ''}
              >
                <ItemCanvas
                  campo={campo}
                  idx={idx}
                  total={schema.length}
                  selecionado={campoCampoSelecionado === campo.id}
                  onSelecionar={() =>
                    setCampoCampoSelecionado((prev) => (prev === campo.id ? null : campo.id))
                  }
                  onMover={moverCampo}
                  onRemover={() => removerCampo(campo.id)}
                  onDragStart={handleItemDragStart}
                  onDragOver={handleItemDragOver}
                  onDrop={handleItemDrop}
                />
              </div>
            ))}
          </div>

          {/* Painel de propriedades */}
          {campoSelecionado ? (
            <PainelPropriedades
              campo={campoSelecionado}
              todosNomes={todosNomes}
              onChange={atualizarCampo}
              onFechar={() => setCampoCampoSelecionado(null)}
            />
          ) : (
            <div className="hidden lg:flex items-center justify-center rounded border border-dashed border-border/50 bg-muted/10 text-sm text-fg/40 text-center p-4">
              Clique em um campo para editar suas propriedades
            </div>
          )}
        </div>
      )}

      {/* ABA: CONFIGURAÇÃO */}
      {aba === 'config' && (
        <div className="max-w-2xl space-y-4">
          {/* Título */}
          <div>
            <label htmlFor={`${idBase}-cfg-titulo`} className={ui.label}>
              Título <span aria-hidden="true">*</span>
            </label>
            <input
              id={`${idBase}-cfg-titulo`}
              className={`${ui.input} mt-1`}
              value={config.titulo}
              onChange={(e) => setConfig((p) => ({ ...p, titulo: e.target.value }))}
              required
              aria-required="true"
            />
          </div>

          {/* Descrição */}
          <div>
            <label htmlFor={`${idBase}-cfg-descricao`} className={ui.label}>
              Descrição
            </label>
            <textarea
              id={`${idBase}-cfg-descricao`}
              className={`${ui.input} mt-1 min-h-[80px] resize-y`}
              value={config.descricao}
              onChange={(e) => setConfig((p) => ({ ...p, descricao: e.target.value }))}
            />
          </div>

          {/* Status */}
          <div>
            <label htmlFor={`${idBase}-cfg-status`} className={ui.label}>
              Status de publicação
            </label>
            <select
              id={`${idBase}-cfg-status`}
              className={`${ui.input} mt-1`}
              value={config.status}
              onChange={(e) => setConfig((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="rascunho">Rascunho</option>
              <option value="publicado">Publicado</option>
              <option value="encerrado">Encerrado</option>
            </select>
          </div>

          {/* URL pública */}
          {config.status === 'publicado' && (
            <div className="flex items-center gap-2 rounded border border-success/30 bg-success/5 p-3">
              <span className="text-sm text-fg/70">URL pública:</span>
              <code className="flex-1 text-xs font-mono text-success">
                /formularios/{formulario.slug}
              </code>
              <button type="button" onClick={copiarSlug} className={ui.btnGhost}>
                {copiado ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          )}

          {/* Mensagem de confirmação */}
          <div>
            <label htmlFor={`${idBase}-cfg-msg`} className={ui.label}>
              Mensagem de confirmação após envio
            </label>
            <textarea
              id={`${idBase}-cfg-msg`}
              className={`${ui.input} mt-1 min-h-[80px] resize-y`}
              value={config.mensagemConfirmacao}
              placeholder="Obrigado! Seu formulário foi enviado com sucesso."
              onChange={(e) => setConfig((p) => ({ ...p, mensagemConfirmacao: e.target.value }))}
            />
          </div>

          {/* Redirecionar URL */}
          <div>
            <label htmlFor={`${idBase}-cfg-redirect`} className={ui.label}>
              Redirecionar para (após envio, opcional)
            </label>
            <input
              id={`${idBase}-cfg-redirect`}
              type="url"
              className={`${ui.input} mt-1`}
              placeholder="https://…"
              value={config.redirecionarUrl}
              onChange={(e) => setConfig((p) => ({ ...p, redirecionarUrl: e.target.value }))}
            />
          </div>

          {/* Checkboxes de opção */}
          <fieldset className="space-y-2 rounded border border-border p-3">
            <legend className={ui.label}>Opções de envio</legend>
            {(
              [
                { key: 'loginObrigatorio', label: 'Exigir login do cidadão para enviar' },
                { key: 'multiplosEnvios', label: 'Permitir múltiplos envios por usuário' },
                { key: 'captchaHabilitado', label: 'Habilitar desafio anti-spam (CAPTCHA)' },
              ] as Array<{ key: keyof ConfigForm; label: string }>
            ).map(({ key, label }) => {
              const inputId = `${idBase}-cfg-${key}`;
              return (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    id={inputId}
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                    checked={config[key] as boolean}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, [key]: e.target.checked } as ConfigForm))
                    }
                  />
                  <span className="text-sm">{label}</span>
                </label>
              );
            })}
          </fieldset>

          {/* Notificações */}
          <fieldset className="space-y-3 rounded border border-border p-3">
            <legend className={ui.label}>Notificações por e-mail</legend>
            <p className="text-xs text-fg/60">Separe múltiplos endereços por vírgula ou ponto-e-vírgula.</p>
            {(
              [
                { key: 'notificarEmails', label: 'Destinatários (Para)' },
                { key: 'notificarCc', label: 'Cópia (CC)' },
                { key: 'notificarBcc', label: 'Cópia oculta (BCC)' },
              ] as Array<{ key: keyof ConfigForm; label: string }>
            ).map(({ key, label }) => {
              const inputId = `${idBase}-cfg-${key}`;
              return (
                <div key={key}>
                  <label htmlFor={inputId} className="text-xs font-semibold">
                    {label}
                  </label>
                  <input
                    id={inputId}
                    type="text"
                    className={`${ui.input} mt-1`}
                    placeholder="email@exemplo.com, outro@exemplo.com"
                    value={config[key] as string}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, [key]: e.target.value } as ConfigForm))
                    }
                  />
                </div>
              );
            })}
          </fieldset>

          <div className="flex justify-end pt-2">
            <button type="button" onClick={salvar} disabled={salvando} className={ui.btn}>
              {salvando ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gestor de Envios ─────────────────────────────────────────────────────────

function GestorEnvios({
  formulario,
  onVoltar,
}: {
  formulario: FormularioDetalhe;
  onVoltar: () => void;
}) {
  const [pagina, setPagina] = useState<PaginaEnvios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [filtroQ, setFiltroQ] = useState('');
  const [filtroDe, setFiltroDe] = useState('');
  const [filtroAte, setFiltroAte] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [envioDetalhe, setEnvioDetalhe] = useState<EnvioDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [marcandoLido, setMarcandoLido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params = qs({ q: filtroQ, de: filtroDe, ate: filtroAte, page, pageSize });
      const res = await adminGet<PaginaEnvios>(
        `/api/admin/formularios/${formulario.id}/envios${params}`,
      );
      setPagina(res);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar envios.');
    } finally {
      setCarregando(false);
    }
  }, [formulario.id, filtroQ, filtroDe, filtroAte, page, pageSize]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirDetalhe(id: string) {
    setCarregandoDetalhe(true);
    try {
      const det = await adminGet<EnvioDetalhe>(
        `/api/admin/formularios/${formulario.id}/envios/${id}`,
      );
      setEnvioDetalhe(det);
      // Marca como lido se não estava
      if (!det.lido) {
        await adminPatch(`/api/admin/formularios/${formulario.id}/envios/${id}`, { lido: true }).catch(() => {});
        carregar();
      }
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar envio.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function excluirEnvio(id: string) {
    if (!window.confirm('Excluir este envio? A ação não pode ser desfeita.')) return;
    setExcluindo(id);
    try {
      await adminDelete(`/api/admin/formularios/${formulario.id}/envios/${id}`);
      if (envioDetalhe?.id === id) setEnvioDetalhe(null);
      carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir envio.');
    } finally {
      setExcluindo(null);
    }
  }

  async function toggleLido(envio: EnvioResumo) {
    setMarcandoLido(envio.id);
    try {
      await adminPatch(`/api/admin/formularios/${formulario.id}/envios/${envio.id}`, {
        lido: !envio.lido,
      });
      carregar();
    } catch {
      // silencioso
    } finally {
      setMarcandoLido(null);
    }
  }

  // Colunas dinâmicas a partir do schema
  const colunasSchema = formulario.schema.filter(
    (c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo',
  );
  const totalPaginas = pagina ? Math.ceil(pagina.total / pageSize) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <button type="button" onClick={onVoltar} className={ui.btnGhost}>
            ← Voltar
          </button>
          <h2 className="font-heading text-lg font-bold">
            Envios: {formulario.titulo}
          </h2>
          {pagina && (
            <span className={`${ui.badge} bg-primary/10 text-primary`}>
              {pagina.total}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`${apiBase}/api/admin/formularios/${formulario.id}/export?formato=csv`}
            className={ui.btnGhost}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Exportar envios em CSV"
          >
            Exportar CSV
          </a>
          <a
            href={`${apiBase}/api/admin/formularios/${formulario.id}/export?formato=xml`}
            className={ui.btnGhost}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Exportar envios em XML"
          >
            Exportar XML
          </a>
          <a
            href={`${apiBase}/api/admin/formularios/${formulario.id}/export?formato=xlsx`}
            className={ui.btnGhost}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Exportar envios em Excel"
          >
            Exportar Excel
          </a>
        </div>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Filtros */}
      <form
        className="flex flex-wrap gap-2 items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(1);
          carregar();
        }}
      >
        <div>
          <label htmlFor="filtro-q" className="text-xs font-semibold">Busca</label>
          <input
            id="filtro-q"
            className={`${ui.input} mt-1`}
            placeholder="Buscar…"
            value={filtroQ}
            onChange={(e) => setFiltroQ(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filtro-de" className="text-xs font-semibold">De</label>
          <input
            id="filtro-de"
            type="date"
            className={`${ui.input} mt-1`}
            value={filtroDe}
            onChange={(e) => setFiltroDe(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="filtro-ate" className="text-xs font-semibold">Até</label>
          <input
            id="filtro-ate"
            type="date"
            className={`${ui.input} mt-1`}
            value={filtroAte}
            onChange={(e) => setFiltroAte(e.target.value)}
          />
        </div>
        <button type="submit" className={ui.btn}>Filtrar</button>
        <button
          type="button"
          className={ui.btnGhost}
          onClick={() => {
            setFiltroQ('');
            setFiltroDe('');
            setFiltroAte('');
            setPage(1);
          }}
        >
          Limpar
        </button>
      </form>

      {/* Tabela */}
      <section aria-label="Tabela de envios" aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">Carregando…</p>
        ) : !pagina || pagina.items.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">Nenhum envio encontrado.</p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full border-collapse min-w-[600px]">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Data</th>
                  <th className={ui.th} scope="col">Cidadão</th>
                  {colunasSchema.slice(0, 3).map((c) => (
                    <th key={c.id} className={ui.th} scope="col">{c.label}</th>
                  ))}
                  <th className={ui.th} scope="col">Lido</th>
                  <th className={ui.th} scope="col">Anexos</th>
                  <th className={ui.th} scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {pagina.items.map((envio) => (
                  <tr
                    key={envio.id}
                    className={`hover:bg-muted/30 transition-colors ${!envio.lido ? 'font-semibold' : ''}`}
                  >
                    <td className={ui.td}>{formatarData(envio.criadoEm)}</td>
                    <td className={ui.td}>{envio.cidadaoNome ?? '—'}</td>
                    {colunasSchema.slice(0, 3).map((c) => (
                      <td key={c.id} className={`${ui.td} max-w-[160px]`}>
                        <span className="line-clamp-2 text-fg/80">
                          {String(envio.dados[c.nome] ?? '—')}
                        </span>
                      </td>
                    ))}
                    <td className={ui.td}>
                      <button
                        type="button"
                        disabled={marcandoLido === envio.id}
                        onClick={() => toggleLido(envio)}
                        className={`${ui.badge} cursor-pointer ${envio.lido ? 'bg-muted text-fg/50' : 'bg-warning/20 text-warning'}`}
                        aria-label={envio.lido ? 'Marcar como não lido' : 'Marcar como lido'}
                        title={envio.lido ? 'Lido' : 'Não lido'}
                      >
                        {envio.lido ? 'Lido' : 'Novo'}
                      </button>
                    </td>
                    <td className={ui.td}>
                      {envio.temAnexos ? (
                        <span className={`${ui.badge} bg-secondary/10 text-secondary`}>Sim</span>
                      ) : (
                        <span className="text-fg/40 text-xs">—</span>
                      )}
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={carregandoDetalhe}
                          onClick={() => abrirDetalhe(envio.id)}
                          className={ui.btnGhost}
                          aria-label={`Ver detalhe do envio de ${envio.cidadaoNome ?? envio.id}`}
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          disabled={excluindo === envio.id}
                          onClick={() => excluirEnvio(envio.id)}
                          className={ui.btnDanger}
                          aria-label={`Excluir envio de ${envio.cidadaoNome ?? envio.id}`}
                        >
                          {excluindo === envio.id ? '…' : 'Excluir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <nav className="flex gap-2 justify-center" aria-label="Paginação dos envios">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className={ui.btnGhost}
            aria-label="Página anterior"
          >
            ← Anterior
          </button>
          <span className="flex items-center text-sm text-fg/60">
            Página {page} de {totalPaginas}
          </span>
          <button
            type="button"
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
            className={ui.btnGhost}
            aria-label="Próxima página"
          >
            Próxima →
          </button>
        </nav>
      )}

      {/* Modal de detalhe */}
      <Modal
        open={envioDetalhe !== null}
        onClose={() => setEnvioDetalhe(null)}
        title="Detalhe do envio"
      >
        {envioDetalhe && (
          <DetalheEnvio
            envio={envioDetalhe}
            schema={formulario.schema}
            onExcluir={() => {
              excluirEnvio(envioDetalhe.id);
              setEnvioDetalhe(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// ─── Detalhe do Envio (dentro do modal) ──────────────────────────────────────

function DetalheEnvio({
  envio,
  schema,
  onExcluir,
}: {
  envio: EnvioDetalhe;
  schema: CampoFormulario[];
  onExcluir: () => void;
}) {
  const camposData = schema.filter((c) => c.tipo !== 'secao' && c.tipo !== 'paragrafo');

  return (
    <div className="space-y-4">
      <dl className="space-y-3">
        {camposData.map((campo) => {
          const valor = envio.dados[campo.nome];
          if (valor === undefined || valor === null || valor === '') return null;
          return (
            <div key={campo.id} className="grid grid-cols-[160px_1fr] gap-2 text-sm">
              <dt className="font-semibold text-fg/70">{campo.label}</dt>
              <dd className="text-fg break-words">
                {Array.isArray(valor) ? valor.join(', ') : String(valor)}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* Anexos */}
      {envio.anexos && envio.anexos.length > 0 && (
        <section>
          <h3 className="font-semibold text-sm mb-2">Anexos</h3>
          <ul className="space-y-1">
            {envio.anexos.map((anexo: AnexoEnvio, idx: number) => (
              <li key={idx} className="flex items-center gap-2 text-sm">
                <a
                  href={`${apiBase}/api/admin/formularios/anexo/${envio.id}/${idx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:opacity-80"
                  aria-label={`Baixar ${anexo.nome}`}
                >
                  {anexo.nome}
                </a>
                <span className="text-fg/50 text-xs">
                  ({Math.round(anexo.tamanho / 1024)} KB — {anexo.mime})
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Meta */}
      <dl className="grid grid-cols-2 gap-2 text-xs text-fg/60 border-t border-border pt-3">
        <div>
          <dt className="font-semibold">Data</dt>
          <dd>{formatarData(envio.criadoEm)}</dd>
        </div>
        <div>
          <dt className="font-semibold">IP</dt>
          <dd>{envio.ip ?? '—'}</dd>
        </div>
        {envio.cidadaoNome && (
          <div>
            <dt className="font-semibold">Cidadão</dt>
            <dd>{envio.cidadaoNome}</dd>
          </div>
        )}
      </dl>

      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onExcluir} className={ui.btnDanger}>
          Excluir envio
        </button>
      </div>
    </div>
  );
}

// ─── Modal: Criar formulário ──────────────────────────────────────────────────

function ModalNovoFormulario({
  open,
  onClose,
  onCriado,
}: {
  open: boolean;
  onClose: () => void;
  onCriado: (id: string) => void;
}) {
  const idBase = useId();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitulo('');
    setDescricao('');
    setErro('');
  }, [open]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) {
      setErro('O título é obrigatório.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      const criado = await adminPost<{ id: string }>('/api/admin/formularios', {
        titulo: titulo.trim(),
        descricao: descricao.trim() || undefined,
      });
      onCriado(criado.id);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao criar formulário.');
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Novo formulário">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div>
          <label htmlFor={`${idBase}-titulo`} className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-titulo`}
            className={`${ui.input} mt-1`}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            aria-required="true"
            autoFocus
          />
        </div>
        <div>
          <label htmlFor={`${idBase}-descricao`} className={ui.label}>
            Descrição
          </label>
          <textarea
            id={`${idBase}-descricao`}
            className={`${ui.input} mt-1 min-h-[72px] resize-y`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Criando…' : 'Criar e editar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal: Confirmar exclusão de formulário ──────────────────────────────────

function ModalConfirmarExclusaoForm({
  open,
  titulo,
  onClose,
  onExcluido,
  id,
}: {
  open: boolean;
  titulo: string;
  id: string;
  onClose: () => void;
  onExcluido: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) setErro('');
  }, [open]);

  async function confirmar() {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/formularios/${id}`);
      onExcluido();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao excluir formulário.');
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Excluir formulário">
      <div className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <p className="text-sm">
          Tem certeza que deseja excluir o formulário <strong>&quot;{titulo}&quot;</strong>?
          Todos os envios também serão excluídos. Esta ação não pode ser desfeita.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="button" onClick={confirmar} disabled={excluindo} className={ui.btnDanger}>
            {excluindo ? 'Excluindo…' : 'Excluir formulário'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Página Principal ─────────────────────────────────────────────────────────

type Tela = 'lista' | 'construtor' | 'envios';

export default function FormulariosAdminPage() {
  const { role } = useSessaoAdmin();
  const [formularios, setFormularios] = useState<FormularioResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [tela, setTela] = useState<Tela>('lista');
  const [formularioAtivo, setFormularioAtivo] = useState<FormularioDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  // Modais
  const [modalNovoAberto, setModalNovoAberto] = useState(false);
  const [formularioExcluindo, setFormularioExcluindo] = useState<FormularioResumo | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const lista = await adminGet<FormularioResumo[]>('/api/admin/formularios');
      setFormularios(lista);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar formulários.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirConstrutor(id: string) {
    setCarregandoDetalhe(true);
    setErro('');
    try {
      const det = await adminGet<FormularioDetalhe>(`/api/admin/formularios/${id}`);
      setFormularioAtivo(det);
      setTela('construtor');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar formulário.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function abrirEnvios(id: string) {
    setCarregandoDetalhe(true);
    setErro('');
    try {
      const det = await adminGet<FormularioDetalhe>(`/api/admin/formularios/${id}`);
      setFormularioAtivo(det);
      setTela('envios');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar formulário.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  function voltarParaLista() {
    setTela('lista');
    setFormularioAtivo(null);
    carregar();
  }

  if (tela === 'construtor' && formularioAtivo) {
    return (
      <main className="space-y-4 p-4 md:p-6">
        <ConstrutorFormulario
          formulario={formularioAtivo}
          onSalvo={carregar}
          onVoltar={voltarParaLista}
        />
      </main>
    );
  }

  if (tela === 'envios' && formularioAtivo) {
    return (
      <main className="space-y-4 p-4 md:p-6">
        <GestorEnvios formulario={formularioAtivo} onVoltar={voltarParaLista} />
      </main>
    );
  }

  return (
    <main className="space-y-5 p-4 md:p-6">
      <AdminHeader
        title="Formulários"
        description="Crie e gerencie formulários eletrônicos com construtor visual drag-drop."
      >
        <button onClick={() => setModalNovoAberto(true)} className={ui.btn}>
          + Novo formulário
        </button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {carregandoDetalhe && (
        <p className="text-sm text-fg/60" role="status">Carregando…</p>
      )}

      {/* Aviso de escopo restrito (gestor / servidor) */}
      {escopoRestrito(role) && (
        <div
          role="status"
          className="flex items-start gap-2 rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-fg"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" className="mt-0.5 shrink-0 text-primary">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
          <span>Você gerencia apenas o conteúdo da sua secretaria.</span>
        </div>
      )}

      <section aria-label="Lista de formulários" aria-live="polite" aria-busy={carregando}>
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">Carregando…</p>
        ) : formularios.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <p className="text-sm text-fg/60">Nenhum formulário cadastrado.</p>
            <button onClick={() => setModalNovoAberto(true)} className={ui.btn}>
              Criar primeiro formulário
            </button>
          </div>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[640px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Envios</th>
                  <th className={ui.th} scope="col">Atualizado em</th>
                  <th className={ui.th} scope="col"><span className="sr-only">Ações</span></th>
                </tr>
              </thead>
              <tbody>
                {formularios.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/30 transition-colors">
                    <td className={ui.td}>
                      <div>
                        <span className="font-semibold">{f.titulo}</span>
                        <div className="text-xs text-fg/50 font-mono">/formularios/{f.slug}</div>
                      </div>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} ${STATUS_CLASS[f.status] ?? 'bg-muted text-fg/60'}`}>
                        {STATUS_LABEL[f.status] ?? f.status}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} bg-primary/10 text-primary`}>
                        {f.totalEnvios}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className="text-fg/70">{formatarData(f.atualizadoEm)}</span>
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <div className="flex gap-2 flex-wrap">
                        <button
                          type="button"
                          disabled={carregandoDetalhe}
                          onClick={() => abrirConstrutor(f.id)}
                          className={ui.btnGhost}
                          aria-label={`Editar formulário ${f.titulo}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          disabled={carregandoDetalhe}
                          onClick={() => abrirEnvios(f.id)}
                          className={ui.btnGhost}
                          aria-label={`Ver envios de ${f.titulo}`}
                        >
                          Envios ({f.totalEnvios})
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormularioExcluindo(f)}
                          className={ui.btnDanger}
                          aria-label={`Excluir formulário ${f.titulo}`}
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ModalNovoFormulario
        open={modalNovoAberto}
        onClose={() => setModalNovoAberto(false)}
        onCriado={(id) => {
          setModalNovoAberto(false);
          abrirConstrutor(id);
        }}
      />

      <ModalConfirmarExclusaoForm
        open={formularioExcluindo !== null}
        titulo={formularioExcluindo?.titulo ?? ''}
        id={formularioExcluindo?.id ?? ''}
        onClose={() => setFormularioExcluindo(null)}
        onExcluido={() => {
          setFormularioExcluindo(null);
          carregar();
        }}
      />
    </main>
  );
}
