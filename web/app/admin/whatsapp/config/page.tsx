'use client';

/**
 * Configuração de WhatsApp por tenant.
 * Providers suportados: Z-API, Evolution API, Meta Cloud API (oficial).
 * Roles: ADMIN_PREFEITURA (verificado no backend).
 * WCAG 2.1 AA, pt-BR, sem segredos em claro.
 *
 * Seção adicional: Canais de WhatsApp (multi-número Meta).
 * Cada canal tem suas próprias credenciais Meta e webhook independente.
 */

import { useEffect, useId, useState, useCallback } from 'react';
import { AdminApiError, adminGet, adminPost, adminPut, adminDelete } from '../../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../../_components/ui';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Provider = 'zapi' | 'evolution' | 'meta';

interface WhatsappConfig {
  provider: Provider;
  fallbackProvider?: string | null;
  // Z-API
  zapiInstanceId?: string | null;
  zapiTokenDefinido: boolean;
  zapiClientTokenDefinido: boolean;
  zapiWebhookSecretDefinido: boolean;
  // Evolution
  evolutionApiUrl?: string | null;
  evolutionInstance?: string | null;
  evolutionApiKeyDefinida: boolean;
  // Meta
  metaPhoneNumberId?: string | null;
  metaWabaId?: string | null;
  metaTokenDefinido: boolean;
  metaAppSecretDefinido: boolean;
  metaVerifyTokenDefinido: boolean;
  metaWebhookSecretDefinido: boolean;
  ativo: boolean;
}

interface MetaWebhookInfo {
  callbackUrl: string | null;
  verifyTokenDefinido: boolean;
  appSecretDefinido: boolean;
  phoneNumberIdDefinido: boolean;
  pronto: boolean;
  aviso: string;
}

interface StatusConexao {
  conectado: boolean;
  detalhe?: string;
}

// ─── Tipos de canal multi-número ──────────────────────────────────────────────

/** Tipos de canal suportados. */
type TipoCanal = 'whatsapp' | 'instagram' | 'messenger' | 'telegram';

interface Canal {
  id: string;
  label: string;
  provider: string;
  /** Tipo do canal: whatsapp (padrão), instagram, messenger ou telegram. */
  tipo: TipoCanal;
  metaPhoneNumberId?: string | null;
  metaWabaId?: string | null;
  secretariaId?: string | null;
  ativo: boolean;
  ordem: number;
  metaTokenDefinido: boolean;
  metaAppSecretDefinido: boolean;
  metaVerifyTokenDefinido: boolean;
  webhookSecretDefinido: boolean;
  atualizadoEm: string;
}

interface CanalWebhookInfo {
  callbackUrl: string | null;
  verifyTokenDefinido: boolean;
  appSecretDefinido: boolean;
  phoneNumberIdDefinido: boolean;
  pronto: boolean;
  aviso: string;
}

// ─── Rótulos amigáveis por tipo de canal ─────────────────────────────────────

const TIPO_LABEL: Record<TipoCanal, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Facebook Messenger',
  telegram: 'Telegram',
};

/**
 * Retorna os rótulos adaptativos para os campos do formulário de canal
 * de acordo com o tipo selecionado.
 */
function labelsPorTipo(tipo: TipoCanal) {
  switch (tipo) {
    case 'instagram':
      return {
        phoneId: 'ID da conta Instagram / Página',
        phoneIdHint: 'ID numérico da conta Instagram ou da Página vinculada',
        wabaId: 'Business Account ID (WABA ID — opcional)',
        token: 'Page Access Token',
        tokenHint: '(token de página de longa duração)',
        appSecret: 'App Secret',
        appSecretHint: '(valida a assinatura do webhook)',
        verifyToken: 'Verify token do webhook',
        verifyTokenHint: 'Você escolhe este valor e usa o mesmo no painel da Meta',
        mostrarPhoneId: true,
        mostrarWabaId: true,
        mostrarAppSecret: true,
        mostrarVerifyToken: true,
      } as const;
    case 'messenger':
      return {
        phoneId: 'ID da Página (Page ID)',
        phoneIdHint: 'ID numérico da Página do Facebook',
        wabaId: 'Business Account ID (opcional)',
        token: 'Page Access Token',
        tokenHint: '(token de página de longa duração)',
        appSecret: 'App Secret',
        appSecretHint: '(valida a assinatura do webhook)',
        verifyToken: 'Verify token do webhook',
        verifyTokenHint: 'Você escolhe este valor e usa o mesmo no painel da Meta',
        mostrarPhoneId: true,
        mostrarWabaId: true,
        mostrarAppSecret: true,
        mostrarVerifyToken: true,
      } as const;
    case 'telegram':
      return {
        phoneId: '', // não usado
        phoneIdHint: '',
        wabaId: '',
        token: 'Token do Bot (BotFather)',
        tokenHint: '(token gerado pelo @BotFather no Telegram)',
        appSecret: '',
        appSecretHint: '',
        verifyToken: 'Secret token do webhook (opcional)',
        verifyTokenHint: 'Enviado pelo Telegram no header X-Telegram-Bot-Api-Secret-Token para validar requisições',
        mostrarPhoneId: false,
        mostrarWabaId: false,
        mostrarAppSecret: false,
        mostrarVerifyToken: true,
      } as const;
    default: // whatsapp
      return {
        phoneId: 'ID do número de telefone',
        phoneIdHint: '(Phone Number ID)',
        wabaId: 'WhatsApp Business Account ID (WABA ID — opcional)',
        token: 'Access token permanente',
        tokenHint: '(token de sistema ou usuário de longa duração)',
        appSecret: 'App Secret',
        appSecretHint: '(valida a assinatura do webhook)',
        verifyToken: 'Verify token do webhook',
        verifyTokenHint: 'Você escolhe este valor e usa o mesmo no painel da Meta',
        mostrarPhoneId: true,
        mostrarWabaId: true,
        mostrarAppSecret: true,
        mostrarVerifyToken: true,
      } as const;
  }
}

interface SecretariaOpt {
  id: string;
  nome: string;
}

// ─── Estado inicial do formulário de canal ────────────────────────────────────

interface FormCanal {
  label: string;
  tipo: TipoCanal;
  metaPhoneNumberId: string;
  metaWabaId: string;
  metaToken: string;
  metaAppSecret: string;
  metaVerifyToken: string;
  secretariaId: string;
  ativo: boolean;
  ordem: string;
}

const FORM_VAZIO: FormCanal = {
  label: '',
  tipo: 'whatsapp',
  metaPhoneNumberId: '',
  metaWabaId: '',
  metaToken: '',
  metaAppSecret: '',
  metaVerifyToken: '',
  secretariaId: '',
  ativo: true,
  ordem: '0',
};

// ─── Auxiliar: campo de segredo com máscara ───────────────────────────────────

/**
 * Input do tipo password com placeholder especial quando o segredo já está
 * definido no servidor. Envia o valor somente se o usuário digitou algo
 * (campo vazio = mantém o atual — backend segue a mesma regra).
 */
