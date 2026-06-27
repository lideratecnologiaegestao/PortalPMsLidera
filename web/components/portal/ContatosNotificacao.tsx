'use client';

import { useEffect, useRef, useState } from 'react';
import { apiBase } from '../../lib/auth-shared';

interface Contatos {
  whatsapp: string;
  whatsappVerificado: boolean;
  email: string;
  emailVerificado: boolean;
  notifWhatsapp: boolean;
  notifEmail: boolean;
  telegram: string | null;
  telegramVerificado: boolean;
  notifTelegram: boolean;
  canais: { whatsapp: boolean; email: boolean; telegram: boolean };
}

interface CodigoTelegram {
  codigo: string;
  expiraEm: string;
  instrucao: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase}/api/me/contatos${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    let msg = `Erro ${res.status}`;
    try {
      const j = await res.json();
      if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : String(j.message);
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function Verificar({ canal, onVerificado }: { canal: 'whatsapp' | 'email'; onVerificado: (c: Contatos) => void }) {
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [info, setInfo] = useState('');
  const label = canal === 'whatsapp' ? 'WhatsApp' : 'e-mail';

  async function verificar() {
    setErro(''); setInfo('');
    try {
      const c = await api<Contatos>('/verificar', { method: 'POST', body: JSON.stringify({ canal, codigo: codigo.trim() }) });
      onVerificado(c);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
    }
  }
  async function reenviar() {
    setErro(''); setInfo('');
    try {
      await api('/reenviar', { method: 'POST', body: JSON.stringify({ canal }) });
      setInfo('Novo código enviado.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
    }
  }

  return (
    <div className="mt-2 rounded border border-warning/40 bg-warning/10 p-3">
      <p className="text-sm">Enviamos um código de verificação para seu {label}. Informe-o abaixo:</p>
      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      {info && <p className="text-sm text-success">{info}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" maxLength={6}
          placeholder="000000" className="w-28 rounded border border-border bg-bg px-2 py-1 text-sm font-mono" />
        <button type="button" onClick={verificar} className="rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-fg">Verificar</button>
        <button type="button" onClick={reenviar} className="text-sm text-primary underline">Reenviar código</button>
      </div>
    </div>
  );
}

/**
 * Painel de vínculo Telegram.
 * - Não vinculado: gera código e exibe instrução para enviar ao bot.
 * - Vinculado: exibe identificador mascarado, toggle de notificação e botão desvincular.
 */
function SecaoTelegram({
  c,
  onAtualizar,
  onSalvarNotif,
}: {
  c: Contatos;
  onAtualizar: (novo: Contatos) => void;
  onSalvarNotif: (patch: Partial<Contatos>) => Promise<void>;
}) {
  const [codigoDados, setCodigoDados] = useState<CodigoTelegram | null>(null);
  const [gerando, setGerando] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [desvinculando, setDesvinculando] = useState(false);
  const [confirmDesvincular, setConfirmDesvincular] = useState(false);
  const [erro, setErro] = useState('');
  const [copiado, setCopiado] = useState(false);
  const copiouTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codigoRef = useRef<HTMLElement>(null);

  async function gerarCodigo() {
    setGerando(true); setErro('');
    try {
      const dados = await api<CodigoTelegram>('/telegram/codigo', { method: 'POST' });
      setCodigoDados(dados);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar código.');
    } finally {
      setGerando(false);
    }
  }

  async function verificarVinculo() {
    setVerificando(true); setErro('');
    try {
      const novo = await api<Contatos>('');
      onAtualizar(novo);
      if (!novo.telegramVerificado) {
        setErro('Vínculo ainda não confirmado. Certifique-se de que enviou o código ao bot.');
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao verificar.');
    } finally {
      setVerificando(false);
    }
  }

  async function desvincular() {
    setDesvinculando(true); setErro('');
    try {
      await api('/telegram', { method: 'DELETE' });
      const novo = await api<Contatos>('');
      onAtualizar(novo);
      setConfirmDesvincular(false);
      setCodigoDados(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao desvincular.');
    } finally {
      setDesvinculando(false);
    }
  }

  function copiarCodigo() {
    if (!codigoDados) return;
    navigator.clipboard.writeText(codigoDados.codigo).then(() => {
      setCopiado(true);
      if (copiouTimer.current) clearTimeout(copiouTimer.current);
      copiouTimer.current = setTimeout(() => setCopiado(false), 2000);
    }).catch(() => {
      // fallback: foca o elemento para o usuário copiar manualmente
      codigoRef.current?.focus();
    });
  }

  // Formata a validade do código em texto legível
  function formatarExpiracao(iso: string): string {
    try {
      const d = new Date(iso);
      const agora = new Date();
      const diffMs = d.getTime() - agora.getTime();
      if (diffMs <= 0) return 'expirado';
      const diffMin = Math.ceil(diffMs / 60000);
      return `expira em ${diffMin} min`;
    } catch {
      return '';
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Telegram</span>
        {c.telegramVerificado && (
          <span className="rounded-full bg-success/20 px-2 py-0.5 text-xs text-success">
            vinculado
          </span>
        )}
      </div>

      {erro && (
        <p role="alert" aria-live="assertive" className="mt-1 text-sm text-danger">
          {erro}
        </p>
      )}

      {!c.telegramVerificado && !codigoDados && (
        <div className="mt-2">
          <p className="text-xs text-fg/60">
            Vincule o Telegram para receber notificações instantâneas pelo bot da prefeitura.
          </p>
          <button
            type="button"
            onClick={gerarCodigo}
            disabled={gerando}
            aria-busy={gerando}
            className="mt-2 rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-fg disabled:opacity-60"
          >
            {gerando ? 'Gerando…' : 'Vincular Telegram'}
          </button>
        </div>
      )}

      {!c.telegramVerificado && codigoDados && (
        <div className="mt-2 rounded border border-border bg-bg p-3 space-y-2">
          <p className="text-sm">{codigoDados.instrucao}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code
              ref={codigoRef}
              tabIndex={0}
              aria-label={`Código de vínculo: ${codigoDados.codigo.split('').join(' ')}`}
              className="rounded bg-muted px-3 py-1 font-mono text-2xl font-bold tracking-widest text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {codigoDados.codigo}
            </code>
            <button
              type="button"
              onClick={copiarCodigo}
              aria-label="Copiar código"
              className="rounded border border-border px-2 py-1 text-xs text-fg/70 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p aria-live="polite" className="text-xs text-fg/50">
            {formatarExpiracao(codigoDados.expiraEm)} &mdash; código de uso único
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={verificarVinculo}
              disabled={verificando}
              aria-busy={verificando}
              className="rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-fg disabled:opacity-60"
            >
              {verificando ? 'Verificando…' : 'Já enviei / Atualizar'}
            </button>
            <button
              type="button"
              onClick={gerarCodigo}
              disabled={gerando}
              className="text-sm text-primary underline disabled:opacity-60"
            >
              Gerar novo código
            </button>
          </div>
        </div>
      )}

      {c.telegramVerificado && (
        <div className="mt-2 space-y-2">
          <p className="text-sm text-fg/70">
            Identificador vinculado:{' '}
            <span className="font-mono font-semibold text-fg">{c.telegram ?? '••••'}</span>
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={c.notifTelegram}
              onChange={(e) => onSalvarNotif({ notifTelegram: e.target.checked })}
              className="rounded"
              aria-label="Receber notificações pelo Telegram"
            />
            <span>Receber notificações pelo Telegram</span>
          </label>

          {!confirmDesvincular ? (
            <button
              type="button"
              onClick={() => setConfirmDesvincular(true)}
              className="text-sm text-danger underline"
            >
              Desvincular
            </button>
          ) : (
            <div
              role="alertdialog"
              aria-labelledby="confirm-desvincular-titulo"
              className="rounded border border-danger/40 bg-danger/10 p-3 space-y-2"
            >
              <p id="confirm-desvincular-titulo" className="text-sm font-semibold text-danger">
                Confirmar desvinculação?
              </p>
              <p className="text-xs text-fg/70">
                Você deixará de receber notificações pelo Telegram. Poderá vincular novamente a qualquer momento.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={desvincular}
                  disabled={desvinculando}
                  aria-busy={desvinculando}
                  className="rounded bg-danger px-3 py-1 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {desvinculando ? 'Desvinculando…' : 'Confirmar'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDesvincular(false)}
                  className="rounded border border-border px-3 py-1 text-sm text-fg"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Contatos e preferências de notificação do usuário (cidadão ou interno).
 * Cadastra WhatsApp + e-mail com verificação por código e opt-in por canal.
 * Suporta vínculo com bot Telegram (fluxo de código enviado ao bot).
 * A cada nova tramitação, quem deve agir recebe aviso (sem dado sensível).
 */
export default function ContatosNotificacao() {
  const [c, setC] = useState<Contatos | null>(null);
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    api<Contatos>('')
      .then((d) => { setC(d); setWhatsapp(d.whatsapp); setEmail(d.email); })
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'));
  }, []);

  async function salvar(patch: Partial<Contatos>) {
    setSalvando(true); setErro(''); setOk('');
    try {
      const novo = await api<Contatos>('', {
        method: 'PUT',
        body: JSON.stringify({
          whatsapp, email,
          notifWhatsapp: patch.notifWhatsapp ?? c?.notifWhatsapp,
          notifEmail: patch.notifEmail ?? c?.notifEmail,
          notifTelegram: patch.notifTelegram ?? c?.notifTelegram,
          ...patch,
        }),
      });
      setC(novo);
      setOk('Preferências salvas.');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  if (!c) return <p className="text-sm text-fg/60">{erro || 'Carregando…'}</p>;

  const Badge = ({ ok: v }: { ok: boolean }) => (
    <span className={`rounded-full px-2 py-0.5 text-xs ${v ? 'bg-success/20 text-success' : 'bg-muted text-fg/60'}`}>
      {v ? 'verificado' : 'não verificado'}
    </span>
  );

  return (
    <div className="space-y-4 rounded-lg border border-border p-4">
      <div>
        <h3 className="font-heading text-lg font-semibold">Contatos e notificações</h3>
        <p className="text-sm text-fg/70">
          Receba avisos por WhatsApp, e-mail ou Telegram quando houver novidade nas suas manifestações.
          O aviso traz apenas o protocolo e um link — nunca o conteúdo.
        </p>
      </div>

      {/* Secretaria (somente leitura — fila de atendimento) */}
      <div className="rounded border border-border bg-muted/30 px-3 py-2">
        <p className="text-xs text-fg/60">
          <span className="font-semibold text-fg/80">Sua fila de atendimento</span> segue a secretaria à qual você está vinculado.
          Manifestações direcionadas à sua secretaria chegam ao seu painel automaticamente.
        </p>
      </div>

      {erro && <p role="alert" className="text-sm text-danger">{erro}</p>}
      {ok && <p aria-live="polite" className="text-sm text-success">{ok}</p>}

      {/* WhatsApp */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="ct-wa" className="text-sm font-medium">WhatsApp</label>
          <Badge ok={c.whatsappVerificado} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input id="ct-wa" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)}
            placeholder="(00) 00000-0000" className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={c.notifWhatsapp} onChange={(e) => salvar({ notifWhatsapp: e.target.checked })} /> avisar
          </label>
        </div>
        {!c.canais.whatsapp && <p className="mt-1 text-xs text-fg/50">Canal WhatsApp indisponível no momento.</p>}
        {!c.whatsappVerificado && c.whatsapp && (
          <Verificar canal="whatsapp" onVerificado={setC} />
        )}
      </div>

      {/* E-mail */}
      <div>
        <div className="flex items-center justify-between">
          <label htmlFor="ct-email" className="text-sm font-medium">E-mail</label>
          <Badge ok={c.emailVerificado} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input id="ct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@email.com" className="flex-1 rounded border border-border bg-bg px-2 py-1 text-sm" />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={c.notifEmail} onChange={(e) => salvar({ notifEmail: e.target.checked })} /> avisar
          </label>
        </div>
        {!c.canais.email && <p className="mt-1 text-xs text-fg/50">Envio de e-mail indisponível no momento (SMTP não configurado).</p>}
        {!c.emailVerificado && c.email && (
          <Verificar canal="email" onVerificado={setC} />
        )}
      </div>

      {/* Telegram */}
      {c.canais.telegram ? (
        <SecaoTelegram
          c={c}
          onAtualizar={setC}
          onSalvarNotif={salvar}
        />
      ) : (
        <div>
          <span className="text-sm font-medium text-fg/50">Telegram</span>
          <p className="mt-1 text-xs text-fg/40">
            Canal Telegram não configurado pela prefeitura. Entre em contato com a administração do sistema.
          </p>
        </div>
      )}

      <button type="button" onClick={() => salvar({})} disabled={salvando}
        className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg disabled:opacity-60">
        {salvando ? 'Salvando…' : 'Salvar contatos'}
      </button>
    </div>
  );
}
