# ADR-0003 — Webmail Institucional: Make or Buy

- **Status:** Aceito
- **Data:** 2026-06-12
- **Decisores:** Arquitetura, Operações, Comercial
- **Relacionado a:** TR Barão de Melgaço bloco 14 (Webmail), `docs/12-infraestrutura.md`, `docs/06-lgpd-gdpr.md`

---

## Contexto

O TR exige plataforma de e-mail institucional com:
- 100 contas de e-mail com domínio do municipio (ex.: `@baraodemelgaco.mt.gov.br`)
- Cota de armazenamento de pelo menos 20 GB (por conta ou total — interpretação mais conservadora: 20 GB por conta)
- Backup semanal com retenção
- SSL/TLS para IMAP, SMTP e webmail
- Acesso via webmail e aplicativo móvel (IMAP/ActiveSync)
- Administração de contas/quotas

O servidor Lidera (Windows Server 2022 / WSL2 / Docker) já hospeda a plataforma portal. A questão é se o servidor de e-mail deve ser auto-hospedado no mesmo servidor ou entregue como serviço gerenciado externo, e como o portal admin integra a administração das contas.

**Servidor de e-mail é infraestrutura, nao software de aplicação.** A decisão de arquitetura está em qual serviço sustenta essa infraestrutura, e qual é o esforço operacional resultante para o fornecedor e para o municipio.

### Restrições relevantes

- O servidor Lidera tem recursos compartilhados com Evolution API, Redis e o portal. A adição de um servidor de e-mail self-hosted (Mailcow, Mailu ou Zimbra) consome CPU, RAM (mínimo 2–4 GB adicionais) e exige portas abertas (25, 465, 587, 993, 143) que hoje estão bloqueadas pelo Cloudflare Zero Trust.
- Deliverability de e-mail depende de reputação de IP. IPs residenciais/VPS sem histórico de envio caem frequentemente em spam, exigindo configuração de SPF, DKIM, DMARC e aquecimento do IP — tarefa operacional contínua.
- LGPD: e-mails institucionais contêm dados pessoais de servidores e possivelmente de cidadãos; o local de armazenamento deve estar em jurisdição brasileira ou amparado por cláusulas adequadas (art. 33).
- O municipio tem equipe técnica limitada para operar infraestrutura de e-mail.

---

## Alternativas consideradas

### A. Self-host — Mailcow no servidor Lidera

**O que é:** Mailcow é uma stack Docker completa (Postfix + Dovecot + rspamd + SOGo webmail + admin). Mailu e Zimbra Community são alternativas similares.

**Prós:**
- Custo de licença zero.
- Dados inteiramente no servidor do municipio.
- Integração via API REST nativa (`/api/v1/` do Mailcow).

**Contras:**
- Exige abrir portas 25, 465, 587, 993 diretamente na internet — incompatível com o modelo de exposição atual (Cloudflare Zero Trust só proxia HTTP/S; SMTP/IMAP nao passam pelo tunel ZT).
- IP do servidor Lidera provavelmente sem reputação de envio → e-mails caem em spam. Aquecimento leva semanas/meses e nunca é garantido em IPs de VPS sem histórico.
- Manutenção contínua: atualizações de segurança do Postfix/Dovecot, monitoramento de filas, blacklist checks, gestão de spam — carga operacional significativa.
- Requisito de RAM: Mailcow requer mínimo 4 GB; servidor Lidera tem recursos disputados.
- Backup semanal com retenção exige automação adicional (Dovecot maildir + MariaDB do Mailcow).
- Em caso de problema no servidor (falha de disco, restart), e-mail fica indisponível junto com o portal.

### B. Serviço gerenciado — provedor nacional

Exemplos: **Titan Email** (hostgator.com.br, locaweb.com.br), **Locaweb Mail**, **Umbler Mail**, **Hostinger Email** — todos com datacenter no Brasil, IMAP/SMTP com SSL/TLS, webmail, app móvel e painel de administração.

**Prós:**
- Entrega (deliverability) garantida: IPs com reputação consolidada, SPF/DKIM/DMARC configurados pelo provedor.
- Sem impacto nos recursos do servidor Lidera.
- SLA de disponibilidade do e-mail independente do portal.
- Backup e retenção gerenciados pelo provedor.
- Dados em jurisdição brasileira (exigir contratualmente).
- Custo previsível: R$ 5–15 por conta/mês → R$ 500–1500/mês para 100 contas.
- Manutenção próxima de zero para o fornecedor.

**Contras:**
- Custo mensal recorrente repassado ao municipio.
- Dependência de terceiro para disponibilidade do e-mail.
- Administração de contas/quotas via painel externo (não integrado nativamente ao portal).

### C. Serviço gerenciado — Google Workspace ou Microsoft 365

**Prós:** maturidade, deliverability excelente, apps para mobile (Gmail/Outlook), funcionalidades avançadas (Meet, Drive/OneDrive).

**Contras:**
- Custo mais alto (Google Workspace Business Starter: ~R$ 40/usuário/mês → R$ 4.000/mês para 100 contas; Microsoft 365 Basic: ~R$ 25/usuário/mês → R$ 2.500/mês).
- Dados armazenados fora do Brasil (requer avaliação LGPD art. 33 + DPA).
- Overkill para a necessidade descrita no TR.

---

## Decisão

**Adotar serviço gerenciado de e-mail de provedor nacional** (opção B).

