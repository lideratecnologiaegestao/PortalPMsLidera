'use client';

import { useState, useEffect, useId } from 'react';
import { Modal, Aviso, ui } from '../../admin/_components/ui';
import {
  getIaConfig,
  salvarIaConfig,
  getWhatsappConfig,
  salvarWhatsappConfig,
  getAtendimentoConfig,
  salvarAtendimentoConfig,
  getLgpdConfig,
  salvarLgpdConfig,
  getAplicConfig,
  salvarAplicConfig,
  getLgpdDocumento,
  gerarLgpdDocumento,
  getCanais,
  criarCanal,
  atualizarCanal,
  excluirCanal,
  getCanalWebhookInfo,
  telegramSetWebhook,
  type IaConfigMascarada,
  type IaConfigDto,
  type WhatsappConfigMascarada,
  type WhatsappConfigDto,
  type AtendimentoConfig,
  type LgpdConfig,
  type AplicConfig,
  type LgpdDocEstado,
  type DadosLgpdEntidade,
  type Tenant,
  type TipoCanal,
  type CanalAtendimento,
  type CanalDto,
  type CanalWebhookInfo,
} from '../../../lib/platform';
import { AdminApiError } from '../../../lib/admin-api';

// ── Tipos internos ─────────────────────────────────────────────────────────────

type Aba = 'ia' | 'whatsapp' | 'atendimento' | 'lgpd' | 'canais' | 'aplic';

// ── Utilitários ────────────────────────────────────────────────────────────────

function erroMsg(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Erro desconhecido.';
}

// ── Badge de chave ─────────────────────────────────────────────────────────────

function BadgeChave({
  definida,
  rotulo,
}: {
  definida: boolean;
  rotulo: string;
}) {
  return (
    <span
      className={`${ui.badge} ${
        definida
          ? 'bg-success/15 text-success'
          : 'bg-muted text-fg/60'
      }`}
      aria-label={`${rotulo}: ${definida ? 'definida' : 'não definida'}`}
    >
      {definida ? 'definida' : 'não definida'}
    </span>
  );
}

// ── Checkbox acessível (reutilizado das abas) ──────────────────────────────────

function CheckField({
  id,
  checked,
  onChange,
  label,
  description,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary"
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {description && (
          <span className="block text-xs text-fg/60">{description}</span>
        )}
      </span>
    </label>
  );
}

// ── Campo de senha com badge e botão "Usar global" ─────────────────────────────

function CampoChave({
  id,
  rotulo,
  descricao,
  definida,
  statusLabel,
  valor,
  onChange,
  onUsarGlobal,
  globalDisponivel,
}: {
  id: string;
  rotulo: string;
  descricao?: string;
  definida: boolean;
  statusLabel: string;
  valor: string;
  onChange: (v: string) => void;
  onUsarGlobal: () => void;
  globalDisponivel: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className={ui.label}>
          {rotulo}
        </label>
        <BadgeChave definida={definida} rotulo={rotulo} />
        {!definida && globalDisponivel && (
          <span className="text-xs text-fg/60">Usando chave global</span>
        )}
        {!definida && !globalDisponivel && (
          <span className="text-xs text-danger">Não configurada</span>
        )}
      </div>
      {descricao && <p className="text-xs text-fg/60">{descricao}</p>}
      <div className="flex gap-2">
        <input
          id={id}
          type="password"
          autoComplete="off"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder="•••• deixe em branco para manter"
          className={ui.input}
          aria-describedby={`${id}-status`}
        />
        {definida && (
          <button
            type="button"
            onClick={onUsarGlobal}
            className={`${ui.btnGhost} shrink-0 py-1 text-xs`}
            title="Limpar chave própria e voltar a usar a chave global"
          >
            Usar global
          </button>
        )}
      </div>
      <p id={`${id}-status`} className="sr-only">
        {statusLabel}
      </p>
    </div>
  );
}

// ── Aba IA ─────────────────────────────────────────────────────────────────────

function AbaIA({ tenantId }: { tenantId: string }) {
  const uid = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [dados, setDados] = useState<IaConfigMascarada | null>(null);

  // Campos editáveis
  const [maxChunks, setMaxChunks] = useState('');
  const [embeddingsProvider, setEmbeddingsProvider] = useState('');
  const [voyageKey, setVoyageKey] = useState('');
  const [anthropicKey, setAnthropicKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  // '' = não tocar; '__global__' = enviar '' (limpar)
  const [voyageAcao, setVoyageAcao] = useState<'manter' | 'limpar'>('manter');
  const [anthropicAcao, setAnthropicAcao] = useState<'manter' | 'limpar'>('manter');
  const [openaiAcao, setOpenaiAcao] = useState<'manter' | 'limpar'>('manter');

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    getIaConfig(tenantId)
      .then((d) => {
        setDados(d);
        setMaxChunks(d.iaMaxChunks !== null ? String(d.iaMaxChunks) : '');
        setEmbeddingsProvider(d.embeddingsProvider ?? '');
        setVoyageKey('');
        setAnthropicKey('');
        setOpenaiKey('');
        setVoyageAcao('manter');
        setAnthropicAcao('manter');
        setOpenaiAcao('manter');
      })
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
  }, [tenantId]);

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const dto: IaConfigDto = {};

      // iaMaxChunks: vazio → null (limpa); valor → número
      if (maxChunks === '') {
        dto.iaMaxChunks = null;
      } else {
        const n = parseInt(maxChunks, 10);
        if (isNaN(n) || n < 100 || n > 50000) {
          setErro('Limite de chunks deve ser entre 100 e 50.000.');
          setSalvando(false);
          return;
        }
        dto.iaMaxChunks = n;
      }

      // embeddingsProvider: '' = usar global
      dto.embeddingsProvider = embeddingsProvider;

      // Chaves: só envia se o usuário digitou algo OU se clicou "Usar global"
      if (voyageAcao === 'limpar') {
        dto.voyageApiKey = '';
      } else if (voyageKey) {
        dto.voyageApiKey = voyageKey;
      }

      if (anthropicAcao === 'limpar') {
        dto.anthropicApiKey = '';
      } else if (anthropicKey) {
        dto.anthropicApiKey = anthropicKey;
      }

      if (openaiAcao === 'limpar') {
        dto.openaiApiKey = '';
      } else if (openaiKey) {
        dto.openaiApiKey = openaiKey;
      }

      const novo = await salvarIaConfig(tenantId, dto);
      setDados(novo);
      setMaxChunks(novo.iaMaxChunks !== null ? String(novo.iaMaxChunks) : '');
      setEmbeddingsProvider(novo.embeddingsProvider ?? '');
      setVoyageKey('');
      setAnthropicKey('');
      setOpenaiKey('');
      setVoyageAcao('manter');
      setAnthropicAcao('manter');
      setOpenaiAcao('manter');
      setSucesso('Configurações de IA salvas com sucesso.');
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
        Carregando configurações de IA…
      </p>
    );
  }

  if (!dados) {
    return <Aviso tipo="erro">{erro ?? 'Falha ao carregar.'}</Aviso>;
  }

  const { efetivo, global: glob } = dados;

  return (
    <div className="space-y-5">
      {/* Resumo do efetivo */}
      <section
        aria-labelledby={`${uid}-efetivo-titulo`}
        className="rounded border border-border bg-muted/30 p-3 text-sm space-y-1"
      >
        <h3 id={`${uid}-efetivo-titulo`} className="font-semibold text-xs uppercase tracking-wide text-fg/60">
          Configuração efetiva
        </h3>
        <p>
          <span className="font-medium">Limite de trechos:</span>{' '}
          {efetivo.maxChunks}{' '}
          <span className="text-fg/60">
            ({efetivo.maxChunksFonte === 'entidade' ? 'definido nesta entidade' : 'padrão global'})
          </span>
        </p>
        <p>
          <span className="font-medium">Provedor:</span>{' '}
          {efetivo.provider ?? '—'}{' '}
          <span className="text-fg/60">
            ({efetivo.providerFonte === 'entidade' ? 'definido nesta entidade' : 'padrão global'})
          </span>
        </p>
      </section>

      {/* Limite de chunks */}
      <div>
        <label htmlFor={`${uid}-maxchunks`} className={ui.label}>
          Limite de trechos (chunks)
        </label>
        <p className="text-xs text-fg/60 mb-1">
          Deixe em branco para usar o global ({glob.maxChunks}). Faixa válida: 100–50.000.
        </p>
        <input
          id={`${uid}-maxchunks`}
          type="number"
          min={100}
          max={50000}
          value={maxChunks}
          onChange={(e) => setMaxChunks(e.target.value)}
          placeholder={`${glob.maxChunks} (global)`}
          className={ui.input}
        />
      </div>

      {/* Provedor de embeddings */}
      <div>
        <label htmlFor={`${uid}-embeddings`} className={ui.label}>
          Provedor de embeddings
        </label>
        <select
          id={`${uid}-embeddings`}
          value={embeddingsProvider}
          onChange={(e) => setEmbeddingsProvider(e.target.value)}
          className={`mt-1 ${ui.input}`}
        >
          <option value="">Usar global ({glob.provider ?? 'não definido'})</option>
          <option value="voyage">Voyage</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>

      {/* Chaves próprias */}
      <fieldset className="rounded border border-border p-3 space-y-4">
        <legend className="px-1 text-xs font-semibold text-fg/60">Chaves de API</legend>

        <Aviso tipo="ok">
          As chaves são cifradas em repouso. Por padrão a entidade usa as chaves globais da plataforma; preencha aqui somente se esta entidade deve usar chave própria.
        </Aviso>

        <CampoChave
          id={`${uid}-voyage-key`}
          rotulo="Chave Voyage AI"
          definida={dados.voyageProprio}
          statusLabel={
            dados.voyageProprio
              ? 'Chave própria definida'
              : glob.voyageDefinida
                ? 'Usando chave global'
                : 'Não configurada'
          }
          globalDisponivel={glob.voyageDefinida}
          valor={voyageAcao === 'limpar' ? '' : voyageKey}
          onChange={(v) => {
            setVoyageKey(v);
            setVoyageAcao('manter');
          }}
          onUsarGlobal={() => {
            setVoyageKey('');
            setVoyageAcao('limpar');
          }}
        />

        <CampoChave
          id={`${uid}-anthropic-key`}
          rotulo="Chave Anthropic"
          definida={dados.anthropicProprio}
          statusLabel={
            dados.anthropicProprio
              ? 'Chave própria definida'
              : glob.anthropicDefinida
                ? 'Usando chave global'
                : 'Não configurada'
          }
          globalDisponivel={glob.anthropicDefinida}
          valor={anthropicAcao === 'limpar' ? '' : anthropicKey}
          onChange={(v) => {
            setAnthropicKey(v);
            setAnthropicAcao('manter');
          }}
          onUsarGlobal={() => {
            setAnthropicKey('');
            setAnthropicAcao('limpar');
          }}
        />

        <CampoChave
          id={`${uid}-openai-key`}
          rotulo="Chave OpenAI"
          definida={dados.openaiProprio}
          statusLabel={
            dados.openaiProprio
              ? 'Chave própria definida'
              : glob.openaiDefinida
                ? 'Usando chave global'
                : 'Não configurada'
          }
          globalDisponivel={glob.openaiDefinida}
          valor={openaiAcao === 'limpar' ? '' : openaiKey}
          onChange={(v) => {
            setOpenaiKey(v);
            setOpenaiAcao('manter');
          }}
          onUsarGlobal={() => {
            setOpenaiKey('');
            setOpenaiAcao('limpar');
          }}
        />
      </fieldset>

      {/* Feedback */}
      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className={ui.btn}
          aria-busy={salvando}
        >
          {salvando ? 'Salvando…' : 'Salvar configurações de IA'}
        </button>
      </div>
    </div>
  );
}

