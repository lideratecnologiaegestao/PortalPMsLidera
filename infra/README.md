# Infra

- `k8s/` — manifestos Kubernetes (deploy da API/web, HPA, secrets via cofre).
- Observabilidade: OpenTelemetry → Prometheus/Grafana (ver `docs/05-devops-devsecops.md`).
- Backups: Postgres PITR + object storage versionado; restore testado periodicamente.
- Segredos: cofre do provedor / Vault — nunca no repo.

Ambientes: local (docker-compose, na raiz) · dev · staging · prod. Deploy imutável por commit SHA; migrations antes do rollout.
