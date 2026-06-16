# 02 — Requisitos

## Requisitos funcionais (por módulo)

### Plataforma / Admin
- Cadastro e gestão de tenants (prefeituras), domínios, planos.
- Gestão de usuários, secretarias e papéis por tenant.
- Painel de filas (BullBoard) restrito a admin.
- Auditoria consultável de ações sensíveis.

### CMS dinâmico
- Páginas compostas por blocos configuráveis (hero, serviços, notícias, galeria, "História do Município").
- Edição de identidade visual (tema) com pré-visualização e validação de acessibilidade.
- Publicação/despublicação e SEO por página.

### ESIC (LAI)
- Registro de pedido de acesso à informação (autenticado via gov.br; nível mínimo configurável).
- Triagem, encaminhamento à secretaria, resposta, indeferimento, atendimento parcial.
- Prorrogação justificada (+10 dias). Recursos de 1ª e 2ª instância.
- Protocolo, acompanhamento e notificação ao cidadão. Controle de sigilo.

### Ouvidoria (Lei 13.460)
- Manifestações: denúncia (anônima permitida), reclamação, sugestão, elogio, solicitação.
- Tratamento, resposta e conclusão; pesquisa de satisfação.
- Carta de Serviços ao Usuário.

### Transparência
- Publicação de receitas/despesas (até 24h), licitações, contratos, folha, diárias, PPA/LDO/LOA, RREO/RGF.
- Exportação em dados abertos (CSV/JSON) e API pública com dicionário de dados.
- ETL a partir do sistema contábil (via n8n).

### Diário Oficial
- Publicação de edições com **assinatura digital ICP-Brasil**, imutabilidade e carimbo de tempo.
- Busca por número/data/assunto; arquivo histórico.

### Serviços
- Catálogo de serviços com requisitos, prazos e canais (Carta de Serviços).
- Agendamento/solicitação quando aplicável.

### App do Cidadão
- Denúncias georreferenciadas (buraco, terreno abandonado, animal abandonado, iluminação, lixo, etc.) com foto e GPS.
- Mapa de chamados próximos; acompanhamento por protocolo; push.

### IA assistida
- Triagem/classificação de manifestações; sugestão de roteamento e prioridade.
- Busca semântica (RAG) na transparência e na Carta de Serviços; chatbot.
- OCR de documentos.

## Requisitos não-funcionais

| Categoria | Requisito |
|-----------|-----------|
| **Acessibilidade** | WCAG 2.1 AA, Design System gov.br, VLibras, ABNT NBR 17225. Bloqueante no tema. |
| **Desempenho** | Páginas públicas via ISR/cache; p95 < 500 ms em leitura cacheada; registro de manifestação p95 < 1 s. |
| **Disponibilidade** | Alvo 99,9% para o portal público; degradação graciosa do app offline-first. |
| **Segurança** | Ver [04](04-seguranca.md). RLS, RBAC, OWASP ASVS, segredos fora do git. |
| **Privacidade** | Ver [06](06-lgpd-gdpr.md). LGPD/GDPR por design. |
| **Escalabilidade** | Ver [09](09-escalabilidade.md). Horizontal na API/web; filas para picos. |
| **Observabilidade** | Logs estruturados, métricas, tracing, alertas de SLA e de erro. |
| **Conformidade legal** | LAI, LC 131/LRF, Lei 13.460, ICP-Brasil para Diário Oficial. |
| **Localização** | pt-BR; valores monetários e datas no padrão brasileiro. |
| **Auditabilidade** | Trilha imutável de eventos de manifestação e `audit_log` de ações sensíveis. |
| **Portabilidade** | Containerizado; sem dependência de provedor específico além do object storage/IA. |

## Critérios de aceite globais (DoD)

Toda feature: spec atendida · testes (incl. isolamento RLS) · acessibilidade quando há UI · base legal LGPD quando há dado pessoal · auditoria em ação sensível · docs atualizados · CI verde.
