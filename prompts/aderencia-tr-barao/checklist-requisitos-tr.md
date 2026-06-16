# Checklist de Requisitos — TR Barão de Melgaço/MT

Rastreador de cobertura para o `PROMPT-aderencia-tr-barao.md`. Marque cada item como **[A] Atende**, **[P] Parcial**, **[N] Não atende** ou **[NS] Não-software**, com o caminho do código/tela/endpoint. Meta: **100% dos itens de software = [A]**.

## 1. Gestão de usuários, grupos e segurança de acesso
- [ ] Adicionar/editar/excluir usuário (nome, e-mail, senha forte, grupo)
- [ ] Grupos com permissões granulares; níveis de acesso ao backend (completo/parcial/sem)
- [ ] Sessões ativas / usuários online
- [ ] Acompanhamento de atividades por usuário
- [ ] Relatórios de usuários (registrados, ativos/inativos, atividades)
- [ ] Política de senha forte + expiração periódica
- [ ] Rastreamento de tentativas de login e alerta de atividades suspeitas

## 2. SEO
- [ ] URLs amigáveis **sem ID** (slugs)
- [ ] Meta tags personalizadas por página/artigo
- [ ] Sitemap XML automático
- [ ] Integração Google Analytics
- [ ] Open Graph
- [ ] Cache de páginas/conteúdo estático e dinâmico

## 3. Segurança / Firewall / WAF
- [ ] HTTPS/SSL/TLS
- [ ] Proteção anti-brute-force (limite + bloqueio temporário de IP)
- [ ] Proteção anti-SQLi e XSS
- [ ] Backup regular + restauração
- [ ] Logs de atividades auditáveis
- [ ] Modo de manutenção
- [ ] Bloqueio por IP/país (borda) e liberação de IPs confiáveis
- [ ] WAF (ataques web comuns) + notificações de segurança
- [ ] Verificação de integridade de arquivos
- [ ] Restrição de acesso à área admin (regras/IP)

## 4. Notícias, galerias (foto/áudio/vídeo)
- [ ] Notícias com texto, imagem, links, anexos (PDF/Vídeo/DOC/Planilha/Áudio)
- [ ] Galeria de fotos (álbuns)
- [ ] Galeria de áudio (streaming/nuvem/host)
- [ ] Galeria de vídeo (YouTube/host)
- [ ] Datas: publicação/modificação/encerramento
- [ ] Metadados (descrição, palavras-chave) + SEO
- [ ] Campos: título, categoria, publicado S/N, nível de acesso, autor, fonte, capa, legenda, crédito
- [ ] Caixa de HTML com preview

## 5. SIC – publicação de documentos
- [ ] Upload DOC/DOCX/ODT/PDF/XLS/XLSX/ZIP + bloqueio de extensões perigosas
- [ ] Datas de publicação/modificação/fim
- [ ] Metadados (descrição, palavras-chave)
- [ ] **Escaneamento/indexação full-text do conteúdo do arquivo** (busca)
- [ ] Categorias múltiplas e **hierárquicas** (categoria-pai)
- [ ] Categorias restritas por grupo (nível de acesso)
- [ ] Descrição em HTML + código-fonte/preview
- [ ] Publicar/não publicar; alterar criador da categoria
- [ ] Filtro de pesquisa no backend (título, descrição, categoria, nível, estado)

## 6. Banners e Popups
- [ ] Banners: título, datas início/fim, estado, link, HTML/preview
- [ ] Popups: imagem (JPG/PNG/GIF) e vídeo (host/YouTube/Vimeo/redes)
- [ ] Popups: links direcionáveis, visibilidade (ativar, mostrar título)
- [ ] Popups: estilos (bordas, caixa, overlay, imagem de fundo)
- [ ] Popups: exibição por página específica + datas/hora e intervalo

## 7. Ouvidoria
- [ ] Manifestação completa; criação automática de login por ticket (ou protocolo+chave mantendo anonimato)
- [ ] Login existente faz várias manifestações; troca de senha
- [ ] Notificação automática ao ouvidor (e-mail) a cada criação/alteração
- [ ] Gestão do ticket pelo ouvidor (status, categoria, setor)
- [ ] Filtros de pesquisa avançados (data, tipo, status, setor…)
- [ ] Histórico completo de manifestações do usuário
- [ ] Gráficos dinâmicos por período (tipo, setor, identificação, meio, prioridade, status, sigilo)
- [ ] Export de gráficos em **imagem e CSV**; períodos anual/semestral/quadrimestral
- [ ] Acessibilidade
- [ ] Pesquisa de satisfação + export **PDF/Excel**
- [ ] Publicação de relatórios **TCE-MT** (PDF/DOCX)

