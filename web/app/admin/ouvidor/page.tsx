'use client';

/**
 * /admin/ouvidor — Painel do Ouvidor (ADR-0005 Fase 3).
 *
 * Layout: Dashboard (KPIs + gráficos + atalhos) acima da caixa unificada
 * na mesma página, separados por âncora #caixa-unificada.
 * Não foi criada sub-rota para manter o link do menu e a compatibilidade
 * de todos os atalhos existentes sem migração.
 *
 * Gate de EULA:
 *  - Detectado via flag eulaRequired no estado do componente ou por 403
 *    EULA_REQUIRED vindo do dashboard.
 *  - O EulaGate é bloqueante (aria-modal, sem ESC, focus trap).
 *  - Após aceite, recarrega o dashboard automaticamente.
 */

import { useState, useEffect } from 'react';
import { adminGet } from '../../../lib/admin-api';
import { AdminHeader } from '../_components/ui';
import ManifestacoesAdmin from '../_components/ManifestacoesAdmin';
import OuvidorDashboard from '../../../components/admin/OuvidorDashboard';
import EulaGate from '../../../components/admin/EulaGate';

export default function PainelOuvidorPage() {
  const [eulaAberta, setEulaAberta] = useState(false);
  const [dashboardKey, setDashboardKey] = useState(0);

  // Verifica na montagem se o EULA já está pendente (via GET /api/auth/eula).
  // Isso cobre o caso em que o usuário chega à página sem ter passado pelo login
  // (ex.: sessão já existia antes da versão EULA ser implantada).
  useEffect(() => {
    adminGet<{ versao: string; titulo: string; texto: string; jaAceito: boolean }>(
      '/api/auth/eula',
    )
      .then((data) => {
        if (!data.jaAceito) setEulaAberta(true);
      })
      .catch(() => {
        // Silenciamos erros da verificação pré-carregamento do EULA:
        // papéis sem EULA (servidor, admin) podem receber 404 aqui e é esperado.
        // O OuvidorDashboard também dispara onEulaRequired() se receber 403.
      });
  }, []);

  function onEulaRequired() {
    setEulaAberta(true);
  }

  function onAceitou() {
    setEulaAberta(false);
    // Força o dashboard a re-montar e re-buscar os dados
    setDashboardKey((k) => k + 1);
  }

  return (
    <>
      {/* Gate de EULA — bloqueante quando aberto */}
      <EulaGate aberto={eulaAberta} onAceitou={onAceitou} />

      {/* ── Cabeçalho ──────────────────────────────────────────────── */}
      <AdminHeader
        title="Painel do Ouvidor"
        description="Visão consolidada das manifestações, KPIs e atalhos rápidos para os módulos de Ouvidoria e e-SIC."
      />

      {/* ── Dashboard de KPIs e gráficos ───────────────────────────── */}
      <OuvidorDashboard
        key={dashboardKey}
        onEulaRequired={onEulaRequired}
      />

      {/* ── Separador para a caixa unificada ───────────────────────── */}
      <div className="my-8 border-t border-border" />

      <section
        id="caixa-unificada"
        aria-labelledby="caixa-unificada-titulo"
        tabIndex={-1}
        className="focus:outline-none"
      >
        <h2
          id="caixa-unificada-titulo"
          className="font-heading text-xl font-bold mb-1"
        >
          Caixa unificada
        </h2>
        <p className="text-sm text-fg/70 mb-4">
          Todos os canais: Ouvidoria e e-SIC. Use os filtros para segmentar por canal, status ou tipo.
        </p>

        {/* Caixa unificada — sem prop canal (exibe ambos) */}
        <ManifestacoesAdmin />
      </section>
    </>
  );
}