O provedor recomendado como ponto de partida é **Locaweb Mail Business** ou **Titan Email via Hostinger/HostGator** — ambos com datacenter no Brasil, certificados SSL/TLS incluídos, suporte a IMAP/SMTP/ActiveSync, webmail responsivo, painel de administração com API e preço acessível para 100 contas.

**Critérios de seleção do provedor** (a confirmar na contratação):

| Critério | Requisito mínimo |
|---|---|
| Datacenter | Brasil (jurisdição LGPD) |
| Contas | 100 contas no plano |
| Cota | ≥ 20 GB por conta ou pool equivalente |
| IMAP / SMTP com TLS | Obrigatório |
| Webmail | Incluído |
| App móvel (IMAP/ActiveSync) | Compatível com iOS e Android |
| Backup | Mínimo semanal, retenção 30 dias |
| API de administração | REST para provisionamento de contas/quotas |
| SLA | ≥ 99,5% de disponibilidade |
| DPA / Contrato de dados | Clausula LGPD art. 37 (operador) |

---

## Integração no portal admin (módulo futuro)

O TR pede que a administração de contas faça parte da plataforma. O portal admin deve oferecer uma interface unificada para o gestor municipal provisionar contas sem acessar diretamente o painel do provedor de e-mail.

### Esboço do contrato de integração

O módulo `webmail-admin` (fase futura) expõe os seguintes endpoints na API do portal, que por sua vez delegam à API REST do provedor escolhido:

```
POST   /api/admin/email/contas
  body: { email, nome, quota_gb, departamento_id }
  → cria conta no provedor via API; armazena referência em webmail_contas (tenant_id, email, quota_gb, status, criado_em)

GET    /api/admin/email/contas
  → lista contas do tenant (local) + status/uso atual (polling à API do provedor)

PATCH  /api/admin/email/contas/:id
  body: { quota_gb?, ativo? }
  → atualiza quota ou suspende conta no provedor

DELETE /api/admin/email/contas/:id
  → desativa conta no provedor + marca inativo localmente (nao deleta histórico por LGPD)

GET    /api/admin/email/contas/:id/uso
  → uso atual de armazenamento (chamada à API do provedor)

POST   /api/admin/email/contas/:id/reset-senha
  → dispara reset de senha pelo provedor; envia e-mail de recuperacao ao titular

GET    /api/admin/email/relatorio
  → relatório de contas ativas/inativas/uso total (export CSV/PDF)
```

**Modelo de dados local (tabela `webmail_contas`):**

```sql
CREATE TABLE webmail_contas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  email         TEXT NOT NULL,
  nome          TEXT NOT NULL,
  departamento  TEXT,
  quota_gb      INTEGER NOT NULL DEFAULT 20,
  status        TEXT NOT NULL DEFAULT 'ativo',  -- ativo | suspenso | inativo
  provedor_ref  TEXT,  -- ID/referência da conta no provedor externo
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE webmail_contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON webmail_contas
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

A tabela segue o mesmo padrão de isolamento RLS das demais tabelas do portal. O campo `provedor_ref` armazena o identificador da conta no provedor externo para correlação nas chamadas de API.

### O que nao entra no módulo (fora de escopo)

- Leitura/escrita de e-mails pelo portal (o webmail continua sendo o do provedor; o portal apenas administra contas).
- Armazenamento de mensagens no banco do portal.
- Proxy IMAP/SMTP pelo backend do portal.

---

## Consequências

**Positivas:**
- Deliverability garantida desde o primeiro dia — sem aquecimento de IP.
- Zero impacto em CPU/RAM/portas do servidor Lidera.
- SLA de e-mail independente do SLA do portal.
- Backup e retenção gerenciados; conformidade com o TR sem operação adicional.
- Dados em jurisdição brasileira (exigir contratualmente no DPA).
- Módulo admin do portal cobre o requisito de provisionamento/quota do TR sem duplicar o webmail.

**Negativas / mitigações:**
- Custo mensal recorrente (~R$ 500–1.500/mês para 100 contas): prever no contrato com o municipio como item de infraestrutura de e-mail, separado da licença da plataforma.
- Dependência de provedor externo para disponibilidade do e-mail: mitigada pela independência do SLA em relação ao portal e pela possibilidade de migrar entre provedores (IMAP é padrão aberto).
- API de administração varia por provedor: o módulo `webmail-admin` deve abstrair o provedor em um `EmailProviderAdapter` (interface com os métodos acima), permitindo trocar o provedor sem alterar a interface do portal.

**LGPD:**
- Exigir DPA (Contrato de Processamento de Dados, art. 37 LGPD) com o provedor, com clausulas de: finalidade (e-mail institucional), prazo de retenção, deleção ao fim do contrato, localização no Brasil.
- Dados de e-mails de servidores públicos podem conter dados pessoais sensíveis; o responsável pelo tratamento é o municipio (controlador); o provedor é operador.

---

## Fase futura

- Implementar o módulo `webmail-admin` com `EmailProviderAdapter` (inicialmente para o provedor contratado).
- Adicionar notificações proativas: alerta quando conta atinge 80% da quota, alerta de conta inativa > 90 dias.
- Integrar com o módulo de estrutura organizacional: contas vinculadas a cargos/departamentos, desprovisionamento automatico ao desligar servidor.
- Avaliar self-host (Mailcow) **somente** se: (a) o municipio migrar para servidor dedicado com IP fixo de reputação; (b) houver equipe técnica para operar e monitorar continuamente; (c) o custo do provedor gerenciado superar o custo operacional do self-host.
