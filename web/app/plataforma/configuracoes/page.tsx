'use client';

/**
 * Configurações GLOBAIS da plataforma (super_admin / Console Lidera).
 * Abas: Desenvolvido por · SMTP global · Backups. Segredos cifrados no backend.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getPlatformConfig,
  salvarPlatformConfig,
  getBackupStatus,
  executarBackup,
  backupDownloadUrl,
  excluirBackup,
  backupEntidade,
  uploadLogoPlataforma,
  listarTenants,
  getLgpdTemplate,
  salvarLgpdTemplate,
  type PlatformConfig,
  type PlatformConfigDto,
  type BackupStatus,
  type Tenant,
  type LgpdTemplate,
} from '../../../lib/platform';

type Aba = 'dev' | 'smtp' | 'ia' | 'backup' | 'lgpd';

const inp = 'mt-1 w-full rounded border border-border bg-bg px-3 py-2 text-sm';
const lbl = 'block text-sm font-medium';

export default function ConfiguracoesGlobaisPage() {
  const [cfg, setCfg] = useState<PlatformConfig | null>(null);
  const [form, setForm] = useState<PlatformConfigDto>({});
  const [smtpPass, setSmtpPass] = useState('');
  const [removerSenha, setRemoverSenha] = useState(false);
  const [iaSecrets, setIaSecrets] = useState({ anthropicKey: '', voyageKey: '', openaiKey: '' });
  const [iaRemover, setIaRemover] = useState({ anthropic: false, voyage: false, openai: false });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [logoV, setLogoV] = useState(0); // cache-bust do preview
  const [backup, setBackup] = useState({
    dbAtivo: false, storageAtivo: false, retencaoDias: 14, frequencia: 'diario', hora: 3,
    ftpAtivo: false, ftpHost: '', ftpPort: 21, ftpUser: '', ftpDir: '', ftpSecure: false,
  });
  const [ftpPass, setFtpPass] = useState('');
  const [removerFtpPass, setRemoverFtpPass] = useState(false);
  const [bkpStatus, setBkpStatus] = useState<BackupStatus | null>(null);
  const [rodandoBackup, setRodandoBackup] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [entSel, setEntSel] = useState('');
  const [gerandoEnt, setGerandoEnt] = useState(false);
  const [lgpdTpl, setLgpdTpl] = useState<LgpdTemplate | null>(null);
  const [lgpdTexto, setLgpdTexto] = useState('');
  const [salvandoTpl, setSalvandoTpl] = useState(false);
  const [aba, setAba] = useState<Aba>('dev');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const c = await getPlatformConfig();
      setCfg(c);
      setForm({
        devAtivo: c.dev.ativo, devNome: c.dev.nome ?? '', devRazaoSocial: c.dev.razaoSocial ?? '',
        devCnpj: c.dev.cnpj ?? '', devEndereco: c.dev.endereco ?? '', devEmail: c.dev.email ?? '',
        devSuporteUrl: c.dev.suporteUrl ?? '', devWhatsapp: c.dev.whatsapp ?? '',
        devSiteUrl: c.dev.siteUrl ?? '', devLogoUrl: c.dev.logoUrl ?? '',
        smtpAtivo: c.smtp.ativo, smtpHost: c.smtp.host ?? '', smtpPort: c.smtp.port ?? undefined,
        smtpSecure: c.smtp.secure, smtpUser: c.smtp.user ?? '', smtpFrom: c.smtp.from ?? '',
        iaModel: c.ia.iaModel ?? '', embeddingsProvider: c.ia.embeddingsProvider ?? '',
        embeddingsModel: c.ia.embeddingsModel ?? '',
      });
      setIaSecrets({ anthropicKey: '', voyageKey: '', openaiKey: '' });
      setIaRemover({ anthropic: false, voyage: false, openai: false });
      const b = (c.backup ?? {}) as Record<string, unknown>;
      setBackup({
        dbAtivo: !!b.dbAtivo, storageAtivo: !!b.storageAtivo, retencaoDias: Number(b.retencaoDias ?? 14),
        frequencia: (b.frequencia as string) ?? 'diario', hora: Number(b.hora ?? 3),
        ftpAtivo: !!b.ftpAtivo, ftpHost: (b.ftpHost as string) ?? '', ftpPort: Number(b.ftpPort ?? 21),
        ftpUser: (b.ftpUser as string) ?? '', ftpDir: (b.ftpDir as string) ?? '', ftpSecure: !!b.ftpSecure,
      });
      setSmtpPass(''); setRemoverSenha(false); setFtpPass(''); setRemoverFtpPass(false);
      getBackupStatus().then(setBkpStatus).catch(() => setBkpStatus(null));
      listarTenants({ pageSize: 100 }).then((p) => setTenants(p.items)).catch(() => undefined);
      getLgpdTemplate().then((t) => { setLgpdTpl(t); setLgpdTexto(t.template); }).catch(() => undefined);
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao carregar as configurações.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  function set<K extends keyof PlatformConfigDto>(k: K, v: PlatformConfigDto[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function salvar() {
    setSalvando(true);
    setFeedback(null);
    try {
      const backupPayload: Record<string, unknown> = { ...backup };
      if (removerFtpPass) backupPayload.ftpPass = '';
      else if (ftpPass) backupPayload.ftpPass = ftpPass;
      const dto: PlatformConfigDto = { ...form, backup: backupPayload };
      if (removerSenha) dto.smtpPass = '';
      else if (smtpPass) dto.smtpPass = smtpPass;
      // chaves de IA: '' remove; valor define; ausente mantém
      if (iaRemover.anthropic) dto.anthropicKey = ''; else if (iaSecrets.anthropicKey) dto.anthropicKey = iaSecrets.anthropicKey;
      if (iaRemover.voyage) dto.voyageKey = ''; else if (iaSecrets.voyageKey) dto.voyageKey = iaSecrets.voyageKey;
      if (iaRemover.openai) dto.openaiKey = ''; else if (iaSecrets.openaiKey) dto.openaiKey = iaSecrets.openaiKey;
      await salvarPlatformConfig(dto);
      setFeedback({ tipo: 'ok', msg: 'Configurações salvas.' });
      carregar();
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao salvar.' });
    } finally {
      setSalvando(false);
    }
  }

  async function rodarBackup() {
    setRodandoBackup(true);
    setFeedback(null);
    try {
      const r = await executarBackup();
      if (r.enfileirado) {
        setFeedback({ tipo: 'ok', msg: 'Backup iniciado em segundo plano. A lista atualiza em instantes.' });
        setTimeout(() => getBackupStatus().then(setBkpStatus).catch(() => undefined), 8000);
      } else {
        setFeedback({ tipo: 'erro', msg: r.aviso ?? 'Backup indisponível.' });
      }
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao iniciar o backup.' });
    } finally {
      setTimeout(() => setRodandoBackup(false), 8000);
    }
  }

  async function enviarLogo() {
    if (!logoFile) return;
    setEnviandoLogo(true); setFeedback(null);
    try {
      await uploadLogoPlataforma(logoFile);
      setLogoFile(null); setLogoV(Date.now());
      setFeedback({ tipo: 'ok', msg: 'Logomarca enviada — aparece no rodapé dos portais.' });
      carregar();
    } catch (e) {
      setFeedback({ tipo: 'erro', msg: e instanceof Error ? e.message : 'Falha ao enviar a logomarca.' });
    } finally {
      setEnviandoLogo(false);
    }
  }

  async function removerBackup(key: string) {
    if (!confirm('Excluir este backup definitivamente?')) return;
    try {
      await excluirBackup(key);
      getBackupStatus().then(setBkpStatus).catch(() => undefined);
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao excluir o backup.' });
    }
  }

  async function gerarBackupEntidade() {
    if (!entSel) return;
    setGerandoEnt(true); setFeedback(null);
    try {
      const r = await backupEntidade(entSel);
      if (r.enfileirado) {
        setFeedback({ tipo: 'ok', msg: 'Backup da entidade iniciado. A lista atualiza em instantes.' });
        setTimeout(() => getBackupStatus().then(setBkpStatus).catch(() => undefined), 9000);
      } else {
        setFeedback({ tipo: 'erro', msg: r.aviso ?? 'Indisponível.' });
      }
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao gerar o backup da entidade.' });
    } finally {
      setTimeout(() => setGerandoEnt(false), 9000);
    }
  }

  async function salvarTemplateLgpd(restaurarPadrao = false) {
    setSalvandoTpl(true); setFeedback(null);
    try {
      const t = await salvarLgpdTemplate(restaurarPadrao ? null : lgpdTexto);
      setLgpdTpl(t); setLgpdTexto(t.template);
      setFeedback({ tipo: 'ok', msg: restaurarPadrao ? 'Template restaurado ao padrão.' : 'Template LGPD salvo.' });
    } catch {
      setFeedback({ tipo: 'erro', msg: 'Falha ao salvar o template.' });
    } finally {
      setSalvandoTpl(false);
    }
  }

  if (carregando) return <p className="py-12 text-center text-sm text-fg/60" role="status">Carregando…</p>;

  const abas: { id: Aba; label: string }[] = [
    { id: 'dev', label: 'Desenvolvido por' },
    { id: 'smtp', label: 'SMTP global' },
    { id: 'ia', label: 'IA (global)' },
    { id: 'backup', label: 'Backups' },
    { id: 'lgpd', label: 'LGPD' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-heading text-xl font-bold">Configurações da Plataforma</h1>
        <p className="text-sm text-fg/60">Identidade da empresa, e-mail global e backups. Vale para toda a plataforma.</p>
      </div>

      {/* Abas */}
      <div role="tablist" aria-label="Seções" className="flex flex-wrap gap-1 border-b border-border">
        {abas.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-t px-3 py-2 text-sm font-medium ${aba === a.id ? 'border-b-2 border-primary text-primary' : 'text-fg/60 hover:text-fg'}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div aria-live="polite">
        {feedback && (
          <p role={feedback.tipo === 'erro' ? 'alert' : 'status'}
            className={`rounded border p-2 text-sm ${feedback.tipo === 'ok' ? 'border-success text-success' : 'border-danger text-danger'}`}>
            {feedback.msg}
          </p>
        )}
      </div>

      {/* Aba: Desenvolvido por */}
      {aba === 'dev' && (
        <section className="space-y-4 rounded border border-border p-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!form.devAtivo} onChange={(e) => set('devAtivo', e.target.checked)} className="h-4 w-4 accent-primary" />
            Exibir &quot;Desenvolvido por&quot; no rodapé dos portais
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Nome <input className={inp} value={form.devNome ?? ''} onChange={(e) => set('devNome', e.target.value)} placeholder="Lidera Tecnologia" /></label></div>
            <div><label className={lbl}>Razão social <input className={inp} value={form.devRazaoSocial ?? ''} onChange={(e) => set('devRazaoSocial', e.target.value)} /></label></div>
            <div><label className={lbl}>CNPJ <input className={inp} value={form.devCnpj ?? ''} onChange={(e) => set('devCnpj', e.target.value)} /></label></div>
            <div><label className={lbl}>Site (link do crédito) <input className={inp} value={form.devSiteUrl ?? ''} onChange={(e) => set('devSiteUrl', e.target.value)} placeholder="https://lidera.app.br" /></label></div>
            <div className="sm:col-span-2"><label className={lbl}>Endereço <input className={inp} value={form.devEndereco ?? ''} onChange={(e) => set('devEndereco', e.target.value)} /></label></div>
            <div><label className={lbl}>E-mail <input className={inp} type="email" value={form.devEmail ?? ''} onChange={(e) => set('devEmail', e.target.value)} /></label></div>
            <div><label className={lbl}>WhatsApp <input className={inp} value={form.devWhatsapp ?? ''} onChange={(e) => set('devWhatsapp', e.target.value)} /></label></div>
            <div><label className={lbl}>Canal de suporte (URL) <input className={inp} value={form.devSuporteUrl ?? ''} onChange={(e) => set('devSuporteUrl', e.target.value)} /></label></div>
            <div><label className={lbl}>Logo (URL externa, opcional) <input className={inp} value={form.devLogoUrl ?? ''} onChange={(e) => set('devLogoUrl', e.target.value)} /></label></div>
          </div>

          {/* Upload da logomarca */}
          <fieldset className="space-y-2 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Logomarca (aparece no rodapé dos portais, canto inferior direito)</legend>
            {cfg?.dev.logoUrl && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-fg/60">Atual:</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`${cfg.dev.logoUrl}${logoV ? `?v=${logoV}` : ''}`} alt="Logomarca atual" className="h-8 w-auto max-w-[160px] rounded border border-border object-contain bg-bg p-0.5" />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                className="text-sm file:mr-3 file:rounded file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-fg" />
              <button type="button" onClick={enviarLogo} disabled={!logoFile || enviandoLogo}
                className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg disabled:opacity-50">
                {enviandoLogo ? 'Enviando…' : 'Enviar logomarca'}
              </button>
            </div>
            <p className="text-xs text-fg/50">PNG, JPG, WEBP ou SVG, até 2 MB. Recomendado fundo transparente.</p>
          </fieldset>
        </section>
      )}

      {/* Aba: SMTP global */}
      {aba === 'smtp' && (
        <section className="space-y-4 rounded border border-border p-4">
          <p className="text-sm text-fg/70">Servidor de e-mail usado como <strong>fallback</strong> quando a entidade não tem SMTP próprio.</p>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={!!form.smtpAtivo} onChange={(e) => set('smtpAtivo', e.target.checked)} className="h-4 w-4 accent-primary" />
            SMTP global ativo
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={lbl}>Host <input className={inp} value={form.smtpHost ?? ''} onChange={(e) => set('smtpHost', e.target.value)} placeholder="smtp.exemplo.com" /></label></div>
            <div><label className={lbl}>Porta <input className={inp} type="number" value={form.smtpPort ?? ''} onChange={(e) => set('smtpPort', e.target.value ? Number(e.target.value) : undefined)} placeholder="587" /></label></div>
            <div><label className={lbl}>Usuário <input className={inp} value={form.smtpUser ?? ''} onChange={(e) => set('smtpUser', e.target.value)} autoComplete="off" /></label></div>
            <div><label className={lbl}>Remetente (From) <input className={inp} value={form.smtpFrom ?? ''} onChange={(e) => set('smtpFrom', e.target.value)} placeholder="nao-responda@lidera.app.br" /></label></div>
            <div>
              <label className={lbl}>
                Senha {cfg?.smtp.senhaDefinida && <span className="text-xs font-normal text-success">(definida)</span>}
                <input className={inp} type="password" value={smtpPass} onChange={(e) => setSmtpPass(e.target.value)}
                  disabled={removerSenha} autoComplete="new-password"
                  placeholder={cfg?.smtp.senhaDefinida ? '•••• (deixe em branco para manter)' : ''} />
              </label>
              {cfg?.smtp.senhaDefinida && (
                <label className="mt-1 flex items-center gap-1.5 text-xs text-fg/70">
                  <input type="checkbox" checked={removerSenha} onChange={(e) => setRemoverSenha(e.target.checked)} className="h-3.5 w-3.5 accent-danger" />
                  Remover senha
                </label>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!form.smtpSecure} onChange={(e) => set('smtpSecure', e.target.checked)} className="h-4 w-4 accent-primary" />
              Conexão segura (SSL/TLS na porta 465)
            </label>
          </div>
        </section>
      )}

      {/* Aba: IA (global) */}
      {aba === 'ia' && (
        <section className="space-y-4 rounded border border-border p-4">
          <p className="text-sm text-fg/70">
            Chaves e modelos de IA <strong>globais</strong> da plataforma. Cada entidade pode ter os seus
            próprios (têm prioridade); estes valem quando a entidade não definir. Editar aqui evita
            mexer no <code className="rounded bg-muted px-1">.env</code> e recriar o container.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={lbl}>Modelo do chat (Anthropic)
              <input className={inp} value={form.iaModel ?? ''} onChange={(e) => set('iaModel', e.target.value)} placeholder="claude-sonnet-4-6" />
            </label>
            <label className={lbl}>Provedor de embeddings
              <select className={inp} value={form.embeddingsProvider ?? ''} onChange={(e) => set('embeddingsProvider', e.target.value)}>
                <option value="">Padrão (env)</option>
                <option value="voyage">Voyage</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label className={lbl}>Modelo de embeddings
              <input className={inp} value={form.embeddingsModel ?? ''} onChange={(e) => set('embeddingsModel', e.target.value)} placeholder="voyage-3" />
            </label>
          </div>

          <fieldset className="space-y-3 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Chaves (cifradas; nunca exibidas)</legend>
            {([
              { campo: 'anthropic', label: 'Anthropic (chat/IA)', def: cfg?.ia.anthropicDefinida, val: iaSecrets.anthropicKey, set: (v: string) => setIaSecrets((s) => ({ ...s, anthropicKey: v })) },
              { campo: 'voyage', label: 'Voyage (embeddings)', def: cfg?.ia.voyageDefinida, val: iaSecrets.voyageKey, set: (v: string) => setIaSecrets((s) => ({ ...s, voyageKey: v })) },
              { campo: 'openai', label: 'OpenAI (embeddings)', def: cfg?.ia.openaiDefinida, val: iaSecrets.openaiKey, set: (v: string) => setIaSecrets((s) => ({ ...s, openaiKey: v })) },
            ] as const).map((k) => (
              <div key={k.campo}>
                <label className={lbl}>
                  {k.label} {k.def && <span className="text-xs font-normal text-success">(definida)</span>}
                  <input className={inp} type="password" autoComplete="new-password"
                    value={k.val} disabled={(iaRemover as Record<string, boolean>)[k.campo]}
                    onChange={(e) => k.set(e.target.value)}
                    placeholder={k.def ? '•••• (deixe em branco para manter)' : ''} />
                </label>
                {k.def && (
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-fg/70">
                    <input type="checkbox" checked={(iaRemover as Record<string, boolean>)[k.campo]}
                      onChange={(e) => setIaRemover((r) => ({ ...r, [k.campo]: e.target.checked }))}
                      className="h-3.5 w-3.5 accent-danger" />
                    Remover chave
                  </label>
                )}
              </div>
            ))}
          </fieldset>
          <p className="text-xs text-fg/50">Precedência: chave da entidade → global do painel → variável de ambiente.</p>
        </section>
      )}

      {/* Aba: Backups */}
      {aba === 'backup' && (
        <section className="space-y-4 rounded border border-border p-4">
          <p className="text-sm text-fg/70">
            Backup automático do banco (PostgreSQL) para o bucket{' '}
            <code className="rounded bg-muted px-1">{bkpStatus?.bucket ?? 'portal-backups'}</code>.
            {bkpStatus && !bkpStatus.disponivel && (
              <span className="text-danger"> — indisponível: faltam credenciais no ambiente do servidor.</span>
            )}
          </p>

          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={backup.dbAtivo} onChange={(e) => setBackup((b) => ({ ...b, dbAtivo: e.target.checked }))} className="h-4 w-4 accent-primary" />
            Backup do banco de dados (PostgreSQL)
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={backup.storageAtivo} onChange={(e) => setBackup((b) => ({ ...b, storageAtivo: e.target.checked }))} className="h-4 w-4 accent-primary" />
            Backup do storage (arquivos) <span className="text-xs font-normal text-fg/50">(offsite na próxima etapa)</span>
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className={lbl}>Frequência
              <select className={inp} value={backup.frequencia} onChange={(e) => setBackup((b) => ({ ...b, frequencia: e.target.value }))}>
                <option value="diario">Diário</option>
                <option value="12h">A cada 12 horas</option>
                <option value="6h">A cada 6 horas</option>
                <option value="semanal">Semanal</option>
              </select>
            </label>
            <label className={lbl}>Hora (0–23)
              <input className={inp} type="number" min={0} max={23} value={backup.hora}
                onChange={(e) => setBackup((b) => ({ ...b, hora: Math.min(23, Math.max(0, Number(e.target.value) || 0)) }))} />
            </label>
            <label className={lbl}>Retenção (dias)
              <input className={inp} type="number" min={1} max={3650} value={backup.retencaoDias}
                onChange={(e) => setBackup((b) => ({ ...b, retencaoDias: Number(e.target.value) || 14 }))} />
            </label>
          </div>

          {/* Destino FTP (offsite) */}
          <fieldset className="space-y-3 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Cópia por FTP (offsite — recomendado para proteção contra perda do servidor)</legend>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={backup.ftpAtivo} onChange={(e) => setBackup((b) => ({ ...b, ftpAtivo: e.target.checked }))} className="h-4 w-4 accent-primary" />
              Enviar uma cópia de cada backup por FTP
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={lbl}>Host <input className={inp} value={backup.ftpHost} onChange={(e) => setBackup((b) => ({ ...b, ftpHost: e.target.value }))} placeholder="ftp.exemplo.com" /></label>
              <label className={lbl}>Porta <input className={inp} type="number" value={backup.ftpPort} onChange={(e) => setBackup((b) => ({ ...b, ftpPort: Number(e.target.value) || 21 }))} /></label>
              <label className={lbl}>Usuário <input className={inp} value={backup.ftpUser} onChange={(e) => setBackup((b) => ({ ...b, ftpUser: e.target.value }))} autoComplete="off" /></label>
              <label className={lbl}>Pasta de destino <input className={inp} value={backup.ftpDir} onChange={(e) => setBackup((b) => ({ ...b, ftpDir: e.target.value }))} placeholder="/backups/portal" /></label>
              <div>
                <label className={lbl}>Senha {bkpStatus?.config.ftpSenhaDefinida && <span className="text-xs font-normal text-success">(definida)</span>}
                  <input className={inp} type="password" autoComplete="new-password" value={ftpPass} disabled={removerFtpPass}
                    onChange={(e) => setFtpPass(e.target.value)} placeholder={bkpStatus?.config.ftpSenhaDefinida ? '•••• (deixe em branco para manter)' : ''} />
                </label>
                {bkpStatus?.config.ftpSenhaDefinida && (
                  <label className="mt-1 flex items-center gap-1.5 text-xs text-fg/70">
                    <input type="checkbox" checked={removerFtpPass} onChange={(e) => setRemoverFtpPass(e.target.checked)} className="h-3.5 w-3.5 accent-danger" /> Remover senha
                  </label>
                )}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={backup.ftpSecure} onChange={(e) => setBackup((b) => ({ ...b, ftpSecure: e.target.checked }))} className="h-4 w-4 accent-primary" />
                FTPS (TLS)
              </label>
            </div>
          </fieldset>

          {/* Status + ação */}
          <div className="rounded border border-border bg-bg p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Última execução:{' '}
                {bkpStatus?.config.ultimoEm ? (
                  <strong className={bkpStatus.config.ultimoStatus === 'ok' ? 'text-success' : 'text-danger'}>
                    {new Date(bkpStatus.config.ultimoEm).toLocaleString('pt-BR')} ({bkpStatus.config.ultimoStatus}
                    {bkpStatus.config.ultimoTamanho ? `, ${(bkpStatus.config.ultimoTamanho / 1048576).toFixed(1)} MB` : ''})
                  </strong>
                ) : <span className="text-fg/50">nunca</span>}
              </span>
              <button type="button" onClick={rodarBackup} disabled={rodandoBackup || !bkpStatus?.disponivel}
                className="rounded border border-primary px-3 py-1 text-sm font-semibold text-primary disabled:opacity-50">
                {rodandoBackup ? 'Executando…' : 'Fazer backup agora'}
              </button>
            </div>
            {bkpStatus?.config.ultimoErro && (
              <p className="mt-1 text-xs text-danger">Erro: {bkpStatus.config.ultimoErro}</p>
            )}
          </div>

          {/* Lista de backups */}
          {bkpStatus && bkpStatus.backups.length > 0 && (
            <div>
              <h3 className="mb-1 text-sm font-semibold">Backups no bucket ({bkpStatus.backups.length})</h3>
              <ul className="space-y-0.5 text-xs">
                {bkpStatus.backups.slice(0, 20).map((b) => (
                  <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1">
                    <span className="truncate font-mono">{b.key}</span>
                    <span className="flex shrink-0 items-center gap-3 text-fg/60">
                      <span>{(b.tamanho / 1048576).toFixed(1)} MB · {new Date(b.em).toLocaleString('pt-BR')}</span>
                      <a href={backupDownloadUrl(b.key)} className="font-semibold text-primary underline">Baixar</a>
                      <button type="button" onClick={() => removerBackup(b.key)} className="font-semibold text-danger underline">Excluir</button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Backup por entidade (dump SQL restaurável da entidade) */}
          <fieldset className="space-y-2 rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Backup por entidade (dump restaurável só dos dados da entidade)</legend>
            <div className="flex flex-wrap items-center gap-2">
              <select className={`${inp} max-w-xs`} value={entSel} onChange={(e) => setEntSel(e.target.value)} aria-label="Entidade">
                <option value="">Selecione a entidade…</option>
                {tenants.map((t) => <option key={t.id} value={t.id}>{t.nome} ({t.slug})</option>)}
              </select>
              <button type="button" onClick={gerarBackupEntidade} disabled={!entSel || gerandoEnt || !bkpStatus?.disponivel}
                className="rounded bg-primary px-3 py-1.5 text-sm font-semibold text-primary-fg disabled:opacity-50">
                {gerandoEnt ? 'Gerando…' : 'Gerar backup da entidade'}
              </button>
            </div>
            {bkpStatus && bkpStatus.backupsEntidades.length > 0 && (
              <ul className="space-y-0.5 text-xs">
                {bkpStatus.backupsEntidades.slice(0, 20).map((b) => (
                  <li key={b.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 py-1">
                    <span className="truncate font-mono">{b.key}</span>
                    <span className="flex shrink-0 items-center gap-3 text-fg/60">
                      <span>{(b.tamanho / 1048576).toFixed(1)} MB · {new Date(b.em).toLocaleString('pt-BR')}</span>
                      <a href={backupDownloadUrl(b.key)} className="font-semibold text-primary underline">Baixar</a>
                      <button type="button" onClick={() => removerBackup(b.key)} className="font-semibold text-danger underline">Excluir</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        </section>
      )}

      {/* Aba: LGPD (template global da documentação) */}
      {aba === 'lgpd' && (
        <section className="space-y-4 rounded border border-border p-4">
          <p className="text-sm text-fg/70">
            Template <strong>global</strong> da documentação LGPD das entidades (Política de Privacidade,
            PSI, RoPA e Relatório de Medidas). Cada entidade gera a sua versão no Gerenciador
            (aba LGPD da entidade → <strong>Gerar LGPD</strong>), substituindo os campos abaixo pelos
            dados dela. O responsável da entidade então baixa em PDF/TXT/HTML e publica em{' '}
            <code className="rounded bg-muted px-1">/privacidade/sobre-lgpd</code>.
          </p>

          <div className="rounded border border-border bg-muted/20 p-3">
            <p className="mb-1 text-xs font-semibold text-fg/70">Campos disponíveis (use {'{{CAMPO}}'} no texto):</p>
            <div className="flex flex-wrap gap-1.5">
              {(lgpdTpl?.placeholders ?? []).map((p) => (
                <span key={p.chave} className="rounded bg-bg px-1.5 py-0.5 font-mono text-[11px] text-fg/80 border border-border" title={`${p.rotulo} (${p.origem})`}>
                  {`{{${p.chave}}}`}
                </span>
              ))}
            </div>
          </div>

          <div>
            <label className={lbl} htmlFor="lgpd-template">
              Conteúdo do template{' '}
              <span className="text-xs font-normal text-fg/50">
                ({lgpdTpl?.personalizado ? 'personalizado' : 'padrão de fábrica'})
              </span>
            </label>
            <textarea
              id="lgpd-template"
              value={lgpdTexto}
              onChange={(e) => setLgpdTexto(e.target.value)}
              rows={20}
              spellCheck={false}
              className="mt-1 w-full rounded border border-border bg-bg px-3 py-2 font-mono text-xs leading-relaxed"
            />
            <p className="mt-1 text-xs text-fg/50">
              Marcação: <code># Título</code> (novo documento), <code>## Seção</code>,
              <code>### Subseção</code>, <code>- item</code> de lista. Linha em branco separa parágrafos.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => salvarTemplateLgpd(true)} disabled={salvandoTpl}
              className="rounded border border-border px-3 py-2 text-sm font-medium text-fg/70 disabled:opacity-60">
              Restaurar padrão
            </button>
            <button type="button" onClick={() => salvarTemplateLgpd(false)} disabled={salvandoTpl}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
              {salvandoTpl ? 'Salvando…' : 'Salvar template'}
            </button>
          </div>
        </section>
      )}

      {aba !== 'lgpd' && (
        <div className="flex justify-end">
          <button onClick={salvar} disabled={salvando} className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </div>
      )}
    </div>
  );
}
