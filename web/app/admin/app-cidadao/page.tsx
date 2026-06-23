'use client';

/**
 * /admin/app-cidadao — Configuração do App do Cidadão
 *
 * ADR-0006 Fase 1: configuração visual, de conteúdo e de integrações do app
 * mobile white-label por tenant.
 * ADR-0006 Fase 2: geração de builds via EAS (aba Builds funcional).
 *
 * Abas:
 *   1. Identidade & Ícones
 *   2. Onboarding
 *   3. Módulos
 *   4. Tema
 *   5. Integrações
 *   6. Builds
 *
 * Acesso: admin_prefeitura e super_admin.
 * Campos bundleId/easProjectId/easOwner/apiUrl: somente-leitura para
 * admin_prefeitura; editáveis apenas para super_admin.
 *
 * WCAG 2.1 AA · sem cores fixas (tokens de tema) · pt-BR.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { AdminApiError, adminGet, adminPatch, adminPost } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { useSessaoAdmin } from '../../../lib/session-context';
import { Aviso, Modal, ui } from '../_components/ui';

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Status retornado pelo backend para cada build. */
type BuildStatus =
  | 'enfileirado'
  | 'preparando'
  | 'em_build'
  | 'concluido'
  | 'falhou';

/** Perfil do build: preview = APK de teste; production = pacote para Play Store. */
type BuildPerfil = 'preview' | 'production';

interface BuildItem {
  id: string;
  perfil: BuildPerfil;
  plataforma: string;
  status: BuildStatus;
  easBuildId?: string;
  easBuildUrl?: string;
  logUrl?: string;
  erroResumo?: string;
  solicitadoPor?: string;
  criadoEm: string;
  atualizadoEm: string;
}

interface OnboardingSlide {
  titulo: string;
  descricao: string;
  imagemUrl: string;
}

interface AcessoRapidoItem {
  titulo: string;
  path: string;
  icone: string;
}

