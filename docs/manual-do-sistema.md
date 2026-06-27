# Manual do Sistema — Portal da Prefeitura

> Versão: 2026-06-26
> Público: servidores e gestores municipais que operam o painel administrativo.
> Este documento é também usado para treinar a IA assistente: cada seção é autocontida.

---

## Primeiros passos

### O que é o portal

O portal é uma plataforma SaaS multi-tenant que serve a prefeitura na internet. Por "multi-tenant" entende-se que o mesmo sistema atende vários municípios ao mesmo tempo, cada um com domínio, identidade visual e dados completamente isolados. O servidor acessa apenas os dados do próprio município.

O painel administrativo (endereço `/admin`) é a área restrita onde servidores e gestores gerenciam todo o conteúdo, atendimento e conformidade do portal público.

### Como fazer login

1. Acesse `https://[dominio-da-prefeitura]/admin` no navegador.
2. A tela de login aparece automaticamente para quem não está autenticado.
3. Há dois métodos de autenticação disponíveis:
   - **Entrar com gov.br** — recomendado para servidores com conta gov.br (usa OIDC/PKCE, nenhuma senha é salva no portal).
   - **E-mail e senha** — para servidores sem conta gov.br cadastrados diretamente pelo administrador.
4. Após autenticar, o sistema redireciona para o painel correspondente ao seu papel.
5. Para sair, clique no seu nome no canto superior direito e escolha "Sair".

### Autocadastro e solicitação de elevação de acesso

Qualquer servidor pode criar uma conta com papel `cidadao` pelo portal público. Para operar o painel administrativo é necessário ter um papel de servidor. O fluxo é:

1. Acesse o portal público e cadastre-se (ou entre com gov.br).
2. No painel do cidadão (`/cidadao`), localize a opção **Solicitar acesso como servidor**.
3. Preencha o formulário declarando nome, cargo e lotação (secretaria).
4. A solicitação aparece para `admin_prefeitura`, `gestor` ou `super_admin` em **Solicitações de Acesso** no menu admin.
5. Após aprovação, seu papel é elevado e você passa a acessar o painel admin.

### Papéis e o que cada um pode fazer

| Papel | Nome exibido | O que pode fazer |
|---|---|---|
| `super_admin` | Super Admin | Tudo. Acessa qualquer tenant, configurações globais da plataforma. |
| `admin_prefeitura` | Administrador | Tudo dentro do próprio município: usuários, tema, módulos, aprovação de acesso. |
| `ti` | TI | Configurações técnicas, assistente IA, integrações. |
| `gestor` | Gestor | Conteúdo e módulos da secretaria. Pode aprovar solicitações de acesso. |
| `ouvidor` | Ouvidor | Apenas Ouvidoria, e-SIC e módulos associados (ADR-0005). |
| `assistente_ouvidoria` | Assistente de Ouvidoria | Idem ouvidor, sem poder aprovar solicitações de acesso. |
| `servidor` | Servidor | Módulos básicos de conteúdo. Não vê Ouvidoria/e-SIC. |
| `cidadao` | Cidadão | Sem acesso ao painel admin. |

**Regra de isolamento (ADR-0005):** os itens de menu Painel do Ouvidor, Ouvidoria, e-SIC e Minhas Atribuições só aparecem para `ouvidor`, `assistente_ouvidoria` e `super_admin`. Outros papéis não enxergam esses itens, mesmo que tentem acessar a URL diretamente.

### Estrutura da tela

Após o login, a tela tem três áreas:

- **Topbar** (faixa superior): nome do usuário, papel e botão de logout.
- **Sidebar** (painel lateral esquerdo): menu de navegação agrupado por categoria. Em dispositivos móveis, o menu abre ao tocar no ícone de hamburguer.
- **Área de conteúdo** (centro-direita): a página do módulo selecionado.

Os grupos do menu lateral, na ordem em que aparecem, são: **Geral**, **Página Inicial**, **Conteúdo**, **Transparência**, **Atendimento e Ouvidoria**, **Inteligência Artificial**, **LGPD e Privacidade**, **Administração**, **Ajuda** e **Conta**.

---

## Geral

### Painel

**O que é:** página inicial do painel admin com visão consolidada (BI) do município — KPIs operacionais, alertas, gráficos e atalhos rápidos.

**Quem acessa:** todos os papéis com acesso ao painel admin.

**Como chegar:** menu lateral > Geral > **Painel**.

**O que exibe:**

- KPIs principais: notícias publicadas no mês, comentários pendentes, manifestações abertas e vencidas, chamados abertos, atendimentos em aberto, respostas de formulários no mês, documentos publicados, usuários ativos, sessões online, solicitações LGPD pendentes, incidentes LGPD abertos, índice PNTP e selo atual.
- Gráficos de tendência: entradas vs. resolvidas por mês (manifestações/chamados).
- Distribuição de manifestações por status, chamados por categoria, manifestações por secretaria.
- Fila de prazos iminentes: manifestações com prazo próximo do vencimento.
- Últimas notícias publicadas e comentários recentes aguardando moderação.
- Alertas ativos (nível crítico, alerta ou informativo) com link para a tela de resolução.
- Nota pessoal do gestor (campo de anotações livre, salvo por usuário).

**Dicas:**

- O índice PNTP exibido no KPI é um resumo. Para o detalhamento por dimensão e critério, acesse **Transparência > Conformidade PNTP**.
- Os dados são calculados de forma tolerante a falha: se um módulo ainda não foi utilizado, o KPI aparece como zero sem travar o painel.

---

## Página Inicial

### Layout da Home

**O que é:** configura a aparência da seção "Acesso Rápido" e do painel lateral/slider na página inicial.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Página Inicial > **Layout da Home**.

**O que é possível configurar:**

- **Acesso Rápido:** número de colunas (1 ou 2), cards por linha, ícone, forma e cor de destaque dos cards.
- **Slider lateral:** tipo (imagem, HTML, vídeo, YouTube ou enquete), imagem, link e conteúdo do slider.
- **Analytics:** ID do Google Analytics (GA4).
- **SEO:** URL da imagem OG (Open Graph) padrão.
- **Modo manutenção:** ativa aviso de manutenção no portal e define a mensagem exibida ao visitante.
- **Atalhos de Acesso Rápido:** lista de links rápidos com ícone, rótulo, descrição e URL. Podem ser reordenados e ativados/desativados individualmente.

**Passo a passo para adicionar um atalho:**

1. Role até a seção "Atalhos do Acesso Rápido".
2. Clique em **Novo atalho**.
3. Preencha rótulo, descrição (opcional), URL e escolha o ícone.
4. Marque como ativo e salve.
5. Clique em **Salvar layout** para aplicar todas as alterações da página.

---

### Banners

**O que é:** gerencia os banners do carrossel/destaque exibidos na página inicial do portal público.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Página Inicial > **Banners**.

**Passo a passo:**

1. Clique em **Novo banner** para abrir o formulário.
2. Preencha título, subtítulo (opcional), link de destino e faça o upload da imagem pelo seletor de mídia.
3. Defina a **ordem** de exibição (número menor aparece primeiro).
4. Marque **Ativo** para que o banner apareça no portal.
5. Clique em **Salvar**.
6. Para editar, clique no banner na lista e altere os campos.
7. Para excluir, use o botão "Excluir" e confirme.

**Dicas:**

- Banners inativos ficam salvos mas não aparecem no portal.
- Use imagens com proporção 16:9 para melhor resultado visual.

---

### Pop-ups

**O que é:** gerencia janelas de aviso que aparecem para o visitante ao acessar o portal.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Página Inicial > **Pop-ups**.

**Passo a passo:**

1. Clique em **Novo popup**.
2. Preencha título, conteúdo (HTML ou texto), e defina datas de início e fim da exibição.
3. Marque **Ativo** para ativar.
4. Salve e verifique no portal público.

