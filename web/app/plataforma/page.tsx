'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  listarTenants,
  criarTenant,
  atualizarTenant,
  getTenant,
  verificarDominio,
  type Tenant,
  type NovoTenantResp,
  type TenantPlano,
  type ListarTenantsParams,
  type DominioValidacao,
  type DominioValidacaoRecord,
} from '../../lib/platform';
import { AdminApiError, type Pagina } from '../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../admin/_components/ui';
import { ModalConfiguracoes } from './_components/ModalConfiguracoes';

// ── Utilitários ──────────────────────────────────────────────────────────────

function slugificar(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function dominioPrincipal(t: Tenant): string {
  return t.dominio ?? `${t.subdominio}.lidera.app.br`;
}

function formatarData(iso: string): string {
  try {
    return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

const PLANOS: { value: TenantPlano; label: string }[] = [
  { value: 'padrao', label: 'Padrão' },
  { value: 'capital', label: 'Capital' },
  { value: 'dedicado', label: 'Dedicado' },
];

// ── Badge de status ───────────────────────────────────────────────────────────

function BadgeStatus({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`${ui.badge} ${ativo ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
    >
      {ativo ? 'Ativo' : 'Inativo'}
    </span>
  );
}

/** Badge visual para o status do Custom Hostname no Cloudflare. */
function BadgeDominioCF({ status }: { status: string }) {
  let classes = 'bg-muted text-fg/70';
  let rotulo = status;
  if (status === 'active') {
    classes = 'bg-success/15 text-success';
    rotulo = 'Domínio ativo';
  } else if (status === 'pending' || status === 'pending_validation') {
    classes = 'bg-warning/20 text-fg';
    rotulo = 'DNS pendente';
  } else if (status === 'blocked' || status === 'moved') {
    classes = 'bg-danger/15 text-danger';
    rotulo = status === 'blocked' ? 'Bloqueado' : 'Movido';
  }
  return (
    <span className={`${ui.badge} ${classes}`} title={`CF status: ${status}`}>
      {rotulo}
    </span>
  );
}

/**
 * Exibe um rótulo, o valor em fonte monoespaçada e um botão "Copiar"
 * com feedback visual acessível.
 */
function RegistroValidacao({
  rotulo,
  valor,
  idBase,
}: {
  rotulo: string;
  valor: string;
  idBase: string;
}) {
  const [copiado, setCopiado] = useState(false);
  const valorId = `${idBase}-valor`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 3000);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold text-fg/60">{rotulo}</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <code
          id={valorId}
          className="break-all rounded bg-muted px-2 py-1 font-mono text-xs text-fg"
        >
          {valor}
        </code>
        <button
          type="button"
          onClick={copiar}
          aria-describedby={valorId}
          aria-label={copiado ? 'Copiado!' : `Copiar ${rotulo}`}
          className={`${ui.btnGhost} py-0.5 px-2 text-xs`}
        >
          {copiado ? 'Copiado!' : 'Copiar'}
        </button>
      </dd>
    </div>
  );
}

/** Lista todos os registros de validação presentes em um DominioValidacao. */
function SecaoRegistrosValidacao({
  validacao,
  idPrefix,
}: {
  validacao: DominioValidacao;
  idPrefix: string;
}) {
  const ov = validacao.ownershipVerification;
  const sslRecords: DominioValidacaoRecord[] = validacao.ssl?.validationRecords ?? [];

  return (
    <div className="space-y-4">
      {/* Verificação de propriedade */}
      <div>
        <p className="mb-2 text-xs font-semibold text-fg/70 uppercase tracking-wide">
          Verificação de propriedade
        </p>
        <dl className="space-y-3 rounded border border-border p-3">
          {ov.txtName && ov.txtValue && (
            <>
              <RegistroValidacao
                rotulo="TXT — Nome"
                valor={ov.txtName}
                idBase={`${idPrefix}-ov-txt-name`}
              />
              <RegistroValidacao
                rotulo="TXT — Valor"
                valor={ov.txtValue}
                idBase={`${idPrefix}-ov-txt-value`}
              />
            </>
          )}
          {ov.httpUrl && (
            <RegistroValidacao
              rotulo="HTTP — URL"
              valor={ov.httpUrl}
              idBase={`${idPrefix}-ov-http-url`}
            />
          )}
          {ov.httpBody && (
            <RegistroValidacao
              rotulo="HTTP — Corpo"
              valor={ov.httpBody}
              idBase={`${idPrefix}-ov-http-body`}
            />
          )}
        </dl>
      </div>

      {/* Registros SSL */}
      {sslRecords.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-fg/70 uppercase tracking-wide">
            Registros de certificado SSL
          </p>
          <dl className="space-y-3 rounded border border-border p-3">
            {sslRecords.map((rec, i) => (
              <div key={i} className="space-y-2">
                {rec.txt_name && (
                  <RegistroValidacao
                    rotulo={`SSL ${i + 1} — TXT Nome`}
                    valor={rec.txt_name}
                    idBase={`${idPrefix}-ssl-${i}-txt-name`}
                  />
                )}
                {rec.txt_value && (
                  <RegistroValidacao
                    rotulo={`SSL ${i + 1} — TXT Valor`}
                    valor={rec.txt_value}
                    idBase={`${idPrefix}-ssl-${i}-txt-value`}
                  />
                )}
                {rec.http_url && (
                  <RegistroValidacao
                    rotulo={`SSL ${i + 1} — HTTP URL`}
                    valor={rec.http_url}
                    idBase={`${idPrefix}-ssl-${i}-http-url`}
                  />
                )}
                {rec.http_body && (
                  <RegistroValidacao
                    rotulo={`SSL ${i + 1} — HTTP Corpo`}
                    valor={rec.http_body}
                    idBase={`${idPrefix}-ssl-${i}-http-body`}
                  />
                )}
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}

// ── Modal: Nova Prefeitura ────────────────────────────────────────────────────

function ModalNovaPrefeitura({
  open,
  onClose,
  onCriado,
}: {
  open: boolean;
  onClose: () => void;
  onCriado: () => void;
}) {
  const [nome, setNome] = useState('');
  const [slug, setSlug] = useState('');
  const [uf, setUf] = useState('');
  const [municipioIbge, setMunicipioIbge] = useState('');
  const [cnpj, setCnpj] = useState('');
  const [dominio, setDominio] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [plano, setPlano] = useState<TenantPlano>('padrao');
  const [adminNome, setAdminNome] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<NovoTenantResp | null>(null);
  const [senhaCopiadaOk, setSenhaCopiadaOk] = useState(false);

  // Limpa ao abrir
  useEffect(() => {
    if (open) {
      setNome(''); setSlug(''); setUf(''); setMunicipioIbge('');
      setCnpj(''); setDominio(''); setSubdominio(''); setPlano('padrao');
      setAdminNome(''); setAdminEmail(''); setErro(null); setResultado(null);
      setSenhaCopiadaOk(false);
    }
  }, [open]);

  // Sugere slug a partir do nome
  function handleNome(v: string) {
    setNome(v);
    setSlug(slugificar(v));
  }

  // Sugere adminEmail a partir do domínio/subdomínio
  useEffect(() => {
    const d = dominio || (subdominio ? `${subdominio}.lidera.app.br` : '');
    if (d && !adminEmail) setAdminEmail(`admin@${d}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dominio, subdominio]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);

    if (!dominio && !subdominio) {
      setErro('Informe ao menos um Domínio próprio ou Subdomínio.');
      return;
    }

    setCarregando(true);
    try {
      const resp = await criarTenant({
        nome,
        slug,
        uf,
        municipioIbge: municipioIbge || undefined,
        cnpj: cnpj || undefined,
        dominio: dominio || undefined,
        subdominio: subdominio || undefined,
        plano,
        adminNome: adminNome || undefined,
        adminEmail: adminEmail || undefined,
      });
      setResultado(resp);
      onCriado();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 409) {
        setErro('Slug ou domínio já cadastrado. Verifique os dados e tente novamente.');
      } else if (err instanceof Error) {
        setErro(err.message);
      } else {
        setErro('Erro desconhecido ao criar prefeitura.');
      }
    } finally {
      setCarregando(false);
    }
  }

  async function copiarSenha(senha: string) {
    try {
      await navigator.clipboard.writeText(senha);
      setSenhaCopiadaOk(true);
      setTimeout(() => setSenhaCopiadaOk(false), 3000);
    } catch {
      /* clipboard indisponível */
    }
  }

  // ── Painel de sucesso ──
  if (resultado) {
    const portal = resultado.tenant.dominio
      ? `https://${resultado.tenant.dominio}`
      : `https://${resultado.tenant.subdominio}.lidera.app.br`;
    return (
      <Modal open={open} onClose={onClose} title="Prefeitura criada com sucesso">
        <div className="space-y-4">
          <Aviso tipo="ok">
            Prefeitura <strong>{resultado.tenant.nome}</strong> cadastrada. Anote as
            informações abaixo — a senha provisória não será mostrada novamente.
          </Aviso>

          <dl className="divide-y divide-border rounded border border-border text-sm">
            <InfoRow label="URL do portal">
              <a
                href={portal}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {portal}
              </a>
            </InfoRow>
            <InfoRow label="URL do admin">
              <a
                href={`${portal}/admin`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                {portal}/admin
              </a>
            </InfoRow>
            <InfoRow label="E-mail do admin">{resultado.admin.email}</InfoRow>
            <InfoRow label="Senha provisória">
              <span className="flex items-center gap-2 flex-wrap">
                <code className="rounded bg-muted px-2 py-0.5 font-mono text-fg">
                  {resultado.admin.senhaProvisoria}
                </code>
                <button
                  type="button"
                  onClick={() => copiarSenha(resultado.admin.senhaProvisoria)}
                  className={`${ui.btnGhost} text-xs py-1`}
                  aria-label="Copiar senha provisória"
                >
                  {senhaCopiadaOk ? 'Copiado!' : 'Copiar'}
                </button>
              </span>
            </InfoRow>
          </dl>

          {/* Seção de configuração do domínio próprio */}
          {resultado.dominioCustom && (
            <section
              aria-labelledby="dominio-custom-titulo"
              className="rounded border border-border bg-muted/30 p-4 space-y-3"
            >
              <h3
                id="dominio-custom-titulo"
                className="font-heading text-base font-bold"
              >
                Configuração do domínio próprio
              </h3>
              <p className="text-sm text-fg/80">
                Para o domínio{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {resultado.dominioCustom.hostname}
                </code>{' '}
                funcionar, peça à prefeitura para publicar <strong>um</strong> destes
                registros no DNS/servidor dela:
              </p>

              <SecaoRegistrosValidacao
                validacao={resultado.dominioCustom}
                idPrefix="novo-tenant"
              />

              <p
                role="note"
                className="rounded bg-warning/20 p-3 text-xs text-fg font-medium"
              >
                Após publicar os registros, clique em{' '}
                <strong>Verificar status</strong> na lista de prefeituras para
                confirmar a ativação.
              </p>
            </section>
          )}

          <p className="rounded bg-warning/20 p-3 text-xs text-fg font-medium" role="note">
            Aviso: anote a senha provisória agora. Por segurança, ela não será exibida
            novamente após fechar este painel.
          </p>

          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={ui.btn}>
              Fechar
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // ── Formulário ──
  return (
    <Modal open={open} onClose={onClose} title="Nova Prefeitura">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Nome */}
          <div className="sm:col-span-2">
            <label htmlFor="nt-nome" className={ui.label}>
              Nome da prefeitura <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <input
              id="nt-nome"
              type="text"
              required
              value={nome}
              onChange={(e) => handleNome(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="Prefeitura de Exemplo"
              aria-required="true"
            />
          </div>

          {/* Slug */}
          <div>
            <label htmlFor="nt-slug" className={ui.label}>
              Slug <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <input
              id="nt-slug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              pattern="[a-z0-9\-]+"
              className={`mt-1 ${ui.input}`}
              placeholder="prefeitura-exemplo"
              aria-required="true"
              aria-describedby="nt-slug-help"
            />
            <p id="nt-slug-help" className="mt-0.5 text-xs text-fg/60">
              Somente minúsculas, números e hífens.
            </p>
          </div>

          {/* UF */}
          <div>
            <label htmlFor="nt-uf" className={ui.label}>
              UF <span aria-hidden="true" className="text-danger">*</span>
            </label>
            <input
              id="nt-uf"
              type="text"
              required
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className={`mt-1 ${ui.input} uppercase`}
              placeholder="SP"
              aria-required="true"
            />
          </div>

          {/* IBGE */}
          <div>
            <label htmlFor="nt-ibge" className={ui.label}>
              Código IBGE
            </label>
            <input
              id="nt-ibge"
              type="text"
              value={municipioIbge}
              onChange={(e) => setMunicipioIbge(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="3550308"
            />
          </div>

          {/* CNPJ */}
          <div>
            <label htmlFor="nt-cnpj" className={ui.label}>
              CNPJ
            </label>
            <input
              id="nt-cnpj"
              type="text"
              value={cnpj}
              onChange={(e) => setCnpj(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="00.000.000/0001-00"
            />
          </div>

          {/* Domínio próprio */}
          <div>
            <label htmlFor="nt-dominio" className={ui.label}>
              Domínio próprio
            </label>
            <input
              id="nt-dominio"
              type="text"
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="portal.exemplo.sp.gov.br"
              aria-describedby="nt-dominio-help"
            />
            <p id="nt-dominio-help" className="mt-0.5 text-xs text-fg/60">
              Domínio oficial da prefeitura (ex.: portal.cidade.sp.gov.br).
            </p>
          </div>

          {/* Subdomínio */}
          <div>
            <label htmlFor="nt-subdominio" className={ui.label}>
              Subdomínio Lidera
            </label>
            <input
              id="nt-subdominio"
              type="text"
              value={subdominio}
              onChange={(e) => setSubdominio(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="cidade"
              aria-describedby="nt-subdominio-help"
            />
            <p id="nt-subdominio-help" className="mt-0.5 text-xs text-fg/60">
              Resultado: <strong>{subdominio ? `${subdominio}.lidera.app.br` : 'cidade.lidera.app.br'}</strong>
            </p>
          </div>

          {/* Plano */}
          <div>
            <label htmlFor="nt-plano" className={ui.label}>
              Plano
            </label>
            <select
              id="nt-plano"
              value={plano}
              onChange={(e) => setPlano(e.target.value as TenantPlano)}
              className={`mt-1 ${ui.input}`}
            >
              {PLANOS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* Admin nome */}
          <div>
            <label htmlFor="nt-admin-nome" className={ui.label}>
              Nome do admin inicial
            </label>
            <input
              id="nt-admin-nome"
              type="text"
              value={adminNome}
              onChange={(e) => setAdminNome(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="Administrador"
            />
          </div>

          {/* Admin email */}
          <div className="sm:col-span-2">
            <label htmlFor="nt-admin-email" className={ui.label}>
              E-mail do admin inicial
            </label>
            <input
              id="nt-admin-email"
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              className={`mt-1 ${ui.input}`}
              placeholder="admin@dominio.gov.br"
            />
          </div>
        </div>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <p className="text-xs text-fg/60" id="nt-obrigatorio-note">
          <span aria-hidden="true" className="text-danger">*</span> Campos obrigatórios.
          Ao menos Domínio próprio ou Subdomínio Lidera deve ser informado.
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={ui.btnGhost}
            disabled={carregando}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={carregando}
            className={ui.btn}
          >
            {carregando ? 'Criando…' : 'Criar prefeitura'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Linha auxiliar de info ────────────────────────────────────────────────────

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-3 py-2">
      <dt className="w-36 shrink-0 text-xs font-semibold text-fg/60">{label}</dt>
      <dd className="flex-1 text-sm">{children}</dd>
    </div>
  );
}

// ── Modal: Domínio do Tenant ──────────────────────────────────────────────────

function ModalDominio({
  tenantId,
  open,
  onClose,
  onVerificado,
}: {
  tenantId: string | null;
  open: boolean;
  onClose: () => void;
  onVerificado: () => void;
}) {
  const [carregando, setCarregando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [avisoVerificacao, setAvisoVerificacao] = useState<string | null>(null);
  const [dados, setDados] = useState<Tenant | null>(null);

  // Carrega dados completos do tenant ao abrir
  useEffect(() => {
    if (!open || !tenantId) return;
    setErro(null);
    setAvisoVerificacao(null);
    setDados(null);
    setCarregando(true);
    getTenant(tenantId)
      .then((t) => setDados(t))
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao carregar dados do domínio.'))
      .finally(() => setCarregando(false));
  }, [open, tenantId]);

  async function handleVerificar() {
    if (!tenantId) return;
    setVerificando(true);
    setErro(null);
    setAvisoVerificacao(null);
    try {
      const resp = await verificarDominio(tenantId);
      // Atualiza estado local com os dados retornados
      setDados((prev) =>
        prev
          ? {
              ...prev,
              cfStatus: resp.cfStatus,
              cfValidacao: resp.cfValidacao,
              cfAtualizadoEm: resp.cfAtualizadoEm,
            }
          : prev,
      );
      const statusLabel = resp.cfStatus === 'active' ? 'ativo' : resp.cfStatus ?? 'atualizado';
      setAvisoVerificacao(`Status verificado: ${statusLabel}.`);
      onVerificado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao verificar domínio.');
    } finally {
      setVerificando(false);
    }
  }

  const temDominioProprio =
    !!dados?.cfCustomHostnameId ||
    !!(dados?.dominio && !dados.dominio.endsWith('.lidera.app.br'));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Domínio próprio — Validação Cloudflare"
    >
      {carregando && (
        <p className="py-6 text-center text-sm text-fg/60" aria-live="polite">
          Carregando dados do domínio…
        </p>
      )}

      {!carregando && erro && !dados && (
        <div className="space-y-3">
          <Aviso tipo="erro">{erro}</Aviso>
          <div className="flex justify-end">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {!carregando && dados && !temDominioProprio && (
        <p className="text-sm text-fg/70 py-4">
          Este tenant não possui domínio próprio configurado no Cloudflare.
        </p>
      )}

      {!carregando && dados && temDominioProprio && (
        <div className="space-y-4">
          {/* Status atual */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-xs font-semibold text-fg/60">Status CF:</span>{' '}
              {dados.cfStatus ? (
                <BadgeDominioCF status={dados.cfStatus} />
              ) : (
                <span className="text-xs text-fg/50">Não disponível</span>
              )}
            </div>
            {dados.cfAtualizadoEm && (
              <div>
                <span className="text-xs text-fg/50">
                  Atualizado em:{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(dados.cfAtualizadoEm))}
                </span>
              </div>
            )}
          </div>

          {/* Registros de validação */}
          {dados.cfValidacao ? (
            <>
              <p className="text-sm text-fg/80">
                Para o domínio{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                  {dados.cfValidacao.hostname}
                </code>{' '}
                funcionar, a prefeitura deve publicar <strong>um</strong> dos
                registros abaixo no DNS/servidor dela:
              </p>
              <SecaoRegistrosValidacao
                validacao={dados.cfValidacao}
                idPrefix={`dominio-modal-${tenantId}`}
              />
            </>
          ) : (
            <p className="text-sm text-fg/50">
              Clique em &ldquo;Verificar status&rdquo; para obter os registros de validação.
            </p>
          )}

          {/* Feedback da verificação */}
          {avisoVerificacao && (
            <Aviso tipo="ok">{avisoVerificacao}</Aviso>
          )}
          {erro && (
            <Aviso tipo="erro">{erro}</Aviso>
          )}

          {/* Botão verificar */}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={ui.btnGhost}>
              Fechar
            </button>
            <button
              type="button"
              onClick={handleVerificar}
              disabled={verificando}
              className={ui.btn}
              aria-busy={verificando}
            >
              {verificando ? 'Verificando…' : 'Verificar status'}
            </button>
          </div>
        </div>
      )}

      {!carregando && dados && !temDominioProprio && (
        <div className="flex justify-end pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost}>
            Fechar
          </button>
        </div>
      )}
    </Modal>
  );
}

// ── Modal: Editar Prefeitura ──────────────────────────────────────────────────

function ModalEditar({
  tenant,
  open,
  onClose,
  onSalvo,
}: {
  tenant: Tenant | null;
  open: boolean;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState('');
  const [uf, setUf] = useState('');
  const [dominio, setDominio] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [plano, setPlano] = useState<TenantPlano>('padrao');
  const [ativo, setAtivo] = useState(true);
  const [iaTriagem, setIaTriagem] = useState(false);
  const [iaChat, setIaChat] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Preenche ao abrir
  useEffect(() => {
    if (open && tenant) {
      setNome(tenant.nome);
      setUf(tenant.uf);
      setDominio(tenant.dominio ?? '');
      setSubdominio(tenant.subdominio ?? '');
      setPlano(tenant.plano);
      setAtivo(tenant.ativo);
      setIaTriagem(tenant.iaTriagemHabilitada);
      setIaChat(tenant.iaChatHabilitada);
      setErro(null);
    }
  }, [open, tenant]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!tenant) return;
    setErro(null);
    setCarregando(true);
    try {
      await atualizarTenant(tenant.id, {
        nome,
        uf,
        dominio: dominio || undefined,
        subdominio: subdominio || undefined,
        plano,
        ativo,
        iaTriagemHabilitada: iaTriagem,
        iaChatHabilitada: iaChat,
      });
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar alterações.');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar Prefeitura">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="ed-nome" className={ui.label}>Nome</label>
            <input
              id="ed-nome"
              type="text"
              required
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={`mt-1 ${ui.input}`}
            />
          </div>
          <div>
            <label htmlFor="ed-uf" className={ui.label}>UF</label>
            <input
              id="ed-uf"
              type="text"
              maxLength={2}
              value={uf}
              onChange={(e) => setUf(e.target.value.toUpperCase())}
              className={`mt-1 ${ui.input} uppercase`}
            />
          </div>
          <div>
            <label htmlFor="ed-plano" className={ui.label}>Plano</label>
            <select
              id="ed-plano"
              value={plano}
              onChange={(e) => setPlano(e.target.value as TenantPlano)}
              className={`mt-1 ${ui.input}`}
            >
              {PLANOS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ed-dominio" className={ui.label}>Domínio próprio</label>
            <input
              id="ed-dominio"
              type="text"
              value={dominio}
              onChange={(e) => setDominio(e.target.value)}
              className={`mt-1 ${ui.input}`}
            />
          </div>
          <div>
            <label htmlFor="ed-subdominio" className={ui.label}>Subdomínio Lidera</label>
            <input
              id="ed-subdominio"
              type="text"
              value={subdominio}
              onChange={(e) => setSubdominio(e.target.value)}
              className={`mt-1 ${ui.input}`}
            />
          </div>
        </div>

        {/* Flags booleanas */}
        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-xs font-semibold text-fg/60">Configurações</legend>
          <div className="space-y-2">
            <CheckField
              id="ed-ativo"
              checked={ativo}
              onChange={setAtivo}
              label="Tenant ativo"
              description="Desativar bloqueia o acesso ao portal e ao admin do tenant."
            />
            <CheckField
              id="ed-ia-triagem"
              checked={iaTriagem}
              onChange={setIaTriagem}
              label="IA — Triagem habilitada"
              description="Triagem automática de manifestações via IA."
            />
            <CheckField
              id="ed-ia-chat"
              checked={iaChat}
              onChange={setIaChat}
              label="IA — Chatbot habilitado"
              description="Chatbot de atendimento ao cidadão via IA."
            />
          </div>
        </fieldset>

        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className={ui.btnGhost}
            disabled={carregando}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={carregando}
            className={ui.btn}
          >
            {carregando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Checkbox acessível ────────────────────────────────────────────────────────

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

// ── Paginação simples ─────────────────────────────────────────────────────────

function Paginacao({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="Paginação de prefeituras" className="mt-4 flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={ui.btnGhost}
        aria-label="Página anterior"
      >
        ‹
      </button>
      <span className="text-sm text-fg/70" aria-current="page">
        Página {page} de {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={ui.btnGhost}
        aria-label="Próxima página"
      >
        ›
      </button>
    </nav>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function PlataformaPage() {
  // Filtros
  const [q, setQ] = useState('');
  const [ativoFiltro, setAtivoFiltro] = useState<'' | 'true' | 'false'>('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  // Dados
  const [dados, setDados] = useState<Pagina<Tenant> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erroLista, setErroLista] = useState<string | null>(null);

  // Modais
  const [modalNovo, setModalNovo] = useState(false);
  const [tenantEditar, setTenantEditar] = useState<Tenant | null>(null);
  const [tenantDominioId, setTenantDominioId] = useState<string | null>(null);
  const [tenantConfiguracoes, setTenantConfiguracoes] = useState<Tenant | null>(null);

  // Ação de ativar/desativar inline
  const [alterandoId, setAlterandoId] = useState<string | null>(null);

  const carregar = useCallback(
    async (params: ListarTenantsParams) => {
      setCarregando(true);
      setErroLista(null);
      try {
        const res = await listarTenants(params);
        setDados(res);
      } catch (err) {
        setErroLista(err instanceof Error ? err.message : 'Erro ao carregar prefeituras.');
      } finally {
        setCarregando(false);
      }
    },
    [],
  );

  // Carrega ao montar e ao mudar filtros/página
  useEffect(() => {
    carregar({ q: q || undefined, ativo: ativoFiltro || undefined, page, pageSize: PAGE_SIZE });
  }, [carregar, q, ativoFiltro, page]);

  // Pesquisa: debounce manual — reset página ao buscar
  function handleQ(v: string) {
    setQ(v);
    setPage(1);
  }

  function handleAtivoFiltro(v: '' | 'true' | 'false') {
    setAtivoFiltro(v);
    setPage(1);
  }

  async function toggleAtivo(t: Tenant) {
    setAlterandoId(t.id);
    try {
      await atualizarTenant(t.id, { ativo: !t.ativo });
      // Atualiza localmente sem recarregar tudo
      setDados((prev) =>
        prev
          ? {
              ...prev,
              items: prev.items.map((item) =>
                item.id === t.id ? { ...item, ativo: !t.ativo } : item,
              ),
            }
          : prev,
      );
    } catch (err) {
      setErroLista(err instanceof Error ? err.message : 'Erro ao atualizar status.');
    } finally {
      setAlterandoId(null);
    }
  }

  function recarregar() {
    carregar({ q: q || undefined, ativo: ativoFiltro || undefined, page, pageSize: PAGE_SIZE });
  }

  const tenants = dados?.items ?? [];

  return (
    <>
      <AdminHeader
        title="Prefeituras (Tenants)"
        description="Gerencie as prefeituras cadastradas na plataforma."
      >
        <button
          type="button"
          onClick={() => setModalNovo(true)}
          className={ui.btn}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
          </svg>
          Nova prefeitura
        </button>
      </AdminHeader>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48">
          <label htmlFor="filtro-q" className="sr-only">Buscar prefeituras</label>
          <input
            id="filtro-q"
            type="search"
            value={q}
            onChange={(e) => handleQ(e.target.value)}
            placeholder="Buscar por nome, slug ou domínio…"
            className={ui.input}
            aria-label="Buscar prefeituras"
          />
        </div>
        <div>
          <label htmlFor="filtro-ativo" className="sr-only">Filtrar por status</label>
          <select
            id="filtro-ativo"
            value={ativoFiltro}
            onChange={(e) => handleAtivoFiltro(e.target.value as '' | 'true' | 'false')}
            className={`${ui.input} w-40`}
            aria-label="Filtrar por status"
          >
            <option value="">Todos os status</option>
            <option value="true">Apenas ativos</option>
            <option value="false">Apenas inativos</option>
          </select>
        </div>
      </div>

      {/* Erro da lista */}
      {erroLista && <div className="mb-4"><Aviso tipo="erro">{erroLista}</Aviso></div>}

      {/* Tabela */}
      <div className={`${ui.card} overflow-x-auto`} role="region" aria-label="Lista de prefeituras" aria-live="polite" aria-busy={carregando}>
        {carregando && (
          <p className="p-6 text-center text-sm text-fg/60" aria-live="polite">
            Carregando prefeituras…
          </p>
        )}

        {!carregando && tenants.length === 0 && (
          <p className="p-6 text-center text-sm text-fg/60">
            {q || ativoFiltro ? 'Nenhuma prefeitura encontrada com esses filtros.' : 'Nenhuma prefeitura cadastrada ainda.'}
          </p>
        )}

        {!carregando && tenants.length > 0 && (
          <table className="w-full border-collapse" aria-label="Prefeituras cadastradas">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>Nome / Slug</th>
                <th scope="col" className={`${ui.th} hidden sm:table-cell`}>Domínio / Subdomínio</th>
                <th scope="col" className={`${ui.th} hidden md:table-cell`}>Plano</th>
                <th scope="col" className={`${ui.th} hidden lg:table-cell`}>Cadastro</th>
                <th scope="col" className={ui.th}>Status</th>
                <th scope="col" className={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => {
                const dom = dominioPrincipal(t);
                return (
                  <tr key={t.id} className="hover:bg-muted/40">
                    {/* Nome / Slug */}
                    <td className={ui.td}>
                      <span className="font-semibold">{t.nome}</span>
                      <br />
                      <span className="text-xs text-fg/50">{t.slug} · {t.uf}</span>
                    </td>

                    {/* Domínio */}
                    <td className={`${ui.td} hidden sm:table-cell`}>
                      <span className="block text-xs">{dom}</span>
                      {t.cfCustomHostnameId && t.cfStatus && (
                        <span className="mt-1 block">
                          <BadgeDominioCF status={t.cfStatus} />
                        </span>
                      )}
                      <span className="mt-1 flex flex-wrap gap-1">
                        <a
                          href={`https://${dom}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          aria-label={`Abrir portal de ${t.nome}`}
                        >
                          Portal
                        </a>
                        <span aria-hidden="true" className="text-fg/30">·</span>
                        <a
                          href={`https://${dom}/admin`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          aria-label={`Abrir admin de ${t.nome}`}
                        >
                          Admin
                        </a>
                      </span>
                    </td>

                    {/* Plano */}
                    <td className={`${ui.td} hidden md:table-cell capitalize`}>
                      {t.plano}
                    </td>

                    {/* Data */}
                    <td className={`${ui.td} hidden lg:table-cell`}>
                      {formatarData(t.criadoEm)}
                    </td>

                    {/* Status */}
                    <td className={ui.td}>
                      <BadgeStatus ativo={t.ativo} />
                    </td>

                    {/* Ações */}
                    <td className={ui.td}>
                      <span className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => setTenantEditar(t)}
                          className={`${ui.btnGhost} py-1 text-xs`}
                          aria-label={`Editar ${t.nome}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setTenantConfiguracoes(t)}
                          className={`${ui.btnGhost} py-1 text-xs`}
                          aria-label={`Configurações de ${t.nome}`}
                        >
                          Configurações
                        </button>
                        {t.cfCustomHostnameId && (
                          <button
                            type="button"
                            onClick={() => setTenantDominioId(t.id)}
                            className={`${ui.btnGhost} py-1 text-xs`}
                            aria-label={`Verificar domínio de ${t.nome}`}
                          >
                            Verificar status
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={alterandoId === t.id}
                          onClick={() => toggleAtivo(t)}
                          className={`${t.ativo ? ui.btnDanger : ui.btnGhost} py-1 text-xs`}
                          aria-label={t.ativo ? `Desativar ${t.nome}` : `Ativar ${t.nome}`}
                        >
                          {alterandoId === t.id
                            ? '…'
                            : t.ativo
                              ? 'Desativar'
                              : 'Ativar'}
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Paginação */}
      {dados && (
        <Paginacao
          page={dados.page}
          total={dados.total}
          pageSize={dados.pageSize}
          onChange={setPage}
        />
      )}

      {/* Contagem */}
      {dados && (
        <p className="mt-2 text-xs text-fg/50 text-center" aria-live="polite">
          {dados.total} {dados.total === 1 ? 'prefeitura' : 'prefeituras'} encontrada{dados.total === 1 ? '' : 's'}
        </p>
      )}

      {/* Modal Nova Prefeitura */}
      <ModalNovaPrefeitura
        open={modalNovo}
        onClose={() => setModalNovo(false)}
        onCriado={recarregar}
      />

      {/* Modal Editar */}
      <ModalEditar
        tenant={tenantEditar}
        open={!!tenantEditar}
        onClose={() => setTenantEditar(null)}
        onSalvo={recarregar}
      />

      {/* Modal Domínio / Validação CF */}
      <ModalDominio
        tenantId={tenantDominioId}
        open={!!tenantDominioId}
        onClose={() => setTenantDominioId(null)}
        onVerificado={recarregar}
      />

      {/* Modal Configurações da Entidade */}
      <ModalConfiguracoes
        tenant={tenantConfiguracoes}
        onClose={() => setTenantConfiguracoes(null)}
      />
    </>
  );
}
