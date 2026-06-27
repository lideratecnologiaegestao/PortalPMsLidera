# Deploy — APLIC Transparência (Fases 0, 1 e 2)

Liga a fonte de dados **APLIC (TCE-MT)** no Portal da Transparência: habilitação por
entidade no painel central + importação das cargas (despesa, contratos, convênios,
licitações) que alimentam as páginas públicas. Ver [ADR-0002](../adr/ADR-0002-importacao-aplic-tcemt.md).

Validado de ponta a ponta contra Postgres real com RLS de produção (`portal_app`):
migrations aplicam, ingestão grava em `aplic_*`/`transp_*`, idempotência, validação de
UG/nomenclatura e isolamento RLS entre entidades.

## O que muda (resumo)

- **Painel central (Gerenciador):** aba "Transparência (APLIC)" em *Configurações da
  Entidade* — liga/desliga a fonte e exige a **UG (7 dígitos)** do TCE-MT.
- **Admin da entidade:** `/admin/aplic` aceita cargas CT/CC/PL/00 (só com a fonte ligada);
  valida nomenclatura padrão do TCE e a UG; reimportar substitui (sem duplicar).
- **Público:** `/transparencia/execucao` (despesa) e as páginas existentes de
  `licitacoes`/`contratos`/`convenios` passam a refletir o dado do APLIC (`fonte_origem='APLIC/TCE-MT'`).
- **Receita:** `PREVISAO_RECEITA` é ingerida (`aplic_previsao_receita`) mas **não publicada**
  ainda (precisa da metodologia de classificação da receita).

## Pré-requisitos

- Banco com **PostGIS + pgvector** (imagem `portal-postgres-pgvector:16`).
- Migrations até a 085 já aplicadas.

## Passo 1 — Migrations (aditivas, sem destruir dados)

```bash
psql "$DATABASE_URL" -f db/086_aplic_habilitado_ug.sql
psql "$DATABASE_URL" -f db/087_aplic_previsao_receita.sql
psql "$DATABASE_URL" -f db/088_aplic_receita_arrecadada.sql
psql "$DATABASE_URL" -f db/089_transp_documentos_fonte.sql
# ou: cd api && npm run db:migrate   (aplica db/*.sql em ordem; idempotente)
```

- `086`: colunas `tenants.aplic_habilitado` (default false) + `tenants.aplic_ug` (CHECK 7 díg) +
  índices ÚNICOS anti-duplicação em `aplic_empenho/liquidacao/pagamento/pagamento_liquidacao`.
- `087`: tabela `aplic_previsao_receita` (RLS).
- `088`: tabela `aplic_receita_arrecadada` (receita realizada por natureza, derivada do
  lançamento contábil; alimenta `transp_receitas`). RLS.

> **PNTP:** ao habilitar a fonte APLIC, a avaliação roda automaticamente e o painel
> mostra selo + essenciais faltantes. A despesa (`aplic_empenho`) e a receita
> (`transp_receitas`, via contabilidade) passam a contar nos critérios essenciais 4.x/3.1.

## Passo 2 — Rebuild + redeploy da API e do Web

A API em execução precisa do código novo (novos endpoints `/config/aplic`, `/admin/aplic/status`,
gating e ingestão multi-módulo). O Web precisa da aba do Gerenciador e da página `/admin/aplic`.

```bash
cd api && npm run build      # gera dist/ (inclui dist/scripts/aplic-importar-lote.js)
# rebuild da imagem portal-api e portal-web e redeploy (pipeline padrão)
```

> O `prisma generate` roda no build; confirme que o client reflete o schema novo.

## Passo 3 — Habilitar a entidade + importar as cargas

Opção A — pelo painel (recomendado para o operador): Gerenciador → Configurações da Entidade →
aba **Transparência (APLIC)** → ligar + informar a UG → depois `/admin/aplic` → enviar os .zip.

Opção B — importação em lote (servidor), reusa o serviço real de ingestão:

```bash
# pré-visualizar o plano (não grava):
node dist/scripts/aplic-importar-lote.js --tenant exemplolandia \
  --dir "E:\ENTIDADES\PM_DIAMANTINO" --ug 1112796 --dry

# habilitar a fonte + UG e importar tudo (CT primeiro → credores → contratos):
npm run aplic:import -- --tenant exemplolandia \
  --dir "E:\ENTIDADES\PM_DIAMANTINO" --habilitar --ug 1112796
```

Flags: `--modulos CT,CC,PL,00` (filtra), `--dry` (só lista), `--habilitar`/`--ug`.

## Passo 4 — Verificação pós-deploy

- Gerenciador mostra o toggle e a UG salvos; auditoria `PLATFORM_CONFIG_APLIC` registrada.
- `/admin/aplic` → "status" habilitado; histórico de cargas com totais por tabela.
- Público com a fonte LIGADA: `/transparencia/execucao` (somatórios empenhado/liquidado/pago),
  `/transparencia/licitacoes`, `/transparencia/contratos`, `/transparencia/convenios` com dados.
- Público com a fonte DESLIGADA (outra entidade): páginas sem dados APLIC (não vazam).
- Conferir somatórios contra o validador do APLIC (E:\) por amostragem.

## Rollback

- Reverter o deploy de API/Web para a imagem anterior.
- As migrations são aditivas; para neutralizar a feature sem reverter schema, basta deixar
  `aplic_habilitado=false` em todas as entidades (estado padrão). Drop de colunas/tabelas só
  se for descartar a feature por completo.