**Dicas:**

- O popup é exibido uma vez por sessão do visitante.
- Use popups com parcimônia: muitos avisos afastam o cidadão.
- Para popups vinculados a uma campanha (com período, recorrência e tema), use o módulo **Campanhas**.

---

### Enquetes

**O que é:** módulo de enquetes (polls) anônimas exibidas no portal. Serve para colher opiniões dos cidadãos.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Página Inicial > **Enquetes**.

**Passo a passo:**

1. Clique em **Nova enquete**.
2. Preencha a pergunta e as opções de resposta (mínimo 2).
3. Defina datas de início e fim.
4. Marque **Ativa**.
5. Salve. A enquete aparece no slider da home se configurada no Layout da Home.

**Dicas:**

- Os resultados são anônimos — nenhum dado pessoal do votante é coletado.
- Uma enquete encerrada exibe o resultado final e não aceita novos votos.

---

### Campanhas

**O que é:** motor de campanhas institucionais que permite criar ações temáticas e sazonais (ex.: campanha de dengue, meses coloridos, datas cívicas) com período, recorrência e efeitos visuais coordenados no portal. Uma campanha pode combinar várias capacidades ao mesmo tempo: tema de cores, faixa no topo, banner de imagem, pop-up, página vinculada, efeito visual (overlay) e selo.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Página Inicial > **Campanhas**.

**Entendendo os status da campanha:**

| Status | Significado |
|---|---|
| Rascunho | Criada mas ainda não agendada nem ativa. |
| Agendada | Ativa no futuro, dentro do período definido. |
| Ativa | Em execução no momento. |
| Pausada | Interrompida manualmente antes do fim. |
| Encerrada | Período encerrado. |
| Arquivada | Removida da listagem ativa. |

**Capacidades configuráveis por campanha:**

| Capacidade | O que faz |
|---|---|
| Tema de cores | Substitui as cores primária, de destaque e secundária do portal durante o período. Pode aplicar em todo o portal ou apenas na home. O backend valida o contraste WCAG AA — cores que reprovarem são rejeitadas. |
| Faixa (ribbon) no topo | Exibe uma faixa colorida com mensagem e link opcional no topo de todas as páginas. |
| Banner de imagem | Insere um banner na home (topo ou seção) com imagem, alt acessível e link. |
| Pop-up modal | Exibe um popup com título, descrição, bullets, imagem, call-to-action e frequência de exibição (sempre, por dia ou por sessão). |
| Página vinculada | Vincula uma página do CMS à campanha; pode ser despublicada automaticamente ao fim do período. |
| Efeito visual | Overlay interativo na tela. Dois efeitos disponíveis: `aedes-overlay` (jogo de combate ao mosquito da dengue) e `copa-overlay` (bolas, bandeiras, confete e fita para Copa). |
| Selo | Exibe um selo textual colorido no portal durante o período. |

**Passo a passo para usar um preset da biblioteca:**

1. Na seção "Biblioteca de presets", filtre por categoria (Saúde, Cívico, Sazonal, Fiscal, Ambiental, Cultural, Administrativo) se desejar.
2. Clique em **Usar / Instalar** no preset desejado. O sistema cria a campanha como rascunho e abre o editor.
3. Ajuste período, prioridade e capacidades conforme necessário.
4. Clique em **Salvar**. Para ativar imediatamente, use o botão **Ligar** na listagem.

**Passo a passo para criar uma campanha do zero:**

1. Clique em **Nova campanha**.
2. Preencha o nome e, opcionalmente, datas de início e fim.
3. Defina a **prioridade** (número maior = maior precedência quando há campanhas simultâneas).
4. Escolha a **recorrência**: sem recorrência, anual (repete todo ano nas mesmas datas) ou sazonal (definindo mês-dia de início e fim).
5. Habilite as capacidades desejadas (checkboxes) e preencha os campos de cada uma.
6. Clique em **Salvar**. A campanha fica como rascunho.
7. Na listagem, clique em **Ligar** para ativar.

**Dicas:**

- Em anos eleitorais (anos pares), o sistema exibe um aviso sobre as vedações da Lei das Eleições (Lei 9.504/1997). Campanhas de cunho político-partidário ou que promovam realizações do governo nos 3 meses anteriores ao pleito podem ser ilegais. Consulte o jurídico do município. O sistema não garante conformidade eleitoral automaticamente.
- Quando duas campanhas ativas têm a mesma capacidade, prevalece a de maior prioridade.
- Somente o `super_admin` pode semear (recarregar) a biblioteca global de presets.

---

## Conteúdo

### Notícias

**O que é:** gerencia as notícias publicadas no portal público.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Notícias**.

**Passo a passo:**

1. Clique em **Nova notícia**.
2. Preencha título, subtítulo (chapéu), corpo da notícia (editor de texto), categoria e tags.
3. Selecione a imagem de capa pelo seletor de mídia.
4. Defina a data de publicação (pode ser futura para agendamento).
5. Marque **Publicado** para tornar a notícia visível no portal.
6. Clique em **Salvar**.
7. Notícias podem ser editadas a qualquer momento. A exclusão é permanente.

**Dicas:**

- Notícias não publicadas ficam como rascunho e só o admin as vê.
- O campo "Destaque" coloca a notícia em posição de destaque na página inicial.
- Comentários de cidadãos nas notícias são moderados pelo módulo **Comentários**.

---

### Comentários

**O que é:** moderação dos comentários enviados pelos cidadãos nas notícias do portal. O cidadão precisa estar logado no portal para comentar. Cada comentário passa por moderação antes de ser exibido publicamente.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Comentários**.

**Status dos comentários:**

| Status | Significado |
|---|---|
| Pendente | Aguardando revisão do moderador. |
| Aprovado | Publicado e visível no portal. |
| Reprovado | Rejeitado e não exibido ao público. |

**Passo a passo:**

1. Use os botões de filtro no topo (Pendente, Aprovado, Reprovado) para selecionar a fila desejada.
2. Para cada comentário, leia o conteúdo e o contexto (notícia de origem e autor).
3. Se houver análise automática da IA (moderação automática), o sistema exibe o resultado e a categoria de violação detectada. A decisão final é sempre do moderador humano.
4. Clique em **Aprovar** para publicar o comentário no portal.
5. Clique em **Reprovar** para rejeitar.

**Dicas:**

- Comentários reprovados automaticamente pela IA (por conteúdo ofensivo, spam, baixo calão, código malicioso ou sem nexo) aparecem com um selo de "Moderação automática". Você pode aprová-los manualmente se considerar adequado.
- Comentários aprovados podem ser reprovados posteriormente e vice-versa.
- Não há campo de resposta do moderador ao cidadão nesta tela — o canal de interação com o cidadão é o Chat Omnichannel ou a Ouvidoria.

---

### Secretarias

**O que é:** gerencia as secretarias e órgãos municipais exibidos no portal. Cada secretaria pode ter página pública completa com descrição, equipe, notícias, galeria e documentos próprios.

**Quem acessa:** `admin_prefeitura`, `super_admin` (gestores podem editar a própria secretaria).

**Como chegar:** menu lateral > Conteúdo > **Secretarias**.

**Passo a passo:**

1. Clique em **Nova secretaria**.
2. Preencha nome, sigla, tipo (secretaria, autarquia, fundação, etc.), descrição e endereço.
3. Adicione o titular (secretário/diretor), telefone e e-mail de contato.
4. Selecione logo ou imagem da secretaria.
5. Marque **Ativa** e **Exibir no menu** conforme necessário.
6. Salve.

**Dicas:**

- A página `/institucional/estrutura` é gerada automaticamente a partir das secretarias cadastradas.
- Secretarias do tipo "gabinete" alimentam a seção de autoridades na estrutura organizacional.

---

### Galeria

