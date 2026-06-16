'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { apiBase } from '../../../lib/auth-shared';
import type {
  CampoFormulario,
  CaptchaDesafio,
  FormularioPublico,
} from '../../../lib/formularios';

// ─── Máscaras ─────────────────────────────────────────────────────────────────

function mascaraTelefone(v: string): string {
  const d = v.replace(/\D/g, '').substring(0, 11);
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  }
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2');
}

function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, '').substring(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
}

// ─── Validação client ─────────────────────────────────────────────────────────

function validarCampo(campo: CampoFormulario, valor: unknown): string | null {
  const v = campo.tipo === 'checkbox' ? valor : String(valor ?? '').trim();

  if (campo.obrigatorio) {
    if (campo.tipo === 'checkbox') {
      if (!Array.isArray(valor) || valor.length === 0) {
        return campo.validacao?.mensagem ?? `${campo.label} é obrigatório.`;
      }
    } else if (!v) {
      return campo.validacao?.mensagem ?? `${campo.label} é obrigatório.`;
    }
  }

  if (!v || typeof v !== 'string') return null;

  const { validacao } = campo;
  if (!validacao) return null;

  if (validacao.minLength && v.length < validacao.minLength) {
    return validacao.mensagem ?? `Mínimo de ${validacao.minLength} caracteres.`;
  }
  if (validacao.maxLength && v.length > validacao.maxLength) {
    return validacao.mensagem ?? `Máximo de ${validacao.maxLength} caracteres.`;
  }
  if (validacao.formato === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
    return validacao.mensagem ?? 'E-mail inválido.';
  }
  if (validacao.formato === 'telefone' && !/^\(\d{2}\) \d{4,5}-\d{4}$/.test(v)) {
    return validacao.mensagem ?? 'Telefone inválido.';
  }
  if (validacao.formato === 'cpf') {
    const cpf = v.replace(/\D/g, '');
    if (cpf.length !== 11) return validacao.mensagem ?? 'CPF inválido.';
  }
  if (validacao.regex) {
    try {
      if (!new RegExp(validacao.regex).test(v)) {
        return validacao.mensagem ?? 'Formato inválido.';
      }
    } catch {
      // regex inválido → ignora
    }
  }

  return null;
}

// ─── Campo individual ─────────────────────────────────────────────────────────

