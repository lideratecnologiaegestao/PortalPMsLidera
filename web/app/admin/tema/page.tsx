'use client';

/**
 * Tela admin: Tema & Identidade Visual
 *
 * Shape do GET /api/theme:
 *   { tokens: ThemeTokens; wcag: WcagReport }
 *   onde ThemeTokens = { colors:{primary,primaryFg,secondary,secondaryFg,accent,bg,fg,muted,border,success,warning,danger},
 *                        fonts:{sans,heading}, radius:{base}, logo:{url,alt}, favicon, iconSet }
 *
 * Shape do POST /api/theme/preview (body = ThemeTokens):
 *   { wcagOk: boolean; relatorio: WcagReport; erros? }
 *   WcagReport = { ok: boolean; checks: { par, ratio, exigido, aprovado }[] }
 *
 * Shape do PUT /api/theme (body = ThemeTokens):
 *   200 → { ok: true; wcag: WcagReport }
 *   400 → AdminApiError com mensagem + wcag no corpo da API
 */

import { useEffect, useState } from 'react';
import { AdminApiError, adminGet, adminPost, adminPut } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

// ─── Tipos ──────────────────────────────────────────────────────────────────

interface ThemeColors {
  primary: string;
  primaryFg: string;
  secondary: string;
  secondaryFg: string;
  accent: string;
  bg: string;
  fg: string;
  muted: string;
  border: string;
  success: string;
  warning: string;
  danger: string;
}

type LogoTamanho = 'pequeno' | 'medio' | 'grande' | 'enorme';

interface ThemeTokens {
  colors: ThemeColors;
  fonts: { sans: string; heading: string };
  radius: { base: string };
  logo: { url: string; alt: string };
  favicon: string;
  pwaIcon?: { url: string; alt: string };
  iconSet: string;
  logoRodape?: { url: string; alt: string };
  logoRelatorio?: { url: string; alt: string };
  logoTamanho?: LogoTamanho;
  logoRodapeTamanho?: LogoTamanho;
  rodapeMostrarTexto?: boolean;
  rodapeTextoPosicao?: 'abaixo' | 'lateral';
  rodapeTitulo?: string;
  rodapeDescricao?: string;
}

interface ContrastCheck {
  par: string;
  ratio: number;
  exigido: number;
  aprovado: boolean;
}

interface WcagReport {
  ok: boolean;
  checks: ContrastCheck[];
}

interface PreviewResult {
  wcagOk: boolean;
  relatorio: WcagReport;
  erros?: unknown;
}

// ─── Defaults (espelham theme.service.ts DEFAULT_TOKENS) ────────────────────

const DEFAULT_COLORS: ThemeColors = {
  primary: '#1351B4',
  primaryFg: '#FFFFFF',
  secondary: '#FFCD07',
  secondaryFg: '#0B2A4A',
  accent: '#168821',
  bg: '#FFFFFF',
  fg: '#1B1B1B',
  muted: '#F0F0F0',
  border: '#CCCCCC',
  success: '#168821',
  warning: '#FFCD07',
  danger: '#E52207',
};

// ─── Rótulos das cores para o formulário ────────────────────────────────────

const COLOR_FIELDS: Array<{ key: keyof ThemeColors; label: string; desc: string }> = [
  { key: 'primary', label: 'Primária', desc: 'Cor principal — botões e links de destaque' },
  { key: 'primaryFg', label: 'Texto sobre primária', desc: 'Contraste com a cor primária (mín. 4,5:1)' },
  { key: 'secondary', label: 'Secundária', desc: 'Cor de suporte — badges e destaques' },
  { key: 'secondaryFg', label: 'Texto sobre secundária', desc: 'Contraste com a cor secundária (mín. 4,5:1)' },
  { key: 'accent', label: 'Accent', desc: 'Cor de ênfase — ícones e indicadores' },
  { key: 'bg', label: 'Fundo', desc: 'Cor de fundo da página' },
  { key: 'fg', label: 'Texto principal', desc: 'Cor do texto base (mín. 4,5:1 sobre fundo)' },
  { key: 'muted', label: 'Muted / cinza suave', desc: 'Fundo de tabelas, inputs e cards' },
  { key: 'border', label: 'Borda', desc: 'Cor das bordas e divisores' },
  { key: 'success', label: 'Sucesso', desc: 'Notificações e badges de estado positivo' },
  { key: 'warning', label: 'Aviso', desc: 'Alertas e prazos próximos do vencimento' },
  { key: 'danger', label: 'Perigo / Erro', desc: 'Erros, ações destrutivas e prazos vencidos' },
];

// ─── Sub-componente: campo de cor (picker + hex) ─────────────────────────────