**O que é:** módulo de galerias de fotos e vídeos do portal. As galerias podem ser associadas a uma secretaria ou ao portal geral.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Galeria**.

**Passo a passo:**

1. Clique em **Nova galeria**.
2. Preencha título, descrição e selecione a secretaria (opcional).
3. Adicione fotos pelo seletor de mídia ou insira links de vídeo (YouTube/MP4).
4. Defina a ordem das mídias arrastando os itens na lista.
5. Publique a galeria.

**Dicas:**

- Vídeos do YouTube são incorporados diretamente pelo link do YouTube.
- A galeria compartilha as mesmas mídias com o portal principal e com as páginas das secretarias.

---

### Mídia

**O que é:** biblioteca centralizada de arquivos: imagens, documentos PDF, vídeos e outros arquivos usados em todo o portal.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Mídia**.

**Passo a passo para enviar uma mídia:**

1. Clique em **Enviar arquivo**.
2. Selecione o arquivo no computador (formatos aceitos variam por tipo).
3. Preencha o título e a descrição (importante para acessibilidade — texto alternativo de imagens).
4. Clique em **Enviar**.
5. A mídia estará disponível no seletor de mídia em todos os módulos.

**Passo a passo para usar uma mídia:**

1. Em qualquer campo com seletor de mídia (ex.: capa de notícia), clique em **Selecionar mídia**.
2. Pesquise ou navegue pela biblioteca.
3. Clique na mídia desejada e confirme.

**Dicas:**

- Nenhum arquivo é enviado diretamente do navegador para o storage — tudo passa pela API do portal, que faz verificação de vírus e controle de acesso.
- O texto alternativo de imagens é obrigatório para conformidade WCAG (acessibilidade).

---

### Páginas

**O que é:** construtor de páginas livres com blocos arrastáveis. Permite criar páginas institucionais, informativos, landing pages e qualquer conteúdo não coberto pelos módulos específicos.

**Quem acessa:** `admin_prefeitura`, `gestor`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Páginas**.

**Passo a passo:**

1. Clique em **Nova página** ou use um **template** pré-existente.
2. Defina o slug (URL da página, ex.: `/sobre-a-cidade`), título e metadados SEO.
3. Adicione blocos arrastando-os para a área de edição. Tipos disponíveis: texto rico, imagem, galeria, vídeo, chamada para ação, cards, destaque, HTML livre, entre outros.
4. Configure cada bloco (texto, cores, links, imagens).
5. Use **Versões** para criar um backup antes de grandes alterações.
6. Publique a página.

**Dicas:**

- Páginas não publicadas ficam como rascunho e não aparecem no portal.
- Versões permitem restaurar o conteúdo de um ponto anterior sem perder o trabalho atual.
- O slug deve ser único dentro do tenant. O sistema avisa se houver conflito.

---

### Diário Oficial

**O que é:** publicação eletrônica do Diário Oficial do Município com matérias estruturadas, busca full-text em português e arquivo histórico.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Diário Oficial**.

**Passo a passo para criar uma edição:**

1. Clique em **Nova edição**.
2. Preencha número, data da edição e título.
3. Adicione matérias (cada matéria tem tipo, número e conteúdo):
   - Tipos disponíveis: Lei, Decreto, Portaria, Resolução, Edital, Licitação, Extrato de Contrato/Convênio, Ato de Pessoal, Aviso/Comunicado, Outro.
4. Salve como rascunho para revisão.
5. Quando pronto, clique em **Publicar**.

**Dicas:**

- Edições publicadas ficam imutáveis para fins de validade jurídica. Use "Revogar" para invalidar uma edição incorreta e publique uma nova edição de retificação.
- A publicação de matérias com validade legal (leis, decretos) exige certificado ICP-Brasil em ambiente de produção — consulte a equipe de TI.
- O histórico de todas as edições fica disponível em `/diario-oficial` no portal público, com busca por texto.

---

### Serviços

**O que é:** gerencia a Carta de Serviços ao Cidadão — catálogo dos serviços prestados pela prefeitura com informações detalhadas para o cidadão.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Serviços**.

**Passo a passo:**

1. Clique em **Novo serviço**.
2. Preencha nome do serviço, descrição, o que é necessário (documentos), como solicitar, onde solicitar, prazo de atendimento, custo (gratuito ou valor), horário e canal (presencial, online, telefone).
3. Selecione a secretaria responsável.
4. Marque **Destaque** para exibir na seção de serviços em destaque na home.
5. Publique.

**Dicas:**

- A Carta de Serviços é exigência da Lei 13.460/2017 (Defesa dos Direitos dos Usuários de Serviços Públicos). Mantenha as informações atualizadas.

---

### Formulários

**O que é:** construtor de formulários personalizados que podem ser publicados no portal para o cidadão preencher (ex.: agendamentos, solicitações, pesquisas).

**Quem acessa:** `admin_prefeitura`, `gestor`, `super_admin`.

**Como chegar:** menu lateral > Conteúdo > **Formulários**.

**Passo a passo:**

1. Clique em **Novo formulário**.
2. Defina título e descrição.
3. Adicione campos arrastando-os para o construtor: texto curto, texto longo, seleção, múltipla escolha, data, arquivo, e-mail, etc.
4. Configure cada campo: rótulo, obrigatório, validação.
5. Ative o **captcha** para evitar spam.
6. Configure o e-mail de notificação (recebido quando alguém responde).
7. Publique.
8. As respostas ficam disponíveis para exportação em CSV, XML ou Excel.

---

## Transparência

### Documentos

**O que é:** motor de publicação de documentos oficiais. Leis, Decretos, Portarias, Resoluções, Relatórios e demais atos são **tipos** dentro deste módulo — não há cadastros separados por tipo. A taxonomia segue o padrão do TCE-MT.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Documentos**.

**Passo a passo:**

1. Clique em **Novo documento**.
2. Selecione o **tipo** (Lei, Decreto, Portaria, etc.) e a **natureza** (conforme taxonomia TCE-MT).
3. Preencha número, ano, ementa e data.
4. Faça upload do arquivo PDF ou informe URL externa.
5. Associe à secretaria, se aplicável.
6. Publique.

**Dicas:**

- O menu público do portal é gerado automaticamente a partir dos tipos de documentos ativos.
- O campo "Downloads" é incrementado automaticamente cada vez que um cidadão abre o PDF.
- Documentos publicados ficam indexados na busca do portal e na busca semântica da IA.

---

### Licitações

**O que é:** gerencia os processos licitatórios publicados no portal de transparência.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Licitações**.

**Passo a passo:**

1. Clique em **Nova licitação**.
2. Preencha número do processo, modalidade (Pregão, Tomada de Preços, etc.), critério de julgamento, objeto, valor estimado e datas (abertura/encerramento).
3. Anexe o edital e demais documentos.
4. Publique.

**Dicas:**

- As modalidades e critérios seguem a nomenclatura oficial (Lei 14.133/2021).
- Licitações publicadas aparecem em `/transparencia/licitacoes` no portal público.

---

### Contratos

**O que é:** gerencia contratos administrativos firmados pela prefeitura.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Contratos**.

**Passo a passo:**

1. Clique em **Novo contrato**.
2. Preencha número, objeto, contratado (CNPJ/CPF e nome), valor, vigência e vínculo com licitação (opcional).
3. Anexe o contrato assinado.
4. Publique.

**Dicas:**

- Contratos publicados aparecem no portal de transparência.
- O sistema não faz integração automática com o APLIC/TCE-MT para contratos — o vínculo é informativo.

---

### Convênios

**O que é:** gerencia convênios, parcerias e termos de colaboração.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Convênios**.

**Passo a passo:** segue o mesmo padrão de Contratos — número, objeto, parceiro, valor, vigência e documentos anexos.

---

### Concursos

**O que é:** gerencia editais de concursos públicos e processos seletivos.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Concursos**.

**Passo a passo:**

