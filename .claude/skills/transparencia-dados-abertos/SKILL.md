---
name: transparencia-dados-abertos
description: Requisitos legais e técnicos do Portal da Transparência (transparência ativa) e exportação em dados abertos deste projeto. Use SEMPRE que a tarefa envolver transparência, receitas/despesas, licitações, contratos, folha, dados abertos, exportação CSV/JSON, ETL contábil ou integração com sistema de contabilidade pública. Acione a qualquer menção a transparência, LC 131, LRF, dados abertos, despesas, licitação ou ETL.
---

# Transparência ativa + dados abertos

Transparência ativa é exigida por **LC 131/2009** + **LRF (LC 101/2000)**. É o módulo com a integração mais difícil: a origem dos dados é o sistema contábil da prefeitura.

## O que precisa ser publicado (mínimo)
Receitas e despesas (em tempo real — até 24h após o registro), licitações e seus editais, contratos e convênios, folha de pagamento e diárias, repasses, e relatórios PPA/LDO/LOA, RREO e RGF. Tudo com histórico e busca.

## Dados abertos (obrigatório)
- Exportação em **CSV e JSON** e **API pública** dos mesmos dados.
- Dados primários, íntegros, atualizados, em formato aberto e legível por máquina; com dicionário de dados.
- Licença aberta declarada.

## Arquitetura de ingestão
1. **n8n** orquestra o ETL a partir do sistema contábil (cada prefeitura usa um — SIAFIC/empresas privadas). Conectores por fornecedor.
2. Normalize para um modelo canônico (tabelas `transp_*` com `tenant_id` + RLS).
3. Jobs pesados via fila `integracoes` (`JOB_TRANSPARENCIA_SYNC`).
4. Publicação no portal via páginas **ISR** com cache por tenant; a API de dados abertos serve do mesmo modelo canônico.
5. Registre cada sincronização (origem, volume, timestamp) para rastreabilidade.

## Cuidados
- Idempotência: reprocessar uma carga não duplica dados (chave natural por exercício/empenho/etc.).
- Defasagem: exiba a data/hora da última atualização por conjunto.
- Performance: índices por `tenant_id` + período; cache agressivo (dado público, mudança previsível).
- Acessibilidade dos relatórios (tabelas navegáveis, exportação).

> Sempre confirme o leiaute/origem do sistema contábil do tenant antes de escrever o conector — não há padrão único nacional.