interface AppConfig {
  appName: string;
  appShortName: string;
  bundleId: string;
  scheme: string;
  apiUrl: string;
  easProjectId: string;
  easOwner: string;
  appVersion: string;
  iconUrl: string;
  splashUrl: string;
  splashBgColor: string;
  primaryColor: string;
  secondaryColor: string;
  modulos: {
    denuncia: boolean;
    mapa: boolean;
    ouvidoria: boolean;
    esic: boolean;
    chat: boolean;
    servicos: boolean;
    noticias: boolean;
    carteira: boolean;
    galeria: boolean;
    documentos: boolean;
  };
  onboardingAtivo: boolean;
  onboardingSlides: OnboardingSlide[];
  acessoRapido: AcessoRapidoItem[];
  categoriasChamados: string[];
  pushHabilitado: boolean;
  biometriaHabilitada: boolean;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ABAS = [
  { id: 'identidade', label: 'Identidade & Ícones' },
  { id: 'onboarding', label: 'Onboarding' },
  { id: 'modulos', label: 'Módulos' },
  { id: 'tema', label: 'Tema' },
  { id: 'integracoes', label: 'Integrações' },
  { id: 'builds', label: 'Builds' },
] as const;

type AbaId = (typeof ABAS)[number]['id'];

const MODULOS_LABELS: Record<keyof AppConfig['modulos'], string> = {
  denuncia: 'Denúncias',
  mapa: 'Mapa',
  ouvidoria: 'Ouvidoria',
  esic: 'e-SIC',
  chat: 'Chat',
  servicos: 'Serviços',
  noticias: 'Notícias',
  carteira: 'Carteira',
  galeria: 'Galeria',
  documentos: 'Documentos',
};

const MODULOS_DESC: Record<keyof AppConfig['modulos'], string> = {
  denuncia: 'Envio de denúncias georreferenciadas pelo cidadão',
  mapa: 'Visualização de ocorrências e pontos de interesse no mapa',
  ouvidoria: 'Abertura e acompanhamento de manifestações na Ouvidoria',
  esic: 'Pedidos de acesso à informação (Lei 12.527/2011)',
  chat: 'Chat de atendimento em tempo real com a prefeitura',
  servicos: 'Catálogo de serviços públicos municipais',
  noticias: 'Feed de notícias e comunicados oficiais',
  carteira: 'Documentos digitais e carteirinhas do cidadão',
  galeria: 'Galeria de fotos e vídeos da prefeitura',
  documentos: 'Leis, decretos e documentos oficiais',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function corHexValida(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

// ─── Componentes de apoio ────────────────────────────────────────────────────

/** Toggle switch acessível com label e descrição opcional. */
function Toggle({
  id,
  checked,
  onChange,
  label,
  descricao,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  descricao?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-describedby={descricao ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
          'disabled:opacity-40',
          checked ? 'bg-primary' : 'bg-border',
        ].join(' ')}
        aria-label={label}
      >
        <span
          aria-hidden="true"
          className={[
            'inline-block h-4 w-4 rounded-full bg-bg shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          ].join(' ')}
        />
      </button>
      <div>
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-semibold leading-6"
          onClick={() => !disabled && onChange(!checked)}
        >
          {label}
        </label>
        {descricao && (
          <p id={`${id}-desc`} className="text-xs text-fg/60">
            {descricao}
          </p>
        )}
      </div>
    </div>
  );
}

/** Input de cor: colorpicker + campo hex sincronizados. */
function ColorInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [hex, setHex] = useState(value);

  useEffect(() => {
    setHex(value);
  }, [value]);

  function handleHexChange(v: string) {
    const norm = v.startsWith('#') ? v : `#${v}`;
    setHex(norm);
    if (corHexValida(norm)) onChange(norm);
  }

  function handlePickerChange(v: string) {
    setHex(v);
    onChange(v);
  }

  const erro = hex && !corHexValida(hex);

  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={corHexValida(hex) ? hex : '#000000'}
          onChange={(e) => handlePickerChange(e.target.value)}
          aria-label={`Seletor de cor para ${label}`}
          className="h-9 w-9 cursor-pointer rounded border border-border bg-bg p-0.5"
        />
        <input
          id={id}
          type="text"
          value={hex}
          onChange={(e) => handleHexChange(e.target.value)}
          placeholder="#1351b4"
          maxLength={7}
          aria-describedby={erro ? `${id}-erro` : undefined}
          aria-invalid={!!erro}
          className={[
            ui.input,
            'font-mono uppercase w-32',
            erro ? 'border-danger focus:ring-danger' : '',
          ].join(' ')}
        />
        {erro && (
          <span id={`${id}-erro`} role="alert" className="text-xs text-danger">
            Formato inválido (ex.: #1351b4)
          </span>
        )}
      </div>
    </div>
  );
}

/** Upload de imagem com preview e requisitos visíveis. */
function ImageUpload({
  label,
  endpoint,
  currentUrl,
  onUploaded,
  requisito,
  accept,
}: {
  label: string;
  endpoint: string;
  currentUrl: string;
  onUploaded: (url: string) => void;
  requisito?: string;
  accept?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const idBase = useId();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setErro('');
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `${apiBase}/api/admin/${endpoint}`,
        {
          method: 'POST',
          credentials: 'include',
          body: form,
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        let msg = `Erro ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : j.message;
        } catch { /* nao-JSON */ }
        throw new AdminApiError(msg, res.status);
      }
      const { url } = await res.json() as { url: string };
      onUploaded(url);
    } catch (err) {
      setErro(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao enviar o arquivo. Tente novamente.',
      );
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <p className={ui.label}>{label}</p>
      {requisito && (
        <p id={`${idBase}-req`} className="text-xs text-fg/60">
          {requisito}
        </p>
      )}
      <div className="flex flex-wrap items-start gap-4">
        {/* Preview */}
        <div
          className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-muted"
          aria-label={currentUrl ? `Pré-visualização de ${label}` : `Sem imagem para ${label}`}
        >
          {currentUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={currentUrl}
              alt={`${label} atual`}
              className="h-full w-full object-contain"
            />
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="currentColor"
              className="text-fg/30"
            >
              <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
            </svg>
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            id={`${idBase}-file`}
            type="file"
            accept={accept ?? 'image/png,image/jpeg,image/webp'}
            onChange={handleFile}
            disabled={enviando}
            aria-describedby={`${idBase}-req`}
            className="sr-only"
          />
          <label
            htmlFor={`${idBase}-file`}
            className={[
              ui.btnGhost,
              'cursor-pointer',
              enviando ? 'opacity-50 pointer-events-none' : '',
            ].join(' ')}
          >
            {enviando ? 'Enviando…' : 'Selecionar arquivo'}
          </label>
          {erro && (
            <p role="alert" className="text-xs text-danger">
              {erro}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Mini-mockup de celular para preview visual. */
function MockupCelular({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="img"
      aria-label="Pré-visualização no app"
      className="mx-auto w-48 rounded-2xl border-4 border-fg/20 bg-muted shadow-lg overflow-hidden"
    >
      {/* Notch simulado */}
      <div className="flex justify-center bg-fg/10 py-1">
        <div className="h-1.5 w-12 rounded-full bg-fg/20" aria-hidden="true" />
      </div>
      <div className="min-h-[200px]">{children}</div>
      {/* Home bar */}
      <div className="flex justify-center bg-fg/5 py-2">
        <div className="h-1 w-16 rounded-full bg-fg/20" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Aba 1: Identidade & Ícones ───────────────────────────────────────────────

function AbaIdentidade({
  config,
  onChange,
  superAdmin,
}: {
  config: AppConfig;
  onChange: (partial: Partial<AppConfig>) => void;
  superAdmin: boolean;
}) {
  const id = useId();

  return (
    <div className="space-y-6">
      <aside
        className="rounded border border-warning/40 bg-warning/5 p-3 text-sm text-fg/80"
        role="note"
      >
        <strong>Atenção:</strong> Alterações de nome, ícone e splash só têm efeito
        após gerar um novo APK (Fase 2 — em breve).
      </aside>

      {/* Nomes */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Identificação do aplicativo</legend>

        <div>
          <label htmlFor={`${id}-appName`} className={ui.label}>
            Nome completo do app <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${id}-appName`}
            type="text"
            className={`${ui.input} mt-1`}
            value={config.appName}
            onChange={(e) => onChange({ appName: e.target.value })}
            maxLength={60}
            placeholder="Ex.: Prefeitura de Exemplolandia"
            required
            aria-required="true"
          />
        </div>

        <div>
          <label htmlFor={`${id}-appShortName`} className={ui.label}>
            Nome curto (ícone)
          </label>
          <p className="mt-0.5 text-xs text-fg/60">
            Aparece sob o ícone na tela inicial. Máximo 12 caracteres.
          </p>
          <input
            id={`${id}-appShortName`}
            type="text"
            className={`${ui.input} mt-1`}
            value={config.appShortName}
            onChange={(e) => onChange({ appShortName: e.target.value })}
            maxLength={12}
            placeholder="Ex.: Exemplolandia"
            aria-describedby={`${id}-shortname-hint`}
          />
          <p id={`${id}-shortname-hint`} className="mt-0.5 text-xs text-fg/50">
            {config.appShortName.length}/12 caracteres
          </p>
        </div>
      </fieldset>

      {/* Ícone */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Ícone do aplicativo</legend>
        <ImageUpload
          label="Ícone (PNG 1024×1024)"
          endpoint="app-config/icon"
          currentUrl={config.iconUrl}
          onUploaded={(url) => onChange({ iconUrl: url })}
          requisito="Obrigatório: PNG quadrado, 1024×1024 pixels. O arquivo será redimensionado pela plataforma para todas as densidades necessárias (iOS e Android)."
          accept="image/png"
        />
      </fieldset>

      {/* Splash */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Tela de abertura (Splash)</legend>
        <ImageUpload
          label="Imagem da Splash Screen"
          endpoint="app-config/splash"
          currentUrl={config.splashUrl}
          onUploaded={(url) => onChange({ splashUrl: url })}
          requisito="Recomendado: PNG 1284×2778 px (resolução iPhone 13 Pro Max). O app centraliza a imagem sobre a cor de fundo."
          accept="image/png,image/jpeg"
        />
        <ColorInput
          id={`${id}-splashBg`}
          label="Cor de fundo da Splash"
          value={config.splashBgColor}
          onChange={(v) => onChange({ splashBgColor: v })}
        />
        {/* Preview splash */}
        <div>
          <p className="mb-2 text-sm font-semibold text-fg/70">Pré-visualização da splash:</p>
          <MockupCelular>
            <div
              className="flex h-full min-h-[180px] flex-col items-center justify-center gap-4"
              style={{ backgroundColor: corHexValida(config.splashBgColor) ? config.splashBgColor : '#ffffff' }}
            >
              {config.splashUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={config.splashUrl}
                  alt="Splash preview"
                  className="h-16 w-16 object-contain"
                />
              ) : (
                <div
                  className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-fg/20"
                  aria-hidden="true"
                >
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-fg/30">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                </div>
              )}
              <p
                className="text-center text-xs font-semibold"
                style={{ color: corHexValida(config.splashBgColor) && config.splashBgColor.toLowerCase() === '#ffffff' ? '#333' : '#fff' }}
              >
                {config.appName || 'Nome do app'}
              </p>
            </div>
          </MockupCelular>
        </div>
      </fieldset>

      {/* Configuração técnica */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">
          Configuração técnica
          {!superAdmin && (
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-fg/60">
              somente leitura
            </span>
          )}
        </legend>
        {!superAdmin && (
          <p className="text-xs text-fg/60" role="note">
            Estes campos identificam o app nas lojas e no servidor EAS (Expo Application
            Services). Somente o Super Admin pode alterá-los para evitar conflitos de
            publicação.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              { key: 'bundleId', label: 'Bundle ID / Package Name', ph: 'br.gov.exemplolandia.app' },
              { key: 'scheme', label: 'Deep Link Scheme', ph: 'exemplolandia' },
              { key: 'apiUrl', label: 'URL da API', ph: 'https://api.exemplolandia.sp.gov.br' },
              { key: 'easProjectId', label: 'EAS Project ID', ph: 'uuid-do-projeto' },
              { key: 'easOwner', label: 'EAS Owner', ph: 'lidera-tecnologia' },
              { key: 'appVersion', label: 'Versão do app', ph: '1.0.0' },
            ] as Array<{ key: keyof AppConfig; label: string; ph: string }>
          ).map(({ key, label, ph }) => (
            <div key={key}>
              <label htmlFor={`${id}-${key}`} className={ui.label}>
                {label}
              </label>
              <input
                id={`${id}-${key}`}
                type="text"
                className={[
                  ui.input,
                  'mt-1 font-mono text-xs',
                  !superAdmin ? 'cursor-not-allowed bg-muted text-fg/60' : '',
                ].join(' ')}
                value={String(config[key] ?? '')}
                onChange={(e) => superAdmin && onChange({ [key]: e.target.value })}
                readOnly={!superAdmin}
                aria-readonly={!superAdmin}
                placeholder={ph}
              />
            </div>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

// ─── Aba 2: Onboarding ────────────────────────────────────────────────────────

const SLIDE_VAZIO: OnboardingSlide = { titulo: '', descricao: '', imagemUrl: '' };
const MAX_SLIDES = 5;

function SlideEditor({
  slide,
  index,
  onChange,
  onRemove,
}: {
  slide: OnboardingSlide;
  index: number;
  onChange: (s: OnboardingSlide) => void;
  onRemove: () => void;
}) {
  const id = useId();

  return (
    <fieldset className="space-y-3 rounded border border-border p-4">
      <div className="flex items-center justify-between">
        <legend className="px-1 text-sm font-semibold">
          Slide {index + 1}
        </legend>
        <button
          type="button"
          onClick={onRemove}
          className={ui.btnDanger}
          aria-label={`Remover slide ${index + 1}`}
        >
          Remover
        </button>
      </div>

      <div>
        <label htmlFor={`${id}-titulo`} className={ui.label}>
          Título
        </label>
        <input
          id={`${id}-titulo`}
          type="text"
          className={`${ui.input} mt-1`}
          value={slide.titulo}
          onChange={(e) => onChange({ ...slide, titulo: e.target.value })}
          maxLength={80}
          placeholder="Ex.: Denúncias em tempo real"
        />
      </div>

      <div>
        <label htmlFor={`${id}-desc`} className={ui.label}>
          Descrição
        </label>
        <textarea
          id={`${id}-desc`}
          className={`${ui.input} mt-1 min-h-[72px] resize-y`}
          value={slide.descricao}
          onChange={(e) => onChange({ ...slide, descricao: e.target.value })}
          maxLength={200}
          placeholder="Descreva o que o cidadão pode fazer com esta funcionalidade."
        />
      </div>

      <div>
        <label htmlFor={`${id}-img`} className={ui.label}>
          URL da imagem
        </label>
        <p className="mt-0.5 text-xs text-fg/60">
          Cole a URL de uma imagem da galeria/mídia do portal ou envie via gerenciador de mídias.
        </p>
        <input
          id={`${id}-img`}
          type="url"
          className={`${ui.input} mt-1`}
          value={slide.imagemUrl}
          onChange={(e) => onChange({ ...slide, imagemUrl: e.target.value })}
          placeholder="https://…/imagem-onboarding.png"
        />
        {slide.imagemUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={slide.imagemUrl}
            alt={`Pré-visualização do slide ${index + 1}`}
            className="mt-2 h-24 w-auto rounded border border-border object-contain"
          />
        )}
      </div>
    </fieldset>
  );
}

function AbaOnboarding({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (partial: Partial<AppConfig>) => void;
}) {
  const id = useId();
  const slides = config.onboardingSlides;

  function setSlides(next: OnboardingSlide[]) {
    onChange({ onboardingSlides: next });
  }

  function addSlide() {
    if (slides.length >= MAX_SLIDES) return;
    setSlides([...slides, { ...SLIDE_VAZIO }]);
  }

  function removeSlide(i: number) {
    setSlides(slides.filter((_, idx) => idx !== i));
  }

  function updateSlide(i: number, s: OnboardingSlide) {
    const next = [...slides];
    next[i] = s;
    setSlides(next);
  }

  // Slide ativo para preview
  const [previewIdx, setPreviewIdx] = useState(0);
  const slidePreview = slides[previewIdx] ?? null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg/70">
        Configure a apresentação exibida ao cidadão na primeira abertura do aplicativo.
        Até {MAX_SLIDES} slides. Se desativado, o app abre direto na tela principal.
      </p>

      <Toggle
        id={`${id}-onboarding-ativo`}
        checked={config.onboardingAtivo}
        onChange={(v) => onChange({ onboardingAtivo: v })}
        label="Onboarding ativo"
        descricao="Exibe a sequência de slides ao abrir o app pela primeira vez."
      />

      <div
        className={[
          'space-y-4 transition-opacity',
          !config.onboardingAtivo ? 'pointer-events-none opacity-40' : '',
        ].join(' ')}
        aria-hidden={!config.onboardingAtivo}
      >
        {slides.map((slide, i) => (
          <SlideEditor
            key={i}
            slide={slide}
            index={i}
            onChange={(s) => updateSlide(i, s)}
            onRemove={() => removeSlide(i)}
          />
        ))}

        {slides.length < MAX_SLIDES && (
          <button
            type="button"
            onClick={addSlide}
            className={ui.btnGhost}
            aria-label="Adicionar novo slide de onboarding"
          >
            + Adicionar slide ({slides.length}/{MAX_SLIDES})
          </button>
        )}

        {slides.length === 0 && (
          <p className="rounded border border-dashed border-border p-4 text-center text-sm text-fg/50">
            Nenhum slide cadastrado. Clique em &quot;Adicionar slide&quot; para começar.
          </p>
        )}

        {/* Preview mockup */}
        {slides.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-semibold">Pré-visualização:</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPreviewIdx(i)}
                  className={[
                    'rounded px-2 py-1 text-xs font-semibold border',
                    previewIdx === i
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-fg/60 hover:bg-muted',
                  ].join(' ')}
                  aria-pressed={previewIdx === i}
                  aria-label={`Ver slide ${i + 1} no mockup`}
                >
                  Slide {i + 1}
                </button>
              ))}
            </div>
            <MockupCelular>
              {slidePreview ? (
                <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 p-4 text-center">
                  {slidePreview.imagemUrl && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={slidePreview.imagemUrl}
                      alt={slidePreview.titulo || `Slide ${previewIdx + 1}`}
                      className="h-20 w-auto object-contain"
                    />
                  )}
                  <p className="text-xs font-bold text-fg line-clamp-2">
                    {slidePreview.titulo || 'Título do slide'}
                  </p>
                  <p className="text-xs text-fg/60 line-clamp-3">
                    {slidePreview.descricao || 'Descrição do slide…'}
                  </p>
                  {/* Indicadores de paginação */}
                  <div className="flex gap-1" aria-hidden="true">
                    {slides.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-1.5 rounded-full ${i === previewIdx ? 'bg-primary' : 'bg-fg/20'}`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </MockupCelular>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Aba 3: Módulos ──────────────────────────────────────────────────────────

function AbaModulos({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (partial: Partial<AppConfig>) => void;
}) {
  return (
    <div className="space-y-6">
      <aside
        className="rounded border border-primary/20 bg-primary/5 p-3 text-sm text-fg/80"
        role="note"
      >
        Mudanças nos módulos aparecem no app no próximo carregamento, <strong>sem necessidade
        de novo APK</strong>. Módulos desativados ficam ocultos da navegação do cidadão.
      </aside>

      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Módulos disponíveis no app</legend>

        {(Object.keys(config.modulos) as Array<keyof AppConfig['modulos']>).map((key) => (
          <Toggle
            key={key}
            id={`modulo-${key}`}
            checked={config.modulos[key]}
            onChange={(v) =>
              onChange({ modulos: { ...config.modulos, [key]: v } })
            }
            label={MODULOS_LABELS[key]}
            descricao={MODULOS_DESC[key]}
          />
        ))}
      </fieldset>
    </div>
  );
}

// ─── Aba 4: Tema ─────────────────────────────────────────────────────────────

function AbaTema({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (partial: Partial<AppConfig>) => void;
}) {
  const id = useId();
  const primary = corHexValida(config.primaryColor) ? config.primaryColor : '#1351b4';
  const secondary = corHexValida(config.secondaryColor) ? config.secondaryColor : '#2670e8';

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg/70">
        Define a paleta de cores do aplicativo. Use cores com contraste suficiente
        (WCAG AA: mínimo 4.5:1 para texto sobre fundo).
      </p>

      <fieldset className="space-y-5 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Paleta de cores do app</legend>

        <ColorInput
          id={`${id}-primary`}
          label="Cor primária"
          value={config.primaryColor}
          onChange={(v) => onChange({ primaryColor: v })}
        />

        <ColorInput
          id={`${id}-secondary`}
          label="Cor secundária"
          value={config.secondaryColor}
          onChange={(v) => onChange({ secondaryColor: v })}
        />
      </fieldset>

      {/* Preview das abas do app */}
      <div>
        <p className="mb-3 text-sm font-semibold">Pré-visualização das abas do app:</p>
        <MockupCelular>
          <div className="flex flex-col h-full min-h-[200px]">
            {/* Conteúdo simulado */}
            <div
              className="flex-1 p-3"
              style={{ backgroundColor: '#f4f4f4' }}
              aria-hidden="true"
            >
              <div className="h-3 w-3/4 rounded bg-gray-300 mb-2" />
              <div className="h-2 w-full rounded bg-gray-200 mb-1" />
              <div className="h-2 w-5/6 rounded bg-gray-200" />
            </div>

            {/* Barra de abas inferior simulada */}
            <nav
              aria-label="Simulação das abas do app"
              style={{ backgroundColor: primary }}
              className="flex justify-around px-2 py-2"
            >
              {['Início', 'Serviços', 'Notícias', 'Perfil'].map((label, i) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-0.5"
                  aria-current={i === 0 ? 'page' : undefined}
                >
                  <div
                    className="h-4 w-4 rounded"
                    style={{
                      backgroundColor: i === 0 ? '#ffffff' : `${secondary}99`,
                    }}
                    aria-hidden="true"
                  />
                  <span
                    className="text-[8px] font-semibold"
                    style={{ color: i === 0 ? '#ffffff' : `${secondary}cc` }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </nav>
          </div>
        </MockupCelular>
        <p className="mt-2 text-center text-xs text-fg/50">
          Pré-visualização meramente ilustrativa
        </p>
      </div>
    </div>
  );
}

// ─── Aba 5: Integrações ───────────────────────────────────────────────────────

function AbaIntegracoes({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (partial: Partial<AppConfig>) => void;
}) {
  const id = useId();
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoAcesso, setNovoAcesso] = useState<AcessoRapidoItem>({ titulo: '', path: '', icone: '' });

  function addCategoria() {
    const v = novaCategoria.trim();
    if (!v || config.categoriasChamados.includes(v)) return;
    onChange({ categoriasChamados: [...config.categoriasChamados, v] });
    setNovaCategoria('');
  }

  function removeCategoria(cat: string) {
    onChange({ categoriasChamados: config.categoriasChamados.filter((c) => c !== cat) });
  }

  function addAcesso() {
    if (!novoAcesso.titulo.trim() || !novoAcesso.path.trim()) return;
    onChange({ acessoRapido: [...config.acessoRapido, novoAcesso] });
    setNovoAcesso({ titulo: '', path: '', icone: '' });
  }

  function removeAcesso(i: number) {
    onChange({ acessoRapido: config.acessoRapido.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-8">
      {/* Push e biometria */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Funcionalidades do dispositivo</legend>

        <Toggle
          id={`${id}-push`}
          checked={config.pushHabilitado}
          onChange={(v) => onChange({ pushHabilitado: v })}
          label="Notificações Push"
          descricao="Permite enviar alertas e notificações para o dispositivo do cidadão. Requer configuração do serviço de push no backend."
        />

        <Toggle
          id={`${id}-bio`}
          checked={config.biometriaHabilitada}
          onChange={(v) => onChange({ biometriaHabilitada: v })}
          label="Autenticação biométrica"
          descricao="Permite que o cidadão use impressão digital ou Face ID para acessar o app após o primeiro login."
        />
      </fieldset>

      {/* Acesso rápido */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Acesso rápido (atalhos da home)</legend>
        <p className="text-xs text-fg/60">
          Atalhos exibidos na tela inicial do app para funcionalidades frequentes.
        </p>

        {config.acessoRapido.length > 0 ? (
          <ul role="list" className="space-y-2">
            {config.acessoRapido.map((item, i) => (
              <li
                key={i}
                className="flex flex-wrap items-center gap-3 rounded border border-border bg-bg p-2"
              >
                <div className="flex-1 min-w-0 text-sm">
                  <p className="font-semibold truncate">{item.titulo}</p>
                  <p className="text-fg/60 font-mono text-xs truncate">{item.path}</p>
                  {item.icone && (
                    <p className="text-xs text-fg/40">Ícone: {item.icone}</p>
                  )}
                </div>
                <button
                  type="button"
                  className={ui.btnDanger}
                  onClick={() => removeAcesso(i)}
                  aria-label={`Remover atalho ${item.titulo}`}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg/50">Nenhum atalho configurado.</p>
        )}

        <fieldset className="space-y-3 rounded border border-dashed border-border p-3">
          <legend className="px-1 text-xs font-semibold text-fg/60">Novo atalho</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor={`${id}-ar-titulo`} className="text-xs font-semibold">
                Título
              </label>
              <input
                id={`${id}-ar-titulo`}
                type="text"
                className={`${ui.input} mt-1 text-xs`}
                value={novoAcesso.titulo}
                onChange={(e) => setNovoAcesso({ ...novoAcesso, titulo: e.target.value })}
                placeholder="Ex.: 2ª via IPTU"
                maxLength={40}
              />
            </div>
            <div>
              <label htmlFor={`${id}-ar-path`} className="text-xs font-semibold">
                Rota / Path
              </label>
              <input
                id={`${id}-ar-path`}
                type="text"
                className={`${ui.input} mt-1 font-mono text-xs`}
                value={novoAcesso.path}
                onChange={(e) => setNovoAcesso({ ...novoAcesso, path: e.target.value })}
                placeholder="Ex.: /servicos/iptu"
              />
            </div>
            <div>
              <label htmlFor={`${id}-ar-icone`} className="text-xs font-semibold">
                Ícone (nome)
              </label>
              <input
                id={`${id}-ar-icone`}
                type="text"
                className={`${ui.input} mt-1 font-mono text-xs`}
                value={novoAcesso.icone}
                onChange={(e) => setNovoAcesso({ ...novoAcesso, icone: e.target.value })}
                placeholder="Ex.: document-text"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={addAcesso}
            disabled={!novoAcesso.titulo.trim() || !novoAcesso.path.trim()}
            className={ui.btnGhost}
            aria-label="Adicionar atalho de acesso rápido"
          >
            + Adicionar atalho
          </button>
        </fieldset>
      </fieldset>

      {/* Categorias de chamados */}
      <fieldset className="space-y-4 rounded border border-border p-4">
        <legend className="px-1 text-sm font-semibold">Categorias de chamados / denúncias</legend>
        <p className="text-xs text-fg/60">
          Categorias disponíveis ao cidadão ao abrir um chamado ou denúncia no app.
        </p>

        {config.categoriasChamados.length > 0 ? (
          <ul role="list" className="flex flex-wrap gap-2">
            {config.categoriasChamados.map((cat) => (
              <li key={cat} className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1">
                <span className="text-sm">{cat}</span>
                <button
                  type="button"
                  onClick={() => removeCategoria(cat)}
                  aria-label={`Remover categoria ${cat}`}
                  className="rounded text-fg/60 hover:text-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg/50">Nenhuma categoria cadastrada.</p>
        )}

        <div className="flex gap-2">
          <div className="flex-1">
            <label htmlFor={`${id}-cat-nova`} className="sr-only">
              Nova categoria
            </label>
            <input
              id={`${id}-cat-nova`}
              type="text"
              className={ui.input}
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategoria();
                }
              }}
              placeholder="Ex.: Buraco na rua"
              maxLength={60}
              aria-label="Nome da nova categoria de chamado"
            />
          </div>
          <button
            type="button"
            onClick={addCategoria}
            disabled={!novaCategoria.trim()}
            className={ui.btnGhost}
            aria-label="Adicionar categoria"
          >
            Adicionar
          </button>
        </div>
      </fieldset>
    </div>
  );
}

// ─── Aba 6: Builds ───────────────────────────────────────────────────────────

/** Status em andamento que disparam polling. */
const STATUS_EM_ANDAMENTO: BuildStatus[] = ['enfileirado', 'preparando', 'em_build'];

/** Rótulo legível e cor semântica para cada status (sem depender só de cor). */
const BUILD_STATUS_META: Record<
  BuildStatus,
  { label: string; cor: string; icone: React.ReactNode; spinner?: boolean }
> = {
  enfileirado: {
    label: 'Na fila',
    cor: 'text-fg/70 bg-muted border-border',
    spinner: true,
    icone: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" />
      </svg>
    ),
  },
  preparando: {
    label: 'Preparando',
    cor: 'text-fg/70 bg-muted border-border',
    spinner: true,
    icone: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
      </svg>
    ),
  },
  em_build: {
    label: 'Em build',
    cor: 'text-primary bg-primary/5 border-primary/30',
    spinner: true,
    icone: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M20 8h-2.81c-.45-.78-1.07-1.45-1.82-1.96L17 4.41 15.59 3l-2.17 2.17C12.96 5.06 12.49 5 12 5s-.96.06-1.41.17L8.41 3 7 4.41l1.62 1.63C7.88 6.55 7.26 7.22 6.81 8H4v2h2.09c-.05.33-.09.66-.09 1v1H4v2h2v1c0 .34.04.67.09 1H4v2h2.81c1.04 1.79 2.97 3 5.19 3s4.15-1.21 5.19-3H20v-2h-2.09c.05-.33.09-.66.09-1v-1h2v-2h-2v-1c0-.34-.04-.67-.09-1H20V8zm-6 8h-4v-2h4v2zm0-4h-4v-2h4v2z" />
      </svg>
    ),
  },
  concluido: {
    label: 'Concluído',
    cor: 'text-success bg-success/5 border-success/30',
    icone: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
      </svg>
    ),
  },
  falhou: {
    label: 'Falhou',
    cor: 'text-danger bg-danger/5 border-danger/30',
    icone: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" />
      </svg>
    ),
  },
};

/** Spinner SVG inline acessível. */
function Spinner({ label }: { label: string }) {
  return (
    <svg
      className="animate-spin"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      <title>{label}</title>
    </svg>
  );
}

/** Selo de status acessível: ícone + texto + cor (WCAG — não depende só de cor). */
function SeloStatus({ status }: { status: BuildStatus }) {
  const meta = BUILD_STATUS_META[status];
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-semibold',
        meta.cor,
      ].join(' ')}
      aria-label={`Status: ${meta.label}`}
    >
      {meta.spinner ? <Spinner label="Em andamento" /> : meta.icone}
      {meta.label}
    </span>
  );
}

/** Formata ISO string para data/hora em pt-BR. */
function fmtDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function AbaBuilds({ config }: { config: AppConfig }) {
  const easConfigurado = Boolean(config.easProjectId?.trim());

  const [builds, setBuilds] = useState<BuildItem[]>([]);
  const [carregandoBuilds, setCarregandoBuilds] = useState(true);
  const [erroBuilds, setErroBuilds] = useState('');

  // Estado do disparo de um novo build
  const [iniciando, setIniciando] = useState(false);
  const [erroIniciar, setErroIniciar] = useState('');
  const [sucessoIniciar, setSucessoIniciar] = useState('');

  // Modal de confirmação para build de produção
  const [confirmarProducao, setConfirmarProducao] = useState(false);

  // ref para o timer de polling (controla cleanup no desmonte)
  const pollingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Funções de API ──

  const carregarBuilds = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregandoBuilds(true);
    try {
      const lista = await adminGet<BuildItem[]>('/api/admin/app-config/builds?limit=20');
      setBuilds(lista ?? []);
      setErroBuilds('');
    } catch (err) {
      if (!silencioso) {
        setErroBuilds(
          err instanceof AdminApiError
            ? err.message
            : 'Falha ao carregar o histórico de builds.',
        );
      }
    } finally {
      if (!silencioso) setCarregandoBuilds(false);
    }
  }, []);

  // Polling: enquanto há builds em andamento, re-consulta a cada 15 s
  useEffect(() => {
    function agendar(lista: BuildItem[]) {
      const temEmAndamento = lista.some((b) =>
        STATUS_EM_ANDAMENTO.includes(b.status),
      );
      if (!temEmAndamento) return;
      pollingTimerRef.current = setTimeout(async () => {
        const novaLista = await adminGet<BuildItem[]>(
          '/api/admin/app-config/builds?limit=20',
        ).catch(() => lista);
        setBuilds(novaLista ?? lista);
        agendar(novaLista ?? lista);
      }, 15_000);
    }

    agendar(builds);

    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builds]);

  // Carga inicial
  useEffect(() => {
    carregarBuilds();
    return () => {
      if (pollingTimerRef.current) clearTimeout(pollingTimerRef.current);
    };
  }, [carregarBuilds]);

  // ── Iniciar build ──

  async function iniciarBuild(perfil: BuildPerfil) {
    setIniciando(true);
    setErroIniciar('');
    setSucessoIniciar('');
    try {
      const novo = await adminPost<BuildItem>('/api/admin/app-config/builds', { perfil });
      // Adiciona o novo build no topo da lista
      setBuilds((prev) => [novo, ...prev]);
      setSucessoIniciar(
        perfil === 'preview'
          ? 'Build de teste iniciado. Acompanhe o progresso abaixo.'
          : 'Build de produção iniciado. Acompanhe o progresso abaixo.',
      );
    } catch (err) {
      setErroIniciar(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao iniciar o build. Tente novamente.',
      );
    } finally {
      setIniciando(false);
      setConfirmarProducao(false);
    }
  }

  // ── Render ──

  return (
    <section aria-labelledby="builds-titulo" className="space-y-6">
      <div>
        <h2 id="builds-titulo" className="font-heading text-lg font-bold">
          Geração de APK
        </h2>
        <p className="mt-1 text-sm text-fg/70">
          Gere o APK do app desta prefeitura. O build roda na nuvem do EAS (Expo
          Application Services) e leva alguns minutos. Após concluído, o link
          para baixar o arquivo aparece no histórico abaixo.
        </p>
      </div>

      {/* Aviso EAS não configurado */}
      {!easConfigurado && (
        <aside
          role="note"
          className="flex items-start gap-2 rounded border border-warning/50 bg-warning/5 p-3 text-sm text-fg/80"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-warning"
          >
            <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
          </svg>
          <p>
            <strong>Projeto EAS ainda não configurado</strong> — peça à equipe
            Lidera para preencher o campo &quot;EAS Project ID&quot; na aba{' '}
            <em>Identidade &amp; Ícones</em>.
          </p>
        </aside>
      )}

      {/* Botões de disparo */}
      <div className="flex flex-wrap items-start gap-3">
        <button
          type="button"
          disabled={iniciando || !easConfigurado}
          onClick={() => iniciarBuild('preview')}
          className={ui.btn}
          aria-busy={iniciando}
          aria-disabled={!easConfigurado}
        >
          {iniciando ? (
            <>
              <Spinner label="Iniciando build…" />
              Iniciando…
            </>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M19 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c1.93 0 3.5 1.57 3.5 3.5S13.93 13 12 13s-3.5-1.57-3.5-3.5S10.07 6 12 6zm7 13H5v-.23c0-.62.28-1.2.76-1.58C7.47 15.82 9.64 15 12 15s4.53.82 6.24 2.19c.48.38.76.97.76 1.58V19z" />
              </svg>
              Gerar APK de teste
            </>
          )}
        </button>

        <button
          type="button"
          disabled={iniciando || !easConfigurado}
          onClick={() => setConfirmarProducao(true)}
          className={ui.btnGhost}
          aria-disabled={!easConfigurado}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
          </svg>
          Gerar versão de produção
        </button>
      </div>

      {/* Feedback das ações */}
      <div aria-live="polite" aria-atomic="true">
        {erroIniciar && (
          <p role="alert" className="rounded border border-danger bg-danger/5 p-3 text-sm text-danger">
            {erroIniciar}
          </p>
        )}
        {sucessoIniciar && (
          <p role="status" className="rounded border border-success bg-success/5 p-3 text-sm text-success">
            {sucessoIniciar}
          </p>
        )}
      </div>

      {/* Histórico de builds */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Histórico de builds</h3>

        {/* região de atualizações de status para leitores de tela */}
        <div aria-live="polite" aria-atomic="false" className="sr-only" role="status">
          {builds
            .filter((b) => STATUS_EM_ANDAMENTO.includes(b.status))
            .map((b) => (
              <span key={b.id}>
                Build {b.perfil === 'preview' ? 'de teste' : 'de produção'} de{' '}
                {fmtDateTime(b.criadoEm)}: {BUILD_STATUS_META[b.status].label}.
              </span>
            ))}
        </div>

        {carregandoBuilds ? (
          <p className="text-sm text-fg/60" role="status" aria-live="polite">
            <Spinner label="Carregando histórico…" />
            {' '}Carregando histórico de builds…
          </p>
        ) : erroBuilds ? (
          <div className="space-y-2">
            <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
              {erroBuilds}
            </p>
            <button
              type="button"
              onClick={() => carregarBuilds()}
              className={ui.btnGhost}
            >
              Tentar novamente
            </button>
          </div>
        ) : builds.length === 0 ? (
          <p className="rounded border border-dashed border-border p-6 text-center text-sm text-fg/50">
            Nenhum build iniciado ainda. Clique em &quot;Gerar APK de teste&quot; para começar.
          </p>
        ) : (
          <ul role="list" className="space-y-3">
            {builds.map((build) => {
              const emAndamento = STATUS_EM_ANDAMENTO.includes(build.status);
              return (
                <li
                  key={build.id}
                  className={[
                    'rounded border bg-bg p-4 space-y-3',
                    build.status === 'falhou'
                      ? 'border-danger/30'
                      : build.status === 'concluido'
                        ? 'border-success/30'
                        : 'border-border',
                  ].join(' ')}
                >
                  {/* Linha principal: perfil + data + status */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {build.perfil === 'preview' ? 'Teste (Preview)' : 'Produção'}
                      </span>
                      {build.plataforma && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-fg/60">
                          {build.plataforma}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <time
                        dateTime={build.criadoEm}
                        className="text-xs text-fg/50"
                        title={`Atualizado em ${fmtDateTime(build.atualizadoEm)}`}
                      >
                        {fmtDateTime(build.criadoEm)}
                      </time>
                      <SeloStatus status={build.status} />
                    </div>
                  </div>

                  {/* Indicador de andamento com texto */}
                  {emAndamento && (
                    <p className="flex items-center gap-2 text-xs text-fg/60">
                      <Spinner label="Build em andamento" />
                      Em andamento — atualizando automaticamente…
                    </p>
                  )}

                  {/* Resumo de erro da IA */}
                  {build.status === 'falhou' && build.erroResumo && (
                    <div
                      className="rounded border border-danger/20 bg-danger/5 p-3 text-sm"
                      role="note"
                      aria-label="Diagnóstico do erro"
                    >
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-danger/70">
                        Diagnóstico
                      </p>
                      <p className="text-fg/80">{build.erroResumo}</p>
                    </div>
                  )}

                  {/* Ações: baixar APK, ver log */}
                  {(build.easBuildUrl || build.logUrl || build.solicitadoPor) && (
                    <div className="flex flex-wrap items-center gap-3">
                      {build.easBuildUrl && build.status === 'concluido' && (
                        <a
                          href={build.easBuildUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ui.btn}
                          aria-label={`Baixar APK do build ${build.perfil === 'preview' ? 'de teste' : 'de produção'} de ${fmtDateTime(build.criadoEm)}`}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z" />
                          </svg>
                          Baixar APK
                        </a>
                      )}
                      {build.logUrl && (
                        <a
                          href={build.logUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={ui.btnGhost}
                          aria-label="Ver log completo do build no EAS"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6A4.997 4.997 0 0 1 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z" />
                          </svg>
                          Ver log
                        </a>
                      )}
                      {build.solicitadoPor && (
                        <span className="text-xs text-fg/40">
                          por {build.solicitadoPor}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Modal de confirmação — build de produção */}
      <Modal
        open={confirmarProducao}
        onClose={() => setConfirmarProducao(false)}
        title="Gerar versão de produção"
      >
        <div className="space-y-4">
          <p className="text-sm text-fg/80">
            Esta ação gera o pacote assinado para publicação na{' '}
            <strong>Play Store</strong>. O processo leva alguns minutos e
            consome créditos EAS. Tem certeza que deseja continuar?
          </p>
          <div
            className="rounded border border-warning/40 bg-warning/5 p-3 text-sm text-fg/70"
            role="note"
          >
            <strong>Atenção:</strong> certifique-se de que a versão do app
            (campo <em>appVersion</em>) foi atualizada antes de gerar um build
            de produção.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmarProducao(false)}
              className={ui.btnGhost}
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={iniciando}
              onClick={() => iniciarBuild('production')}
              className={ui.btn}
              aria-busy={iniciando}
            >
              {iniciando ? (
                <>
                  <Spinner label="Iniciando build de produção…" />
                  Iniciando…
                </>
              ) : (
                'Confirmar e gerar'
              )}
            </button>
          </div>
        </div>
      </Modal>
    </section>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const CONFIG_VAZIA: AppConfig = {
  appName: '',
  appShortName: '',
  bundleId: '',
  scheme: '',
  apiUrl: '',
  easProjectId: '',
  easOwner: '',
  appVersion: '1.0.0',
  iconUrl: '',
  splashUrl: '',
  splashBgColor: '#ffffff',
  primaryColor: '#1351b4',
  secondaryColor: '#2670e8',
  modulos: {
    denuncia: true,
    mapa: true,
    ouvidoria: true,
    esic: true,
    chat: true,
    servicos: true,
    noticias: true,
    carteira: false,
    galeria: true,
    documentos: true,
  },
  onboardingAtivo: false,
  onboardingSlides: [],
  acessoRapido: [],
  categoriasChamados: [],
  pushHabilitado: false,
  biometriaHabilitada: false,
};

export default function AppCidadaoPage() {
  const { role } = useSessaoAdmin();
  const superAdmin = role === 'super_admin';

  const [abaAtiva, setAbaAtiva] = useState<AbaId>('identidade');
  const [config, setConfig] = useState<AppConfig>(CONFIG_VAZIA);
  const configRef = useRef<AppConfig>(CONFIG_VAZIA);

  const [carregando, setCarregando] = useState(true);
  const [erroCarregar, setErroCarregar] = useState('');

  const [salvando, setSalvando] = useState(false);
  const [feedbackSalvar, setFeedbackSalvar] = useState<{
    tipo: 'ok' | 'erro';
    msg: string;
  } | null>(null);

  // Mantém configRef sempre atualizado sem re-render desnecessário
  function setConfigSync(next: AppConfig) {
    configRef.current = next;
    setConfig(next);
  }

  function patchConfig(partial: Partial<AppConfig>) {
    const next = { ...configRef.current, ...partial };
    setConfigSync(next);
  }

  // ── Carregar ──
  const carregar = useCallback(async () => {
    setCarregando(true);
    setErroCarregar('');
    try {
      const dados = await adminGet<AppConfig>('/api/admin/app-config');
      setConfigSync(dados);
    } catch (err) {
      setErroCarregar(
        err instanceof AdminApiError
          ? err.message
          : 'Falha ao carregar a configuração do app. Tente novamente.',
      );
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // ── Salvar (PATCH parcial por aba) ──
  async function salvarAba() {
    setSalvando(true);
    setFeedbackSalvar(null);

    // Extrai apenas os campos relevantes para a aba atual (PATCH parcial)
    const c = configRef.current;
    let payload: Partial<AppConfig> = {};

    switch (abaAtiva) {
      case 'identidade':
        payload = {
          appName: c.appName,
          appShortName: c.appShortName,
          iconUrl: c.iconUrl,
          splashUrl: c.splashUrl,
          splashBgColor: c.splashBgColor,
          ...(superAdmin
            ? {
                bundleId: c.bundleId,
                scheme: c.scheme,
                apiUrl: c.apiUrl,
                easProjectId: c.easProjectId,
                easOwner: c.easOwner,
                appVersion: c.appVersion,
              }
            : {}),
        };
        break;
      case 'onboarding':
        payload = {
          onboardingAtivo: c.onboardingAtivo,
          onboardingSlides: c.onboardingSlides,
        };
        break;
      case 'modulos':
        payload = { modulos: c.modulos };
        break;
      case 'tema':
        payload = {
          primaryColor: c.primaryColor,
          secondaryColor: c.secondaryColor,
        };
        break;
      case 'integracoes':
        payload = {
          pushHabilitado: c.pushHabilitado,
          biometriaHabilitada: c.biometriaHabilitada,
          acessoRapido: c.acessoRapido,
          categoriasChamados: c.categoriasChamados,
        };
        break;
      default:
        break;
    }

    try {
      await adminPatch('/api/admin/app-config', payload);
      setFeedbackSalvar({ tipo: 'ok', msg: 'Configurações salvas com sucesso.' });
    } catch (err) {
      setFeedbackSalvar({
        tipo: 'erro',
        msg:
          err instanceof AdminApiError
            ? err.message
            : 'Falha ao salvar. Tente novamente.',
      });
    } finally {
      setSalvando(false);
      // Remove feedback após 4 s
      setTimeout(() => setFeedbackSalvar(null), 4000);
    }
  }

  // ── Render ──

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-fg/60" role="status" aria-live="polite">
          Carregando configurações do app…
        </p>
      </div>
    );
  }

  if (erroCarregar) {
    return (
      <div className="space-y-4">
        <h1 className="font-heading text-2xl font-bold">App do Cidadão</h1>
        <p role="alert" className="rounded border border-danger p-3 text-sm text-danger">
          {erroCarregar}
        </p>
        <button type="button" onClick={carregar} className={ui.btnGhost}>
          Tentar novamente
        </button>
      </div>
    );
  }

  const abaAtual = ABAS.find((a) => a.id === abaAtiva);
  const buildAtiva = abaAtiva !== 'builds';

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <header>
        <h1 className="font-heading text-2xl font-bold">App do Cidadão</h1>
        <p className="mt-1 text-sm text-fg/70">
          Configure a identidade, os módulos e as integrações do aplicativo mobile da entidade.
          As configurações de módulos e integrações são aplicadas em tempo real; alterações
          de identidade visual requerem novo APK.
        </p>
      </header>

      {/* Abas */}
      <nav aria-label="Seções de configuração do app">
        <div
          role="tablist"
          aria-label="Configurações do App do Cidadão"
          className="flex flex-wrap gap-1 border-b border-border"
        >
          {ABAS.map((aba) => {
            const ativa = abaAtiva === aba.id;
            const desabilitada = Boolean('desabilitada' in aba && (aba as Record<string, unknown>).desabilitada);

            return (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={ativa}
                aria-disabled={desabilitada}
                disabled={desabilitada}
                onClick={() => !desabilitada && setAbaAtiva(aba.id)}
                className={[
                  'inline-flex items-center gap-2 rounded-t px-4 py-2.5 text-sm font-semibold',
                  'transition-colors focus-visible:outline focus-visible:outline-2',
                  'focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                  desabilitada
                    ? 'cursor-not-allowed text-fg/30'
                    : ativa
                      ? 'border-b-2 border-primary bg-primary/5 text-primary'
                      : 'text-fg/60 hover:bg-muted hover:text-fg',
                ].join(' ')}
              >
                {aba.label}
                {desabilitada && (
                  <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-normal text-fg/40">
                    em breve
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Conteúdo da aba ativa */}
      <div role="tabpanel" aria-label={abaAtual?.label}>
        {abaAtiva === 'identidade' && (
          <AbaIdentidade config={config} onChange={patchConfig} superAdmin={superAdmin} />
        )}
        {abaAtiva === 'onboarding' && (
          <AbaOnboarding config={config} onChange={patchConfig} />
        )}
        {abaAtiva === 'modulos' && (
          <AbaModulos config={config} onChange={patchConfig} />
        )}
        {abaAtiva === 'tema' && (
          <AbaTema config={config} onChange={patchConfig} />
        )}
        {abaAtiva === 'integracoes' && (
          <AbaIntegracoes config={config} onChange={patchConfig} />
        )}
        {abaAtiva === 'builds' && <AbaBuilds config={config} />}
      </div>

      {/* Rodapé de ação */}
      {buildAtiva && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div aria-live="polite" aria-atomic="true" className="flex-1">
            {feedbackSalvar && (
              <Aviso tipo={feedbackSalvar.tipo}>{feedbackSalvar.msg}</Aviso>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={carregar}
              disabled={salvando}
              className={ui.btnGhost}
            >
              Desfazer alterações
            </button>
            <button
              type="button"
              onClick={salvarAba}
              disabled={salvando}
              className={ui.btn}
              aria-busy={salvando}
            >
              {salvando ? (
                <>
                  <svg
                    className="animate-spin"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    aria-hidden="true"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Salvando…
                </>
              ) : (
                'Salvar alterações'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