1. Clique em **Novo concurso**.
2. Preencha número do edital, tipo de concurso, objeto, órgão responsável e datas.
3. Adicione documentos (edital, gabarito, resultado, homologação) pelo seletor de tipo de documento.
4. Publique.

---

### Conselhos

**O que é:** gerencia os conselhos municipais e seus membros.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Conselhos**.

**Passo a passo:**

1. Clique em **Novo conselho**.
2. Selecione o tipo de conselho (CMAS, CME, CMDCA, etc. — lista pré-cadastrada conforme padrão TCE-MT).
3. Preencha nome, ato de criação e vigência.
4. Adicione os membros: nome, tipo de membro (titular, suplente, etc.) e segmento (governo, sociedade civil, etc.).
5. Publique.

---

### Portal da Transparência

**O que é:** gerencia os documentos de transparência ativa (PPA, LDO, LOA, RGF, RREO, Balanço, Prestação de Contas, etc.) e os datasets publicados no portal de transparência.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Portal da Transparência**.

**Passo a passo para publicar um documento de transparência:**

1. Clique em **Novo documento**.
2. Selecione a categoria (ex.: LOA, RREO), exercício, período e título.
3. Informe URL externa ou faça upload do arquivo.
4. Salve.

**Passo a passo para sincronizar datasets:**

1. Na aba **Sincronização**, selecione o dataset (ex.: contratos, licitações).
2. Clique em **Sincronizar agora**.
3. O sistema gera os arquivos CSV para download público.

**Dicas:**

- A LAI (Lei 12.527/2011) exige publicação dos instrumentos de planejamento (PPA, LDO, LOA) e dos relatórios fiscais (RGF, RREO) nos prazos legais. O portal não controla esses prazos automaticamente — o gestor é responsável por publicar dentro do prazo.
- Os dados do APLIC/TCE-MT alimentam automaticamente a Transparência quando importados pelo módulo Contas Públicas (APLIC).

---

### Conformidade PNTP

**O que é:** medidor detalhado de conformidade do portal com o Programa Nacional de Transparência Pública (PNTP). Exibe o índice percentual, o selo atual (Elevado, Prata, Ouro ou Diamante), os critérios bloqueantes e o desempenho por dimensão. Esta tela é distinta da Conformidade LGPD — aqui o assunto é transparência pública, não proteção de dados.

**Quem acessa:** todos os papéis com acesso ao painel admin.

**Como chegar:** menu lateral > Transparência > **Conformidade PNTP**.

**O que exibe:**

- Índice percentual de conformidade e o selo atual.
- Alerta com os critérios essenciais pendentes que bloqueiam a obtenção do próximo selo.
- Barras de progresso por dimensão (com peso e percentual atingido).
- Tabela expandível com todos os critérios, exigibilidade e percentual de atendimento.

**Dicas:**

- Critérios marcados como bloqueantes impedem a emissão do selo mesmo com índice alto. Resolva-os primeiro.
- A atualização do índice é automática; não há botão de "recalcular".
- Um resumo do índice e do selo também aparece no KPI do Painel (BI).

---

### Contas Públicas (APLIC)

**O que é:** importa a carga contábil do sistema APLIC (TCE-MT) — execução da despesa: empenhos, liquidações, pagamentos e credores — para o portal de transparência real.

**Quem acessa:** `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Contas Públicas (APLIC)**.

**Passo a passo:**

1. Exporte o arquivo `.zip` da carga contábil no sistema APLIC do TCE-MT (módulo CT).
2. No portal, clique em **Selecionar arquivo** e escolha o `.zip` exportado.
3. Clique em **Enviar carga**.
4. Aguarde o processamento (pode levar alguns minutos para cargas grandes).
5. O painel exibe o resumo: total empenhado, liquidado, pago, número de empenhos e credores.
6. O histórico de cargas importadas fica registrado na seção abaixo.

**Dicas:**

- A IA fiscal usa esses dados para responder perguntas como "qual o total pago ao fornecedor X em 2025".
- Cada carga importada substitui os dados do mesmo exercício/competência. A carga mais recente prevalece para o período.

---

### Tipos e Taxonomias

**O que é:** gerencia as tabelas auxiliares (tipos) usadas em todos os módulos: tipos de documento, tipos de concurso, tipos de membro de conselho, tipos de conselho, etc.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Transparência > **Tipos e Taxonomias**.

**Passo a passo:**

1. Selecione a categoria de tipo que deseja editar (ex.: "Tipos de documento").
2. Adicione, edite ou desative itens da lista.
3. Salve.

**Dicas:**

- Os tipos pré-cadastrados seguem a nomenclatura oficial do TCE-MT. Altere com cuidado — mudanças afetam todos os módulos que usam aquele tipo.
- Desativar um tipo o remove dos formulários de cadastro, mas não apaga os registros já existentes que o usam.

---

## Atendimento e Ouvidoria

### Chat Omnichannel

**O que é:** caixa de entrada unificada para atendimento ao cidadão em tempo real via widget do portal e WhatsApp. Inclui bot de IA que responde automaticamente e escala para agente humano quando necessário.

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin` (todos os papéis com acesso ao painel, exceto ouvidor/assistente que têm foco na ouvidoria).

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Chat Omnichannel**.

**Entendendo os status da conversa:**

| Status | Significado |
|---|---|
| Bot | O bot de IA está respondendo automaticamente. |
| Aguardando | O bot escalou para humano; nenhum agente assumiu ainda. |
| Em atendimento | Um agente está atendendo. |
| Encerrada | Conversa finalizada. |

**Passo a passo para atender uma conversa:**

1. Na lista à esquerda, conversas com badge vermelho têm mensagens não lidas.
2. Clique na conversa para abrir o detalhe à direita.
3. Se a conversa estiver com status "Aguardando", clique em **Assumir** para tomar o atendimento.
4. Digite a resposta no campo inferior e pressione **Enter** (ou clique em Enviar).
5. Use **Nota interna** (checkbox acima do campo de texto) para escrever observações visíveis apenas para a equipe — não enviadas ao cidadão.
6. Use **Tags** para categorizar a conversa.
7. Use **Atribuir** para passar a conversa para outro agente.
8. Use **Transferir** para mover para outra secretaria.
9. Ao terminar, clique em **Encerrar** (com mensagem opcional de despedida).

**Filtros disponíveis:** status, canal (widget ou WhatsApp), secretaria e tags.

**Transcrição:** clique em **.txt** para baixar a transcrição completa da conversa.

**Configurações do atendimento:** acesse por **Configurações** (link no topo da caixa de entrada) ou via `/admin/atendimento/config`. Lá é possível:
- Ligar/desligar o atendimento humano e o widget de IA.
- Definir mensagem de saudação, mensagem fora do expediente e aviso de LGPD.
- Configurar horários de atendimento por dia da semana.
- Gerenciar tags (criar, colorir, excluir).

**Dicas:**

- O bot de IA responde automaticamente 24h. O atendimento humano só é acionado quando o bot escala ou o cidadão pede explicitamente.
- Se o chat estiver vinculado a uma manifestação de ouvidoria (via bot), o protocolo da manifestação aparece nas informações da conversa.

---

### WhatsApp

**O que é:** configura o canal de mensagens (WhatsApp e outros canais de mensageria) para recebimento e envio de mensagens via atendimento. Permite escolher o provider de integração e gerenciar múltiplos canais (multi-número ou multi-plataforma).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **WhatsApp**.

**Providers disponíveis:**

| Provider | Tipo |
|---|---|
| Evolution API | Self-hosted — recomendado para quem já tem a instância Evolution na infraestrutura. |
| Z-API | Nuvem — solução SaaS de terceiro. |
| Meta Cloud API | API oficial do WhatsApp Business da Meta. Exigida em editais que especificam "API oficial Meta". |

**Passo a passo para configurar o provider principal:**

