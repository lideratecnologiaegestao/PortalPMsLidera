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
  getLgpdDocumento,
  gerarLgpdDocumento,
  type IaConfigMascarada,
  type IaConfigDto,
  type WhatsappConfigMascarada,
  type WhatsappConfigDto,
  type AtendimentoConfig,
  type LgpdConfig,
  type LgpdDocEstado,
  type DadosLgpdEntidade,
  type Tenant,
} from '../../../lib/platform';
import { AdminApiError } from '../../../lib/admin-api';

// ── Tipos internos ─────────────────────────────────────────────────────────────

type Aba = 'ia' | 'whatsapp' | 'atendimento' | 'lgpd';

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