## 8. Criação de formulários
- [ ] Construtor visual (arrastar-e-soltar), interface intuitiva
- [ ] Personalização (campos, layout, estilos)
- [ ] Tipos de campo (texto, área, select, checkbox, rádio, upload)
- [ ] Validações (obrigatório, e-mail/telefone/CPF, comprimento, custom)
- [ ] Gerenciamento de envios (filtragem/ordenação)
- [ ] CAPTCHA/anti-spam
- [ ] Responsivo (mobile)
- [ ] Permissões de acesso (criar/ver/enviar)
- [ ] Mensagem de agradecimento/confirmação
- [ ] Notificações por e-mail (com anexos, CC/BCC)
- [ ] Armazenamento seguro + export **Excel/XML/CSV**

## 9. Criação de páginas (CMS)
- [ ] Construtor arrastar-e-soltar
- [ ] Design responsivo automático
- [ ] Elementos prontos (botões, sliders, galerias, tabelas, listas…)
- [ ] Templates aprovados pelo órgão (importáveis/personalizáveis)
- [ ] Personalização de estilos/cores/fontes/layout sem código
- [ ] Backup/restauração de páginas
- [ ] SEO por página (título, descrição, URL, palavras-chave, meta tags)
- [ ] HTML/CSS/JS custom
- [ ] Conteúdo dinâmico/feeds sociais
- [ ] Animações/efeitos

## 10. LGPD
- [ ] Aviso/política de privacidade na coleta
- [ ] Consentimento explícito ativo
- [ ] Direitos do titular (acesso, retificação, exclusão, portabilidade)
- [ ] Segurança (criptografia, firewall, monitoramento)
- [ ] Privacy by design (minimização, pseudonimização/anonimização)
- [ ] Exportação de dados
- [ ] Auditorias/relatórios de conformidade
- [ ] Comunicação de incidentes

## 11. Carta de Serviços (Lei 13.460)
- [ ] Serviços por categoria Cidadão/Empresa/Servidor
- [ ] Avaliação por estrelas (1–5)
- [ ] Lista dos serviços mais avaliados
- [ ] Pesquisa de satisfação
- [ ] Layout intuitivo, responsivo, acessível (WCAG), cards por serviço
- [ ] Separação por categorias + busca/filtros
- [ ] Gestão dos serviços (add/editar/remover, horários, requisitos)
- [ ] Notificação de novos serviços + acompanhamento de status

## 12. Governo Digital
- [ ] Solicitação 100% online; login automático por solicitação (ou anônimo)
- [ ] Login existente faz várias solicitações; troca de senha por e-mail
- [ ] Recuperação de protocolo por e-mail (lista por e-mail)
- [ ] Notificação ao responsável a cada solicitação/movimentação
- [ ] Gerenciamento pelo responsável (status, categoria)
- [ ] Filtros avançados
- [ ] **Acompanhar protocolo e enviar mensagem SEM login (pela home)**
- [ ] Separação por departamento (admin vê só o seu)
- [ ] Gráficos por período exportáveis (imagem e CSV/Excel)
- [ ] Acessibilidade; pesquisa de satisfação + export PDF/Excel

## 13. Chatbot omnichannel + atendimento humano
- [ ] Console admin: criação/gestão de usuários (admin/agente/usuário) por permissão
- [ ] Caixa de entrada centralizada
- [ ] Notificações em tempo real (áudio)
- [ ] Filtros (tags, departamentos, usuários)
- [ ] Departamentos + atribuição de agentes
- [ ] Tags, marcar como lida, arquivar
- [ ] Transcrição de conversas (.txt)
- [ ] Mensagens ricas (botões, seletores, links)
- [ ] Suporte a mídias e emojis
- [ ] Ativação automática do bot após atendimento humano
- [ ] Transferência de conversa para departamento/atendente
- [ ] Notas internas (não visíveis ao cidadão)
- [ ] Verificação de horário de atendimento (fora do horário, segue no bot)
- [ ] Widget 24h em Portal/Governo Digital/Ouvidoria/Carta de Serviços/SIC
- [ ] Integração com o banco (consultar protocolos/solicitações) + histórico

## 14. Webmail (NS — integrar/administrar; servidor é infra) já temos um webmail
- [ ] ADR make-or-buy (Zimbra gerenciado)


## 15. Requisitos técnicos mínimos (seção 8)
- [ ] Responsivo, acessível, seguro, navegadores modernos, painel admin, permissões, logs, backup, HTTPS, SEO, export de dados
- [ ] Sem dependência de tecnologia obsoleta; **portabilidade/export ao fim do contrato**

