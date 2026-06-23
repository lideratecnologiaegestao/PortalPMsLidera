'use client';

import { useEffect } from 'react';

/**
 * Registra o service worker do portal público.
 *
 * Renderiza null — só executa o efeito de registro no client.
 * O SW é servido estaticamente em /sw.js e tem scope '/'.
 *
 * Erros são tratados silenciosamente para não impactar o cidadão.
 */
export default function PwaRegister(): null {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch(() => {
        // Falha silenciosa — o portal continua funcionando normalmente sem SW.
      });
  }, []);

  return null;
}
