'use client';

/**
 * /admin/certificado-digital — Cofre do Certificado Digital (ICP-Brasil A1)
 *
 * Importa o certificado A1 (.pfx/.p12) do órgão + senha, usados para ASSINAR
 * digitalmente os PDFs institucionais (Diário Oficial, certificados de curso).
 * O arquivo e a senha são cifrados em repouso; a API nunca os devolve.
 *
 * Acesso: admin_prefeitura e super_admin.
 */

import { useEffect, useRef, useState } from 'react';
import { AdminApiError, adminGet, adminDelete } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso } from '../_components/ui';

interface StatusCert {
  definido: boolean;
  envGlobalDisponivel?: boolean;
  ativo?: boolean;
  legivel?: boolean;
  titular?: string | null;
  emissor?: string | null;
  numeroSerie?: string | null;
  tipo?: string | null;
  validoDe?: string | null;
  validoAte?: string | null;
  diasParaVencer?: number | null;
  vencido?: boolean;
  atualizadoEm?: string | null;
}

function dataBR(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

export default function CertificadoDigitalPage() {
  const [status, setStatus] = useState<StatusCert | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [senha, setSenha] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  async function carregar() {
    setCarregando(true);
    try {
      setStatus(await adminGet<StatusCert>('/api/admin/certificado-digital'));
    } catch {
      setStatus(null);
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => {
    carregar();
  }, []);

  async function importar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setErro('Selecione o arquivo .pfx/.p12 do certificado.');
      return;
    }
    if (!senha) {
      setErro('Informe a senha do certificado.');
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('senha', senha);
      const res = await fetch(`${apiBase}/api/admin/certificado-digital`, {
        method: 'POST',
        credentials: 'include',
        body: form,
        cache: 'no-store',
      });
      if (!res.ok) {
        let msg = `Erro ${res.status}`;
        try {
          const j = await res.json();
          if (j?.message) msg = Array.isArray(j.message) ? j.message.join('; ') : j.message;
        } catch {
          /* nao-JSON */
        }
        throw new AdminApiError(msg, res.status);
      }
      setStatus((await res.json()) as StatusCert);
      setSenha('');
      if (inputRef.current) inputRef.current.value = '';
      setOk('Certificado importado com sucesso.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao importar o certificado.');
    } finally {
      setEnviando(false);
    }
  }

  async function remover() {
    if (!confirm('Remover o certificado digital do órgão? As próximas assinaturas ficarão indisponíveis até um novo ser importado.')) return;
    setErro('');
    setOk('');
    try {
      await adminDelete('/api/admin/certificado-digital');
      setOk('Certificado removido.');
      await carregar();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao remover.');
    }
  }

  const venc = status?.vencido;
  const diasBadge =
    status?.definido && status.diasParaVencer != null
      ? venc
        ? { txt: 'VENCIDO', cls: 'border-danger text-danger' }
        : status.diasParaVencer <= 30
          ? { txt: `vence em ${status.diasParaVencer} dia(s)`, cls: 'border-warning text-warning' }
          : { txt: `válido — ${status.diasParaVencer} dia(s)`, cls: 'border-success text-success' }
      : null;

  return (
    <div className="max-w-3xl">
      <AdminHeader
        title="Certificado Digital"
        description="Certificado ICP-Brasil A1 (.pfx/.p12) do órgão, usado para assinar digitalmente o Diário Oficial e os certificados de curso. O arquivo e a senha são cifrados em repouso e nunca são exibidos."
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* Estado atual */}
      <section className="mt-4 rounded border border-border bg-bg p-4">
        <h2 className="mb-2 font-heading text-lg font-semibold">Certificado atual</h2>
        {carregando ? (
          <p className="text-sm text-fg/60">Carregando…</p>
        ) : status?.definido ? (
          <>
          {status.legivel === false && (
            <p role="alert" className="mb-3 rounded border border-danger p-2 text-sm text-danger">
              O certificado está armazenado mas <strong>não pôde ser lido</strong> (a chave de cifra do
              ambiente mudou ou o arquivo está corrompido). As assinaturas não funcionarão até você
              <strong> reimportar</strong> o .pfx.
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 sm:col-span-2">
              <span className="font-semibold">Situação:</span>
              {diasBadge && (
                <span className={`rounded border px-2 py-0.5 text-xs ${diasBadge.cls}`}>{diasBadge.txt}</span>
              )}
              {!status.ativo && <span className="rounded border border-fg/30 px-2 py-0.5 text-xs text-fg/60">inativo</span>}
            </div>
            <div><dt className="text-fg/60">Titular</dt><dd className="font-medium">{status.titular ?? '—'}</dd></div>
            <div><dt className="text-fg/60">Tipo</dt><dd>{status.tipo ?? '—'}</dd></div>
            <div><dt className="text-fg/60">Emissor (AC)</dt><dd>{status.emissor ?? '—'}</dd></div>
            <div><dt className="text-fg/60">Nº de série</dt><dd className="break-all font-mono text-xs">{status.numeroSerie ?? '—'}</dd></div>
            <div><dt className="text-fg/60">Válido de</dt><dd>{dataBR(status.validoDe)}</dd></div>
            <div><dt className="text-fg/60">Válido até</dt><dd>{dataBR(status.validoAte)}</dd></div>
            <div className="sm:col-span-2"><dt className="text-fg/60">Atualizado em</dt><dd>{dataBR(status.atualizadoEm)}</dd></div>
            <div className="sm:col-span-2 pt-2">
              <button
                type="button"
                onClick={remover}
                className="rounded border border-danger px-3 py-1.5 text-sm text-danger hover:bg-danger/10"
              >
                Remover certificado
              </button>
            </div>
          </dl>
          </>
        ) : (
          <p className="text-sm text-fg/70">
            Nenhum certificado importado.{' '}
            {status?.envGlobalDisponivel
              ? 'Um certificado global do ambiente está configurado e será usado como padrão até você importar o do órgão.'
              : 'Sem um certificado, o Diário Oficial não pode ser publicado em produção e os certificados de curso saem sem assinatura digital.'}
          </p>
        )}
      </section>

      {/* Importar / substituir */}
      <section className="mt-4 rounded border border-border bg-bg p-4">
        <h2 className="mb-1 font-heading text-lg font-semibold">
          {status?.definido ? 'Substituir certificado' : 'Importar certificado'}
        </h2>
        <p className="mb-3 text-sm text-fg/60">
          Arquivo <strong>.pfx</strong> ou <strong>.p12</strong> (ICP-Brasil A1) + a senha do certificado. A senha é validada
          na importação e guardada cifrada.
        </p>
        <form onSubmit={importar} className="space-y-3">
          <div>
            <label htmlFor="cert-file" className="mb-1 block text-sm font-medium">Arquivo do certificado (.pfx / .p12)</label>
            <input
              id="cert-file"
              ref={inputRef}
              type="file"
              accept=".pfx,.p12,application/x-pkcs12"
              className="block w-full text-sm file:mr-3 file:rounded file:border file:border-border file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <div>
            <label htmlFor="cert-senha" className="mb-1 block text-sm font-medium">Senha do certificado</label>
            <input
              id="cert-senha"
              type="password"
              autoComplete="off"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full max-w-sm rounded border border-border bg-bg px-3 py-1.5 text-sm"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={enviando}
            className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50"
          >
            {enviando ? 'Enviando…' : status?.definido ? 'Substituir' : 'Importar'}
          </button>
        </form>
      </section>

      <p className="mt-3 text-xs text-fg/50">
        Segurança: o arquivo e a senha são cifrados em repouso (AES-256-GCM) e a API nunca os retorna. Mantenha o .pfx
        original em local seguro fora do sistema.
      </p>
    </div>
  );
}
