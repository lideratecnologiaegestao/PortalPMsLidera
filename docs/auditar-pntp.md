---
description: Audita o portal contra a matriz do PNTP e desenvolve o que falta para o selo Diamante
argument-hint: [tenant/prefeitura ou URL do portal — opcional]
---

Atue como `pntp-auditor` para levar o portal à NOTA MÁXIMA do PNTP (selo Diamante). Alvo: **$ARGUMENTS** (se vazio, use o tenant-modelo).

1. Leia `docs/13-pntp-criterios.md` e **confirme a matriz oficial vigente** (Atricon/PNTP) por web.
2. Audite o estado atual por dimensão e critério (specs, código, banco e, se houver URL, o portal em execução + acessibilidade via Playwright), avaliando os 5 itens de verificação.
3. Entregue o **relatório de conformidade**: índice projetado, nível de selo, tabela por dimensão, **essenciais não atendidos (bloqueantes)** e lacunas priorizadas por impacto na nota.
4. Desenvolva/coordene as entregas (delegando migrations ao `dba-postgres-rls` e seguindo a fronteira de camadas), priorizando essenciais e dimensões de peso 4/3, e os itens transversais (atualidade, série histórica, download, filtro).
5. Evolua o **painel de conformidade PNTP** (índice por tenant + dossiê de evidências).
6. Reexecute a auditoria e mostre **antes → depois**. Só declare Diamante com 100% dos essenciais e evidência por critério.