1. Na seção "Provider de WhatsApp", selecione o provider desejado.
2. Preencha as credenciais do provider selecionado (campos variam por provider):
   - **Evolution API:** URL da instância, nome da instância e API Key.
   - **Z-API:** Instance ID, Token e Client-Token (opcional).
   - **Meta Cloud API:** Phone Number ID, WABA ID (opcional), Access Token, App Secret e Verify Token do webhook.
3. Clique em **Salvar configuração**.
4. Clique em **Testar conexão** para verificar se as credenciais estão corretas.
5. Se usar Meta Cloud API, após salvar aparece o bloco "Configuração do Webhook (Meta)" com a Callback URL gerada — cole esta URL no painel da Meta em WhatsApp > Configurações > Webhooks.

**Gerenciar canais adicionais (multi-número / multi-plataforma):**

A seção "Canais" permite cadastrar canais adicionais com webhook próprio. Tipos suportados: WhatsApp, Instagram, Facebook Messenger e Telegram. Cada canal pode ser vinculado a uma secretaria para roteamento automático.

1. Clique em **+ Novo canal**.
2. Selecione o tipo (WhatsApp, Instagram, Messenger ou Telegram) e preencha as credenciais.
3. Vincule a uma secretaria (opcional) para roteamento de atendimentos.
4. Salve e clique em **Webhook** para ver e copiar a URL de callback do canal.
5. Para Telegram, use o botão **Configurar webhook automaticamente** — o sistema chama a Bot API do Telegram por você.

**Guia completo de conexão Meta Cloud:** consulte `docs/atendimento/conectar-meta-cloud.md` para o passo a passo detalhado incluindo criação do app na Meta, permissões e verificação.

---

### Denúncias (App)

**O que é:** painel para visualizar e gerenciar as denúncias enviadas pelos cidadãos pelo Aplicativo do Cidadão (problemas urbanos: buracos, iluminação, lixo, etc.).