// ── Aba WhatsApp ───────────────────────────────────────────────────────────────

function AbaWhatsapp({ tenantId }: { tenantId: string }) {
  const uid = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [dados, setDados] = useState<WhatsappConfigMascarada | null>(null);

  // Campos
  const [provider, setProvider] = useState('z-api');
  const [fallbackProvider, setFallbackProvider] = useState('');
  const [zapiInstanceId, setZapiInstanceId] = useState('');
  const [zapiToken, setZapiToken] = useState('');
  const [zapiClientToken, setZapiClientToken] = useState('');
  const [evolutionApiUrl, setEvolutionApiUrl] = useState('');
  const [evolutionInstance, setEvolutionInstance] = useState('');
  const [evolutionApiKey, setEvolutionApiKey] = useState('');
  const [ativo, setAtivo] = useState(false);

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    getWhatsappConfig(tenantId)
      .then((d) => {
        setDados(d);
        setProvider(d.provider || 'z-api');
        setFallbackProvider(d.fallbackProvider ?? '');
        setZapiInstanceId(d.zapiInstanceId ?? '');
        setZapiToken('');
        setZapiClientToken('');
        setEvolutionApiUrl(d.evolutionApiUrl ?? '');
        setEvolutionInstance(d.evolutionInstance ?? '');
        setEvolutionApiKey('');
        setAtivo(d.ativo);
      })
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
  }, [tenantId]);

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const dto: WhatsappConfigDto = {
        provider,
        fallbackProvider: fallbackProvider || undefined,
        zapiInstanceId: zapiInstanceId || undefined,
        evolutionApiUrl: evolutionApiUrl || undefined,
        evolutionInstance: evolutionInstance || undefined,
        ativo,
      };
      // Só envia chave se digitou algo
      if (zapiToken) dto.zapiToken = zapiToken;
      if (zapiClientToken) dto.zapiClientToken = zapiClientToken;
      if (evolutionApiKey) dto.evolutionApiKey = evolutionApiKey;

      const novo = await salvarWhatsappConfig(tenantId, dto);
      setDados(novo);
      setZapiToken('');
      setZapiClientToken('');
      setEvolutionApiKey('');
      setSucesso('Configurações de WhatsApp salvas com sucesso.');
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
        Carregando configurações de WhatsApp…
      </p>
    );
  }

  if (!dados) {
    return <Aviso tipo="erro">{erro ?? 'Falha ao carregar.'}</Aviso>;
  }

  return (
    <div className="space-y-5">
      {/* Provider + fallback */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-wpp-provider`} className={ui.label}>
            Provedor
          </label>
          <select
            id={`${uid}-wpp-provider`}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            className={`mt-1 ${ui.input}`}
          >
            <option value="z-api">Z-API</option>
            <option value="evolution">Evolution API</option>
            <option value="meta">Meta (Cloud API)</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${uid}-wpp-fallback`} className={ui.label}>
            Fallback
          </label>
          <select
            id={`${uid}-wpp-fallback`}
            value={fallbackProvider}
            onChange={(e) => setFallbackProvider(e.target.value)}
            className={`mt-1 ${ui.input}`}
          >
            <option value="">Nenhum</option>
            <option value="z-api">Z-API</option>
            <option value="evolution">Evolution API</option>
            <option value="meta">Meta (Cloud API)</option>
          </select>
        </div>
      </div>

      {/* Z-API */}
      <fieldset className="rounded border border-border p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold text-fg/60">Z-API</legend>

        <div>
          <label htmlFor={`${uid}-zapi-instance`} className={ui.label}>
            Instance ID
          </label>
          <input
            id={`${uid}-zapi-instance`}
            type="text"
            value={zapiInstanceId}
            onChange={(e) => setZapiInstanceId(e.target.value)}
            className={`mt-1 ${ui.input}`}
            placeholder="ex.: XXXXXXXX-XXXX-XXXX-XXXX"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <label htmlFor={`${uid}-zapi-token`} className={ui.label}>
              Token
            </label>
            <BadgeChave
              definida={dados.zapiTokenDefinido}
              rotulo="Token Z-API"
            />
          </div>
          <input
            id={`${uid}-zapi-token`}
            type="password"
            autoComplete="off"
            value={zapiToken}
            onChange={(e) => setZapiToken(e.target.value)}
            placeholder="•••• deixe em branco para manter"
            className={ui.input}
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <label htmlFor={`${uid}-zapi-client-token`} className={ui.label}>
              Client Token
            </label>
            <BadgeChave
              definida={dados.zapiClientTokenDefinido}
              rotulo="Client Token Z-API"
            />
          </div>
          <input
            id={`${uid}-zapi-client-token`}
            type="password"
            autoComplete="off"
            value={zapiClientToken}
            onChange={(e) => setZapiClientToken(e.target.value)}
            placeholder="•••• deixe em branco para manter"
            className={ui.input}
          />
        </div>

        <p className="text-xs text-fg/60">
          Webhook secret:{' '}
          <BadgeChave
            definida={dados.zapiWebhookSecretDefinido}
            rotulo="Webhook secret"
          />{' '}
          (gerado automaticamente pelo sistema)
        </p>
      </fieldset>

      {/* Evolution API */}
      <fieldset className="rounded border border-border p-3 space-y-3">
        <legend className="px-1 text-xs font-semibold text-fg/60">Evolution API</legend>

        <div>
          <label htmlFor={`${uid}-evo-url`} className={ui.label}>
            URL da API
          </label>
          <input
            id={`${uid}-evo-url`}
            type="text"
            value={evolutionApiUrl}
            onChange={(e) => setEvolutionApiUrl(e.target.value)}
            className={`mt-1 ${ui.input}`}
            placeholder="https://evolution.exemplo.com"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-evo-instance`} className={ui.label}>
            Instância
          </label>
          <input
            id={`${uid}-evo-instance`}
            type="text"
            value={evolutionInstance}
            onChange={(e) => setEvolutionInstance(e.target.value)}
            className={`mt-1 ${ui.input}`}
            placeholder="minha-instancia"
          />
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <label htmlFor={`${uid}-evo-key`} className={ui.label}>
              API Key
            </label>
            <BadgeChave
              definida={dados.evolutionApiKeyDefinida}
              rotulo="API Key Evolution"
            />
          </div>
          <input
            id={`${uid}-evo-key`}
            type="password"
            autoComplete="off"
            value={evolutionApiKey}
            onChange={(e) => setEvolutionApiKey(e.target.value)}
            placeholder="•••• deixe em branco para manter"
            className={ui.input}
          />
        </div>
      </fieldset>

      {/* Ativo */}
      <CheckField
        id={`${uid}-wpp-ativo`}
        checked={ativo}
        onChange={setAtivo}
        label="WhatsApp ativo"
        description="Habilita o envio e recebimento de mensagens via WhatsApp."
      />

      {/* Feedback */}
      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className={ui.btn}
          aria-busy={salvando}
        >
          {salvando ? 'Salvando…' : 'Salvar configurações de WhatsApp'}
        </button>
      </div>
    </div>
  );
}

// ── Aba Atendimento ────────────────────────────────────────────────────────────

function AbaAtendimento({ tenantId }: { tenantId: string }) {
  const uid = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Campos
  const [atendimentoHumanoAtivo, setAtendimentoHumanoAtivo] = useState(false);
  const [iaChatWidgetAtivo, setIaChatWidgetAtivo] = useState(false);
  const [iaChatHabilitada, setIaChatHabilitada] = useState(false);
  const [iaTriagemHabilitada, setIaTriagemHabilitada] = useState(false);
  const [saudacao, setSaudacao] = useState('');
  const [avisoLgpd, setAvisoLgpd] = useState('');
  const [mensagemForaExp, setMensagemForaExp] = useState('');
  const [inatividadeMin, setInatividadeMin] = useState('');
  const [timezone, setTimezone] = useState('');

  function preencherForm(d: AtendimentoConfig) {
    setAtendimentoHumanoAtivo(d.atendimentoHumanoAtivo);
    setIaChatWidgetAtivo(d.iaChatWidgetAtivo);
    setIaChatHabilitada(d.iaChatHabilitada);
    setIaTriagemHabilitada(d.iaTriagemHabilitada);
    setSaudacao(d.atendimentoSaudacao ?? '');
    setAvisoLgpd(d.atendimentoAvisoLgpd ?? '');
    setMensagemForaExp(d.atendimentoMensagemForaExp ?? '');
    setInatividadeMin(String(d.atendimentoInatividadeMin));
    setTimezone(d.atendimentoTimezone ?? '');
  }

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    getAtendimentoConfig(tenantId)
      .then((d) => preencherForm(d))
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  async function handleSalvar() {
    const min = parseInt(inatividadeMin, 10);
    if (!isNaN(min) && (min < 1 || min > 240)) {
      setErro('Tempo de inatividade deve ser entre 1 e 240 minutos.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const dto: Partial<AtendimentoConfig> = {
        atendimentoHumanoAtivo,
        iaChatWidgetAtivo,
        iaChatHabilitada,
        iaTriagemHabilitada,
        atendimentoSaudacao: saudacao || null,
        atendimentoAvisoLgpd: avisoLgpd || null,
        atendimentoMensagemForaExp: mensagemForaExp || null,
        atendimentoTimezone: timezone || undefined,
      };
      if (!isNaN(min)) dto.atendimentoInatividadeMin = min;

      const novo = await salvarAtendimentoConfig(tenantId, dto);
      preencherForm(novo);
      setSucesso('Configurações de atendimento salvas com sucesso.');
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
        Carregando configurações de atendimento…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Dica visível */}
      <p
        role="note"
        className="rounded bg-warning/20 p-3 text-xs font-medium text-fg"
      >
        Para o chat aparecer na home, ligue &ldquo;Exibir o widget&rdquo; + &ldquo;Bot de IA ativo&rdquo;.
      </p>

      {/* Flags de visibilidade */}
      <fieldset className="rounded border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-fg/60">Visibilidade e capacidades</legend>
        <div className="space-y-3 mt-1">
          <CheckField
            id={`${uid}-atend-humano`}
            checked={atendimentoHumanoAtivo}
            onChange={setAtendimentoHumanoAtivo}
            label="Exibir o widget de chat no portal"
            description="Exibe o botão flutuante de atendimento no portal público."
          />
          <CheckField
            id={`${uid}-ia-widget`}
            checked={iaChatWidgetAtivo}
            onChange={setIaChatWidgetAtivo}
            label="Bot de IA ativo no widget"
            description="Ativa o bot de IA como primeiro contato no widget."
          />
          <CheckField
            id={`${uid}-ia-chat`}
            checked={iaChatHabilitada}
            onChange={setIaChatHabilitada}
            label="IA habilitada para a entidade"
            description="Liga o motor de IA para esta entidade."
          />
          <CheckField
            id={`${uid}-ia-triagem`}
            checked={iaTriagemHabilitada}
            onChange={setIaTriagemHabilitada}
            label="Triagem de manifestações por IA"
            description="A IA classifica automaticamente as manifestações recebidas."
          />
        </div>
      </fieldset>

      {/* Mensagens */}
      <fieldset className="rounded border border-border p-3 space-y-4">
        <legend className="px-1 text-xs font-semibold text-fg/60">Mensagens do widget</legend>

        <div>
          <label htmlFor={`${uid}-saudacao`} className={ui.label}>
            Saudação inicial
          </label>
          <textarea
            id={`${uid}-saudacao`}
            value={saudacao}
            onChange={(e) => setSaudacao(e.target.value)}
            rows={2}
            className={`mt-1 ${ui.input}`}
            placeholder="Olá! Como posso ajudar?"
          />
        </div>

        <div>
          <label htmlFor={`${uid}-lgpd`} className={ui.label}>
            Aviso LGPD
          </label>
          <textarea
            id={`${uid}-lgpd`}
            value={avisoLgpd}
            onChange={(e) => setAvisoLgpd(e.target.value)}
            rows={2}
            className={`mt-1 ${ui.input}`}
            placeholder="Seus dados serão tratados conforme a Lei nº 13.709/2018 (LGPD)."
          />
        </div>

        <div>
          <label htmlFor={`${uid}-fora-exp`} className={ui.label}>
            Mensagem fora do expediente
          </label>
          <textarea
            id={`${uid}-fora-exp`}
            value={mensagemForaExp}
            onChange={(e) => setMensagemForaExp(e.target.value)}
            rows={2}
            className={`mt-1 ${ui.input}`}
            placeholder="Estamos fora do horário de atendimento. Retornaremos em breve."
          />
        </div>
      </fieldset>

      {/* Parâmetros */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-inatividade`} className={ui.label}>
            Inatividade (minutos)
          </label>
          <input
            id={`${uid}-inatividade`}
            type="number"
            min={1}
            max={240}
            value={inatividadeMin}
            onChange={(e) => setInatividadeMin(e.target.value)}
            className={`mt-1 ${ui.input}`}
            placeholder="30"
          />
          <p className="mt-0.5 text-xs text-fg/60">Entre 1 e 240 minutos.</p>
        </div>
        <div>
          <label htmlFor={`${uid}-timezone`} className={ui.label}>
            Fuso horário
          </label>
          <input
            id={`${uid}-timezone`}
            type="text"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className={`mt-1 ${ui.input}`}
            placeholder="America/Cuiaba"
          />
        </div>
      </div>

      {/* Feedback */}
      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSalvar}
          disabled={salvando}
          className={ui.btn}
          aria-busy={salvando}
        >
          {salvando ? 'Salvando…' : 'Salvar configurações de atendimento'}
        </button>
      </div>
    </div>
  );
}

