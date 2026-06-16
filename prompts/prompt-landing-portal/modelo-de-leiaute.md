# Modelo de Leiaute — Portal Público Municipal

Modelo consolidado a partir da navegação nos sete portais de referência (Sapezal/MT, Betim/MG, São Mateus do Sul/PR, Cachoeira do Sul/RS, São Francisco de Paula/RS, Inocência/MS, Alto Garças/MT). Todos seguem o mesmo padrão de portal público brasileiro. Este documento descreve **a anatomia comum** — é o ponto de partida a ser **superado** em design e usabilidade, não copiado.

## Anatomia da home (de cima para baixo)

### 0. Barra de utilidades (pré-cabeçalho)
- **Consentimento de cookies (LGPD)** — "Aceitar" / "Personalizar" (necessários vs. estatísticas).
- **Login / Cadastro do cidadão** — CPF/CNPJ/e-mail + senha; cadastro PF e PJ; "Esqueci minha senha".
- **Ferramentas de acessibilidade** — A+ / A- (redimensionar fonte), **alto contraste**, **VLibras**.
- **Skip links** — "Ir para o conteúdo / menu / busca / rodapé".
- **Links** — Mapa do site, Acessibilidade.
- **Redes sociais** — Instagram, Facebook, LinkedIn, YouTube, WhatsApp, X.
- **Selos** — Ranking SICONF (Tesouro), **Radar da Transparência (Atricon)**.

### 1. Cabeçalho
- **Brasão + nome da prefeitura** (à esquerda).
- **Busca** ("O que deseja encontrar?").
- **Previsão do tempo** (cidades maiores).
- Destaque para **Ouvidoria**.

### 2. Navegação principal (mega-menu)
Itens recorrentes: **A Prefeitura / A Cidade** (História, Dados Gerais, Geografia, Hino, Brasão, Galeria de Prefeitos, Turismo) · **Secretarias** (lista) · **Transparência** (Portal da Transparência, Contas Públicas, Radar) · **Serviços / Carta de Serviços** · **Editais** (Licitações, Concursos/Processos Seletivos) · **Legislação** (Leis e Decretos) · **Diário Oficial** · **Imprensa/Notícias** · **Audiências Públicas** · **Ouvidoria / SIC** · **Contato / Telefones Úteis**. No mobile: menu hambúrguer com acordeão.

### 3. Banner principal (hero)
Carrossel rotativo com play/pause (campanhas: IPTU, vacinação, programas).

### 4. "Serviços para" (acesso por público)
Três trilhas: **CIDADÃO · EMPRESA · SERVIDOR** (cards com ícone). "Ver todos / Acesso Fácil".

### 5. Acesso rápido (grade de atalhos)
Cartões/ícones: NFe, Alvará, Certidão/IPTU, Ouvidoria, Contas Públicas, Licitações, Leis, Serviços Online, Protocolo, Transparência, Emprego, etc. — para sistemas internos e externos.

### 6. Notícias
Notícia em destaque + grade das últimas (data, categoria, nº de visualizações, miniatura, resumo). "Ver mais".

### 7. Secretarias e Departamentos
Grade de cards com **foto + nome do(a) secretário(a)** e secretaria.

### 8. Diário Oficial
Última edição + edições anteriores (número, data, visualizações, "Ler online"/Download) e filtro por ano.

### 9. Editais em destaque
Cards de Licitações/Concursos com modalidade, **status** (ABERTO/Homologado), datas de publicação e realização.

### 10. Agenda / Eventos
Cards com data e título (cidades com agenda cultural).

### 11. Galeria de vídeos
Miniaturas (YouTube) com play.

### 12. Galeria de fotos
Álbuns com data, categoria e nº de visualizações.

### 13. Arquivos para download
Lista de PDFs com categoria, data, tamanho e download.

### 14. Publicações oficiais (busca por categoria)
Seletores: Concursos (modalidade), Licitações (modalidade), Contas Públicas (PPA/LDO/LOA, demonstrativos…).

### 15. Newsletter
Cadastro de e-mail para informativos.

### 16. Rodapé
Brasão · redes sociais · **Localização** (endereço/CEP) · **Contato** (telefone/e-mail) · **Atendimento** (horário) · Newsletter · **"Portal atualizado em \<data/hora\>"** · **Dados Abertos** · Radar da Transparência · copyright.

### Pop-ups
Modais de campanha na abertura (com fechar acessível).

## Observações de UX/Conformidade (o que manter)

- Forte ligação com **conformidade**: busca no site, acesso visível ao portal, acessibilidade (A+/A-/contraste/VLibras/mapa do site/skip links), **Dados Abertos**, **Radar da Transparência**, carimbo "Portal atualizado em" — todos pontuam no **PNTP**.
- Organização **orientada a público** (cidadão/empresa/servidor) e a **tarefas** (acesso rápido).
- Atualização frequente de notícias/diário transmite que o portal é "vivo".

## Limitações comuns (o que SUPERAR)

- Densidade visual alta, muitos banners concorrendo, hierarquia fraca.
- Estética datada e padronizada entre municípios (pouca identidade).
- Acesso rápido vira "muro de ícones" sem priorização por uso real.
- Mobile muitas vezes é só o desktop espremido.
- Acessibilidade frequentemente limitada a A+/A-/contraste, sem cobrir WCAG de fato.
- Performance prejudicada por carrosséis e imagens pesadas.