function CampoInput({
  campo,
  valor,
  erro,
  onChange,
  onFileChange,
}: {
  campo: CampoFormulario;
  valor: unknown;
  erro?: string;
  onChange: (nome: string, v: unknown) => void;
  onFileChange: (nome: string, files: FileList | null) => void;
}) {
  const idBase = useId();
  const inputId = `campo-${idBase}-${campo.nome}`;
  const descId = `${inputId}-desc`;
  const erroId = `${inputId}-erro`;

  const strVal = typeof valor === 'string' ? valor : '';
  const arrVal = Array.isArray(valor) ? (valor as string[]) : [];

  const commonProps = {
    id: inputId,
    name: campo.nome,
    required: campo.obrigatorio,
    'aria-required': campo.obrigatorio ? ('true' as const) : undefined,
    'aria-describedby': [campo.ajuda ? descId : '', erro ? erroId : ''].filter((s): s is string => !!s).join(' ') || undefined,
    'aria-invalid': erro ? ('true' as const) : undefined,
  };

  const inputClass = [
    'w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-bg text-fg',
    erro ? 'border-danger focus:ring-danger' : 'border-border',
  ].join(' ');

  const wrapClass = campo.largura === 'half' ? 'sm:col-span-1' : 'sm:col-span-2';

  if (campo.tipo === 'secao') {
    return (
      <h2 className="sm:col-span-2 font-heading text-xl font-bold text-fg border-b border-border pb-2 mt-4">
        {campo.label}
      </h2>
    );
  }

  if (campo.tipo === 'paragrafo') {
    return (
      <p className="sm:col-span-2 text-sm text-fg/70 whitespace-pre-wrap">{campo.label}</p>
    );
  }

  return (
    <div className={wrapClass}>
      <label htmlFor={inputId} className="block text-sm font-semibold mb-1">
        {campo.label}
        {campo.obrigatorio && (
          <span className="text-danger ml-1" aria-hidden="true">*</span>
        )}
      </label>

      {campo.tipo === 'textarea' && (
        <textarea
          {...commonProps}
          className={`${inputClass} min-h-[100px] resize-y`}
          placeholder={campo.placeholder}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
          maxLength={campo.validacao?.maxLength}
        />
      )}

      {campo.tipo === 'texto' && (
        <input
          {...commonProps}
          type="text"
          className={inputClass}
          placeholder={campo.placeholder}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
          minLength={campo.validacao?.minLength}
          maxLength={campo.validacao?.maxLength}
        />
      )}

      {campo.tipo === 'email' && (
        <input
          {...commonProps}
          type="email"
          className={inputClass}
          placeholder={campo.placeholder ?? 'seu@email.com'}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
          autoComplete="email"
        />
      )}

      {campo.tipo === 'telefone' && (
        <input
          {...commonProps}
          type="tel"
          className={inputClass}
          placeholder={campo.placeholder ?? '(00) 00000-0000'}
          value={strVal}
          onChange={(e) => onChange(campo.nome, mascaraTelefone(e.target.value))}
          autoComplete="tel"
          inputMode="tel"
        />
      )}

      {campo.tipo === 'cpf' && (
        <input
          {...commonProps}
          type="text"
          className={`${inputClass} font-mono`}
          placeholder={campo.placeholder ?? '000.000.000-00'}
          value={strVal}
          onChange={(e) => onChange(campo.nome, mascaraCpf(e.target.value))}
          inputMode="numeric"
          maxLength={14}
          autoComplete="off"
        />
      )}

      {campo.tipo === 'numero' && (
        <input
          {...commonProps}
          type="number"
          className={inputClass}
          placeholder={campo.placeholder}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
          inputMode="numeric"
        />
      )}

      {campo.tipo === 'data' && (
        <input
          {...commonProps}
          type="date"
          className={inputClass}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
        />
      )}

      {campo.tipo === 'select' && (
        <select
          {...commonProps}
          className={inputClass}
          value={strVal}
          onChange={(e) => onChange(campo.nome, e.target.value)}
        >
          <option value="">{campo.placeholder ?? 'Selecione…'}</option>
          {(campo.opcoes ?? []).map((op) => (
            <option key={op.valor} value={op.valor}>
              {op.label}
            </option>
          ))}
        </select>
      )}

      {campo.tipo === 'radio' && (
        <fieldset aria-describedby={commonProps['aria-describedby']}>
          <legend className="sr-only">{campo.label}</legend>
          <div className="space-y-1">
            {(campo.opcoes ?? []).map((op) => {
              const radioId = `${inputId}-${op.valor}`;
              return (
                <label key={op.valor} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    id={radioId}
                    type="radio"
                    name={campo.nome}
                    value={op.valor}
                    required={campo.obrigatorio}
                    checked={strVal === op.valor}
                    onChange={() => onChange(campo.nome, op.valor)}
                    className="h-4 w-4 accent-primary focus:ring-2 focus:ring-primary"
                    aria-invalid={erro ? 'true' : undefined}
                  />
                  {op.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {campo.tipo === 'checkbox' && (
        <fieldset aria-describedby={commonProps['aria-describedby']}>
          <legend className="sr-only">{campo.label}</legend>
          <div className="space-y-1">
            {(campo.opcoes ?? []).map((op) => {
              const cbId = `${inputId}-${op.valor}`;
              return (
                <label key={op.valor} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    id={cbId}
                    type="checkbox"
                    name={campo.nome}
                    value={op.valor}
                    checked={arrVal.includes(op.valor)}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...arrVal, op.valor]
                        : arrVal.filter((v) => v !== op.valor);
                      onChange(campo.nome, next);
                    }}
                    className="h-4 w-4 rounded accent-primary focus:ring-2 focus:ring-primary"
                    aria-invalid={erro ? 'true' : undefined}
                  />
                  {op.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      {campo.tipo === 'upload' && (
        <input
          {...commonProps}
          type="file"
          className={`${inputClass} file:mr-3 file:rounded file:border-0 file:bg-primary/10 file:px-3 file:py-1 file:text-sm file:font-semibold file:text-primary hover:file:bg-primary/20`}
          accept={campo.accept}
          multiple={campo.multiplos}
          onChange={(e) => onFileChange(campo.nome, e.target.files)}
        />
      )}

      {/* Texto de ajuda */}
      {campo.ajuda && (
        <p id={descId} className="mt-1 text-xs text-fg/60">
          {campo.ajuda}
        </p>
      )}

      {/* Mensagem de erro */}
      {erro && (
        <p id={erroId} role="alert" className="mt-1 text-xs text-danger font-semibold">
          {erro}
        </p>
      )}
    </div>
  );
}

// ─── CAPTCHA ──────────────────────────────────────────────────────────────────

function CaptchaWidget({
  slug,
  onResolvido,
}: {
  slug: string;
  onResolvido: (token: string, resposta: string) => void;
}) {
  const idBase = useId();
  const [desafio, setDesafio] = useState<CaptchaDesafio | null>(null);
  const [resposta, setResposta] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erroCarregar, setErroCarregar] = useState('');

  async function carregarDesafio() {
    setCarregando(true);
    setErroCarregar('');
    setResposta('');
    try {
      const res = await fetch(`${apiBase}/api/formularios/${encodeURIComponent(slug)}/captcha`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('Falha ao carregar desafio.');
      const data: CaptchaDesafio = await res.json();
      setDesafio(data);
    } catch {
      setErroCarregar('Não foi possível carregar o desafio anti-spam. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregarDesafio();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (desafio && resposta) {
      onResolvido(desafio.token, resposta);
    }
  }, [desafio, resposta, onResolvido]);

  const inputId = `captcha-${idBase}`;

  return (
    <div className="rounded border border-border/60 bg-muted/20 p-4 space-y-2">
      <p className="text-xs font-semibold text-fg/70 uppercase tracking-wide">
        Verificação anti-spam
      </p>
      {carregando && (
        <p className="text-sm text-fg/60" role="status">Carregando desafio…</p>
      )}
      {erroCarregar && (
        <div>
          <p className="text-sm text-danger" role="alert">{erroCarregar}</p>
          <button type="button" onClick={carregarDesafio} className="mt-1 text-xs text-primary underline">
            Tentar novamente
          </button>
        </div>
      )}
      {desafio && !carregando && (
        <div className="flex items-center gap-3">
          <label htmlFor={inputId} className="text-sm font-semibold shrink-0">
            {desafio.pergunta}
          </label>
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={resposta}
            onChange={(e) => setResposta(e.target.value)}
            required
            aria-required="true"
            aria-label={`Resposta para: ${desafio.pergunta}`}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={carregarDesafio}
            className="text-xs text-fg/50 hover:text-fg underline"
            aria-label="Gerar novo desafio"
          >
            Novo desafio
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Formulário Renderizador ──────────────────────────────────────────────────

export default function FormRenderer({
  slug,
  formulario,
}: {
  slug: string;
  formulario: FormularioPublico;
}) {
  const [valores, setValores] = useState<Record<string, unknown>>({});
  const [arquivos, setArquivos] = useState<Record<string, FileList>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erroGlobal, setErroGlobal] = useState('');

  // Anti-spam
  const mountTime = useRef(Date.now());
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaResposta, setCaptchaResposta] = useState('');

  const API = apiBase;

  function setValor(nome: string, v: unknown) {
    setValores((prev) => ({ ...prev, [nome]: v }));
    // Limpa o erro do campo ao digitar
    setErros((prev) => {
      if (!prev[nome]) return prev;
      const next = { ...prev };
      delete next[nome];
      return next;
    });
  }

  function setArquivo(nome: string, files: FileList | null) {
    if (files && files.length > 0) {
      setArquivos((prev) => ({ ...prev, [nome]: files }));
    } else {
      setArquivos((prev) => {
        const next = { ...prev };
        delete next[nome];
        return next;
      });
    }
  }

  function validarTudo(): Record<string, string> {
    const novosErros: Record<string, string> = {};
    for (const campo of formulario.schema) {
      if (campo.tipo === 'secao' || campo.tipo === 'paragrafo') continue;
      const err = validarCampo(campo, valores[campo.nome]);
      if (err) novosErros[campo.nome] = err;
    }
    setErros(novosErros);
    return novosErros;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErroGlobal('');

    const errosCampos = validarTudo();
    if (Object.keys(errosCampos).length > 0) {
      setErroGlobal('Corrija os erros indicados antes de enviar.');
      // Move foco para o primeiro campo com erro
      const primeiroNome = Object.keys(errosCampos)[0];
      if (primeiroNome) {
        document.querySelector<HTMLElement>(`[name="${primeiroNome}"]`)?.focus();
      }
      return;
    }

    setEnviando(true);
    try {
      const fd = new FormData();

      // Campos normais
      for (const campo of formulario.schema) {
        if (campo.tipo === 'secao' || campo.tipo === 'paragrafo') continue;
        const v = valores[campo.nome];
        if (v === undefined || v === null || v === '') continue;
        if (Array.isArray(v)) {
          fd.append(campo.nome, JSON.stringify(v));
        } else {
          fd.append(campo.nome, String(v));
        }
      }

      // Arquivos
      for (const [nome, files] of Object.entries(arquivos)) {
        for (let i = 0; i < files.length; i++) {
          const f = files[i];
          if (f) fd.append(nome, f);
        }
      }

      // Anti-spam: honeypot (vazio!) + tempo + captcha
      fd.append('_hp', '');
      fd.append('_t', String(mountTime.current));
      if (formulario.captchaHabilitado && captchaToken) {
        fd.append('_captcha_token', captchaToken);
        fd.append('_captcha_resposta', captchaResposta);
      }

      const res = await fetch(`${API}/api/formularios/${encodeURIComponent(slug)}/enviar`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });

      if (res.ok) {
        const json = await res.json().catch(() => ({}));
        if (formulario.redirecionarUrl) {
          window.location.href = formulario.redirecionarUrl;
          return;
        }
        setEnviado(true);
        // mensagemConfirmacao pode ter vindo no payload ou vem da prop
        void json;
        return;
      }

      if (res.status === 401) {
        setErroGlobal('Você precisa fazer login para enviar este formulário.');
        return;
      }
      if (res.status === 409) {
        setErroGlobal('Você já enviou este formulário anteriormente.');
        return;
      }
      if (res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (body?.erros && typeof body.erros === 'object') {
          setErros((prev) => ({ ...prev, ...body.erros }));
          setErroGlobal('Corrija os erros indicados e tente novamente.');
          return;
        }
        setErroGlobal(body?.message ?? 'Dados inválidos. Verifique o formulário.');
        return;
      }

      setErroGlobal('Ocorreu um erro ao enviar. Tente novamente.');
    } catch {
      setErroGlobal('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  // ── Sucesso ───────────────────────────────────────────────────────────────

  if (enviado) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded border border-success/40 bg-success/10 p-8 text-center space-y-3"
      >
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="mx-auto text-success"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="font-heading text-xl font-bold text-success">Enviado com sucesso!</h2>
        <p className="text-fg/80">
          {formulario.mensagemConfirmacao?.trim() ||
            'Obrigado! Seu formulário foi recebido com sucesso.'}
        </p>
      </div>
    );
  }

  // ── Formulário ────────────────────────────────────────────────────────────

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-label={formulario.titulo}
      className="space-y-6"
    >
      {/* Honeypot — campo oculto anti-spam */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: '-9999px',
          top: 'auto',
          width: '1px',
          height: '1px',
          overflow: 'hidden',
        }}
      >
        <label htmlFor="hp-field">Deixe este campo em branco</label>
        <input
          id="hp-field"
          name="_hp"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
          onChange={() => {}} // somente bots preenchem
        />
      </div>

      {/* Campos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {formulario.schema.map((campo) => (
          <CampoInput
            key={campo.id}
            campo={campo}
            valor={valores[campo.nome] ?? ''}
            erro={erros[campo.nome]}
            onChange={setValor}
            onFileChange={setArquivo}
          />
        ))}
      </div>

      {/* CAPTCHA */}
      {formulario.captchaHabilitado && (
        <CaptchaWidget
          slug={slug}
          onResolvido={(token, resp) => {
            setCaptchaToken(token);
            setCaptchaResposta(resp);
          }}
        />
      )}

      {/* Erro global */}
      {erroGlobal && (
        <p role="alert" className="rounded border border-danger/50 bg-danger/10 p-3 text-sm text-danger font-semibold">
          {erroGlobal}
        </p>
      )}

      {/* Nota de obrigatoriedade */}
      <p className="text-xs text-fg/50">
        Campos marcados com <span className="text-danger font-bold">*</span> são obrigatórios.
      </p>

      {/* Submit */}
      <button
        type="submit"
        disabled={enviando}
        className="inline-flex items-center gap-2 rounded bg-primary px-6 py-3 text-sm font-semibold text-primary-fg hover:opacity-90 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {enviando ? (
          <>
            <svg
              className="animate-spin h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
            Enviando…
          </>
        ) : (
          'Enviar formulário'
        )}
      </button>
    </form>
  );
}
