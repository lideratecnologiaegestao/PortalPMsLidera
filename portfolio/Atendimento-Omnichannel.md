# Atendimento Omnichannel com IA — Lidera Portal de Prefeitura

**5 canais. Uma caixa unificada. Bot de IA 24 horas.**

---

## O problema que resolvemos

Cidadaos tentam falar com a prefeitura pelo WhatsApp, pelo site, pelo Instagram — e nao recebem resposta. Cada canal fica em uma tela diferente. A equipe nao tem historico. Protocolos se perdem. A prefeitura perde pontuacao em editais por nao ter canal de atendimento digital adequado.

---

## A solucao: Atendimento Omnichannel integrado ao Portal

O modulo de Atendimento Omnichannel unifica todos os canais digitais da prefeitura em uma unica caixa de entrada, com bot de IA que atende 24 horas e escala para um atendente humano quando necessario. Tudo dentro do mesmo Portal que a prefeitura ja usa — sem ferramenta externa, sem custo adicional por canal.

---

## 5 canais numa unica caixa

| Canal | Como chega ao cidadao | Requisito tecnico |
|---|---|---|
| **Site / Widget** | Janela de chat no proprio portal da prefeitura | Nenhum — ativo por padrao |
| **WhatsApp API Oficial** | Numero profissional (Cloud API Meta) | Conta Meta Business verificada + numero homologado |
| **Instagram Direct** | Caixa de entrada do perfil profissional da prefeitura | Conta Instagram Profissional vinculada ao Meta Business |
| **Facebook Messenger** | Pagina oficial da prefeitura no Facebook | Pagina do Facebook administrada pela prefeitura |
| **Telegram** | Bot Telegram da prefeitura | Criacao via @BotFather (gratuito) |

Todas as conversas — de qualquer canal — chegam ao mesmo painel administrativo, com historico completo e identificacao do canal de origem.

---

## Bot de IA 24 horas

O bot nao e um menu de opcoes fixas. Ele usa IA generativa (Anthropic Claude) com a base de conhecimento da propria prefeitura para:

- Responder perguntas sobre servicos, documentos, horarios e requisitos.
- Abrir manifestacoes de ouvidoria (denuncia, reclamacao, sugestao, elogio) e devolver protocolo + chave de acompanhamento na hora.
- Consultar o andamento de protocolos existentes.
- Reconhecer quando o cidadao precisa de atendimento humano e transferir a conversa para a fila — com notificacao imediata ao atendente.

O bot aprende com o conteudo que o gestor cadastra: FAQs, artigos, normas, servicos. Sem programacao. Sem TI.

---

## Console do atendente (caixa unificada)

O servidor da prefeitura acessa um painel unico com:

- Fila de conversas aguardando atendimento humano, com filtro por canal e por secretaria.
- Historico completo da conversa com o bot antes da transferencia.
- Resposta direta ao cidadao pelo painel — a mensagem chega no canal de origem do cidadao (WhatsApp, Telegram etc.).
- Distribuicao por secretaria: o atendimento de saude vai para a equipe de saude; o de obras, para a equipe de obras.
- Relatorios de volume, tempo de resposta e canais mais utilizados.

---

## Multi-numero e multi-canal

A prefeitura pode ter:

- **1 numero profissional WhatsApp** para todos os atendimentos (mais comum em municipios menores).
- **Varios numeros ou canais por secretaria** — o sistema gerencia todos na mesma tela.

Cada canal e configurado com credenciais proprias, cifradas em repouso. Adicionar ou remover um canal nao interrompe os outros.

---

## Consumo de templates WhatsApp

Para envio ativo (notificacoes pro-ativas) via WhatsApp API Oficial, a Meta exige templates pre-aprovados com consumo de credito (HSM). O sistema:

- Registra o consumo de templates por canal.
- Alerta o operador quando o saldo de creditos esta proximo do limite configurado.
- Mantem historico de envios para auditoria.

---

## App instalavel (PWA)

O portal do cidadao e uma PWA (Progressive Web App): o cidadao pode instalar o portal da sua prefeitura diretamente na tela inicial do celular, sem App Store. O widget de atendimento funciona na PWA da mesma forma que no site.

---

## Aderencia a editais

Para prefeituras que participam de editais de modernizacao municipal (TR padrão TCE-MT e similares), o modulo atende diretamente os blocos de:

- Canal digital de atendimento ao cidadao (bloco 13 nos modelos TR mais recentes).
- Integracao com canais de mensageria ampliada (WhatsApp API Oficial — exigencia de API oficial, nao versao nao autorizada).
- Registro e rastreabilidade de atendimentos com protocolo.
- Acessibilidade no canal web (WCAG 2.1 AA).

A adocao da **API Oficial da Meta** (Cloud API) — e nao versoes nao homologadas — e um diferencial relevante em processos licitatorios que exigem conformidade com termos de servico das plataformas.

---

## Multi-tenant + LGPD

- Cada prefeitura tem seus proprios canais, suas proprias conversas e seu proprio historico. Nenhum dado de uma prefeitura e visto por outra (isolamento por Row Level Security no banco).
- Credenciais de API (tokens, secrets) sao cifradas com AES-256-GCM em repouso. Nenhum colaborador da Lidera ve o valor bruto das chaves.
- Dados de conversa seguem as regras de minimizacao e retencao da LGPD. Denuncias anonimas nao armazenam identificacao do cidadao.
- Base legal: execucao de servico publico (art. 7, inciso III da LGPD) e cumprimento de obrigacao legal.

---

## Resumo dos diferenciais

- 5 canais numa caixa unificada, sem ferramentas externas.
- Bot de IA que executa acoes (abre protocolo, consulta andamento) — nao apenas responde.
- API Oficial Meta (WhatsApp, Instagram, Messenger) — conformidade com editais.
- Distribuicao por secretaria e historico completo.
- Alerta de creditos de template WhatsApp.
- Chaves cifradas em repouso, isolamento por prefeitura, LGPD nativo.
- Incluido no Portal de Prefeitura sem custo adicional de modulo.

---

**Lidera Tecnologia e Gestao**
www.lideratecnologia.com.br | comercial@lideratecnologia.com.br | prefeitura.lidera.app.br