// ── Aba LGPD ──────────────────────────────────────────────────────────────────

function AbaLgpd({ tenantId }: { tenantId: string }) {
  const uid = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [dpoNome, setDpoNome] = useState('');
  const [dpoEmail, setDpoEmail] = useState('');
  // Complementos da documentação
  const [dpoTelefone, setDpoTelefone] = useState('');
  const [dpoEndereco, setDpoEndereco] = useState('');
  const [enderecoEntidade, setEnderecoEntidade] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [responsavelNome, setResponsavelNome] = useState('');
  const [responsavelCargo, setResponsavelCargo] = useState('');
  const [estado, setEstado] = useState<LgpdDocEstado | null>(null);

  function preencherDados(d: DadosLgpdEntidade) {
    setDpoTelefone(d.dpoTelefone ?? '');
    setDpoEndereco(d.dpoEndereco ?? '');
    setEnderecoEntidade(d.enderecoEntidade ?? '');
    setMunicipio(d.municipio ?? '');
    setResponsavelNome(d.responsavelNome ?? '');
    setResponsavelCargo(d.responsavelCargo ?? '');
  }

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    Promise.all([getLgpdConfig(tenantId), getLgpdDocumento(tenantId)])
      .then(([dpo, doc]: [LgpdConfig, LgpdDocEstado]) => {
        setDpoNome(dpo.dpoNome ?? '');
        setDpoEmail(dpo.dpoEmail ?? '');
        setEstado(doc);
        preencherDados(doc.dados ?? {});
      })
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
  }, [tenantId]);

  function dadosAtuais(): DadosLgpdEntidade {
    return {
      dpoTelefone: dpoTelefone || undefined,
      dpoEndereco: dpoEndereco || undefined,
      enderecoEntidade: enderecoEntidade || undefined,
      municipio: municipio || undefined,
      responsavelNome: responsavelNome || undefined,
      responsavelCargo: responsavelCargo || undefined,
    };
  }

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      await salvarLgpdConfig(tenantId, { dpoNome: dpoNome || null, dpoEmail: dpoEmail || null });
      setSucesso('Dados do DPO salvos com sucesso.');
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  async function handleGerar() {
    setGerando(true);
    setErro(null);
    setSucesso(null);
    try {
      // Garante o DPO salvo (a geração lê o DPO do tenant) e então gera.
      await salvarLgpdConfig(tenantId, { dpoNome: dpoNome || null, dpoEmail: dpoEmail || null });
      const novo = await gerarLgpdDocumento(tenantId, dadosAtuais());
      setEstado(novo);
      preencherDados(novo.dados ?? {});
      setSucesso(`Documentação LGPD gerada (versão ${novo.versao}). O responsável da entidade pode baixá-la e publicá-la em /privacidade/sobre-lgpd no painel admin.`);
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setGerando(false);
    }
  }

  if (carregando) {
    return (
      <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
        Carregando configurações LGPD…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg/70">
        Encarregado de Dados (DPO) conforme art. 41 da Lei nº 13.709/2018. Deixe em branco para remover.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${uid}-dpo-nome`} className={ui.label}>Nome do DPO</label>
          <input id={`${uid}-dpo-nome`} type="text" value={dpoNome}
            onChange={(e) => setDpoNome(e.target.value)} className={`mt-1 ${ui.input}`}
            placeholder="Nome do Encarregado de Dados" />
        </div>
        <div>
          <label htmlFor={`${uid}-dpo-email`} className={ui.label}>E-mail do DPO</label>
          <input id={`${uid}-dpo-email`} type="email" value={dpoEmail}
            onChange={(e) => setDpoEmail(e.target.value)} className={`mt-1 ${ui.input}`}
            placeholder="dpo@prefeitura.gov.br" />
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={handleSalvar} disabled={salvando}
          className={ui.btnGhost} aria-busy={salvando}>
          {salvando ? 'Salvando…' : 'Salvar dados do DPO'}
        </button>
      </div>

      {/* Documentação LGPD ------------------------------------------------------ */}
      <fieldset className="rounded border border-border p-3 space-y-4">
        <legend className="px-1 text-xs font-semibold text-fg/60">Documentação LGPD</legend>

        <Aviso tipo="ok">
          Gera o pacote de documentação LGPD da entidade (Política de Privacidade, PSI, RoPA e
          Relatório de Medidas) a partir do template global e dos dados abaixo. O responsável da
          entidade poderá baixar em PDF/TXT/HTML e publicar em <code>/privacidade/sobre-lgpd</code>.
        </Aviso>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${uid}-dpo-tel`} className={ui.label}>Telefone do DPO</label>
            <input id={`${uid}-dpo-tel`} type="text" value={dpoTelefone}
              onChange={(e) => setDpoTelefone(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="(65) 0000-0000" />
          </div>
          <div>
            <label htmlFor={`${uid}-dpo-end`} className={ui.label}>Endereço do DPO</label>
            <input id={`${uid}-dpo-end`} type="text" value={dpoEndereco}
              onChange={(e) => setDpoEndereco(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="Endereço para correspondência" />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-end-ent`} className={ui.label}>Endereço da entidade</label>
            <input id={`${uid}-end-ent`} type="text" value={enderecoEntidade}
              onChange={(e) => setEnderecoEntidade(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="Ex.: Av. Principal, 100, Centro" />
          </div>
          <div>
            <label htmlFor={`${uid}-municipio`} className={ui.label}>Município</label>
            <input id={`${uid}-municipio`} type="text" value={municipio}
              onChange={(e) => setMunicipio(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="(detecta do nome se vazio)" />
          </div>
          <div></div>
          <div>
            <label htmlFor={`${uid}-resp-nome`} className={ui.label}>Autoridade signatária</label>
            <input id={`${uid}-resp-nome`} type="text" value={responsavelNome}
              onChange={(e) => setResponsavelNome(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="Nome de quem assina" />
          </div>
          <div>
            <label htmlFor={`${uid}-resp-cargo`} className={ui.label}>Cargo da autoridade</label>
            <input id={`${uid}-resp-cargo`} type="text" value={responsavelCargo}
              onChange={(e) => setResponsavelCargo(e.target.value)} className={`mt-1 ${ui.input}`}
              placeholder="Ex.: Prefeito(a) Municipal" />
          </div>
        </div>

        {estado?.gerado && (
          <p className="text-xs text-fg/70">
            Última geração: versão {estado.versao}
            {estado.geradoEm ? ` em ${new Date(estado.geradoEm).toLocaleString('pt-BR')}` : ''} ·{' '}
            {estado.publicado
              ? <span className="text-success">publicada em /privacidade/sobre-lgpd</span>
              : <span className="text-fg/60">ainda não publicada pela entidade</span>}
          </p>
        )}

        <div className="flex justify-end">
          <button type="button" onClick={handleGerar} disabled={gerando}
            className={ui.btn} aria-busy={gerando}>
            {gerando ? 'Gerando…' : estado?.gerado ? 'Regerar LGPD' : 'Gerar LGPD'}
          </button>
        </div>
      </fieldset>

      {/* Feedback */}
      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>
    </div>
  );
}

// ── Aba APLIC (Transparência) ──────────────────────────────────────────────────

function AbaAplic({ tenantId }: { tenantId: string }) {
  const uid = useId();
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [habilitado, setHabilitado] = useState(false);
  const [ug, setUg] = useState('');
  const [pntp, setPntp] = useState<AplicConfig['pntp']>(null);

  function preencher(d: AplicConfig) {
    setHabilitado(d.aplicHabilitado);
    setUg(d.aplicUg ?? '');
    if (d.pntp !== undefined) setPntp(d.pntp);
  }

  useEffect(() => {
    setCarregando(true);
    setErro(null);
    setSucesso(null);
    getAplicConfig(tenantId)
      .then(preencher)
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
  }, [tenantId]);

  async function handleSalvar() {
    const ugLimpa = ug.replace(/\D/g, '');
    if (ugLimpa && ugLimpa.length !== 7) {
      setErro('A UG deve ter exatamente 7 dígitos.');
      return;
    }
    if (habilitado && !ugLimpa) {
      setErro('Para habilitar a fonte APLIC, informe a UG (7 dígitos) da entidade no TCE-MT.');
      return;
    }
    setSalvando(true);
    setErro(null);
    setSucesso(null);
    try {
      const novo = await salvarAplicConfig(tenantId, { aplicHabilitado: habilitado, aplicUg: ugLimpa });
      preencher(novo);
      setSucesso('Configurações da fonte APLIC salvas com sucesso.');
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
        Carregando configurações da fonte APLIC…
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-fg/70">
        Liga a fonte de dados <strong>APLIC (TCE-MT)</strong> no Portal da Transparência desta
        entidade. Com ela ligada, o administrador pode importar as cargas contábeis (módulo CT:
        empenhos, liquidações e pagamentos) e os dados aparecem na vitrine pública
        <code className="mx-1 rounded bg-muted px-1">/transparencia/execucao</code>.
      </p>

      <CheckField
        id={`${uid}-aplic-hab`}
        checked={habilitado}
        onChange={setHabilitado}
        label="Habilitar a fonte APLIC para esta entidade"
        description="Desligada: nenhuma importação nem vitrine pública de execução da despesa."
      />

      <div>
        <label htmlFor={`${uid}-aplic-ug`} className={ui.label}>
          Unidade Gestora (UG) — 7 dígitos
        </label>
        <p className="mb-1 text-xs text-fg/60">
          Código da entidade no TCE-MT (os 7 primeiros dígitos do nome das cargas, ex.:{' '}
          <code className="rounded bg-muted px-1">1112796</code>). Toda carga importada é validada
          contra esta UG. Obrigatória para habilitar.
        </p>
        <input
          id={`${uid}-aplic-ug`}
          type="text"
          inputMode="numeric"
          maxLength={7}
          value={ug}
          onChange={(e) => setUg(e.target.value.replace(/\D/g, '').slice(0, 7))}
          placeholder="1112796"
          className={`${ui.input} max-w-[180px] font-mono tracking-widest`}
        />
      </div>

      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>

      {/* Feedback PNTP (avaliação executada ao habilitar) */}
      {habilitado && pntp && (
        <div className="rounded border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold">
            Avaliação PNTP: selo <span className="text-primary">{pntp.selo}</span> · índice {pntp.indice.toFixed(1)}%
          </p>
          {pntp.essenciaisOk ? (
            <p className="text-success">Critérios essenciais atendidos.</p>
          ) : (
            <>
              <p className="text-fg/70">Faltam {pntp.bloqueantes.length} essencial(is) para Diamante:</p>
              <ul className="mt-1 list-disc pl-5 text-fg/70">
                {pntp.bloqueantes.slice(0, 8).map((b) => (
                  <li key={b.id}>{b.dimensao} — {b.desc}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <button type="button" onClick={handleSalvar} disabled={salvando} className={ui.btn} aria-busy={salvando}>
          {salvando ? 'Salvando…' : 'Salvar configurações da APLIC'}
        </button>
      </div>
    </div>
  );
}

// ── Aba Canais ─────────────────────────────────────────────────────────────────

const TIPO_LABEL_CANAL: Record<TipoCanal, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Facebook Messenger',
  telegram: 'Telegram',
};

function labelsCanalPorTipo(tipo: TipoCanal) {
  const base = {
    mostrarPhoneId: true,
    mostrarWabaId: true,
    mostrarAppSecret: true,
    phoneId: 'ID do número / página',
    token: 'Token',
    verifyToken: 'Verify token',
    // dicas (texto de ajuda sob cada campo)
    phoneIdDica: '',
    tokenDica: '',
    appSecretDica: 'App Secret do app da Meta (Configurações do app → Básico). Valida a assinatura do webhook.',
    verifyDica: 'Uma string que VOCÊ escolhe (ex.: "meu-token-123"). Usada no aperto de mão do webhook na Meta.',
    // guia passo a passo
    guia: [] as string[],
  };
  if (tipo === 'telegram') {
    return {
      ...base,
      mostrarPhoneId: false, mostrarWabaId: false, mostrarAppSecret: false,
      token: 'Token do Bot (BotFather)', verifyToken: 'Secret token (opcional)',
      tokenDica: 'Token gerado pelo @BotFather ao criar o bot.',
      verifyDica: 'Opcional: uma string secreta que você escolhe; reforça a segurança do webhook.',
      guia: [
        'No Telegram, fale com o @BotFather → comando /newbot → escolha nome e usuário do bot.',
        'Copie o TOKEN que o BotFather fornece e cole em "Token do Bot".',
        '(Opcional) defina um Secret token e cole no campo abaixo.',
        'Salve o canal; depois clique em "Webhook" do canal → "Configurar webhook automaticamente". Pronto — o Telegram passa a entregar as mensagens.',
      ],
    };
  }
  if (tipo === 'instagram') {
    return {
      ...base,
      phoneId: 'ID da conta Instagram / Página', token: 'Page Access Token',
      phoneIdDica: 'ID da conta Instagram profissional (ou da Página do Facebook conectada a ela).',
      tokenDica: 'Page Access Token da Página ligada ao Instagram.',
      guia: [
        'Tenha uma conta Instagram PROFISSIONAL conectada a uma Página do Facebook.',
        'No app da Meta (developers.facebook.com), adicione as permissões instagram_basic, instagram_manage_messages e pages_messaging.',
        'Pegue o ID da conta/Página e gere o Page Access Token.',
        'Copie o App Secret (Configurações do app → Básico) e defina um Verify token.',
        'Salve o canal, clique em "Webhook" e cole a Callback URL + Verify token no app da Meta, assinando o campo "messages".',
      ],
    };
  }
  if (tipo === 'messenger') {
    return {
      ...base,
      phoneId: 'ID da Página (Page ID)', token: 'Page Access Token',
      phoneIdDica: 'Page ID da Página do Facebook que vai atender.',
      tokenDica: 'Page Access Token da Página (app da Meta com permissão pages_messaging).',
      guia: [
        'Tenha uma Página do Facebook e um app na Meta com a permissão pages_messaging.',
        'Pegue o Page ID e gere o Page Access Token da Página.',
        'Copie o App Secret (Configurações do app → Básico) e defina um Verify token.',
        'Salve o canal, clique em "Webhook" e cole a Callback URL + Verify token no app da Meta, assinando "messages".',
      ],
    };
  }
  return {
    ...base,
    phoneId: 'Phone Number ID', token: 'Access token permanente',
    phoneIdDica: 'Phone Number ID do número (WhatsApp → API Setup, no painel da Meta).',
    tokenDica: 'Token PERMANENTE de um System User (Business Settings → Usuários do sistema), com permissões whatsapp_business_messaging e whatsapp_business_management.',
    guia: [
      'Crie/use um app Business no developers.facebook.com e um Meta Business Manager verificado.',
      'Adicione o produto "WhatsApp" → copie o Phone Number ID (e o WABA ID, opcional).',
      'Gere um token PERMANENTE via System User (Business Settings → Usuários do sistema).',
      'Copie o App Secret (Configurações do app → Básico) e defina um Verify token (string sua).',
      'Salve o canal, clique em "Webhook" e cole a Callback URL + Verify token no app da Meta (WhatsApp → Configuration → Webhooks), assinando o campo "messages".',
    ],
  };
}

// Bloco de guia (passo a passo) por tipo, expansível
function GuiaCanal({ guia, tipo }: { guia: string[]; tipo: TipoCanal }) {
  const nome = TIPO_LABEL_CANAL[tipo] ?? tipo;
  if (!guia.length) return null;
  return (
    <details className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
      <summary className="cursor-pointer select-none font-semibold text-primary">
        Como configurar o {nome} — passo a passo
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-fg/80">
        {guia.map((p, i) => (
          <li key={i}>{p}</li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-fg/50">
        As chaves ficam cifradas; o sistema gera sozinho o segredo do webhook. Manual completo: docs/atendimento/manual-canais-apis.md
      </p>
    </details>
  );
}

// Bloco do webhook DENTRO do formulário: mostra a URL exata (ao editar) ou a
// orientação do tipo (ao criar), com a instrução correta por plataforma.
function WebhookNoFormulario({
  tenantId,
  canal,
  tipo,
}: {
  tenantId: string;
  canal: CanalAtendimento | null;
  tipo: TipoCanal;
}) {
  const inputId = useId();
  const [info, setInfo] = useState<CanalWebhookInfo | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [resultadoTg, setResultadoTg] = useState<{ ok: boolean; descricao: string } | null>(null);

  useEffect(() => {
    if (!canal) { setInfo(null); return; }
    let vivo = true;
    getCanalWebhookInfo(tenantId, canal.id).then((i) => { if (vivo) setInfo(i); }).catch(() => {});
    return () => { vivo = false; };
  }, [tenantId, canal]);

  const ehTelegram = tipo === 'telegram';
  const pathTipo = ehTelegram ? '/api/webhooks/telegram/…' : '/api/webhooks/meta-canal/…';
  const instrucao = ehTelegram
    ? 'Telegram: não precisa colar em lugar nenhum — clique em "Configurar webhook automaticamente" abaixo. O sistema registra a URL no Telegram para você.'
    : 'Cole esta URL no painel da Meta (developers.facebook.com → seu app → Webhooks), assinando o campo "messages", e informe lá o MESMO Verify token deste formulário.';

  async function copiar() {
    if (!info?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(info.callbackUrl);
    } catch {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function configurarTelegram() {
    if (!canal) return;
    setConfigurando(true);
    setResultadoTg(null);
    try {
      setResultadoTg(await telegramSetWebhook(tenantId, canal.id));
    } catch (e) {
      setResultadoTg({ ok: false, descricao: erroMsg(e) });
    } finally {
      setConfigurando(false);
    }
  }

  return (
    <fieldset className="space-y-2 rounded border border-border p-3">
      <legend className="px-1 text-xs font-semibold text-fg/70">Webhook deste canal</legend>
      {!canal ? (
        <p className="text-xs text-fg/60">
          A URL exata do webhook é <strong>gerada ao salvar</strong> este canal e aparece aqui.
          Tipo: <span className="font-mono">{pathTipo}</span>
        </p>
      ) : info?.callbackUrl ? (
        <>
          <label htmlFor={inputId} className="text-xs text-fg/60">
            {ehTelegram ? 'URL do webhook (registrada pelo botão automático)' : 'Callback URL — cole no app da Meta'}
          </label>
          <div className="flex gap-2">
            <input id={inputId} type="text" readOnly value={info.callbackUrl}
              className={`${ui.input} flex-1 select-all font-mono text-xs`}
              aria-label="URL do webhook deste canal" />
            <button type="button" onClick={copiar} className={`${ui.btnGhost} shrink-0 text-xs`}>
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="text-xs text-fg/50">{instrucao}</p>
          {ehTelegram && (
            <>
              <button type="button" onClick={configurarTelegram} disabled={configurando}
                className={`${ui.btn} text-sm`}>
                {configurando ? 'Configurando…' : 'Configurar webhook automaticamente'}
              </button>
              {resultadoTg && (
                <p role={resultadoTg.ok ? 'status' : 'alert'}
                  className={`rounded border p-2 text-xs ${resultadoTg.ok ? 'border-success/40 text-success' : 'border-danger/40 text-danger'}`}>
                  {resultadoTg.descricao}
                </p>
              )}
            </>
          )}
        </>
      ) : (
        <p className="text-xs text-fg/60">Salve as credenciais para gerar a URL do webhook.</p>
      )}
    </fieldset>
  );
}

// Formulário de criação/edição de canal (dentro do modal de canais)
function FormCanal({
  tenantId,
  canal,
  onSalvo,
  onCancelar,
}: {
  tenantId: string;
  canal: CanalAtendimento | null;
  onSalvo: () => void;
  onCancelar: () => void;
}) {
  const uid = useId();
  const [tipo, setTipo] = useState<TipoCanal>(canal?.tipo ?? 'whatsapp');
  const [label, setLabel] = useState(canal?.label ?? '');
  const [phoneId, setPhoneId] = useState(canal?.metaPhoneNumberId ?? '');
  const [wabaId, setWabaId] = useState(canal?.metaWabaId ?? '');
  const [token, setToken] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [secretariaId, setSecretariaId] = useState(canal?.secretariaId ?? '');
  const [ativo, setAtivo] = useState(canal?.ativo ?? true);
  const [ordem, setOrdem] = useState(String(canal?.ordem ?? 0));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const l = labelsCanalPorTipo(tipo);

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) { setErro('O nome do canal é obrigatório.'); return; }
    if (l.mostrarPhoneId && !phoneId.trim()) { setErro(`O campo "${l.phoneId}" é obrigatório.`); return; }
    setSalvando(true);
    setErro('');
    try {
      const dto: CanalDto = {
        label: label.trim(),
        tipo,
        ativo,
        ordem: Number(ordem) || 0,
        ...(token ? { metaToken: token } : {}),
        ...(appSecret && l.mostrarAppSecret ? { metaAppSecret: appSecret } : {}),
        ...(verifyToken.trim() ? { metaVerifyToken: verifyToken.trim() } : {}),
        ...(secretariaId.trim() ? { secretariaId: secretariaId.trim() } : {}),
      };
      if (l.mostrarPhoneId) dto.metaPhoneNumberId = phoneId.trim();
      if (l.mostrarWabaId && wabaId.trim()) dto.metaWabaId = wabaId.trim();

      if (canal) {
        await atualizarCanal(tenantId, canal.id, dto);
      } else {
        await criarCanal(tenantId, dto);
      }
      onSalvo();
    } catch (err) {
      setErro(erroMsg(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">
        {canal ? `Editar canal — ${canal.label}` : 'Novo canal'}
      </h3>

      {erro && <p role="alert" className="rounded border border-danger/40 p-2 text-sm text-danger">{erro}</p>}

      <form onSubmit={handleSalvar} noValidate className="space-y-4">
        {/* Tipo */}
        <div>
          <label htmlFor={`${uid}-tipo`} className={ui.label}>Tipo do canal <span className="text-danger" aria-hidden="true">*</span></label>
          <select id={`${uid}-tipo`} value={tipo} onChange={(e) => setTipo(e.target.value as TipoCanal)}
            className={`mt-1 ${ui.input}`} aria-required="true">
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="messenger">Facebook Messenger</option>
            <option value="telegram">Telegram</option>
          </select>
        </div>

        {/* Guia de configuração (passo a passo por tipo) */}
        <GuiaCanal guia={l.guia} tipo={tipo} />

        {/* Nome */}
        <div>
          <label htmlFor={`${uid}-label`} className={ui.label}>Nome do canal <span className="text-danger" aria-hidden="true">*</span></label>
          <input id={`${uid}-label`} type="text" required value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex.: Saúde, Geral" className={`mt-1 ${ui.input}`} aria-required="true" />
          <p className="mt-0.5 text-xs text-fg/50">Rótulo interno para identificar o canal (ex.: Saúde, Ouvidoria). Não aparece para o cidadão.</p>
        </div>

        {/* Phone ID / Page ID */}
        {l.mostrarPhoneId && (
          <div>
            <label htmlFor={`${uid}-phone-id`} className={ui.label}>
              {l.phoneId} <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <input id={`${uid}-phone-id`} type="text" required value={phoneId}
              onChange={(e) => setPhoneId(e.target.value)}
              placeholder="123456789012345" className={`mt-1 ${ui.input}`} aria-required="true" />
            {l.phoneIdDica && <p className="mt-0.5 text-xs text-fg/50">{l.phoneIdDica}</p>}
          </div>
        )}

        {/* WABA ID */}
        {l.mostrarWabaId && (
          <div>
            <label htmlFor={`${uid}-waba-id`} className={ui.label}>
              WABA ID <span className="text-xs font-normal text-fg/50">(opcional)</span>
            </label>
            <input id={`${uid}-waba-id`} type="text" value={wabaId}
              onChange={(e) => setWabaId(e.target.value)}
              placeholder="987654321098765" className={`mt-1 ${ui.input}`} />
          </div>
        )}

        {/* Token (segredo) */}
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <label htmlFor={`${uid}-token`} className={ui.label}>{l.token}</label>
            {canal && <BadgeChave definida={canal.metaTokenDefinido} rotulo={l.token} />}
          </div>
          <input id={`${uid}-token`} type="password" autoComplete="new-password"
            value={token} onChange={(e) => setToken(e.target.value)}
            placeholder={canal?.metaTokenDefinido ? '•••• definido (deixe vazio para manter)' : 'Cole o token aqui'}
            className={ui.input} />
          {l.tokenDica && <p className="mt-0.5 text-xs text-fg/50">{l.tokenDica}</p>}
        </div>

        {/* App Secret */}
        {l.mostrarAppSecret && (
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <label htmlFor={`${uid}-app-secret`} className={ui.label}>App Secret</label>
              {canal && <BadgeChave definida={canal.metaAppSecretDefinido} rotulo="App Secret" />}
            </div>
            <input id={`${uid}-app-secret`} type="password" autoComplete="new-password"
              value={appSecret} onChange={(e) => setAppSecret(e.target.value)}
              placeholder={canal?.metaAppSecretDefinido ? '•••• definido (deixe vazio para manter)' : 'Cole o App Secret'}
              className={ui.input} />
            {l.appSecretDica && <p className="mt-0.5 text-xs text-fg/50">{l.appSecretDica}</p>}
          </div>
        )}

        {/* Verify / Secret token */}
        <div>
          <label htmlFor={`${uid}-verify`} className={ui.label}>{l.verifyToken}</label>
          <input id={`${uid}-verify`} type="text"
            value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)}
            placeholder={canal?.metaVerifyTokenDefinido ? '•••• definido (deixe vazio para manter)' : 'Ex.: meu-token-secreto'}
            className={`mt-1 ${ui.input}`} />
          {l.verifyDica && <p className="mt-0.5 text-xs text-fg/50">{l.verifyDica}</p>}
        </div>

        {/* Webhook (URL exata ao editar; orientação ao criar) */}
        <WebhookNoFormulario tenantId={tenantId} canal={canal} tipo={tipo} />

        {/* Secretaria */}
        <div>
          <label htmlFor={`${uid}-secretaria`} className={ui.label}>
            UUID da secretaria <span className="text-xs font-normal text-fg/50">(opcional)</span>
          </label>
          <input id={`${uid}-secretaria`} type="text" value={secretariaId}
            onChange={(e) => setSecretariaId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" className={`mt-1 ${ui.input}`} />
          <p className="mt-0.5 text-xs text-fg/50">Vincula o canal a uma secretaria: as conversas desse número já entram atribuídas a ela. Deixe vazio para a caixa geral.</p>
        </div>

        {/* Ordem + Ativo */}
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor={`${uid}-ordem`} className={ui.label}>Ordem</label>
            <input id={`${uid}-ordem`} type="number" min="0" value={ordem}
              onChange={(e) => setOrdem(e.target.value)} className={`mt-1 ${ui.input} w-24`} />
          </div>
          <CheckField id={`${uid}-ativo`} checked={ativo} onChange={setAtivo} label="Canal ativo" />
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <button type="button" onClick={onCancelar} className={ui.btnGhost}>Cancelar</button>
          <button type="submit" disabled={salvando} className={ui.btn} aria-busy={salvando}>
            {salvando ? 'Salvando…' : canal ? 'Salvar alterações' : 'Criar canal'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Bloco de webhook do canal (plataforma)
function BlocoWebhookCanalPlataforma({
  tenantId,
  canal,
  onFechar,
}: {
  tenantId: string;
  canal: CanalAtendimento;
  onFechar: () => void;
}) {
  const inputId = useId();
  const [info, setInfo] = useState<CanalWebhookInfo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const [configurando, setConfigurando] = useState(false);
  const [resultadoTg, setResultadoTg] = useState<{ ok: boolean; descricao: string } | null>(null);

  useEffect(() => {
    getCanalWebhookInfo(tenantId, canal.id)
      .then(setInfo)
      .catch((e) => setErro(erroMsg(e)))
      .finally(() => setCarregando(false));
  }, [tenantId, canal.id]);

  async function copiar() {
    if (!info?.callbackUrl) return;
    try {
      await navigator.clipboard.writeText(info.callbackUrl);
    } catch {
      const el = document.getElementById(inputId) as HTMLInputElement | null;
      el?.select();
      document.execCommand('copy');
    }
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  async function configurarTelegram() {
    setConfigurando(true);
    setResultadoTg(null);
    try {
      const res = await telegramSetWebhook(tenantId, canal.id);
      setResultadoTg(res);
    } catch (e) {
      setResultadoTg({ ok: false, descricao: erroMsg(e) });
    } finally {
      setConfigurando(false);
    }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm">Webhook — {canal.label}</h3>
      {carregando && <p className="text-sm text-fg/60" aria-live="polite">Carregando…</p>}
      {erro && <p role="alert" className="rounded border border-danger/40 p-2 text-sm text-danger">{erro}</p>}
      {!carregando && info && (
        <>
          {info.aviso && (
            <p role={info.pronto ? 'status' : 'alert'} aria-live="polite"
              className={`rounded border p-2 text-sm ${info.pronto ? 'border-success/40 text-success' : 'border-warning/60 text-fg/80'}`}>
              {info.aviso}
            </p>
          )}
          {info.callbackUrl ? (
            <div>
              <label htmlFor={inputId} className={ui.label}>Callback URL</label>
              <div className="mt-1 flex gap-2">
                <input id={inputId} type="text" readOnly value={info.callbackUrl}
                  className={`${ui.input} flex-1 select-all font-mono text-xs`}
                  aria-label={`Callback URL do canal ${canal.label}`} />
                <button type="button" onClick={copiar} className={`${ui.btnGhost} shrink-0 text-xs`}
                  aria-label={copiado ? 'URL copiada' : 'Copiar URL'}>
                  {copiado ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg/60">Salve o canal com as credenciais para gerar a URL.</p>
          )}

          {canal.tipo === 'telegram' && info.callbackUrl && (
            <div className="space-y-2">
              <button type="button" onClick={configurarTelegram} disabled={configurando}
                className={`${ui.btn} text-sm`}
                aria-label="Configurar webhook automaticamente no Telegram via Bot API">
                {configurando ? 'Configurando…' : 'Configurar webhook automaticamente'}
              </button>
              {resultadoTg && (
                <p role={resultadoTg.ok ? 'status' : 'alert'} aria-live="polite"
                  className={`rounded border p-2 text-sm ${resultadoTg.ok ? 'border-success/40 text-success' : 'border-danger/40 text-danger'}`}>
                  {resultadoTg.descricao}
                </p>
              )}
            </div>
          )}
        </>
      )}
      <div className="flex justify-end">
        <button type="button" onClick={onFechar} className={ui.btnGhost}>Fechar</button>
      </div>
    </div>
  );
}

function AbaCanais({ tenantId }: { tenantId: string }) {
  const [canais, setCanais] = useState<CanalAtendimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  // Qual painel inline exibir: null = lista, 'form-novo', 'form-editar', 'webhook'
  type Vista = null | 'form-novo' | { tipo: 'editar'; canal: CanalAtendimento } | { tipo: 'webhook'; canal: CanalAtendimento };
  const [vista, setVista] = useState<Vista>(null);

  function feedback(msg: string) {
    setSucesso(msg);
    setTimeout(() => setSucesso(null), 4000);
  }

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      setCanais(await getCanais(tenantId));
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleExcluir(id: string) {
    setExcluindo(id);
    setErro(null);
    try {
      await excluirCanal(tenantId, id);
      setConfirmandoId(null);
      feedback('Canal excluído com sucesso.');
      await carregar();
    } catch (e) {
      setErro(erroMsg(e));
    } finally {
      setExcluindo(null);
    }
  }

  // Mostrar sub-painel inline (form ou webhook)
  if (vista === 'form-novo') {
    return (
      <FormCanal tenantId={tenantId} canal={null}
        onSalvo={async () => { setVista(null); feedback('Canal criado.'); await carregar(); }}
        onCancelar={() => setVista(null)} />
    );
  }
  if (vista !== null && typeof vista === 'object' && vista.tipo === 'editar') {
    return (
      <FormCanal tenantId={tenantId} canal={vista.canal}
        onSalvo={async () => { setVista(null); feedback('Canal atualizado.'); await carregar(); }}
        onCancelar={() => setVista(null)} />
    );
  }
  if (vista !== null && typeof vista === 'object' && vista.tipo === 'webhook') {
    return (
      <BlocoWebhookCanalPlataforma tenantId={tenantId} canal={vista.canal}
        onFechar={() => setVista(null)} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">Canais de atendimento</p>
          <p className="text-xs text-fg/60">WhatsApp, Instagram, Facebook Messenger e Telegram — credenciais por entidade.</p>
        </div>
        <button type="button" onClick={() => setVista('form-novo')} className={`${ui.btn} text-sm`}>
          + Novo canal
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {sucesso && <Aviso tipo="ok">{sucesso}</Aviso>}
      </div>

      {carregando && (
        <p className="py-4 text-center text-sm text-fg/60" aria-live="polite">Carregando canais…</p>
      )}

      {!carregando && canais.length === 0 && (
        <div className={`${ui.card} p-5 text-center`}>
          <p className="text-sm text-fg/60">Nenhum canal cadastrado. Clique em <strong>+ Novo canal</strong> para adicionar.</p>
        </div>
      )}

      {!carregando && canais.length > 0 && (
        <ul className="space-y-2" role="list" aria-label="Canais cadastrados">
          {canais.map((c) => {
            const tipoLabel = TIPO_LABEL_CANAL[c.tipo] ?? c.tipo;
            const ehTelegram = c.tipo === 'telegram';
            return (
              <li key={c.id} className={`${ui.card} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-sm">{c.label}</span>
                      <span className={`${ui.badge} bg-primary/10 text-primary`} aria-label={`Tipo: ${tipoLabel}`}>{tipoLabel}</span>
                      <span className={`${ui.badge} ${c.ativo ? 'bg-success/10 text-success' : 'bg-muted text-fg/50'}`}
                        aria-label={c.ativo ? 'Ativo' : 'Inativo'}>
                        {c.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </div>
                    {!ehTelegram && c.metaPhoneNumberId && (
                      <p className="truncate font-mono text-xs text-fg/60">
                        {c.tipo === 'messenger' ? 'Page ID' : c.tipo === 'instagram' ? 'IG Account ID' : 'Phone ID'}: {c.metaPhoneNumberId}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-fg/50">
                      <span className={c.metaTokenDefinido ? 'text-success' : 'text-fg/40'}
                        title={c.metaTokenDefinido ? 'Token definido' : 'Token não definido'}>
                        {ehTelegram ? 'BotToken' : 'Token'} {c.metaTokenDefinido ? '✓' : '✗'}
                      </span>
                      {!ehTelegram && (
                        <span className={c.metaAppSecretDefinido ? 'text-success' : 'text-fg/40'}
                          title={c.metaAppSecretDefinido ? 'App Secret definido' : 'App Secret não definido'}>
                          App Secret {c.metaAppSecretDefinido ? '✓' : '✗'}
                        </span>
                      )}
                      <span className={c.metaVerifyTokenDefinido ? 'text-success' : 'text-fg/40'}
                        title={ehTelegram ? (c.metaVerifyTokenDefinido ? 'Secret token definido' : 'Secret token não definido') : (c.metaVerifyTokenDefinido ? 'Verify Token definido' : 'Verify Token não definido')}>
                        {ehTelegram ? 'Secret Token' : 'Verify Token'} {c.metaVerifyTokenDefinido ? '✓' : '✗'}
                      </span>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button type="button" className={`${ui.btnGhost} text-xs`}
                      onClick={() => setVista({ tipo: 'webhook', canal: c })}
                      aria-label={`Ver webhook do canal ${c.label}`}>
                      Webhook
                    </button>
                    <button type="button" className={`${ui.btnGhost} text-xs`}
                      onClick={() => setVista({ tipo: 'editar', canal: c })}
                      aria-label={`Editar canal ${c.label}`}>
                      Editar
                    </button>
                    {confirmandoId === c.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-danger">Confirmar?</span>
                        <button type="button" disabled={excluindo === c.id}
                          onClick={() => handleExcluir(c.id)}
                          className={`${ui.btnDanger} text-xs`}
                          aria-label={`Confirmar exclusão do canal ${c.label}`}>
                          {excluindo === c.id ? 'Excluindo…' : 'Excluir'}
                        </button>
                        <button type="button" onClick={() => setConfirmandoId(null)}
                          className={`${ui.btnGhost} text-xs`} aria-label="Cancelar exclusão">
                          Cancelar
                        </button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirmandoId(c.id)}
                        className={`${ui.btnDanger} text-xs`}
                        aria-label={`Excluir canal ${c.label}`}>
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
    </div>
  );
}

// ── Modal principal com abas ────────────────────────────────────────────────────

export function ModalConfiguracoes({
  tenant,
  onClose,
}: {
  tenant: Tenant | null;
  onClose: () => void;
}) {
  const uid = useId();
  const [abaAtiva, setAbaAtiva] = useState<Aba>('ia');

  // Reinicia para a aba IA ao abrir um tenant diferente
  useEffect(() => {
    if (tenant) setAbaAtiva('ia');
  }, [tenant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const abas: { id: Aba; rotulo: string }[] = [
    { id: 'ia', rotulo: 'IA' },
    { id: 'whatsapp', rotulo: 'WhatsApp' },
    { id: 'atendimento', rotulo: 'Atendimento' },
    { id: 'lgpd', rotulo: 'LGPD' },
    { id: 'canais', rotulo: 'Canais' },
    { id: 'aplic', rotulo: 'Transparência (APLIC)' },
  ];

  const open = !!tenant;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Configurações — ${tenant?.nome ?? ''}`}
    >
      {/* Barra de abas */}
      <div
        role="tablist"
        aria-label="Seções de configuração"
        className="mb-5 flex gap-1 border-b border-border"
      >
        {abas.map((aba) => {
          const isAtiva = abaAtiva === aba.id;
          const tabId = `${uid}-tab-${aba.id}`;
          const panelId = `${uid}-panel-${aba.id}`;
          return (
            <button
              key={aba.id}
              id={tabId}
              type="button"
              role="tab"
              aria-selected={isAtiva}
              aria-controls={panelId}
              onClick={() => setAbaAtiva(aba.id)}
              className={[
                'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
                isAtiva
                  ? 'border-primary text-primary'
                  : 'border-transparent text-fg/60 hover:text-fg hover:border-border',
              ].join(' ')}
            >
              {aba.rotulo}
            </button>
          );
        })}
      </div>

      {/* Painéis das abas */}
      {tenant && abas.map((aba) => {
        const tabId = `${uid}-tab-${aba.id}`;
        const panelId = `${uid}-panel-${aba.id}`;
        const isAtiva = abaAtiva === aba.id;
        return (
          <div
            key={aba.id}
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabId}
            hidden={!isAtiva}
          >
            {isAtiva && (
              <>
                {aba.id === 'ia' && <AbaIA tenantId={tenant.id} />}
                {aba.id === 'whatsapp' && <AbaWhatsapp tenantId={tenant.id} />}
                {aba.id === 'atendimento' && <AbaAtendimento tenantId={tenant.id} />}
                {aba.id === 'lgpd' && <AbaLgpd tenantId={tenant.id} />}
                {aba.id === 'canais' && <AbaCanais tenantId={tenant.id} />}
                {aba.id === 'aplic' && <AbaAplic tenantId={tenant.id} />}
              </>
            )}
          </div>
        );
      })}

      {/* Rodapé */}
      <div className="mt-5 flex justify-end border-t border-border pt-4">
        <button type="button" onClick={onClose} className={ui.btnGhost}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