**Quem acessa:** `servidor`, `gestor`, `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Denúncias (App)**.

**Categorias de denúncia:** Buraco na via, Terreno abandonado, Animal abandonado, Iluminação pública, Lixo/entulho, Poda de árvore, Sinalização, Outro (as categorias também são configuráveis no módulo App do Cidadão).

**Status do chamado:**

| Status | Significado |
|---|---|
| Aberto | Recém recebido. |
| Em triagem | Em avaliação pela equipe. |
| Em atendimento | Equipe trabalhando na solução. |
| Resolvido | Problema solucionado. |
| Reaberto | Cidadão contestou a resolução. |
| Cancelado | Denúncia inválida ou duplicada. |
| Duplicado | Mesma ocorrência já registrada. |

**Passo a passo:**

1. Visualize a lista de chamados com filtros por status, categoria e período.
2. Clique em um chamado para ver o detalhe: foto, endereço, coordenadas e descrição.
3. No detalhe, selecione o novo status e clique em **Atualizar status**.
4. O cidadão é notificado pelo app sobre a mudança de status.

---

### Painel do Ouvidor

**O que é:** visão consolidada com KPIs (indicadores) de Ouvidoria e e-SIC, gráficos de tendência, alertas de prazo e caixa unificada dos dois canais numa só tela.

**Quem acessa:** EXCLUSIVAMENTE `ouvidor`, `assistente_ouvidoria` e `super_admin` (ADR-0005).

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Painel do Ouvidor**.

**EULA (Termo de Uso):** ao acessar o Painel do Ouvidor pela primeira vez (ou após atualização dos termos), o sistema exibe um gate obrigatório com o Termo de Uso e Responsabilidade do Ouvidor. O acesso ao painel só é liberado após aceitar o EULA. O gate é bloqueante (não pode ser fechado com ESC) e foca automaticamente para leitores de tela.

**O que o painel exibe:**

- Total de manifestações abertas, com SLA em dia e em atraso.
- Manifestações por tipo e canal.
- Prazo médio de resposta.
- Gráfico de tendência de novos registros.
- Alertas de manifestações vencendo nas próximas 48 horas.

**Caixa unificada:** abaixo do dashboard, a caixa unificada lista Ouvidoria e e-SIC juntos, com os mesmos filtros e ações dos módulos individuais.

---

### Ouvidoria

**O que é:** painel para gerenciar as manifestações dos cidadãos (denúncias, reclamações, sugestões, elogios e solicitações) recebidas pelo canal de ouvidoria.

**Quem acessa:** EXCLUSIVAMENTE `ouvidor`, `assistente_ouvidoria` e `super_admin` (ADR-0005). Outros papéis não veem este item no menu.

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Ouvidoria**.

**Tipos de manifestação (Ouvidoria):** denúncia, reclamação, sugestão, elogio, solicitação.

**Prazo legal:** 30 dias prorrogáveis por mais 30 (Lei 13.460/2017). O sistema exibe o prazo em vermelho quando vencido.

**Passo a passo para tramitar uma manifestação:**

1. Na lista, clique em **Detalhar** na manifestação desejada.
2. O modal exibe: protocolo, tipo, status, assunto, descrição, solicitante (ou "[identidade protegida]" para anônimas), prazo e resposta.
3. Na seção **Tramitação**, use o chat interno para comunicar com a área responsável ou registrar o andamento.
4. Na seção **Aplicar ação**, selecione o evento/transição disponível:
   - Iniciar análise, Encaminhar à área, Solicitar complemento, Retomar, Prorrogar prazo, Responder, Indeferir, Atender parcialmente, Abrir recurso 1ª instância, Abrir recurso 2ª instância, Concluir, Arquivar.
5. Informe a observação (opcional) e clique em **Aplicar**.
6. Para atribuir a área responsável, preencha os campos de atribuição e salve.

**Exportação:** use o painel acima da lista para exportar em CSV, Excel, DOC ou PDF, com filtro por período, status e tipo.

**Dicas:**

- Manifestações anônimas protegem a identidade: o nome do solicitante não é exibido nem para o ouvidor.
- O bot de IA pode criar manifestações diretamente pelo chat (o cidadão descreve o problema e o bot abre o protocolo). Essas manifestações chegam automaticamente nesta tela.
- Fique atento ao campo "Prazo": prazos vencidos aparecem em vermelho e com o aviso "(VENCIDO)".

---

### e-SIC

**O que é:** painel para gerenciar os pedidos de acesso à informação recebidos pelo Serviço de Informação ao Cidadão (e-SIC), conforme a LAI (Lei 12.527/2011).

**Quem acessa:** EXCLUSIVAMENTE `ouvidor`, `assistente_ouvidoria` e `super_admin` (ADR-0005).

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **e-SIC**.

**Tipo:** acesso à informação (único tipo para e-SIC, conforme LAI).

**Prazo legal:** 20 dias prorrogáveis por mais 10 dias, mediante justificativa (LAI 12.527/2011, art. 11). O sistema exibe o prazo em vermelho quando vencido e "(P)" quando prorrogado.

**Passo a passo:** idêntico ao módulo Ouvidoria, com as mesmas ações de tramitação. As transições de estado são as mesmas máquinas de estado.

**Exportação:** CSV, Excel, DOC e PDF com filtros.

**Dicas:**

- O prazo de 20 dias é contado a partir da data de registro. A prorrogação de 10 dias deve ser comunicada ao solicitante antes do vencimento do prazo original.
- Pedidos negados devem ter fundamentação legal explícita. Use o campo de observação para registrar a justificativa.
- Estatísticas para o Relatório Estatístico do SIC (publicação obrigatória LAI) são geradas automaticamente pelo sistema.

---

### Minhas Atribuições

**O que é:** fila pessoal do servidor ou área — manifestações encaminhadas pela ouvidoria para a sua área responder. A resposta à ouvidoria é feita pela tramitação interna; a ouvidoria consolida e responde ao cidadão.

**Quem acessa:** `ouvidor`, `assistente_ouvidoria`, `super_admin`.

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Minhas Atribuições**.

**Passo a passo:**

1. Veja a lista de manifestações encaminhadas para você ou sua área.
2. Clique em **Detalhar** para abrir o detalhe.
3. Na tramitação interna, redija a resposta para a ouvidoria.
4. A ouvidoria recebe a resposta e repassa ao cidadão.

---

### Painéis de TV

**O que é:** gera links de acesso sem login para exibir painéis operacionais em TVs no ambiente de trabalho (sala da ouvidoria, gabinete do prefeito).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Atendimento e Ouvidoria > **Painéis de TV**.

**Painéis disponíveis:**

- **Painel da Ouvidoria:** operacional — manifestações abertas, SLA, prazos vencendo, denúncias do app e satisfação. Para a TV da sala da ouvidoria.
- **Painel do Prefeito:** executivo — visão consolidada da cidade, índice de resolução, satisfação, tendência e demandas por secretaria. Para a TV do gabinete.

**Passo a passo:**

1. Clique em **Gerar link** para o painel desejado.
2. Copie o link gerado (botão "Copiar").
3. Abra o link em um navegador na TV (modo tela cheia, F11).
4. O link tem token próprio — a TV não precisa de login e o painel atualiza automaticamente.

**Dicas:**

- Cada clique em "Gerar link" gera um novo token. Links antigos continuam funcionando até expirar.
- Nunca compartilhe o link de TV em ambientes públicos — ele dá acesso de leitura aos dados operacionais.

---

## Inteligência Artificial

### Assistente IA (Conhecimento)

#### Perguntas e Respostas

**O que é:** base de conhecimento curada com pares pergunta/resposta que o assistente virtual (chatbot) usa para responder os cidadãos com precisão. O bot prioriza estas respostas sobre qualquer outra fonte.

**Quem acessa:** `gestor`, `admin_prefeitura`, `ti`, `super_admin`.

**Como chegar:** menu lateral > Inteligência Artificial > **Assistente IA (Conhecimento)** > aba **Perguntas e Respostas**.

**Passo a passo:**

1. Clique em **+ Novo item**.
2. Preencha:
   - **Pergunta:** como o cidadão vai perguntar (ex.: "Qual o telefone da Prefeitura?").
   - **Resposta:** resposta oficial e completa.
   - **Tags:** palavras-chave para organização (ex.: "contato", "telefone").
   - **Fixado:** marque para itens que o bot deve considerar SEMPRE, independentemente da pergunta (ex.: nome e endereço da prefeitura, horário de funcionamento geral).
   - **Ativo:** desmarque para desativar temporariamente sem excluir.
3. Clique em **Adicionar**.

**Passo a passo para reindexar a busca semântica:**

1. No painel "Busca semântica (índice vetorial)", clique em **Reindexar agora**.
2. Aguarde a confirmação "Reindexação iniciada em segundo plano".
3. O painel mostra o número de trechos indexados por fonte (perguntas, artigos, notícias, serviços, etc.).

**Dicas:**

- Itens **Fixados** são sempre considerados pelo bot, mesmo sem correspondência direta na pergunta do cidadão — use para fatos essenciais da entidade.
- Itens inativos são completamente ignorados pelo bot.
- Após adicionar ou editar muitos itens, execute a reindexação para atualizar a busca semântica.

#### Artigos e Materiais

**O que é:** conteúdos textuais longos que alimentam o RAG (Retrieval-Augmented Generation) do chatbot. O assistente usa trechos desses conteúdos ao responder os cidadãos quando a pergunta não tem par exato na base de Perguntas e Respostas.

**Quem acessa:** `gestor`, `admin_prefeitura`, `ti`, `super_admin`.

**Como chegar:** menu lateral > Inteligência Artificial > **Assistente IA (Conhecimento)** > aba **Artigos e Materiais**.

**Passo a passo:**

1. Clique em **+ Novo artigo**.
2. Preencha:
   - **Título:** nome identificador do conteúdo.
   - **Categoria:** Educação, Saúde, Eventos, Regimentos, Normas, etc. (ou texto livre).
   - **Conteúdo:** texto completo, aceita Markdown. Cole aqui regulamentos, horários de postos de saúde, calendários escolares, perguntas frequentes por área, regimentos internos, etc.
   - **Tags:** palavras-chave para filtros.
   - **Secretaria:** vínculo opcional com uma secretaria (gestores com escopo restrito só editam a própria secretaria).
   - **Vigência:** datas de início e fim (para conteúdo temporário como eventos ou normas sazonais).
   - **Público:** quando marcado, o assistente pode usar este conteúdo para responder cidadãos no chat do portal.
   - **Ativo:** desative para retirar do assistente sem excluir.
3. Salve.

**Dicas:**

- Conteúdo inativo é completamente ignorado pelo assistente.
- Use **Vigência** para conteúdo temporário (eventos, avisos): o sistema pode desativar automaticamente após a data fim.
- Gestores com papel `gestor` ou `servidor` podem ter escopo restrito à própria secretaria — o campo de secretaria fica bloqueado para edição.

---

## LGPD e Privacidade

### Conformidade LGPD

**O que é:** dashboard de conformidade com a LGPD, exibindo indicadores gerais sobre solicitações de titulares, incidentes de segurança e estado do Encarregado (DPO). Esta tela trata exclusivamente de proteção de dados pessoais — é distinta da Conformidade PNTP (que trata de transparência pública).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > LGPD e Privacidade > **Conformidade LGPD**.

**O que exibe:**

- Pontuação de conformidade LGPD (score calculado pelo sistema).
- Estado do Encarregado (DPO): nome e e-mail configurados, ou alerta de ausência.
- Estatísticas de solicitações: total, abertas, concluídas, indeferidas, atrasadas e vencendo em 48 horas.
- Tempo médio de resposta a solicitações.
- Estatísticas de incidentes: total, abertos, atrasados na comunicação e comunicados à ANPD.
- Distribuição por tipo de solicitação e por severidade de incidente.
- Prazos de retenção: anos de guarda de solicitações e incidentes.
- Alertas de ações urgentes.

---

### Documentação LGPD

**O que é:** gera, edita, publica e permite baixar os documentos de conformidade LGPD da entidade (Política de Privacidade, Aviso de Cookies, etc.) a partir de template global da plataforma, preenchido com os dados do município.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > LGPD e Privacidade > **Documentação LGPD**.

**Passo a passo:**

1. Preencha os dados complementares da entidade: nome e cargo do responsável, DPO (nome, e-mail, telefone, endereço), endereço da entidade e município.
2. Clique em **Gerar documentação**.
3. Após geração, baixe nos formatos disponíveis: **PDF**, **TXT** ou **HTML**.
4. Clique em **Publicar no portal** para tornar os documentos acessíveis em `/privacidade/sobre-lgpd`.

**Dicas:**

- A documentação deve ser atualizada sempre que houver mudança nas finalidades de tratamento de dados ou nos dados do DPO.
- A Lidera Tecnologia atua como Operadora e a prefeitura como Controladora — essa distinção está refletida nos documentos gerados.

---

### Solicitações LGPD

**O que é:** gerencia as solicitações de direitos dos titulares de dados conforme a LGPD, art. 18 (confirmação de existência, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação de compartilhamento, revogação de consentimento, oposição, revisão de decisão automatizada).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > LGPD e Privacidade > **Solicitações LGPD**.

**Configuração do DPO:** no topo da página há um formulário para cadastrar nome e e-mail do Encarregado de Proteção de Dados (DPO), conforme LGPD art. 41. Esses dados são exibidos publicamente.

**Passo a passo para tratar uma solicitação:**

1. Filtre por status e/ou tipo na barra de filtros.
2. Clique em **Ver / Atuar** na solicitação desejada.
3. O modal exibe: dados do titular, tipo de solicitação, status atual, prazo e descrição.
4. Selecione o novo status: Em andamento, Encaminhada, Concluída ou Indeferida.
5. Preencha a resposta ao titular (obrigatória ao concluir ou indeferir).
6. Para indeferimento, informe o motivo (obrigatório).
7. Salve.

**Anonimização (apenas para solicitações de eliminação):**

Para solicitações do tipo "Eliminação/Exclusão", é exibido um bloco de anonimização. Esta ação:
- Remove definitivamente os dados de identificação do titular (nome, e-mail, telefone, CPF, vínculo gov.br).
- Desativa a conta do titular.
- Mantém registros legais (manifestações, chamados, audit_log) de forma anonimizada.
- É irreversível. O sistema exige dupla confirmação.

**Dicas:**

- Prazo de resposta LGPD: 15 dias a partir da solicitação (ANPD recomenda). Acompanhe o campo "Prazo" e o badge "Atrasada".
- Solicitações em estado final (Concluída ou Indeferida) não podem ser alteradas.

---

### Incidentes de Segurança

**O que é:** registro e acompanhamento de incidentes de segurança que envolvam dados pessoais, conforme LGPD art. 48 (obrigação de comunicar à ANPD e aos titulares afetados em prazo razoável).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > LGPD e Privacidade > **Incidentes de Segurança**.

**Categorias de incidente:** acesso indevido, vazamento, perda de dados, ransomware, indisponibilidade, erro humano, outro.

**Severidade:** baixa, média, alta, crítica.

**Status do incidente:** registrado, em avaliação, em contenção, comunicado, encerrado.

**Passo a passo para registrar um incidente:**

1. Clique em **Novo incidente**.
2. Preencha: título, categoria, severidade, data de detecção, descrição, natureza dos dados afetados, número estimado de titulares afetados, nível e descrição do risco.
3. Salve.

**Passo a passo para atualizar um incidente:**

1. Clique no incidente na lista para abrir o detalhe.
2. Atualize o status (progride conforme o ciclo).
3. Preencha medidas de contenção e mitigação.
4. Quando comunicado à ANPD, informe a data e o protocolo de comunicação.
5. Quando comunicado aos titulares, informe a data e o meio utilizado.
6. Para baixar o relatório do incidente em PDF, use o botão de download no detalhe.

**Dicas:**

- A LGPD (art. 48) exige comunicação à ANPD em prazo razoável quando o incidente pode acarretar risco ou dano relevante aos titulares. Não há prazo fixo na lei brasileira, mas a ANPD orienta comunicação em 2 dias úteis para incidentes graves.
- O campo "Prazo de comunicação" é calculado automaticamente. O badge "Comunicação atrasada" aparece se o prazo passou sem registro de comunicação.
- Incidentes encerrados ficam no histórico para fins de auditoria obrigatória.

---

## Administração

### Usuários

**O que é:** lista e gerencia os usuários do painel administrativo do portal.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Usuários**.

**O que exibe:** lista de usuários com nome, e-mail, papel, status (ativo/inativo), último login e se tem MFA habilitado.

**Passo a passo para criar um usuário:**

1. Clique em **Novo usuário**.
2. Preencha nome, e-mail e papel (servidor, gestor, ouvidor, administrador).
3. Salve. O usuário recebe um e-mail para definir a senha.

**Passo a passo para editar papel ou desativar:**

1. Clique em **Editar** no usuário desejado.
2. Altere o papel ou desmarque "Ativo" para suspender o acesso.
3. Salve.

**Dicas:**

- Usuários inativos não conseguem fazer login.
- O papel `ouvidor` dá acesso apenas aos módulos de Ouvidoria/e-SIC (ADR-0005).
- Não é possível criar usuários com papel `super_admin` por esta tela — esse papel é gerenciado pela Lidera.

---

### Solicitações de Acesso

**O que é:** lista as solicitações de elevação de papel enviadas por servidores pelo portal público e permite aprovar ou recusar.

**Quem acessa:** `admin_prefeitura`, `gestor`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Solicitações de Acesso**.

**Passo a passo:**

1. Visualize as solicitações pendentes com nome, e-mail, cargo, lotação declarada e papel solicitado.
2. Para aprovar: clique em **Aprovar**. O papel do usuário é elevado imediatamente.
3. Para recusar: clique em **Recusar**, informe o motivo (obrigatório) e confirme.

**Dicas:**

- Verifique as informações de cargo e lotação antes de aprovar — o solicitante declara esses dados no formulário, mas cabe ao gestor validar.
- Solicitações recusadas ficam registradas com o motivo para auditoria.

---

### Grupos e Permissões

**O que é:** gerencia grupos de permissões granulares que complementam os papéis. Um usuário pode pertencer a um ou mais grupos, recebendo permissões adicionais específicas.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Grupos e Permissões**.

**Passo a passo para criar um grupo:**

1. Clique em **Novo grupo**.
2. Preencha nome e descrição.
3. Selecione as permissões do catálogo (organizadas por módulo).
4. Salve.

**Passo a passo para adicionar membros:**

1. Abra o grupo desejado.
2. Na seção "Membros", busque o usuário pelo nome ou e-mail.
3. Clique em **Adicionar**.

**Dicas:**

- Os grupos são aditivos aos papéis — não substituem. Um servidor pode ter o papel `servidor` mais as permissões extras do grupo "Comunicação", por exemplo.
- Grupos inativos não concedem permissões a seus membros.

---

### Sessões Ativas

**O que é:** lista as sessões abertas de todos os usuários do tenant, mostrando quem está online agora.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Sessões Ativas**.

**O que exibe:** para cada sessão: nome, e-mail, papel, IP de origem, user-agent (navegador), data de criação, última atividade e status online/offline.

**Passo a passo para revogar uma sessão:**

1. Localize a sessão na lista.
2. Clique em **Revogar sessão**.
3. O usuário é desconectado imediatamente na próxima requisição.

**Dicas:**

- Use para encerrar sessões suspeitas (ex.: IP desconhecido após relato de conta comprometida).
- "Online" significa que houve atividade nos últimos 5 minutos. Sessões offline ainda são válidas até expirar.

---

### Relatório de Usuários

**O que é:** relatório consolidado de todos os usuários do tenant, com filtros por papel, status e período, para auditoria e gestão de acessos.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Relatório de Usuários**.

**O que exibe:** tabela com todos os usuários, papéis, último login, status MFA e data de cadastro. Permite exportação em CSV.

---

### E-mail (SMTP)

**O que é:** configura o servidor de e-mail (SMTP) utilizado pelo portal para enviar notificações, avisos de solicitações LGPD, confirmações de formulários, etc.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **E-mail (SMTP)**.

**Passo a passo:**

1. Preencha: host SMTP, porta, usuário, senha, remetente padrão (nome e e-mail) e se usa TLS/SSL.
2. Clique em **Testar conexão** para verificar se as configurações estão corretas.
3. Salve.

**Dicas:**

- Se não configurado, o portal usa o SMTP global da plataforma (Lidera) como fallback, mas recomenda-se configurar o SMTP próprio da prefeitura para que os e-mails saiam com o domínio oficial.
- Erros de SMTP ficam registrados no audit_log.

---

### Tema e Identidade

**O que é:** personaliza a identidade visual do portal: cores, fontes, logo, favicon e configurações do rodapé.

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Tema e Identidade**.

**O que é possível configurar:**

- **Cores:** primária, primária (texto), secundária, secundária (texto), acento, fundo, texto, muted, borda, sucesso, alerta, perigo.
- **Fontes:** fonte de texto geral (sans) e fonte de títulos (heading).
- **Raio de borda:** arredondamento dos elementos (px, rem).
- **Logo:** logo principal (cabeçalho), logo do rodapé, logo de relatórios — com URL, texto alternativo e tamanho.
- **Favicon:** ícone da aba do navegador.
- **Rodapé:** exibir texto no rodapé, posição (abaixo ou lateral à logo), título e descrição.

**Passo a passo:**

1. Altere as cores usando o seletor de cores ou digitando o código hexadecimal.
2. Clique em **Pré-visualizar** para verificar o contraste WCAG antes de salvar.
3. O sistema verifica automaticamente o contraste WCAG AA. Se alguma combinação reprovada aparecer, ajuste as cores antes de prosseguir.
4. Faça upload do logo pelo seletor de mídia.
5. Clique em **Salvar tema**.

**Dicas:**

- O sistema rejeita temas com contraste abaixo do mínimo WCAG AA (4,5:1 para texto normal). Acessibilidade é obrigatória — não há como contornar essa validação.
- O portal carrega VLibras automaticamente para usuários com deficiência — não é necessário configurar.
- Alterações de tema aplicam-se imediatamente para novos visitantes. Cache pode atrasar a visualização em alguns minutos.

---

### Menus

**O que é:** gerencia os menus de navegação do portal público (menu principal, menu do rodapé, menus de secretarias, etc.).

**Quem acessa:** `admin_prefeitura`, `super_admin`.

**Como chegar:** menu lateral > Administração > **Menus**.

**Passo a passo:**

1. Selecione o menu que deseja editar (ex.: "Menu Principal", "Menu do Rodapé").
2. Adicione itens: rótulo, URL de destino e se abre em nova aba.
3. Organize os itens arrastando para reordená-los.
4. Crie subitens (segundo nível de menu) arrastando um item para dentro de outro.
5. Salve.

**Dicas:**

- O menu principal é o que aparece no cabeçalho do portal público.
- Links externos devem começar com `https://`.
- Itens sem URL são tratados como cabeçalho de grupo (não clicáveis).

