# ADR-0007 — Motor de Campanhas: Template Global + Campanha por Tenant

**Status:** Aceito  
**Data:** 2026-06  
**Módulo:** Campanhas (migration 084)

---

## Contexto

A plataforma serve N prefeituras a partir de um único código. Campanhas sazonais (dengue, meses coloridos, IPTU) são comuns a muitos municípios — manter apenas uma biblioteca global simplifica a operação da Lidera e reduz o esforço de cada prefeitura para começar. Ao mesmo tempo, cada prefeitura precisa de autonomia total para customizar datas, cores, textos e habilitar/desabilitar capacidades conforme a realidade local.

O produto anterior tinha campanhas hardcoded no código do portal (overlay da dengue em `site_settings`), o que exigia deploy para ativar/desativar e não suportava múltiplos tenants.

---

## Decisão

Adotar uma arquitetura de dois níveis:

**Nível 1 — `campaign_template` (global, sem `tenant_id`):** biblioteca de presets mantida pela plataforma Lidera. Sem RLS de tenant: leitura livre para qualquer sessão, escrita restrita a `app_is_platform()`. Segue o mesmo padrão de `ia_conteudos_global` (migration 079).

**Nível 2 — `campaign` (por tenant, com RLS):** cada prefeitura instala um preset (clona para si) ou cria campanhas do zero. A cópia é independente — o preset global pode ser atualizado sem afetar campanhas já instaladas. Toda a customização (datas, cores, conteúdo, prioridade) fica na instância do tenant.

O campo `template_key` em `campaign` é texto, não FK para `campaign_template` — preserva o vínculo histórico mesmo que o preset global seja renomeado ou removido.

---

## Consequências

- A Lidera pode evoluir os presets globais sem quebrar campanhas em produção nos tenants.
- Cada prefeitura tem soberania total sobre suas campanhas; nenhuma mudança global afeta retroativamente.
- O super_admin da Lidera usa `POST /api/admin/campanhas/_semear` para propagar atualizações do catálogo; tenants não são impactados automaticamente.
- A biblioteca de mídia (banners) e o CMS (páginas) são por tenant — os presets globais usam URLs de placeholder que o admin substitui ao instalar.
- A dupla tabela adiciona um JOIN semântico (template → campanha), mas o resolver opera apenas sobre `campaign` em runtime, sem ler `campaign_template`.

---

## Alternativas consideradas

**Uma única tabela `campaign` com `tenant_id nullable`:** presets seriam campanhas com `tenant_id = null`. Rejeitado porque misturar dados globais e de tenant na mesma tabela complica o RLS (policy precisa tratar o null) e aumenta o risco de vazamento cross-tenant.

**Presets como código (sem tabela):** hardcodar os defaults no código da API. Rejeitado porque impede que a Lidera atualize o catálogo sem deploy, e não suporta presets customizados por tenant.

**Templates por tenant (sem biblioteca global):** cada tenant mantém seus próprios templates. Rejeitado porque duplica manutenção e impede que a Lidera ofereça campanhas pré-prontas como diferencial de produto.
