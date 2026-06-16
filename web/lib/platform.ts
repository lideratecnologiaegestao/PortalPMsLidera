/**
 * Helpers de dados para o Gerenciador da Plataforma (super_admin).
 *
 * Este arquivo contém APENAS tipos e funções client-safe
 * (não importam next/headers).
 *
 * Para o helper server getPlataformaUser(), ver lib/platform-server.ts.
 */

import {
  adminGet,
  adminPost,
  adminPatch,
  adminPut,
  adminDelete,
  qs,
  type Pagina,
} from './admin-api';
import { apiBase } from './auth-shared';

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface PlataformaUser {
  id: string;
  nome: string;
  email: string;
  role: 'super_admin';
}

export type TenantPlano = 'padrao' | 'capital' | 'dedicado';

/**
 * Registro individual de validação DNS/HTTP retornado pelo Cloudflare
 * (pode ser TXT ou HTTP, campos relevantes presentes conforme o método).
 */
export interface DominioValidacaoRecord {
  txt_name?: string;
  txt_value?: string;
  http_url?: string;
  http_body?: string;
}

/**
 * Objeto completo de validação do Custom Hostname do Cloudflare.
 * Retornado em `dominioCustom` (criação) e em `cfValidacao` (GET/verificar).
 */
export interface DominioValidacao {
  id: string;
  hostname: string;
  status: string;
  jaExistia?: boolean;
  ssl: {
    status: string;
    method: string;
    type?: string;
    validationRecords?: DominioValidacaoRecord[];
  };
  ownershipVerification: {
    txtName?: string;
    txtValue?: string;
    httpUrl?: string;
    httpBody?: string;
  };
}

export interface Tenant {
  id: string;
  slug: string;
  nome: string;
  uf: string;
  dominio: string | null;
  subdominio: string | null;
  plano: TenantPlano;
  ativo: boolean;
  iaTriagemHabilitada: boolean;
  iaChatHabilitada: boolean;
  criadoEm: string; // ISO 8601
  /** Presente quando o tenant usa domínio próprio gerenciado pelo Cloudflare. */
  cfCustomHostnameId?: string | null;
  /** Status do Custom Hostname no Cloudflare (ex.: pending, active, blocked). */
  cfStatus?: string | null;
  /** Dados completos de validação (disponível no GET individual e após verificar). */
  cfValidacao?: DominioValidacao | null;
  /** ISO 8601 da última atualização dos dados CF. */
  cfAtualizadoEm?: string | null;
}

/** Shape da resposta de POST /dominio/verificar. */
export interface VerificarDominioResp {
  id: string;
  dominio: string;
  cfCustomHostnameId: string;
  cfStatus: string;
  cfValidacao: DominioValidacao | null;
  cfAtualizadoEm: string | null;
}

export interface NovoTenantDto {
  nome: string;
  slug: string;
  uf: string;
  municipioIbge?: string;
  cnpj?: string;
  dominio?: string;
  subdominio?: string;
  plano?: TenantPlano;
  adminNome?: string;
  adminEmail?: string;
}

export interface NovoTenantResp {
  tenant: Tenant;
  admin: {
    email: string;
    senhaProvisoria: string;
  };
  /** Presente quando o tenant criado tem domínio próprio e o CF está configurado. */
  dominioCustom?: DominioValidacao | null;
}

export interface AtualizarTenantDto {
  nome?: string;
  uf?: string;
  dominio?: string;
  subdominio?: string;
  plano?: TenantPlano;
  ativo?: boolean;
  iaTriagemHabilitada?: boolean;
  iaChatHabilitada?: boolean;
}

export interface ListarTenantsParams {
  q?: string;
  ativo?: '' | 'true' | 'false';
  page?: number;
  pageSize?: number;
}

// ── Funções client (browser) ─────────────────────────────────────────────────

export async function listarTenants(
  filtros: ListarTenantsParams = {},
): Promise<Pagina<Tenant>> {
  const query = qs({
    q: filtros.q,
    ativo: filtros.ativo,
    page: filtros.page,
    pageSize: filtros.pageSize,
  });
  return adminGet<Pagina<Tenant>>(`/api/_platform/tenants${query}`);
}

export async function getTenant(id: string): Promise<Tenant> {
  return adminGet<Tenant>(`/api/_platform/tenants/${id}`);
}

export async function criarTenant(dto: NovoTenantDto): Promise<NovoTenantResp> {
  return adminPost<NovoTenantResp>('/api/_platform/tenants', dto);
}

export async function atualizarTenant(
  id: string,
  dto: AtualizarTenantDto,
): Promise<Tenant> {
  return adminPatch<Tenant>(`/api/_platform/tenants/${id}`, dto);
}