---

### App do Cidadão

**O que é:** configuração e geração do Aplicativo do Cidadão (app mobile white-label) por entidade. Permite definir a identidade visual do app, os módulos ativos, o onboarding, as integrações e disparar a geração do APK na nuvem via EAS (Expo Application Services).

**Quem acessa:** `admin_prefeitura`, `super_admin` (campos técnicos como Bundle ID e EAS Project ID são editáveis apenas pelo `super_admin`).

**Como chegar:** menu lateral > Administração > **App do Cidadão**.

**Abas disponíveis:**

| Aba | O que configura |
|---|---|
| Identidade & Ícones | Nome do app, nome curto (ícone), ícone PNG 1024×1024, splash screen e parâmetros técnicos (Bundle ID, scheme, API URL, EAS). |
| Onboarding | Slides de apresentação exibidos ao cidadão na primeira abertura do app (até 5 slides, cada um com título, descrição e imagem). |
| Módulos | Liga/desliga os módulos visíveis ao cidadão: Denúncias, Mapa, Ouvidoria, e-SIC, Chat, Serviços, Notícias, Carteira, Galeria, Documentos. Mudanças nos módulos não exigem novo APK. |
| Tema | Cor primária e cor secundária do app. Use cores com contraste WCAG AA. |
| Integrações | Notificações push, autenticação biométrica, atalhos de acesso rápido na home do app e categorias de chamados/denúncias. |
| Builds | Geração do APK via EAS. |