function CampoCor({
  id,
  label,
  desc,
  value,
  onChange,
}: {
  id: string;
  label: string;
  desc: string;
  value: string;
  onChange: (v: string) => void;
}) {
  function handleHex(raw: string) {
    // normaliza: aceita com ou sem #
    const val = raw.startsWith('#') ? raw : `#${raw}`;
    onChange(val);
  }

  const hexSemHash = value.replace('#', '');
  const pickerVal = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : '#000000';

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`picker-${id}`} className={ui.label}>
        {label}
      </label>
      <p id={`desc-${id}`} className="text-xs text-fg/60">
        {desc}
      </p>
      <div className="flex items-center gap-2">
        {/* Color picker acessível */}
        <input
          type="color"
          id={`picker-${id}`}
          aria-describedby={`desc-${id}`}
          value={pickerVal}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-border p-0.5"
          aria-label={`Seletor de cor para ${label}`}
        />
        {/* Campo hex texto */}
        <div className="flex items-center rounded border border-border bg-bg">
          <span className="select-none px-2 text-sm text-fg/50">#</span>
          <input
            type="text"
            aria-label={`Valor hexadecimal para ${label}`}
            className="w-24 bg-transparent py-2 pr-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary rounded-r"
            maxLength={6}
            value={hexSemHash}
            onChange={(e) => handleHex(e.target.value)}
          />
        </div>
        {/* Amostra da cor */}
        <span
          className="inline-block h-8 w-8 rounded border border-border"
          style={{ backgroundColor: pickerVal }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

// ─── Pré-visualização de cartão com as cores escolhidas ─────────────────────

function CartaoPreview({ colors, fonts }: { colors: ThemeColors; fonts: { sans: string; heading: string } }) {
  return (
    <div
      aria-label="Pré-visualização do tema"
      className="rounded border border-border p-4 space-y-3"
      style={{
        backgroundColor: colors.bg,
        color: colors.fg,
        fontFamily: fonts.sans,
        borderColor: colors.border,
      }}
    >
      <h3
        style={{
          color: colors.primary,
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: '1.1rem',
        }}
      >
        Portal Municipal — Pré-visualização
      </h3>
      <p style={{ fontSize: '0.875rem', color: colors.fg }}>
        Texto de exemplo sobre o fundo escolhido. Verifique legibilidade e contraste.
      </p>
      <div className="flex flex-wrap gap-2">
        <span
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryFg,
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Botão primário
        </span>
        <span
          style={{
            backgroundColor: colors.secondary,
            color: colors.secondaryFg,
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Secundário
        </span>
        <span
          style={{
            backgroundColor: colors.success,
            color: colors.primaryFg,
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Sucesso
        </span>
        <span
          style={{
            backgroundColor: colors.danger,
            color: colors.primaryFg,
            padding: '4px 12px',
            borderRadius: '4px',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          Erro
        </span>
      </div>
      <div
        style={{
          backgroundColor: colors.muted,
          borderRadius: '4px',
          padding: '8px',
          fontSize: '0.8rem',
          color: colors.fg,
        }}
      >
        Fundo muted — tabelas e cards secundários
      </div>
    </div>
  );
}

// ─── Componente do relatório WCAG ────────────────────────────────────────────

function RelatorioWcag({ report }: { report: WcagReport }) {
  return (
    <div className="space-y-1">
      <p className={`font-semibold ${report.ok ? 'text-success' : 'text-danger'}`}>
        {report.ok ? 'WCAG AA aprovado' : 'WCAG AA reprovado — corrija os pares abaixo'}
      </p>
      <ul className="space-y-1 text-sm">
        {report.checks.map((c) => (
          <li
            key={c.par}
            className={`flex items-center gap-2 rounded border p-2 ${
              c.aprovado ? 'border-success/30 bg-success/5' : 'border-danger/30 bg-danger/5'
            }`}
          >
            <span aria-hidden="true">{c.aprovado ? '✓' : '✗'}</span>
            <span>
              <strong>{c.par}</strong> — razão {c.ratio}:1 (exigido {c.exigido}:1)
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Tipos de modelos de tema ────────────────────────────────────────────────

interface ModeloTema {
  id: string;
  nome: string;
  descricao?: string;
  cores: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

// ─── Componente: Seletor de Modelos ──────────────────────────────────────────

function SetorModelos({
  onModeloAplicado,
}: {
  onModeloAplicado: () => void;
}) {
  const [modelos, setModelos] = useState<ModeloTema[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [aplicando, setAplicando] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<ModeloTema | null>(null);

  useEffect(() => {
    setCarregando(true);
    adminGet<ModeloTema[]>('/api/theme/templates')
      .then(setModelos)
      .catch(() => setErro('Não foi possível carregar os modelos de tema.'))
      .finally(() => setCarregando(false));
  }, []);

  async function aplicarModelo(modelo: ModeloTema) {
    setAplicando(modelo.id);
    setErro('');
    setMsgOk('');
    try {
      await adminPost('/api/theme/aplicar-modelo', { id: modelo.id });
      // Invalida o cache ISR do tema imediatamente.
      void fetch('/revalidar-tema', { method: 'POST' }).catch(() => undefined);
      setMsgOk(
        'Modelo aplicado. As cores foram atualizadas (seu logo/brasão foram preservados).',
      );
      setConfirmando(null);
      onModeloAplicado();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao aplicar modelo.');
    } finally {
      setAplicando(null);
    }
  }

  return (
    <section aria-labelledby="modelos-titulo" className="rounded border border-border p-4 space-y-4">
      <div>
        <h2 id="modelos-titulo" className="font-heading text-lg font-bold text-fg">
          Modelos prontos
        </h2>
        <p className="text-sm text-fg/60">
          Clique em um modelo para pré-visualizar as cores. Ao aplicar, as cores do portal serão
          substituídas, mas o logo e o favicon serão preservados.
        </p>
      </div>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="text-sm text-fg/60">
          Carregando modelos…
        </p>
      ) : modelos.length === 0 ? (
        <p className="text-sm text-fg/60">Nenhum modelo disponível.</p>
      ) : (
        <ul
          role="list"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          aria-label="Modelos de tema disponíveis"
        >
          {modelos.map((m) => (
            <li key={m.id}>
              <article
                className="flex flex-col gap-3 rounded border border-border bg-bg p-3 hover:border-primary/50 transition-colors"
                aria-label={`Modelo: ${m.nome}`}
              >
                {/* Swatches das 3 cores */}
                <div className="flex gap-1.5" aria-hidden="true">
                  <span
                    className="h-7 w-7 rounded-full border border-border/40"
                    style={{ backgroundColor: m.cores.primary }}
                    title={`Primária: ${m.cores.primary}`}
                  />
                  <span
                    className="h-7 w-7 rounded-full border border-border/40"
                    style={{ backgroundColor: m.cores.secondary }}
                    title={`Secundária: ${m.cores.secondary}`}
                  />
                  <span
                    className="h-7 w-7 rounded-full border border-border/40"
                    style={{ backgroundColor: m.cores.accent }}
                    title={`Accent: ${m.cores.accent}`}
                  />
                </div>

                {/* Nome e descrição */}
                <div className="flex-1">
                  <p className="font-semibold text-sm text-fg">{m.nome}</p>
                  {m.descricao && (
                    <p className="text-xs text-fg/60 mt-0.5">{m.descricao}</p>
                  )}
                </div>

                {/* Botão aplicar */}
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => setConfirmando(m)}
                  disabled={aplicando !== null}
                  aria-label={`Aplicar modelo "${m.nome}"`}
                >
                  Aplicar este modelo
                </button>
              </article>
            </li>
          ))}
        </ul>
      )}

      {/* Modal de confirmação */}
      <Modal
        open={confirmando !== null}
        onClose={() => setConfirmando(null)}
        title="Confirmar aplicação de modelo"
      >
        {confirmando && (
          <div className="space-y-4">
            <p className="text-sm text-fg">
              Deseja aplicar o modelo <strong>&ldquo;{confirmando.nome}&rdquo;</strong>?
            </p>
            <p className="text-sm text-fg/70">
              As cores do portal serão substituídas pelas cores deste modelo. Seu logo, favicon e
              configurações de tipografia serão preservados. Esta ação pode ser desfeita editando
              as cores manualmente.
            </p>

            {/* Preview das cores do modelo */}
            <div className="flex items-center gap-3 rounded border border-border p-3">
              <div className="flex gap-2" aria-hidden="true">
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: confirmando.cores.primary,
                    color: '#fff',
                  }}
                >
                  P
                </span>
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold border border-border/40"
                  style={{
                    backgroundColor: confirmando.cores.secondary,
                    color: '#fff',
                  }}
                >
                  S
                </span>
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: confirmando.cores.accent,
                    color: '#fff',
                  }}
                >
                  A
                </span>
              </div>
              <p className="text-xs text-fg/60">
                Primária · Secundária · Accent
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className={ui.btnGhost}
                onClick={() => setConfirmando(null)}
                disabled={aplicando !== null}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={ui.btn}
                disabled={aplicando !== null}
                aria-busy={aplicando !== null}
                onClick={() => aplicarModelo(confirmando)}
              >
                {aplicando ? 'Aplicando…' : 'Confirmar e aplicar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}

// ─── Helper: invalida cache ISR do tema no Next.js ───────────────────────────

/**
 * Dispara a revalidação sob demanda do cache ISR do tema (mesma origem →
 * mesmo host → mesma tag `theme:<host>`). Falha silenciosa: o revalidate
 * por tempo (30 s) serve de rede de segurança.
 */
async function revalidarTema(): Promise<void> {
  try {
    await fetch('/revalidar-tema', { method: 'POST' });
  } catch {
    // falha silenciosa — não bloqueia o fluxo de save
  }
}

// ─── Página principal ────────────────────────────────────────────────────────

export default function TemaAdminPage() {
  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');

  // Estado do formulário
  const [colors, setColors] = useState<ThemeColors>(DEFAULT_COLORS);
  const [fontSans, setFontSans] = useState('Rawline, system-ui, sans-serif');
  const [fontHeading, setFontHeading] = useState('Rawline, sans-serif');
  const [radiusBase, setRadiusBase] = useState('0.5rem');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoAlt, setLogoAlt] = useState('');
  const [favicon, setFavicon] = useState('');
  const [pwaIconUrl, setPwaIconUrl] = useState('');
  const [pwaIconAlt, setPwaIconAlt] = useState('');
  const [pwaIconErro, setPwaIconErro] = useState('');
  const [iconSet, setIconSet] = useState('lucide');
  // Logo do rodapé
  const [logoRodapeUrl, setLogoRodapeUrl] = useState('');
  const [logoRodapeAlt, setLogoRodapeAlt] = useState('');
  // Logo para relatórios/PDF
  const [logoRelatorioUrl, setLogoRelatorioUrl] = useState('');
  const [logoRelatorioAlt, setLogoRelatorioAlt] = useState('');
  // Tamanho do logo no cabeçalho
  const [logoTamanho, setLogoTamanho] = useState<LogoTamanho>('medio');
  // Opções do rodapé
  const [logoRodapeTamanho, setLogoRodapeTamanho] = useState<LogoTamanho>('medio');
  const [rodapeMostrarTexto, setRodapeMostrarTexto] = useState(true);
  const [rodapeTextoPosicao, setRodapeTextoPosicao] = useState<'abaixo' | 'lateral'>('abaixo');
  const [rodapeTitulo, setRodapeTitulo] = useState('');
  const [rodapeDescricao, setRodapeDescricao] = useState('');

  // Feedback
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [validando, setValidando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [msgOk, setMsgOk] = useState('');
  const [msgErro, setMsgErro] = useState('');

  // MediaPicker (logo, favicon, logo rodapé, logo relatório)
  const [pickerLogoAberto, setPickerLogoAberto] = useState(false);
  const [pickerFaviconAberto, setPickerFaviconAberto] = useState(false);
  const [pickerPwaIconAberto, setPickerPwaIconAberto] = useState(false);
  const [pickerLogoRodapeAberto, setPickerLogoRodapeAberto] = useState(false);
  const [pickerLogoRelatorioAberto, setPickerLogoRelatorioAberto] = useState(false);

  // Carrega tema atual (também chamada após aplicar modelo)
  function carregarTema() {
    setCarregando(true);
    setErroCarregar('');
    adminGet<{ tokens: ThemeTokens; wcag: WcagReport }>('/api/theme')
      .then(({ tokens: t }) => {
        setColors(t.colors as ThemeColors);
        setFontSans(t.fonts.sans);
        setFontHeading(t.fonts.heading);
        setRadiusBase(t.radius.base);
        setLogoUrl(t.logo.url);
        setLogoAlt(t.logo.alt);
        setFavicon(t.favicon);
        setPwaIconUrl(t.pwaIcon?.url ?? '');
        setPwaIconAlt(t.pwaIcon?.alt ?? '');
        setIconSet(t.iconSet);
        setLogoRodapeUrl(t.logoRodape?.url ?? '');
        setLogoRodapeAlt(t.logoRodape?.alt ?? '');
        setLogoRelatorioUrl(t.logoRelatorio?.url ?? '');
        setLogoRelatorioAlt(t.logoRelatorio?.alt ?? '');
        setLogoTamanho(t.logoTamanho ?? 'medio');
        setLogoRodapeTamanho(t.logoRodapeTamanho ?? 'medio');
        setRodapeMostrarTexto(t.rodapeMostrarTexto !== false);
        setRodapeTextoPosicao(t.rodapeTextoPosicao ?? 'abaixo');
        setRodapeTitulo(t.rodapeTitulo ?? '');
        setRodapeDescricao(t.rodapeDescricao ?? '');
      })
      .catch((e) => {
        setErroCarregar(
          e instanceof AdminApiError ? e.message : 'Erro ao carregar tema atual.',
        );
      })
      .finally(() => setCarregando(false));
  }

  useEffect(() => {
    carregarTema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function buildPayload(): ThemeTokens {
    return {
      colors,
      fonts: { sans: fontSans, heading: fontHeading },
      radius: { base: radiusBase },
      logo: { url: logoUrl, alt: logoAlt },
      favicon,
      pwaIcon: pwaIconUrl ? { url: pwaIconUrl, alt: pwaIconAlt } : undefined,
      iconSet,
      logoRodape: logoRodapeUrl ? { url: logoRodapeUrl, alt: logoRodapeAlt } : undefined,
      logoRelatorio: logoRelatorioUrl ? { url: logoRelatorioUrl, alt: logoRelatorioAlt } : undefined,
      logoTamanho,
      logoRodapeTamanho,
      rodapeMostrarTexto,
      rodapeTextoPosicao,
      rodapeTitulo: rodapeTitulo.trim() || undefined,
      rodapeDescricao: rodapeDescricao.trim() || undefined,
    };
  }

  function setColor(key: keyof ThemeColors, val: string) {
    setColors((prev) => ({ ...prev, [key]: val }));
    // Limpa feedback anterior ao editar
    setPreview(null);
    setMsgOk('');
    setMsgErro('');
  }

  async function validarContraste() {
    setValidando(true);
    setPreview(null);
    setMsgOk('');
    setMsgErro('');
    try {
      const result = await adminPost<PreviewResult>('/api/theme/preview', buildPayload());
      setPreview(result);
    } catch (e) {
      setMsgErro(e instanceof AdminApiError ? e.message : 'Erro ao validar o tema.');
    } finally {
      setValidando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setMsgOk('');
    setMsgErro('');
    setPreview(null);
    try {
      await adminPut('/api/theme', buildPayload());
      // Invalida o cache ISR do tema imediatamente; falha silenciosa (rede de
      // segurança = revalidate: 30 em web/lib/theme.ts).
      void revalidarTema();
      setMsgOk('Tema salvo com sucesso! As alterações serão aplicadas ao portal.');
    } catch (e) {
      if (e instanceof AdminApiError) {
        // A API retorna { message, wcag } no body quando reprovar no WCAG
        setMsgErro(e.message);
        // Tenta extrair o relatório do erro (repassa via mensagem formatada)
      } else {
        setMsgErro('Erro inesperado ao salvar o tema.');
      }
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <p aria-live="polite" className="py-16 text-center text-sm text-fg/60">
        Carregando tema atual…
      </p>
    );
  }

  if (erroCarregar) {
    return <Aviso tipo="erro">{erroCarregar}</Aviso>;
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Tema & Identidade Visual"
        description="Personalize as cores, tipografia e identidade do portal municipal. A validação de contraste WCAG AA é obrigatória e bloqueia o salvamento."
      />

      {/* Seletor de modelos prontos */}
      <SetorModelos
        onModeloAplicado={() => {
          setPreview(null);
          setMsgOk('');
          setMsgErro('');
          carregarTema();
        }}
      />

      {/* Aviso legal de acessibilidade */}
      <aside
        role="note"
        className="rounded border border-warning bg-warning/10 p-3 text-sm text-fg"
      >
        <strong>Acessibilidade obrigatória (WCAG 2.1 AA):</strong> o contraste mínimo é 4,5:1
        para texto normal e 3:1 para componentes de interface. Temas que não atingirem esse
        padrão não poderão ser salvos. Use o botão "Validar contraste" antes de salvar.
      </aside>

      {/* Mensagens de feedback */}
      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {msgErro && <Aviso tipo="erro">{msgErro}</Aviso>}

      {/* Relatório de validação */}
      {preview && (
        <section aria-label="Resultado da validação WCAG" className="rounded border border-border p-3">
          <RelatorioWcag report={preview.relatorio} />
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Coluna principal: formulário */}
        <div className="lg:col-span-2 space-y-6">
          {/* Seção: Cores */}
          <fieldset className="rounded border border-border p-4 space-y-4">
            <legend className="px-1 font-semibold text-fg">Paleta de cores</legend>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {COLOR_FIELDS.map((f) => (
                <CampoCor
                  key={f.key}
                  id={f.key}
                  label={f.label}
                  desc={f.desc}
                  value={colors[f.key]}
                  onChange={(v) => setColor(f.key, v)}
                />
              ))}
            </div>
          </fieldset>

          {/* Seção: Tipografia */}
          <fieldset className="rounded border border-border p-4 space-y-3">
            <legend className="px-1 font-semibold text-fg">Tipografia</legend>
            <div>
              <label htmlFor="inp-font-sans" className={ui.label}>
                Fonte sans-serif (corpo de texto)
              </label>
              <input
                id="inp-font-sans"
                type="text"
                className={ui.input}
                value={fontSans}
                onChange={(e) => setFontSans(e.target.value)}
                placeholder="ex.: Rawline, system-ui, sans-serif"
              />
            </div>
            <div>
              <label htmlFor="inp-font-heading" className={ui.label}>
                Fonte de títulos (heading)
              </label>
              <input
                id="inp-font-heading"
                type="text"
                className={ui.input}
                value={fontHeading}
                onChange={(e) => setFontHeading(e.target.value)}
                placeholder="ex.: Rawline, sans-serif"
              />
            </div>
          </fieldset>

          {/* Seção: Geometria */}
          <fieldset className="rounded border border-border p-4 space-y-3">
            <legend className="px-1 font-semibold text-fg">Geometria</legend>
            <div>
              <label htmlFor="inp-radius" className={ui.label}>
                Border radius base
              </label>
              <input
                id="inp-radius"
                type="text"
                className={ui.input}
                value={radiusBase}
                onChange={(e) => setRadiusBase(e.target.value)}
                placeholder="ex.: 0.5rem"
              />
            </div>
          </fieldset>

          {/* Seção: Logotipo e favicon */}
          <fieldset className="rounded border border-border p-4 space-y-3">
            <legend className="px-1 font-semibold text-fg">Logotipo & Favicon</legend>
            <div>
              <label htmlFor="inp-logo-url" className={ui.label}>
                URL do logotipo
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="inp-logo-url"
                  type="url"
                  className={`flex-1 ${ui.input}`}
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://cdn.prefeitura.gov.br/logo.svg"
                  aria-describedby="logo-url-hint"
                />
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => setPickerLogoAberto(true)}
                  aria-label="Escolher logotipo da biblioteca de midia"
                >
                  Biblioteca
                </button>
              </div>
              <p id="logo-url-hint" className="mt-1 text-xs text-fg/60">
                Digite uma URL ou escolha da Biblioteca de Midia.
              </p>
            </div>
            <div>
              <label htmlFor="inp-logo-alt" className={ui.label}>
                Texto alternativo do logotipo (alt)
              </label>
              <input
                id="inp-logo-alt"
                type="text"
                className={ui.input}
                value={logoAlt}
                onChange={(e) => setLogoAlt(e.target.value)}
                placeholder="ex.: Brasão do município de Exemplo"
              />
            </div>
            <div>
              <label htmlFor="inp-favicon" className={ui.label}>
                URL do favicon
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="inp-favicon"
                  type="url"
                  className={`flex-1 ${ui.input}`}
                  value={favicon}
                  onChange={(e) => setFavicon(e.target.value)}
                  placeholder="https://cdn.prefeitura.gov.br/favicon.ico"
                  aria-describedby="favicon-url-hint"
                />
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => setPickerFaviconAberto(true)}
                  aria-label="Escolher favicon da biblioteca de midia"
                >
                  Biblioteca
                </button>
              </div>
              <p id="favicon-url-hint" className="mt-1 text-xs text-fg/60">
                Digite uma URL ou escolha da Biblioteca de Midia.
              </p>
            </div>

            {/* Ícone do PWA — instalação do portal no celular (exige PNG) */}
            <div>
              <label htmlFor="inp-pwa-icon" className={ui.label}>
                Ícone do PWA (instalação no celular)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="inp-pwa-icon"
                  type="url"
                  className={`flex-1 ${ui.input}`}
                  value={pwaIconUrl}
                  onChange={(e) => {
                    setPwaIconUrl(e.target.value);
                    setPwaIconErro('');
                  }}
                  placeholder="/midia/imagem/... (PNG quadrado 512×512)"
                  aria-describedby="pwa-icon-hint"
                />
                <button
                  type="button"
                  className={ui.btnGhost}
                  onClick={() => {
                    setPwaIconErro('');
                    setPickerPwaIconAberto(true);
                  }}
                  aria-label="Escolher ícone do PWA da biblioteca de midia"
                >
                  Biblioteca
                </button>
                {pwaIconUrl && (
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => {
                      setPwaIconUrl('');
                      setPwaIconAlt('');
                      setPwaIconErro('');
                    }}
                    aria-label="Remover ícone do PWA"
                  >
                    Remover
                  </button>
                )}
              </div>
              {pwaIconUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={pwaIconUrl}
                  alt="Prévia do ícone do PWA"
                  className="mt-2 h-16 w-16 rounded-lg border border-border object-cover"
                />
              )}
              {pwaIconErro && (
                <p role="alert" className="mt-1 text-xs font-medium text-danger">
                  {pwaIconErro}
                </p>
              )}
              <p id="pwa-icon-hint" className="mt-1 text-xs text-fg/60">
                Use um <strong>PNG quadrado</strong> (recomendado 512×512). SVG não é aceito
                como ícone instalável. Se vazio, o ícone do app/brasão é usado automaticamente.
              </p>
            </div>

            <div>
              <label htmlFor="inp-iconset" className={ui.label}>
                Conjunto de ícones (iconSet)
              </label>
              <input
                id="inp-iconset"
                type="text"
                className={ui.input}
                value={iconSet}
                onChange={(e) => setIconSet(e.target.value)}
                placeholder="lucide"
              />
            </div>

            {/* Tamanho do logo no cabeçalho */}
            <div>
              <label htmlFor="sel-logo-tamanho" className={ui.label}>
                Tamanho do logo no cabeçalho
              </label>
              <select
                id="sel-logo-tamanho"
                className={ui.input}
                value={logoTamanho}
                onChange={(e) => setLogoTamanho(e.target.value as LogoTamanho)}
                aria-describedby="logo-tamanho-hint"
              >
                <option value="pequeno">Pequeno (h-8 — 32 px)</option>
                <option value="medio">Médio (h-12 — 48 px) — padrão</option>
                <option value="grande">Grande (h-16 — 64 px)</option>
                <option value="enorme">Enorme (h-20 — 80 px)</option>
              </select>
              <p id="logo-tamanho-hint" className="mt-1 text-xs text-fg/60">
                Controla a altura da imagem do logo no topo do portal. Afeta apenas o cabeçalho.
              </p>
            </div>

            {/* Logo do rodapé */}
            <fieldset className="rounded border border-border/60 p-3 space-y-3">
              <legend className="px-1 text-sm font-semibold text-fg">Logo do rodapé</legend>
              <p className="text-xs text-fg/60" id="logo-rodape-hint">
                Se vazio, o rodapé usará o logo principal acima.
              </p>
              <div>
                <label htmlFor="inp-logo-rodape-url" className={ui.label}>
                  URL do logo do rodapé
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="inp-logo-rodape-url"
                    type="url"
                    className={`flex-1 ${ui.input}`}
                    value={logoRodapeUrl}
                    onChange={(e) => setLogoRodapeUrl(e.target.value)}
                    placeholder="https://cdn.prefeitura.gov.br/logo-rodape.svg"
                    aria-describedby="logo-rodape-hint"
                  />
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => setPickerLogoRodapeAberto(true)}
                    aria-label="Escolher logo do rodapé da biblioteca de mídia"
                  >
                    Biblioteca
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="inp-logo-rodape-alt" className={ui.label}>
                  Texto alternativo do logo do rodapé (alt)
                </label>
                <input
                  id="inp-logo-rodape-alt"
                  type="text"
                  className={ui.input}
                  value={logoRodapeAlt}
                  onChange={(e) => setLogoRodapeAlt(e.target.value)}
                  placeholder="ex.: Brasão versão monocromática para rodapé"
                />
              </div>
              {logoRodapeUrl && (
                <div className="mt-1">
                  <p className="text-xs text-fg/60 mb-1">Pré-visualização:</p>
                  <img
                    src={logoRodapeUrl}
                    alt={logoRodapeAlt || 'Logo do rodapé'}
                    className="h-12 w-auto rounded border border-border object-contain"
                  />
                </div>
              )}

              {/* Tamanho do logo no rodapé */}
              <div>
                <label htmlFor="sel-logo-rodape-tamanho" className={ui.label}>
                  Tamanho do logo no rodapé
                </label>
                <select
                  id="sel-logo-rodape-tamanho"
                  className={ui.input}
                  value={logoRodapeTamanho}
                  onChange={(e) => setLogoRodapeTamanho(e.target.value as LogoTamanho)}
                  aria-describedby="logo-rodape-tamanho-hint"
                >
                  <option value="pequeno">Pequeno (h-10 — 40 px)</option>
                  <option value="medio">Médio (h-14 — 56 px) — padrão</option>
                  <option value="grande">Grande (h-20 — 80 px)</option>
                  <option value="enorme">Enorme (h-28 — 112 px)</option>
                </select>
                <p id="logo-rodape-tamanho-hint" className="mt-1 text-xs text-fg/60">
                  Controla a altura da imagem do logo exibido no rodapé do portal.
                </p>
              </div>

              {/* Toggle: mostrar nome e descrição no rodapé */}
              <div className="flex items-start gap-3">
                <input
                  id="chk-rodape-mostrar-texto"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border accent-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  checked={rodapeMostrarTexto}
                  onChange={(e) => setRodapeMostrarTexto(e.target.checked)}
                  aria-describedby="chk-rodape-mostrar-texto-hint"
                />
                <div>
                  <label htmlFor="chk-rodape-mostrar-texto" className={`${ui.label} cursor-pointer`}>
                    Mostrar nome e descrição da entidade no rodapé
                  </label>
                  <p id="chk-rodape-mostrar-texto-hint" className="mt-0.5 text-xs text-fg/60">
                    Quando marcado, exibe o título e a descrição ao lado ou abaixo do logo. Quando desmarcado, apenas o logo é exibido.
                  </p>
                </div>
              </div>

              {/* Posição do texto (só relevante quando visível) */}
              {rodapeMostrarTexto && (
                <div>
                  <label htmlFor="sel-rodape-texto-posicao" className={ui.label}>
                    Posição do texto em relação ao logo
                  </label>
                  <select
                    id="sel-rodape-texto-posicao"
                    className={ui.input}
                    value={rodapeTextoPosicao}
                    onChange={(e) => setRodapeTextoPosicao(e.target.value as 'abaixo' | 'lateral')}
                    aria-describedby="sel-rodape-texto-posicao-hint"
                  >
                    <option value="abaixo">Abaixo do logo (empilhado — padrão)</option>
                    <option value="lateral">Ao lado do logo (lado a lado)</option>
                  </select>
                  <p id="sel-rodape-texto-posicao-hint" className="mt-1 text-xs text-fg/60">
                    "Ao lado" posiciona o logo e o texto na mesma linha, alinhados verticalmente ao centro.
                  </p>
                </div>
              )}

              {/* Título personalizado */}
              <div>
                <label htmlFor="inp-rodape-titulo" className={ui.label}>
                  Título do rodapé
                </label>
                <input
                  id="inp-rodape-titulo"
                  type="text"
                  className={ui.input}
                  value={rodapeTitulo}
                  onChange={(e) => setRodapeTitulo(e.target.value)}
                  placeholder="Nome do município (padrão)"
                  aria-describedby="inp-rodape-titulo-hint"
                />
                <p id="inp-rodape-titulo-hint" className="mt-1 text-xs text-fg/60">
                  Deixe em branco para usar automaticamente o nome do município cadastrado.
                </p>
              </div>

              {/* Descrição personalizada */}
              <div>
                <label htmlFor="inp-rodape-descricao" className={ui.label}>
                  Descrição do rodapé
                </label>
                <textarea
                  id="inp-rodape-descricao"
                  className={`${ui.input} resize-y`}
                  rows={3}
                  value={rodapeDescricao}
                  onChange={(e) => setRodapeDescricao(e.target.value)}
                  placeholder="Descrição ou slogan da prefeitura (opcional)"
                  aria-describedby="inp-rodape-descricao-hint"
                />
                <p id="inp-rodape-descricao-hint" className="mt-1 text-xs text-fg/60">
                  Deixe em branco para usar a descrição padrão da entidade.
                </p>
              </div>
            </fieldset>

            {/* Logo para relatórios (PDF) */}
            <fieldset className="rounded border border-border/60 p-3 space-y-3">
              <legend className="px-1 text-sm font-semibold text-fg">Logo para relatórios (PDF)</legend>
              <p className="text-xs text-fg/60" id="logo-relatorio-hint">
                Usado na geração de documentos PDF e relatórios impressos. Se vazio, usa o logo principal.
              </p>
              <div>
                <label htmlFor="inp-logo-relatorio-url" className={ui.label}>
                  URL do logo para relatórios
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="inp-logo-relatorio-url"
                    type="url"
                    className={`flex-1 ${ui.input}`}
                    value={logoRelatorioUrl}
                    onChange={(e) => setLogoRelatorioUrl(e.target.value)}
                    placeholder="https://cdn.prefeitura.gov.br/logo-relatorio.png"
                    aria-describedby="logo-relatorio-hint"
                  />
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => setPickerLogoRelatorioAberto(true)}
                    aria-label="Escolher logo para relatórios da biblioteca de mídia"
                  >
                    Biblioteca
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="inp-logo-relatorio-alt" className={ui.label}>
                  Texto alternativo do logo para relatórios (alt)
                </label>
                <input
                  id="inp-logo-relatorio-alt"
                  type="text"
                  className={ui.input}
                  value={logoRelatorioAlt}
                  onChange={(e) => setLogoRelatorioAlt(e.target.value)}
                  placeholder="ex.: Brasão municipal versão para impressão"
                />
              </div>
              {logoRelatorioUrl && (
                <div className="mt-1">
                  <p className="text-xs text-fg/60 mb-1">Pré-visualização:</p>
                  <img
                    src={logoRelatorioUrl}
                    alt={logoRelatorioAlt || 'Logo para relatórios'}
                    className="h-12 w-auto rounded border border-border object-contain"
                  />
                </div>
              )}
            </fieldset>
          </fieldset>

          {/* MediaPicker — Logotipo */}
          <MediaPicker
            open={pickerLogoAberto}
            onClose={() => setPickerLogoAberto(false)}
            tipo="imagem"
            onSelect={(asset) => {
              if (asset.urlPublica) setLogoUrl(asset.urlPublica);
              if (asset.altText) setLogoAlt(asset.altText);
              setPickerLogoAberto(false);
            }}
          />

          {/* MediaPicker — Favicon */}
          <MediaPicker
            open={pickerFaviconAberto}
            onClose={() => setPickerFaviconAberto(false)}
            tipo="imagem"
            onSelect={(asset) => {
              if (asset.urlPublica) setFavicon(asset.urlPublica);
              setPickerFaviconAberto(false);
            }}
          />

          {/* MediaPicker — Ícone do PWA (exige PNG) */}
          <MediaPicker
            open={pickerPwaIconAberto}
            onClose={() => setPickerPwaIconAberto(false)}
            tipo="imagem"
            onSelect={(asset) => {
              // O ícone do PWA precisa ser PNG — SVG não funciona como ícone
              // instalável nos navegadores. Bloqueia qualquer outro formato.
              if (asset.mime !== 'image/png') {
                setPwaIconErro(
                  `O ícone do PWA deve ser PNG. O arquivo escolhido é "${asset.mime}". Envie/escolha um PNG quadrado.`,
                );
                setPickerPwaIconAberto(false);
                return;
              }
              if (asset.urlPublica) setPwaIconUrl(asset.urlPublica);
              setPwaIconAlt(asset.altText ?? 'Ícone do aplicativo');
              setPwaIconErro('');
              setPickerPwaIconAberto(false);
            }}
          />

          {/* MediaPicker — Logo do Rodapé */}
          <MediaPicker
            open={pickerLogoRodapeAberto}
            onClose={() => setPickerLogoRodapeAberto(false)}
            tipo="imagem"
            onSelect={(asset) => {
              if (asset.urlPublica) setLogoRodapeUrl(asset.urlPublica);
              if (asset.altText) setLogoRodapeAlt(asset.altText);
              setPickerLogoRodapeAberto(false);
            }}
          />

          {/* MediaPicker — Logo para Relatórios */}
          <MediaPicker
            open={pickerLogoRelatorioAberto}
            onClose={() => setPickerLogoRelatorioAberto(false)}
            tipo="imagem"
            onSelect={(asset) => {
              if (asset.urlPublica) setLogoRelatorioUrl(asset.urlPublica);
              if (asset.altText) setLogoRelatorioAlt(asset.altText);
              setPickerLogoRelatorioAberto(false);
            }}
          />

          {/* Botões de ação */}
          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className={ui.btnGhost}
              disabled={validando || salvando}
              onClick={validarContraste}
              aria-busy={validando}
            >
              {validando ? 'Validando…' : 'Validar contraste (WCAG)'}
            </button>
            <button
              type="button"
              className={ui.btn}
              disabled={salvando || validando}
              onClick={salvar}
              aria-busy={salvando}
            >
              {salvando ? 'Salvando…' : 'Salvar tema'}
            </button>
          </div>

          {/* Relatório inline (repetido abaixo dos botões para foco natural) */}
          {preview && (
            <div aria-live="polite" className="rounded border border-border p-3">
              <RelatorioWcag report={preview.relatorio} />
            </div>
          )}
        </div>

        {/* Coluna lateral: pré-visualização */}
        <aside aria-label="Pré-visualização" className="space-y-3">
          <h2 className="font-semibold text-fg">Pré-visualização</h2>
          <p className="text-xs text-fg/60">
            Atualizada em tempo real conforme você edita as cores.
          </p>
          <CartaoPreview colors={colors} fonts={{ sans: fontSans, heading: fontHeading }} />

          {/* Mostrar logotipo se URL válida */}
          {logoUrl && (
            <div className="mt-3">
              <p className="mb-1 text-xs text-fg/60">Logotipo:</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={logoAlt || 'Logotipo do município'}
                className="max-h-16 max-w-full rounded border border-border object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