/**
 * Aciona a verificação do Custom Hostname no Cloudflare para o tenant.
 * Retorna o status atualizado e os registros de validação.
 * Lança AdminApiError 400 se o tenant não tem domínio próprio,
 * ou 503 se o Cloudflare não está configurado.
 */
export async function verificarDominio(id: string): Promise<VerificarDominioResp> {
  return adminPost<VerificarDominioResp>(
    `/api/_platform/tenants/${id}/dominio/verificar`,
  );
}

// ── Configurações da Entidade (super_admin) ──────────────────────────────────
// Segredos NUNCA voltam em claro: os GETs retornam apenas flags "*Definido/Proprio".
// Convenção de escrita: campo ausente mantém; string vazia '' LIMPA (volta ao global).

/** IA — override por entidade sobre o global (.env). */
export interface IaConfigMascarada {
  iaMaxChunks: number | null;
  embeddingsProvider: 'voyage' | 'openai' | null;
  voyageProprio: boolean;
  anthropicProprio: boolean;
  openaiProprio: boolean;
  efetivo: {
    maxChunks: number;
    maxChunksFonte: 'entidade' | 'global';
    provider: string | null;
    providerFonte: 'entidade' | 'global';
    embeddingsDefinido: boolean;
    anthropicDefinido: boolean;
  };
  global: {
    maxChunks: number;
    provider: string | null;
    voyageDefinida: boolean;
    openaiDefinida: boolean;
    anthropicDefinida: boolean;
  };
}
export interface IaConfigDto {
  iaMaxChunks?: number | null;
  embeddingsProvider?: string;
  voyageApiKey?: string;
  anthropicApiKey?: string;
  openaiApiKey?: string;
  ativo?: boolean;
}
export const getIaConfig = (id: string) =>
  adminGet<IaConfigMascarada>(`/api/_platform/tenants/${id}/config/ia`);
export const salvarIaConfig = (id: string, dto: IaConfigDto) =>
  adminPut<IaConfigMascarada>(`/api/_platform/tenants/${id}/config/ia`, dto);

/** WhatsApp — provider + credenciais (cifradas). */
export interface WhatsappConfigMascarada {
  provider: string;
  fallbackProvider: string | null;
  zapiInstanceId: string | null;
  zapiTokenDefinido: boolean;
  zapiClientTokenDefinido: boolean;
  zapiWebhookSecretDefinido: boolean;
  evolutionApiUrl: string | null;
  evolutionInstance: string | null;
  evolutionApiKeyDefinida: boolean;
  ativo: boolean;
}
export interface WhatsappConfigDto {
  provider?: string;
  fallbackProvider?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  evolutionApiUrl?: string;
  evolutionInstance?: string;
  evolutionApiKey?: string;
  ativo?: boolean;
}
export const getWhatsappConfig = (id: string) =>
  adminGet<WhatsappConfigMascarada>(`/api/_platform/tenants/${id}/config/whatsapp`);
export const salvarWhatsappConfig = (id: string, dto: WhatsappConfigDto) =>
  adminPut<WhatsappConfigMascarada>(`/api/_platform/tenants/${id}/config/whatsapp`, dto);

/** Atendimento / chat — flags de visibilidade do widget + mensagens. */
export interface AtendimentoConfig {
  atendimentoHumanoAtivo: boolean;
  iaChatWidgetAtivo: boolean;
  iaChatHabilitada: boolean;
  iaTriagemHabilitada: boolean;
  atendimentoAvisoLgpd: string | null;
  atendimentoMensagemForaExp: string | null;
  atendimentoSaudacao: string | null;
  atendimentoInatividadeMin: number;
  atendimentoTimezone: string;
}
export const getAtendimentoConfig = (id: string) =>
  adminGet<AtendimentoConfig>(`/api/_platform/tenants/${id}/config/atendimento`);
export const salvarAtendimentoConfig = (id: string, dto: Partial<AtendimentoConfig>) =>
  adminPut<AtendimentoConfig>(`/api/_platform/tenants/${id}/config/atendimento`, dto);

/** LGPD — Encarregado de Dados (DPO). */
export interface LgpdConfig {
  dpoNome: string | null;
  dpoEmail: string | null;
}
export const getLgpdConfig = (id: string) =>
  adminGet<LgpdConfig>(`/api/_platform/tenants/${id}/config/lgpd`);
export const salvarLgpdConfig = (id: string, dto: Partial<LgpdConfig>) =>
  adminPut<LgpdConfig>(`/api/_platform/tenants/${id}/config/lgpd`, dto);

/** Dados complementares usados na geração da documentação LGPD. */
export interface DadosLgpdEntidade {
  dpoTelefone?: string;
  dpoEndereco?: string;
  enderecoEntidade?: string;
  municipio?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
}
/** Estado da documentação LGPD gerada por entidade. */
export interface LgpdDocEstado {
  gerado: boolean;
  publicado: boolean;
  versao: number | null;
  geradoEm: string | null;
  publicadoEm: string | null;
  dados: DadosLgpdEntidade;
  temHtml: boolean;
}
export const getLgpdDocumento = (id: string) =>
  adminGet<LgpdDocEstado>(`/api/_platform/tenants/${id}/config/lgpd/documento`);
