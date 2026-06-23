'use client';

/**
 * Componente Turnstile — carrega o widget CAPTCHA da Cloudflare.
 *
 * Comportamento:
 * - No mount, busca GET /api/turnstile/config.
 * - Se enabled=false ou siteKey=null: não renderiza nada; NÃO bloqueia o submit.
 * - Se enabled=true: chama imediatamente onToken('') (sinaliza "ativo, sem token"),
 *   carrega o script oficial (singleton por sessão), renderiza o widget e chama
 *   onToken(token) no sucesso; onToken('') em expired/error.
 * - Reset via prop `key` externa (re-mount força novo widget).
 *
 * Acessibilidade:
 * - Contêiner com role="group" + aria-label para leitores de tela.
 * - O iframe do Turnstile já possui title acessível injetado pela Cloudflare.
 *
 * Sem dependências npm — usa apenas o script oficial da Cloudflare.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiBase } from '../../lib/auth-shared';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

interface TurnstileProps {
  /** Chamado com token não-vazio quando resolvido; '' quando ativo mas sem token. */
  onToken: (token: string) => void;
}

// Singleton por sessão — o script só é inserido uma vez mesmo com vários widgets.
let scriptCarregado = false;

function carregarScript(): Promise<void> {
  if (scriptCarregado) return Promise.resolve();
  const existente = document.getElementById('cf-turnstile-script');
  if (existente) {
    scriptCarregado = true;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.id = 'cf-turnstile-script';
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.defer = true;
    s.onload = () => { scriptCarregado = true; resolve(); };
    s.onerror = () => reject(new Error('Falha ao carregar Turnstile'));
    document.head.appendChild(s);
  });
}

export default function Turnstile({ onToken }: TurnstileProps) {
  const [config, setConfig] = useState<{ enabled: boolean; siteKey: string | null } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  // Ref estável: o widget não é recriado ao mudar o callback
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  // 1. Busca configuração do tenant
  useEffect(() => {
    let cancelado = false;
    fetch(`${apiBase}/api/turnstile/config`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (!cancelado) setConfig(d); })
      .catch(() => { if (!cancelado) setConfig({ enabled: false, siteKey: null }); });
    return () => { cancelado = true; };
  }, []);

  const removerWidget = useCallback(() => {
    if (widgetIdRef.current != null && window.turnstile) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* já removido */ }
      widgetIdRef.current = null;
    }
  }, []);

  // 2. Monta o widget quando a config chega e o contêiner está no DOM
  useEffect(() => {
    if (!config?.enabled || !config.siteKey) return;

    // Sinaliza ao pai: Turnstile ativo mas sem token ainda (bloqueia submit)
    onTokenRef.current('');

    const sitekey = config.siteKey;

    carregarScript()
      .then(() => {
        // O objeto window.turnstile pode ainda não estar disponível logo após onload
        const tentarRender = (tentativa = 0) => {
          if (!containerRef.current) return; // componente desmontado
          if (!window.turnstile) {
            if (tentativa < 30) setTimeout(() => tentarRender(tentativa + 1), 100);
            return;
          }
          removerWidget();
          const id = window.turnstile.render(containerRef.current, {
            sitekey,
            callback: (token) => onTokenRef.current(token),
            'expired-callback': () => onTokenRef.current(''),
            'error-callback': () => onTokenRef.current(''),
          });
          widgetIdRef.current = id;
        };
        tentarRender();
      })
      .catch(() => {
        // Falha ao carregar script (sem rede, bloqueador de ads): não bloquear
        onTokenRef.current('__bypass__');
      });

    return () => { removerWidget(); };
  }, [config, removerWidget]);

  // Enquanto a config não chegou, ou se não está habilitado: não renderiza nada
  if (!config || !config.enabled || !config.siteKey) return null;

  return (
    <div
      role="group"
      aria-label="Verificação de segurança Cloudflare Turnstile"
      className="mt-2"
    >
      {/* O contêiner é sempre mantido no DOM quando enabled=true para que o
          useEffect encontre containerRef.current ao montar o widget. */}
      <div ref={containerRef} />
    </div>
  );
}