**Passo a passo para configurar o app:**

1. Preencha as informações nas abas **Identidade & Ícones**, **Onboarding**, **Módulos**, **Tema** e **Integrações**.
2. Clique em **Salvar** ao final de cada aba ou use o botão de salvar global.
3. Alterações de módulo e tema já valem no próximo carregamento do app, sem necessidade de gerar novo APK.

**Passo a passo para gerar o APK:**

1. Acesse a aba **Builds**.
2. Verifique se o EAS Project ID está configurado (campo na aba Identidade & Ícones, preenchido pela equipe Lidera).
3. Clique em **Gerar APK de teste** para um build de preview (para distribuição interna e teste).
4. Para um build de produção (Play Store), clique em **Gerar versão de produção** e confirme.
5. O build roda na nuvem do EAS e leva alguns minutos. O progresso é exibido no histórico de builds com polling automático a cada 15 segundos.
6. Quando concluído, o link para baixar o APK aparece no histórico.

**Dicas:**

- Ícone e splash só têm efeito após gerar um novo APK — alterações de módulo e tema não precisam de rebuild.
- O campo Bundle ID identifica o app nas lojas e não pode ser mudado após a primeira publicação na Play Store sem criar um app novo.
- Em caso de erro no build, o histórico exibe o resumo do erro e, quando disponível, o link para os logs do EAS.

---

## Ajuda

### Manual do Sistema

**O que é:** este manual, disponível dentro do próprio painel para consulta a qualquer momento.

**Como chegar:** menu lateral > Ajuda > **Manual do Sistema**.

O manual está disponível publicamente também em `/admin/manual` (sem necessidade de login para leitura).

---

## Conta

### Meu Perfil

**O que é:** tela pessoal do usuário logado para editar seus próprios dados, foto de perfil, configurar MFA (autenticação em dois fatores) e gerenciar contatos de notificação.

**Quem acessa:** qualquer usuário autenticado no painel admin.

**Como chegar:** menu lateral > Conta > **Meu Perfil**, ou clique no seu nome no canto superior direito e escolha "Alterar perfil".

**O que é possível fazer:**

- **Foto de perfil:** envie uma imagem (recortada em 256×256) que aparece para colegas no chat interno.
- **Dados pessoais:** altere nome e senha.
- **MFA (autenticação em dois fatores):** ative para maior segurança. Gera um QR Code para configurar em aplicativo autenticador (Google Authenticator, Authy, etc.).
- **Contatos de notificação:** adicione telefone para receber alertas por WhatsApp e e-mail para notificações.
- **Nível gov.br:** exibido para usuários autenticados via gov.br (Bronze, Prata ou Ouro).

**Dicas:**

- O MFA é fortemente recomendado para papéis com alto privilégio (`admin_prefeitura`, `ouvidor`, `super_admin`).
- A foto de perfil não é exibida no portal público — apenas no chat interno entre servidores.

---

## Glossário rápido

| Termo | Significado |
|---|---|
| Tenant | Cada prefeitura/cliente é um "tenant" isolado no sistema. |
| RLS | Row Level Security — mecanismo que garante que cada tenant só acessa seus próprios dados. |
| PNTP | Programa Nacional de Transparência Pública — avalia conformidade do portal em transparência ativa. |
| LGPD | Lei Geral de Proteção de Dados (Lei 13.709/2018). |
| LAI | Lei de Acesso à Informação (Lei 12.527/2011) — rege o e-SIC. |
| Lei 13.460 | Lei de Defesa dos Direitos do Usuário de Serviços Públicos — rege prazos da Ouvidoria. |
| DPO/Encarregado | Pessoa responsável pela proteção de dados (LGPD art. 41). |
| ANPD | Autoridade Nacional de Proteção de Dados — órgão que recebe comunicações de incidentes. |
| APLIC | Sistema contábil do TCE-MT para execução da despesa pública. |
| RAG | Retrieval-Augmented Generation — técnica da IA para buscar conteúdo antes de responder. |
| WCAG AA | Padrão de acessibilidade web (contraste mínimo 4,5:1 para texto normal). |
| Bot | Assistente virtual (IA) que responde automaticamente no chat do portal. |
| ADR | Architecture Decision Record — registro de decisões de arquitetura do sistema. |
| EAS | Expo Application Services — plataforma de build e distribuição do app mobile. |
| APK | Arquivo de instalação do app Android. |
| ICP-Brasil | Infraestrutura de Chaves Públicas Brasileira — certificação digital com validade jurídica. |
| Overlay/Efeito | Elemento visual interativo sobreposto ao portal, usado em campanhas (ex.: `aedes-overlay`, `copa-overlay`). |