export const gerarLgpdDocumento = (id: string, dados: DadosLgpdEntidade) =>
  adminPost<LgpdDocEstado>(`/api/_platform/tenants/${id}/config/lgpd/gerar`, dados);

/** Template GLOBAL da documentação LGPD (Console da Plataforma). */
export interface LgpdPlaceholder { chave: string; rotulo: string; origem: string }
export interface LgpdTemplate {
  template: string;
  personalizado: boolean;
  atualizadoEm: string | null;
  placeholders: LgpdPlaceholder[];
}
export const getLgpdTemplate = () =>
  adminGet<LgpdTemplate>('/api/_platform/config/lgpd-template');
export const salvarLgpdTemplate = (template: string | null) =>
  adminPut<LgpdTemplate>('/api/_platform/config/lgpd-template', { template });

// ── Configuração GLOBAL da plataforma (super_admin) ──────────────────────────
export interface PlatformConfig {
  dev: {
    ativo: boolean; nome: string | null; razaoSocial: string | null; cnpj: string | null;
    endereco: string | null; email: string | null; suporteUrl: string | null;
    whatsapp: string | null; siteUrl: string | null; logoUrl: string | null;
  };
  smtp: {
    ativo: boolean; host: string | null; port: number | null; secure: boolean;
    user: string | null; from: string | null; senhaDefinida: boolean;
  };
  ia: {
    iaModel: string | null; embeddingsProvider: string | null; embeddingsModel: string | null;
    anthropicDefinida: boolean; voyageDefinida: boolean; openaiDefinida: boolean;
  };
  backup: Record<string, unknown>;
  atualizadoEm: string;
}
export interface PlatformConfigDto {
  devAtivo?: boolean; devNome?: string; devRazaoSocial?: string; devCnpj?: string;
  devEndereco?: string; devEmail?: string; devSuporteUrl?: string; devWhatsapp?: string;
  devSiteUrl?: string; devLogoUrl?: string;
  smtpAtivo?: boolean; smtpHost?: string; smtpPort?: number; smtpSecure?: boolean;
  smtpUser?: string; smtpPass?: string; smtpFrom?: string;
  iaModel?: string; embeddingsProvider?: string; embeddingsModel?: string;
  anthropicKey?: string; voyageKey?: string; openaiKey?: string;
  backup?: Record<string, unknown>;
}
export const getPlatformConfig = () => adminGet<PlatformConfig>('/api/_platform/config');
export const salvarPlatformConfig = (dto: PlatformConfigDto) =>
  adminPut<PlatformConfig>('/api/_platform/config', dto);

// ── Backups (super_admin) ────────────────────────────────────────────────────
export interface BackupConfig {
  dbAtivo?: boolean; storageAtivo?: boolean; retencaoDias?: number;
  frequencia?: 'diario' | '12h' | '6h' | 'semanal'; hora?: number;
  ultimoEm?: string; ultimoStatus?: string; ultimoTamanho?: number; ultimoErro?: string;
  ftpAtivo?: boolean; ftpHost?: string; ftpPort?: number; ftpUser?: string;
  ftpDir?: string; ftpSecure?: boolean; ftpSenhaDefinida?: boolean;
}
export interface BackupItem { key: string; tamanho: number; em: string }
export interface BackupStatus {
  disponivel: boolean;
  bucket: string;
  config: BackupConfig;
  backups: BackupItem[];
  backupsEntidades: BackupItem[];
}
export const getBackupStatus = () => adminGet<BackupStatus>('/api/_platform/backups');
export const backupEntidade = (tenantId: string) =>
  adminPost<{ enfileirado: boolean; aviso?: string }>(`/api/_platform/backups/entidade/${tenantId}`);
export const executarBackup = () =>
  adminPost<{ enfileirado: boolean; aviso?: string }>('/api/_platform/backups/executar');
export const backupDownloadUrl = (key: string) =>
  `${apiBase}/api/_platform/backups/download?key=${encodeURIComponent(key)}`;
export const excluirBackup = (key: string) =>
  adminDelete<{ ok: boolean }>(`/api/_platform/backups?key=${encodeURIComponent(key)}`);

/** Upload da logomarca da empresa (multipart). Retorna a URL pública estável. */
export async function uploadLogoPlataforma(file: File): Promise<{ logoUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${apiBase}/api/_platform/config/logo`, {
    method: 'POST', body: form, credentials: 'include',
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error(d?.message ?? 'Falha ao enviar a logomarca.');
  }
  return res.json();
}
