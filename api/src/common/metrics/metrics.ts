import { Gauge } from 'prom-client';

/**
 * Métricas de negócio expostas em /api/metrics (registry default do prom-client,
 * que o HealthController serializa). Manifestações com prazo LEGAL a vencer —
 * insumo para alerta operacional (ADR-0001, observabilidade).
 *
 * Cardinalidade: label `tenant` × `canal`. Aceitável para dezenas/centenas de
 * tenants; se crescer muito, agregar sem o label de tenant.
 */
export const slaAtRisk = new Gauge({
  name: 'portal_sla_at_risk',
  help: 'Manifestações com prazo legal a vencer em até 48h, por tenant e canal',
  labelNames: ['tenant', 'canal'],
});