function CampoSegredo({
  id,
  label,
  descricao,
  definido,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  descricao?: string;
  definido: boolean;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
        {descricao && (
          <span className="ml-1 font-normal text-fg/50">{descricao}</span>
        )}
      </label>
      <input
        id={id}
        type="password"
        autoComplete={autoComplete ?? 'new-password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={definido ? '•••••••• definido' : 'Cole o valor aqui'}
        aria-describedby={`${id}-hint`}
        className={ui.input + ' mt-1'}
      />
      <p id={`${id}-hint`} className="mt-0.5 text-xs text-fg/50">
        {definido
          ? 'Deixe vazio para manter o valor atual.'
          : 'Obrigatório para ativar este provider.'}
      </p>
    </div>
  );
}

// ─── Bloco de informações do webhook Meta ─────────────────────────────────────

function BlocoWebhookMeta({ pronto }: { pronto: boolean }) {
  const [info, setInfo] = useState<MetaWebhookInfo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const dados = await adminGet<MetaWebhookInfo>('/api/admin/whatsapp/meta-webhook-info');
      setInfo(dados);
    } catch {
      // silencioso — aviso aparece no bloco
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    if (pronto) {
      carregar();
    }
  }, [pronto, carregar]);

  async function copiar() {
    if (!info?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(info.callbackUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Fallback: select/copy manual
      const el = document.getElementById('meta-callback-url') as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  return (
    <section aria-labelledby="sec-meta-webhook" className={ui.card + ' p-4'}>
      <h3 id="sec-meta-webhook" className="mb-3 font-heading text-sm font-bold">
        Configuração do Webhook (Meta)
      </h3>

      {carregando && (
        <p className="text-sm text-fg/60">Carregando informações do webhook…</p>
      )}

      {!carregando && info && (
        <>
          {info.aviso && (
            <p
              role={info.pronto ? 'status' : 'alert'}
              aria-live="polite"
              className={
                'mb-3 rounded border p-2 text-sm ' +
                (info.pronto
                  ? 'border-success/40 text-success'
                  : 'border-warning/60 text-fg/80')
              }
            >
              {info.aviso}
            </p>
          )}

          {info.callbackUrl ? (
            <div className="space-y-3">
              <div>
                <label htmlFor="meta-callback-url" className={ui.label}>
                  Callback URL{' '}
                  <span className="font-normal text-fg/50">
                    (cole no app da Meta → Webhooks)
                  </span>
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="meta-callback-url"
                    type="text"
                    readOnly
                    value={info.callbackUrl}
                    className={ui.input + ' flex-1 select-all font-mono text-xs'}
                    aria-label="Callback URL do webhook Meta"
                  />
                  <button
                    type="button"
                    onClick={copiar}
                    className={ui.btnGhost + ' shrink-0 text-xs'}
                    aria-label={copiado ? 'URL copiada' : 'Copiar URL'}
                  >
                    {copiado ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>

              <div className="rounded border border-border/60 bg-muted/40 p-3 text-xs text-fg/70 space-y-1">
                <p className="font-semibold text-fg/80">Como configurar no painel da Meta:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Acesse <strong>developers.facebook.com</strong> → seu App.</li>
                  <li>Vá em <strong>WhatsApp → Configurações</strong> → seção <strong>Webhooks</strong>.</li>
                  <li>Clique em <strong>Editar</strong> e cole a <strong>Callback URL</strong> acima.</li>
                  <li>No campo <strong>Verify Token</strong>, cole o valor que você definiu em &quot;Verify token do webhook&quot; acima.</li>
                  <li>Assine o campo <strong>messages</strong> e clique em Verificar e Salvar.</li>
                </ol>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg/60">
              Salve as credenciais (provider Meta + Phone Number ID + tokens) para gerar a URL.
            </p>
          )}

          {!info.pronto && (
            <button
              type="button"
              onClick={carregar}
              className={ui.btnGhost + ' mt-3 text-xs'}
            >
              Recarregar informações
            </button>
          )}
        </>
      )}

      {!carregando && !info && (
        <p className="text-sm text-fg/60">
          Salve a configuração com provider Meta para exibir as informações do webhook.
        </p>
      )}
    </section>
  );
}

// ─── Bloco de webhook de um canal específico ──────────────────────────────────

/** Instruções de configuração manual por tipo de canal (Meta). */
function InstrucoesWebhookMeta({ tipo }: { tipo: TipoCanal }) {
  if (tipo === 'messenger') {
    return (
      <div className="rounded border border-border/60 bg-muted/40 p-3 text-xs text-fg/70 space-y-1">
        <p className="font-semibold text-fg/80">Como configurar no painel da Meta (Messenger):</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Acesse <strong>developers.facebook.com</strong> → seu App.</li>
          <li>Vá em <strong>Messenger → Configurações</strong> → seção <strong>Webhooks</strong>.</li>
          <li>Clique em <strong>Adicionar callback URL</strong> e cole a <strong>Callback URL</strong> acima.</li>
          <li>No campo <strong>Verify Token</strong>, use o valor definido em &quot;Verify token do webhook&quot; deste canal.</li>
          <li>Assine o campo <strong>messages</strong> e clique em Verificar e Salvar.</li>
        </ol>
      </div>
    );
  }
  if (tipo === 'instagram') {
    return (
      <div className="rounded border border-border/60 bg-muted/40 p-3 text-xs text-fg/70 space-y-1">
        <p className="font-semibold text-fg/80">Como configurar no painel da Meta (Instagram):</p>
        <ol className="list-decimal list-inside space-y-0.5">
          <li>Acesse <strong>developers.facebook.com</strong> → seu App.</li>
          <li>Vá em <strong>Instagram → Configurações</strong> → seção <strong>Webhooks</strong>.</li>
          <li>Clique em <strong>Editar</strong> e cole a <strong>Callback URL</strong> acima.</li>
          <li>No campo <strong>Verify Token</strong>, use o valor definido em &quot;Verify token do webhook&quot; deste canal.</li>
          <li>Assine o campo <strong>messages</strong> e clique em Verificar e Salvar.</li>
        </ol>
      </div>
    );
  }
  // WhatsApp (padrão)
  return (
    <div className="rounded border border-border/60 bg-muted/40 p-3 text-xs text-fg/70 space-y-1">
      <p className="font-semibold text-fg/80">Como configurar no painel da Meta (WhatsApp):</p>
      <ol className="list-decimal list-inside space-y-0.5">
        <li>Acesse <strong>developers.facebook.com</strong> → seu App.</li>
        <li>Vá em <strong>WhatsApp → Configurações</strong> → seção <strong>Webhooks</strong>.</li>
        <li>Clique em <strong>Editar</strong> e cole a <strong>Callback URL</strong> acima.</li>
        <li>No campo <strong>Verify Token</strong>, use o valor definido em &quot;Verify token do webhook&quot; deste canal.</li>
        <li>Assine o campo <strong>messages</strong> e clique em Verificar e Salvar.</li>
      </ol>
    </div>
  );
}

function BlocoWebhookCanal({
  canalId,
  label,
  tipo,
  onFechar,
}: {
  canalId: string;
  label: string;
  tipo: TipoCanal;
  onFechar: () => void;
}) {
  const [info, setInfo] = useState<CanalWebhookInfo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Estado do botão "Configurar webhook automaticamente" (Telegram)
  const [configurando, setConfigurando] = useState(false);
  const [resultadoTg, setResultadoTg] = useState<{ ok: boolean; descricao: string } | null>(null);

  const inputId = `webhook-canal-url-${canalId}`;

  useEffect(() => {
    setCarregando(true);
    setErro('');
    adminGet<CanalWebhookInfo>(`/api/admin/whatsapp/canais/${canalId}/webhook-info`)
      .then(setInfo)
      .catch((e) =>
        setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar webhook do canal.'),
      )
      .finally(() => setCarregando(false));
  }, [canalId]);

  async function copiar() {
    if (!info?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(info.callbackUrl);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  }

  /** Chama POST /api/admin/whatsapp/canais/:id/telegram-setwebhook */
  async function configurarTelegram() {
    setConfigurando(true);
    setResultadoTg(null);
    try {
      const res = await adminPost<{ ok: boolean; descricao: string }>(
        `/api/admin/whatsapp/canais/${canalId}/telegram-setwebhook`,
        {},
      );
      setResultadoTg(res);
    } catch (e) {
      setResultadoTg({
        ok: false,
        descricao: e instanceof AdminApiError ? e.message : 'Falha ao configurar webhook do Telegram.',
      });
    } finally {
      setConfigurando(false);
    }
  }

  const ehTelegram = tipo === 'telegram';

  return (
    <Modal open onClose={onFechar} title={`Webhook — ${label}`}>
      {carregando && (
        <p className="py-4 text-sm text-fg/60" aria-live="polite">
          Carregando informações do webhook…
        </p>
      )}

      {erro && (
        <p role="alert" className="rounded border border-danger/40 p-2 text-sm text-danger">
          {erro}
        </p>
      )}

      {!carregando && info && (
        <div className="space-y-4">
          {info.aviso && (
            <p
              role={info.pronto ? 'status' : 'alert'}
              aria-live="polite"
              className={
                'rounded border p-2 text-sm ' +
                (info.pronto
                  ? 'border-success/40 text-success'
                  : 'border-warning/60 text-fg/80')
              }
            >
              {info.aviso}
            </p>
          )}

          {info.callbackUrl ? (
            <div>
              <label htmlFor={inputId} className={ui.label}>
                {ehTelegram ? 'URL do webhook do bot' : 'Callback URL'}{' '}
                <span className="font-normal text-fg/50">
                  {ehTelegram
                    ? '(registrada via Bot API)'
                    : `(cole no app da Meta → ${TIPO_LABEL[tipo]} → Webhooks)`}
                </span>
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id={inputId}
                  type="text"
                  readOnly
                  value={info.callbackUrl}
                  className={ui.input + ' flex-1 select-all font-mono text-xs'}
                  aria-label={`URL do webhook do canal ${label}`}
                />
                <button
                  type="button"
                  onClick={copiar}
                  className={ui.btnGhost + ' shrink-0 text-xs'}
                  aria-label={copiado ? 'URL copiada' : 'Copiar URL'}
                >
                  {copiado ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg/60">
              {ehTelegram
                ? 'Salve o canal com o Token do Bot para gerar a URL do webhook.'
                : 'Salve as credenciais do canal para gerar a URL de webhook.'}
            </p>
          )}

          {/* Botão de configuração automática — apenas Telegram */}
          {ehTelegram && info.callbackUrl && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={configurarTelegram}
                disabled={configurando}
                className={ui.btn + ' text-sm'}
                aria-label="Configurar webhook automaticamente no Telegram via Bot API"
              >
                {configurando ? 'Configurando…' : 'Configurar webhook automaticamente'}
              </button>

              {resultadoTg && (
                <p
                  role={resultadoTg.ok ? 'status' : 'alert'}
                  aria-live="polite"
                  className={
                    'rounded border p-2 text-sm ' +
                    (resultadoTg.ok
                      ? 'border-success/40 text-success'
                      : 'border-danger/40 text-danger')
                  }
                >
                  {resultadoTg.descricao}
                </p>
              )}

              <div className="rounded border border-border/60 bg-muted/40 p-3 text-xs text-fg/70 space-y-1">
                <p className="font-semibold text-fg/80">Como funciona:</p>
                <ol className="list-decimal list-inside space-y-0.5">
                  <li>Clique em <strong>Configurar webhook automaticamente</strong> — o sistema chama a Bot API do Telegram por você.</li>
                  <li>Alternativamente, registre manualmente via:<br />
                    <code className="rounded bg-muted px-1 py-0.5">POST https://api.telegram.org/bot&lt;TOKEN&gt;/setWebhook</code>
                    <br />com o campo <code>url</code> apontando para a URL acima.
                  </li>
                </ol>
              </div>
            </div>
          )}

          {/* Instruções para canais Meta (WhatsApp, Instagram, Messenger) */}
          {!ehTelegram && info.callbackUrl && (
            <InstrucoesWebhookMeta tipo={tipo} />
          )}

          <div className="flex justify-end">
            <button type="button" onClick={onFechar} className={ui.btnGhost}>
              Fechar
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Formulário de canal (criar/editar) ──────────────────────────────────────

function FormularioCanal({
  canal,
  secretarias,
  onSalvo,
  onCancelar,
}: {
  canal: Canal | null; // null = criar novo
  secretarias: SecretariaOpt[];
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const idb = useId();
  const [form, setForm] = useState<FormCanal>(() =>
    canal
      ? {
          label: canal.label,
          tipo: canal.tipo ?? 'whatsapp',
          metaPhoneNumberId: canal.metaPhoneNumberId ?? '',
          metaWabaId: canal.metaWabaId ?? '',
          metaToken: '',
          metaAppSecret: '',
          metaVerifyToken: '',
          secretariaId: canal.secretariaId ?? '',
          ativo: canal.ativo,
          ordem: String(canal.ordem),
        }
      : { ...FORM_VAZIO },
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  // Rótulos adaptativos conforme o tipo selecionado
  const labels = labelsPorTipo(form.tipo);

  function set<K extends keyof FormCanal>(k: K, v: FormCanal[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) { setErro('O nome do canal é obrigatório.'); return; }
    // Telegram não usa phoneId; os demais exigem.
    if (form.tipo !== 'telegram' && !form.metaPhoneNumberId.trim()) {
      setErro(`O ${labels.phoneId} é obrigatório.`);
      return;
    }
    setSalvando(true);
    setErro('');

    const body: Record<string, unknown> = {
      label: form.label.trim(),
      tipo: form.tipo,
      ativo: form.ativo,
      ordem: Number(form.ordem) || 0,
      // Segredos: envia só se digitados
      ...(form.metaToken ? { metaToken: form.metaToken } : {}),
      ...(form.metaAppSecret ? { metaAppSecret: form.metaAppSecret } : {}),
    };

    // Campos condicionais por tipo
    if (form.tipo !== 'telegram') {
      body.metaPhoneNumberId = form.metaPhoneNumberId.trim();
      if (form.metaWabaId.trim()) body.metaWabaId = form.metaWabaId.trim();
    }
    if (form.metaVerifyToken.trim()) body.metaVerifyToken = form.metaVerifyToken.trim();
    if (form.secretariaId.trim()) body.secretariaId = form.secretariaId.trim();

    try {
      if (canal) {
        await adminPut(`/api/admin/whatsapp/canais/${canal.id}`, body);
      } else {
        await adminPost('/api/admin/whatsapp/canais', body);
      }
      onSalvo();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar canal.');
    } finally {
      setSalvando(false);
    }
  }

  const titulo = canal
    ? `Editar canal — ${canal.label}`
    : `Novo canal — ${TIPO_LABEL[form.tipo]}`;

  return (
    <Modal open onClose={onCancelar} title={titulo}>
      <form onSubmit={salvar} noValidate className="space-y-4">
        {erro && (
          <p role="alert" className="rounded border border-danger/40 p-2 text-sm text-danger">
            {erro}
          </p>
        )}

        {/* Tipo do canal */}
        <div>
          <label htmlFor={`${idb}-canal-tipo`} className={ui.label}>
            Tipo do canal <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <select
            id={`${idb}-canal-tipo`}
            value={form.tipo}
            onChange={(e) => set('tipo', e.target.value as TipoCanal)}
            className={ui.input + ' mt-1'}
            aria-required="true"
          >
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Facebook Messenger</option>
            <option value="telegram">Telegram</option>
          </select>
          <p className="mt-0.5 text-xs text-fg/50">
            {form.tipo === 'telegram'
              ? 'Canal via Bot do Telegram (token gerado pelo @BotFather).'
              : form.tipo === 'messenger'
              ? 'Canal via Messenger API (Página do Facebook + token de página).'
              : form.tipo === 'instagram'
              ? 'Canal via Instagram Messaging API (conta Business + Página vinculada).'
              : 'Canal via Meta Cloud API — número de telefone WhatsApp Business.'}
          </p>
        </div>

        {/* Nome do canal */}
        <div>
          <label htmlFor={`${idb}-canal-label`} className={ui.label}>
            Nome do canal <span className="text-danger" aria-hidden="true">*</span>
          </label>
          <input
            id={`${idb}-canal-label`}
            type="text"
            required
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder="Ex.: Saúde, Educação, Geral"
            className={ui.input + ' mt-1'}
            aria-required="true"
          />
        </div>

        {/* Phone Number ID / Page ID — oculto para Telegram */}
        {labels.mostrarPhoneId && (
          <div>
            <label htmlFor={`${idb}-canal-phone-id`} className={ui.label}>
              {labels.phoneId}{' '}
              {labels.phoneIdHint && (
                <span className="font-normal text-fg/50">{labels.phoneIdHint}</span>
              )}{' '}
              <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input
              id={`${idb}-canal-phone-id`}
              type="text"
              required
              value={form.metaPhoneNumberId}
              onChange={(e) => set('metaPhoneNumberId', e.target.value)}
              placeholder="123456789012345"
              className={ui.input + ' mt-1'}
              aria-required="true"
            />
          </div>
        )}

        {/* WABA ID — oculto para Telegram */}
        {labels.mostrarWabaId && (
          <div>
            <label htmlFor={`${idb}-canal-waba-id`} className={ui.label}>
              {labels.wabaId}
            </label>
            <input
              id={`${idb}-canal-waba-id`}
              type="text"
              value={form.metaWabaId}
              onChange={(e) => set('metaWabaId', e.target.value)}
              placeholder="987654321098765"
              className={ui.input + ' mt-1'}
            />
          </div>
        )}

        {/* Token (BotToken para Telegram; Access Token para Meta) */}
        <CampoSegredo
          id={`${idb}-canal-meta-token`}
          label={labels.token}
          descricao={labels.tokenHint}
          definido={canal?.metaTokenDefinido ?? false}
          value={form.metaToken}
          onChange={(v) => set('metaToken', v)}
        />

        {/* App Secret — oculto para Telegram */}
        {labels.mostrarAppSecret && (
          <CampoSegredo
            id={`${idb}-canal-app-secret`}
            label={labels.appSecret}
            descricao={labels.appSecretHint}
            definido={canal?.metaAppSecretDefinido ?? false}
            value={form.metaAppSecret}
            onChange={(v) => set('metaAppSecret', v)}
          />
        )}

        {/* Verify Token / Secret token do webhook */}
        {labels.mostrarVerifyToken && (
          <div>
            <label htmlFor={`${idb}-canal-verify-token`} className={ui.label}>
              {labels.verifyToken}{' '}
              <span className="font-normal text-fg/50">({labels.verifyTokenHint})</span>
            </label>
            <input
              id={`${idb}-canal-verify-token`}
              type="text"
              value={form.metaVerifyToken}
              onChange={(e) => set('metaVerifyToken', e.target.value)}
              placeholder={
                canal?.metaVerifyTokenDefinido
                  ? '•••••• definido (deixe vazio para manter)'
                  : form.tipo === 'telegram'
                  ? 'Ex.: meu-secret-token (opcional)'
                  : 'Ex.: meu-token-secreto-123'
              }
              className={ui.input + ' mt-1'}
            />
          </div>
        )}

        {/* Secretaria */}
        <div>
          <label htmlFor={`${idb}-canal-secretaria`} className={ui.label}>
            Secretaria <span className="font-normal text-fg/50">(opcional)</span>
          </label>
          {secretarias.length > 0 ? (
            <select
              id={`${idb}-canal-secretaria`}
              value={form.secretariaId}
              onChange={(e) => set('secretariaId', e.target.value)}
              className={ui.input + ' mt-1'}
            >
              <option value="">Nenhuma (canal geral)</option>
              {secretarias.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${idb}-canal-secretaria`}
              type="text"
              value={form.secretariaId}
              onChange={(e) => set('secretariaId', e.target.value)}
              placeholder="UUID da secretaria (opcional)"
              className={ui.input + ' mt-1'}
              aria-describedby={`${idb}-canal-secretaria-hint`}
            />
          )}
          <p id={`${idb}-canal-secretaria-hint`} className="mt-0.5 text-xs text-fg/50">
            Vincule este canal a uma secretaria para roteamento automático de atendimentos.
          </p>
        </div>

        {/* Ordem */}
        <div>
          <label htmlFor={`${idb}-canal-ordem`} className={ui.label}>
            Ordem de exibição
          </label>
          <input
            id={`${idb}-canal-ordem`}
            type="number"
            min="0"
            value={form.ordem}
            onChange={(e) => set('ordem', e.target.value)}
            className={ui.input + ' mt-1 w-32'}
          />
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input
            id={`${idb}-canal-ativo`}
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set('ativo', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
          />
          <label htmlFor={`${idb}-canal-ativo`} className="text-sm font-semibold">
            Canal ativo
          </label>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onCancelar} className={ui.btnGhost}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : canal ? 'Salvar alterações' : 'Criar canal'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Seção de canais multi-número ─────────────────────────────────────────────

function SecaoCanais() {
  const [canais, setCanais] = useState<Canal[]>([]);
  const [secretarias, setSecretarias] = useState<SecretariaOpt[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  // Modal de formulário
  const [modalForm, setModalForm] = useState<{ aberto: boolean; canal: Canal | null }>({
    aberto: false,
    canal: null,
  });

  // Bloco de webhook de canal
  const [webhookCanal, setWebhookCanal] = useState<{ id: string; label: string; tipo: TipoCanal } | null>(null);

  // Confirmação de exclusão
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  function feedback(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(''), 4000);
  }

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const dados = await adminGet<Canal[]>('/api/admin/whatsapp/canais');
      setCanais(dados);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar canais.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    // Carrega secretarias para o select do formulário
    adminGet<{ items?: SecretariaOpt[] } | SecretariaOpt[]>('/api/admin/secretarias?pageSize=200')
      .then((r) => {
        const lista = Array.isArray(r) ? r : (r.items ?? []);
        setSecretarias(lista);
      })
      .catch(() => setSecretarias([]));
  }, [carregar]);

  async function excluir(id: string) {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/whatsapp/canais/${id}`);
      setConfirmandoId(null);
      feedback('Canal excluído com sucesso.');
      await carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir canal.');
    } finally {
      setExcluindo(false);
    }
  }

  async function aoSalvar() {
    setModalForm({ aberto: false, canal: null });
    feedback(modalForm.canal ? 'Canal atualizado com sucesso.' : 'Canal criado com sucesso.');
    await carregar();
  }

  return (
    <section aria-labelledby="sec-canais-multi" className="space-y-4">
      {/* Cabeçalho da seção */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="sec-canais-multi" className="font-heading text-base font-bold">
            Canais (multi-número / multi-plataforma)
          </h2>
          <p className="text-xs text-fg/60">
            Canais adicionais com webhook próprio: WhatsApp, Instagram, Facebook Messenger e Telegram.
            Úteis para separar atendimentos por secretaria, assunto ou plataforma.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setModalForm({ aberto: true, canal: null })}
          className={ui.btn + ' text-sm'}
        >
          + Novo canal
        </button>
      </div>

      {/* Feedback */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Estado de carregamento */}
      {carregando && (
        <p className="text-sm text-fg/60" aria-live="polite">
          Carregando canais…
        </p>
      )}

      {/* Lista vazia */}
      {!carregando && canais.length === 0 && (
        <div className={ui.card + ' p-5 text-center'}>
          <p className="text-sm text-fg/60">
            Nenhum canal cadastrado. Clique em <strong>+ Novo canal</strong> para adicionar.
          </p>
        </div>
      )}

      {/* Lista de canais */}
      {!carregando && canais.length > 0 && (
        <ul className="space-y-2" role="list" aria-label="Canais cadastrados">
          {canais.map((c) => {
            const tipoCanal: TipoCanal = (c.tipo ?? 'whatsapp') as TipoCanal;
            const tipoLabel = TIPO_LABEL[tipoCanal] ?? tipoCanal;
            return (
            <li key={c.id} className={ui.card + ' p-4'}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                {/* Informações do canal */}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.label}</span>
                    {/* Badge de tipo de canal */}
                    <span
                      className={ui.badge + ' bg-primary/10 text-primary'}
                      aria-label={`Tipo: ${tipoLabel}`}
                    >
                      {tipoLabel}
                    </span>
                    <span
                      className={
                        ui.badge +
                        ' ' +
                        (c.ativo
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-fg/50')
                      }
                      aria-label={c.ativo ? 'Canal ativo' : 'Canal inativo'}
                    >
                      {c.ativo ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {/* Phone ID / Page ID — não exibido para Telegram */}
                  {tipoCanal !== 'telegram' && c.metaPhoneNumberId && c.metaPhoneNumberId !== 'telegram' && (
                    <p className="truncate font-mono text-xs text-fg/60">
                      {tipoCanal === 'messenger' ? 'Page ID' : tipoCanal === 'instagram' ? 'IG Account ID' : 'Phone ID'}:{' '}
                      {c.metaPhoneNumberId}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs text-fg/50">
                    <span
                      className={c.metaTokenDefinido ? 'text-success' : 'text-fg/40'}
                      title={c.metaTokenDefinido ? 'Token definido' : 'Token não definido'}
                    >
                      {tipoCanal === 'telegram' ? 'BotToken' : 'Token'}{' '}
                      {c.metaTokenDefinido ? '✓' : '✗'}
                    </span>
                    {tipoCanal !== 'telegram' && (
                      <span
                        className={c.metaAppSecretDefinido ? 'text-success' : 'text-fg/40'}
                        title={c.metaAppSecretDefinido ? 'App Secret definido' : 'App Secret não definido'}
                      >
                        App Secret {c.metaAppSecretDefinido ? '✓' : '✗'}
                      </span>
                    )}
                    <span
                      className={c.metaVerifyTokenDefinido ? 'text-success' : 'text-fg/40'}
                      title={
                        tipoCanal === 'telegram'
                          ? c.metaVerifyTokenDefinido ? 'Secret token definido' : 'Secret token não definido'
                          : c.metaVerifyTokenDefinido ? 'Verify Token definido' : 'Verify Token não definido'
                      }
                    >
                      {tipoCanal === 'telegram' ? 'Secret Token' : 'Verify Token'}{' '}
                      {c.metaVerifyTokenDefinido ? '✓' : '✗'}
                    </span>
                  </div>
                </div>

                {/* Ações */}
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWebhookCanal({ id: c.id, label: c.label, tipo: tipoCanal })}
                    className={ui.btnGhost + ' text-xs'}
                    aria-label={`Ver informações de webhook do canal ${c.label}`}
                  >
                    Webhook
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalForm({ aberto: true, canal: c })}
                    className={ui.btnGhost + ' text-xs'}
                    aria-label={`Editar canal ${c.label}`}
                  >
                    Editar
                  </button>
                  {confirmandoId === c.id ? (
                    <span className="flex items-center gap-1">
                      <span className="text-xs text-danger">Confirmar exclusão?</span>
                      <button
                        type="button"
                        disabled={excluindo}
                        onClick={() => excluir(c.id)}
                        className={ui.btnDanger + ' text-xs'}
                        aria-label={`Confirmar exclusão do canal ${c.label}`}
                      >
                        {excluindo ? 'Excluindo…' : 'Excluir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmandoId(null)}
                        className={ui.btnGhost + ' text-xs'}
                        aria-label="Cancelar exclusão"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmandoId(c.id)}
                      className={ui.btnDanger + ' text-xs'}
                      aria-label={`Excluir canal ${c.label}`}
                    >
                      Excluir
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
          })}
        </ul>
      )}

      {/* Modal de formulário */}
      {modalForm.aberto && (
        <FormularioCanal
          canal={modalForm.canal}
          secretarias={secretarias}
          onSalvo={aoSalvar}
          onCancelar={() => setModalForm({ aberto: false, canal: null })}
        />
      )}

      {/* Modal de webhook do canal */}
      {webhookCanal && (
        <BlocoWebhookCanal
          canalId={webhookCanal.id}
          label={webhookCanal.label}
          tipo={webhookCanal.tipo}
          onFechar={() => setWebhookCanal(null)}
        />
      )}
    </section>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function WhatsappConfigPage() {
  const idb = useId();

  // Config carregada do backend (mascarada — sem segredos)
  const [cfg, setCfg] = useState<WhatsappConfig | null>(null);

  // Campos de segredo (apenas o que o usuário digitar é enviado)
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [metaToken, setMetaToken] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');

  // Campos não-secretos editáveis
  const [provider, setProvider] = useState<Provider>('evolution');
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionInstance, setEvolutionInstance] = useState('');
  const [metaPhoneNumberId, setMetaPhoneNumberId] = useState('');
  const [metaWabaId, setMetaWabaId] = useState('');
  const [metaVerifyToken, setMetaVerifyToken] = useState('');

  // UI state
  const [salvando, setSalvando] = useState(false);
  const [testando, setTestando] = useState(false);
  const [statusConexao, setStatusConexao] = useState<StatusConexao | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  // Controla se o bloco de webhook Meta deve carregar (após salvar com provider=meta)
  const [metaSalvo, setMetaSalvo] = useState(false);

  function feedback(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(''), 4000);
  }

  // ── Carrega configuração ──────────────────────────────────────────────────
  useEffect(() => {
    adminGet<WhatsappConfig>('/api/admin/whatsapp/config')
      .then((dados) => {
        setCfg(dados);
        setProvider(dados.provider ?? 'evolution');
        setZapiInstanceId(dados.zapiInstanceId ?? '');
        setEvolutionApiUrl(dados.evolutionApiUrl ?? '');
        setEvolutionInstance(dados.evolutionInstance ?? '');
        setMetaPhoneNumberId(dados.metaPhoneNumberId ?? '');
        setMetaWabaId(dados.metaWabaId ?? '');
        // metaVerifyToken: valor não é retornado em claro, mas o admin pode redefinir
        if (dados.provider === 'meta' && dados.metaWebhookSecretDefinido) {
          setMetaSalvo(true);
        }
      })
      .catch((e) => {
        setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar configuração.');
      });
  }, []);

  // ── Salvar ────────────────────────────────────────────────────────────────
  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!cfg) return;
    setSalvando(true);
    setErro('');

    // Monta body: envia segredos SOMENTE se o usuário digitou algo
    const body: Record<string, string | boolean | undefined> = {
      provider,
      zapiInstanceId: zapiInstanceId || undefined,
      evolutionApiUrl: evolutionApiUrl || undefined,
      evolutionInstance: evolutionInstance || undefined,
      metaPhoneNumberId: metaPhoneNumberId || undefined,
      metaWabaId: metaWabaId || undefined,
      metaVerifyToken: metaVerifyToken || undefined,
      // Segredos: só envia se preenchido
      ...(zapiToken ? { zapiToken } : {}),
      ...(zapiClientToken ? { zapiClientToken } : {}),
      ...(evolutionApiKey ? { evolutionApiKey } : {}),
      ...(metaToken ? { metaToken } : {}),
      ...(metaAppSecret ? { metaAppSecret } : {}),
    };

    try {
      const res = await adminPut<{ ok: boolean; config: WhatsappConfig }>(
        '/api/admin/whatsapp/config',
        body,
      );
      const nova = res.config;
      setCfg(nova);
      // Limpa campos de segredo (não repersistir após salvar)
      setZapiToken('');
      setZapiClientToken('');
      setEvolutionApiKey('');
      setMetaToken('');
      setMetaAppSecret('');

      if (nova.provider === 'meta' && nova.metaWebhookSecretDefinido) {
        setMetaSalvo(true);
      }
      feedback('Configuração salva com sucesso.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  // ── Testar conexão ────────────────────────────────────────────────────────
  async function testarConexao() {
    setTestando(true);
    setStatusConexao(null);
    setErro('');
    try {
      const st = await adminGet<StatusConexao>('/api/admin/whatsapp/status');
      setStatusConexao(st);
    } catch (err) {
      setStatusConexao({
        conectado: false,
        detalhe: err instanceof AdminApiError ? err.message : 'Erro ao verificar status.',
      });
    } finally {
      setTestando(false);
    }
  }

  if (!cfg) {
    return (
      <div className="p-6">
        {erro ? (
          <Aviso tipo="erro">{erro}</Aviso>
        ) : (
          <p className="text-sm text-fg/60" aria-live="polite">Carregando configuração…</p>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <AdminHeader
          title="WhatsApp"
          description="Configure o provider de WhatsApp desta entidade (Z-API, Evolution API ou Meta Cloud API oficial)."
        />
        <a href="/admin/atendimento/config" className={ui.btnGhost + ' text-sm'}>
          ← Atendimento
        </a>
      </div>

      {/* Feedback global */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* ── Formulário principal ─────────────────────────────────────────── */}
      <form onSubmit={salvar} className="space-y-6" noValidate>

        {/* ── Seção 1: Seleção de provider ──────────────────────────────── */}
        <section aria-labelledby="sec-provider" className={ui.card + ' p-5'}>
          <h2 id="sec-provider" className="mb-4 font-heading text-base font-bold">
            Provider de WhatsApp
          </h2>

          <div>
            <label htmlFor={`${idb}-provider`} className={ui.label}>
              Provider ativo
            </label>
            <select
              id={`${idb}-provider`}
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className={ui.input + ' mt-1'}
            >
              <option value="evolution">Evolution API (self-hosted)</option>
              <option value="zapi">Z-API (nuvem)</option>
              <option value="meta">Meta Cloud API (API Oficial do WhatsApp)</option>
            </select>
            <p className="mt-1 text-xs text-fg/50">
              Somente o provider selecionado processa mensagens. Preencha as credenciais
              correspondentes abaixo e salve.
            </p>
          </div>
        </section>

        {/* ── Seção 2: Z-API ────────────────────────────────────────────── */}
        <section
          aria-labelledby="sec-zapi"
          className={ui.card + ' p-5'}
          aria-hidden={provider !== 'zapi' ? 'true' : undefined}
        >
          <h2 id="sec-zapi" className="mb-4 font-heading text-base font-bold">
            Z-API
            {provider !== 'zapi' && (
              <span className="ml-2 text-xs font-normal text-fg/50">(provider inativo)</span>
            )}
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idb}-zapi-instance`} className={ui.label}>
                Instance ID
              </label>
              <input
                id={`${idb}-zapi-instance`}
                type="text"
                value={zapiInstanceId}
                onChange={(e) => setZapiInstanceId(e.target.value)}
                placeholder="Ex.: 3D...A1"
                className={ui.input + ' mt-1'}
              />
            </div>
            <CampoSegredo
              id={`${idb}-zapi-token`}
              label="Token"
              definido={cfg.zapiTokenDefinido}
              value={zapiToken}
              onChange={setZapiToken}
            />
            <CampoSegredo
              id={`${idb}-zapi-client-token`}
              label="Client-Token"
              descricao="(opcional — para planos multi-device)"
              definido={cfg.zapiClientTokenDefinido}
              value={zapiClientToken}
              onChange={setZapiClientToken}
            />
          </div>
        </section>

        {/* ── Seção 3: Evolution API ────────────────────────────────────── */}
        <section
          aria-labelledby="sec-evolution"
          className={ui.card + ' p-5'}
          aria-hidden={provider !== 'evolution' ? 'true' : undefined}
        >
          <h2 id="sec-evolution" className="mb-4 font-heading text-base font-bold">
            Evolution API
            {provider !== 'evolution' && (
              <span className="ml-2 text-xs font-normal text-fg/50">(provider inativo)</span>
            )}
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor={`${idb}-evo-url`} className={ui.label}>
                URL da Evolution API
              </label>
              <input
                id={`${idb}-evo-url`}
                type="url"
                value={evolutionApiUrl}
                onChange={(e) => setEvolutionApiUrl(e.target.value)}
                placeholder="https://evolution.seudominio.com.br"
                className={ui.input + ' mt-1'}
              />
            </div>
            <div>
              <label htmlFor={`${idb}-evo-instance`} className={ui.label}>
                Nome da instância
              </label>
              <input
                id={`${idb}-evo-instance`}
                type="text"
                value={evolutionInstance}
                onChange={(e) => setEvolutionInstance(e.target.value)}
                placeholder="prefeitura-atendimento"
                className={ui.input + ' mt-1'}
              />
            </div>
            <CampoSegredo
              id={`${idb}-evo-key`}
              label="API Key"
              definido={cfg.evolutionApiKeyDefinida}
              value={evolutionApiKey}
              onChange={setEvolutionApiKey}
            />
          </div>
        </section>

        {/* ── Seção 4: Meta Cloud API ───────────────────────────────────── */}
        <section
          aria-labelledby="sec-meta"
          className={ui.card + ' p-5'}
          aria-hidden={provider !== 'meta' ? 'true' : undefined}
        >
          <h2 id="sec-meta" className="mb-4 font-heading text-base font-bold">
            Meta Cloud API (API Oficial do WhatsApp)
            {provider !== 'meta' && (
              <span className="ml-2 text-xs font-normal text-fg/50">(provider inativo)</span>
            )}
          </h2>

          <div className="mb-4 rounded border border-border/60 bg-muted/40 px-3 py-2 text-xs text-fg/70">
            Credenciais obtidas em{' '}
            <strong>developers.facebook.com</strong> → seu App WhatsApp Business.
            Tokens são cifrados e nunca expostos pelo sistema.
          </div>

          <div className="space-y-4">
            <div>
              <label htmlFor={`${idb}-meta-phone-id`} className={ui.label}>
                ID do número de telefone
                <span className="ml-1 font-normal text-fg/50">(Phone Number ID)</span>
              </label>
              <input
                id={`${idb}-meta-phone-id`}
                type="text"
                value={metaPhoneNumberId}
                onChange={(e) => setMetaPhoneNumberId(e.target.value)}
                placeholder="123456789012345"
                className={ui.input + ' mt-1'}
              />
            </div>

            <div>
              <label htmlFor={`${idb}-meta-waba-id`} className={ui.label}>
                WhatsApp Business Account ID
                <span className="ml-1 font-normal text-fg/50">(WABA ID — opcional)</span>
              </label>
              <input
                id={`${idb}-meta-waba-id`}
                type="text"
                value={metaWabaId}
                onChange={(e) => setMetaWabaId(e.target.value)}
                placeholder="987654321098765"
                className={ui.input + ' mt-1'}
              />
            </div>

            <CampoSegredo
              id={`${idb}-meta-token`}
              label="Access token permanente"
              descricao="(token de sistema ou token de usuário de longa duração)"
              definido={cfg.metaTokenDefinido}
              value={metaToken}
              onChange={setMetaToken}
            />

            <CampoSegredo
              id={`${idb}-meta-app-secret`}
              label="App Secret"
              descricao="(valida a assinatura do webhook)"
              definido={cfg.metaAppSecretDefinido}
              value={metaAppSecret}
              onChange={setMetaAppSecret}
            />

            <div>
              <label htmlFor={`${idb}-meta-verify-token`} className={ui.label}>
                Verify token do webhook
                <span className="ml-1 font-normal text-fg/50">
                  (você escolhe este valor e usa o mesmo no painel da Meta)
                </span>
              </label>
              <input
                id={`${idb}-meta-verify-token`}
                type="text"
                value={metaVerifyToken}
                onChange={(e) => setMetaVerifyToken(e.target.value)}
                placeholder={
                  cfg.metaVerifyTokenDefinido
                    ? '•••••• definido (deixe vazio para manter)'
                    : 'Ex.: meu-token-secreto-123'
                }
                className={ui.input + ' mt-1'}
                aria-describedby={`${idb}-meta-verify-hint`}
              />
              {cfg.metaVerifyTokenDefinido && !metaVerifyToken && (
                <p id={`${idb}-meta-verify-hint`} className="mt-0.5 text-xs text-fg/50">
                  Já definido. Deixe vazio para manter o valor atual.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Ações do formulário ──────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={salvando}
            className={ui.btn}
          >
            {salvando ? 'Salvando…' : 'Salvar configuração'}
          </button>

          <button
            type="button"
            disabled={testando}
            onClick={testarConexao}
            className={ui.btnGhost}
            aria-label="Testar conexão com o provider de WhatsApp ativo"
          >
            {testando ? 'Testando…' : 'Testar conexão'}
          </button>
        </div>

        {/* Resultado do teste de conexão */}
        {statusConexao && (
          <p
            role="status"
            aria-live="polite"
            className={
              'rounded border p-2 text-sm ' +
              (statusConexao.conectado
                ? 'border-success/40 text-success'
                : 'border-danger/40 text-danger')
            }
          >
            {statusConexao.conectado
              ? 'Conexão estabelecida com sucesso.'
              : `Falha na conexão: ${statusConexao.detalhe ?? 'erro desconhecido'}`}
          </p>
        )}
      </form>

      {/* ── Bloco de webhook Meta (fora do form, só quando Meta for o provider salvo) */}
      {(provider === 'meta' || metaSalvo) && (
        <BlocoWebhookMeta pronto={metaSalvo} />
      )}

      {/* ── Separador visual ─────────────────────────────────────────────── */}
      <hr className="border-border" aria-hidden="true" />

      {/* ── Seção de canais multi-número ─────────────────────────────────── */}
      <SecaoCanais />

      <hr className="border-border" aria-hidden="true" />

      {/* ── Consumo de mensagens automatizadas (templates) ───────────────── */}
      <SecaoConsumo />
    </div>
  );
}

/* ================================================================== */
/* Seção: Consumo de templates + cota + alerta (item 80868 do edital)  */
/* ================================================================== */

interface ConsumoResumo {
  creditosTotal: number;
  usadosCiclo: number;
  restante: number;
  percentual: number;
  alerta: boolean;
  cicloInicio: string | null;
  porTemplate: { nome: string | null; n: number }[];
  porCanal: { canalId: string | null; label: string | null; n: number }[];
  serie: { dia: string; n: number }[];
}
interface Cota {
  creditosTotal: number;
  alertaPercentual: number;
  cicloDia: number;
}

function BarrasConsumo({ dados, vazio }: { dados: { k: string; n: number }[]; vazio: string }) {
  if (!dados.length) return <p className="text-sm text-fg/50">{vazio}</p>;
  const max = Math.max(...dados.map((d) => d.n), 1);
  return (
    <ul className="space-y-1.5" role="list">
      {dados.map((d, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <span className="w-40 shrink-0 truncate text-fg" title={d.k}>{d.k}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-muted">
            <div className="h-full rounded bg-primary" style={{ width: `${(d.n / max) * 100}%` }} />
          </div>
          <span className="w-12 shrink-0 text-right tabular-nums text-fg/70">{d.n}</span>
        </li>
      ))}
    </ul>
  );
}

function SecaoConsumo() {
  const idb = useId();
  const [resumo, setResumo] = useState<ConsumoResumo | null>(null);
  const [cota, setCota] = useState<Cota>({ creditosTotal: 0, alertaPercentual: 80, cicloDia: 1 });
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    setErro('');
    adminGet<ConsumoResumo>('/api/admin/whatsapp/consumo')
      .then(setResumo)
      .catch((e) => setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar consumo.'));
    adminGet<Cota>('/api/admin/whatsapp/cota')
      .then(setCota)
      .catch(() => {});
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function salvarCota(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    setOk('');
    try {
      await adminPut('/api/admin/whatsapp/cota', cota);
      setOk('Cota atualizada.');
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar cota.');
    } finally {
      setSalvando(false);
    }
  }

  const pct = resumo?.percentual ?? 0;
  const corBarra = pct >= 100 ? 'bg-danger' : pct >= (cota.alertaPercentual || 80) ? 'bg-warning' : 'bg-success';
  const maxSerie = resumo ? Math.max(...resumo.serie.map((s) => s.n), 1) : 1;

  return (
    <section aria-labelledby="sec-consumo" className={ui.card + ' p-5 space-y-5'}>
      <div className="flex items-center justify-between gap-2">
        <h2 id="sec-consumo" className="font-heading text-base font-bold">
          Consumo de mensagens automatizadas (templates)
        </h2>
        <button type="button" onClick={carregar} className={ui.btnGhost + ' text-sm'}>Atualizar</button>
      </div>
      <p className="text-xs text-fg/50">
        Contabiliza os templates (mensagens automáticas via API oficial da Meta) enviados no ciclo atual.
        Defina a cota de créditos e o limite de alerta de esgotamento.
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {resumo && (
        <>
          {resumo.alerta && (
            <div role="alert" className="rounded border border-warning bg-warning/10 p-3 text-sm font-medium text-fg">
              ⚠️ Créditos próximos do esgotamento — {resumo.percentual}% da cota já utilizada
              ({resumo.usadosCiclo} de {resumo.creditosTotal}).
            </div>
          )}

          <div>
            <div className="mb-1 flex items-end justify-between text-sm">
              <span className="text-fg/70">Usados no ciclo</span>
              <span className="font-heading text-2xl font-bold text-fg tabular-nums">
                {resumo.usadosCiclo}
                <span className="text-sm font-normal text-fg/50">
                  {resumo.creditosTotal > 0 ? ` / ${resumo.creditosTotal}` : ' (sem cota)'}
                </span>
              </span>
            </div>
            {resumo.creditosTotal > 0 && (
              <>
                <div className="h-3 overflow-hidden rounded bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className={`h-full rounded ${corBarra} transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
                <p className="mt-1 text-xs text-fg/60">
                  {resumo.percentual}% usado · {resumo.restante} restante{resumo.cicloInicio ? ` · ciclo desde ${new Date(resumo.cicloInicio).toLocaleDateString('pt-BR')}` : ''}
                </p>
              </>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg/70">Por template</h3>
              <BarrasConsumo dados={resumo.porTemplate.map((t) => ({ k: t.nome ?? '(sem nome)', n: t.n }))} vazio="Nenhum template enviado no ciclo." />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg/70">Por canal</h3>
              <BarrasConsumo dados={resumo.porCanal.map((c) => ({ k: c.label ?? '(número único)', n: c.n }))} vazio="Sem envios por canal." />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg/70">Últimos 30 dias</h3>
            {resumo.serie.some((s) => s.n > 0) ? (
              <svg viewBox="0 0 300 60" className="w-full" role="img" aria-label="Envios de templates nos últimos 30 dias">
                {resumo.serie.map((s, i) => {
                  const w = 300 / resumo.serie.length;
                  const h = (s.n / maxSerie) * 54;
                  return <rect key={i} x={i * w + 1} y={56 - h} width={w - 2} height={h} className="fill-primary" rx="0.5" />;
                })}
              </svg>
            ) : (
              <p className="text-sm text-fg/50">Sem envios nos últimos 30 dias.</p>
            )}
          </div>
        </>
      )}

      {/* Form de cota */}
      <form onSubmit={salvarCota} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-3">
        <div>
          <label htmlFor={`${idb}-total`} className={ui.label}>Cota de créditos</label>
          <input id={`${idb}-total`} type="number" min={0} value={cota.creditosTotal}
            onChange={(e) => setCota({ ...cota, creditosTotal: Number(e.target.value) })}
            className={ui.input + ' mt-1'} />
          <p className="mt-1 text-xs text-fg/50">0 = sem cota</p>
        </div>
        <div>
          <label htmlFor={`${idb}-alerta`} className={ui.label}>Alerta em (%)</label>
          <input id={`${idb}-alerta`} type="number" min={1} max={100} value={cota.alertaPercentual}
            onChange={(e) => setCota({ ...cota, alertaPercentual: Number(e.target.value) })}
            className={ui.input + ' mt-1'} />
        </div>
        <div>
          <label htmlFor={`${idb}-ciclo`} className={ui.label}>Dia de reinício do ciclo</label>
          <input id={`${idb}-ciclo`} type="number" min={1} max={28} value={cota.cicloDia}
            onChange={(e) => setCota({ ...cota, cicloDia: Number(e.target.value) })}
            className={ui.input + ' mt-1'} />
        </div>
        <div className="sm:col-span-3">
          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar cota'}
          </button>
        </div>
      </form>
    </section>
  );
}
