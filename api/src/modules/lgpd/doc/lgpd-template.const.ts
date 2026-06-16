/**
 * Template PADRÃO da documentação LGPD da ENTIDADE (município/prefeitura).
 *
 * Adaptado do "Programa de Governança em Privacidade e Segurança da Informação"
 * da Lidera Tecnologia: aqui a ENTIDADE é a CONTROLADORA dos dados dos cidadãos e
 * a Lidera Tecnologia atua como OPERADORA (provedora da plataforma SaaS). São 4
 * documentos: Política de Privacidade, PSI, RoPA e Relatório de Medidas.
 *
 * Formato de marcação (parseado por lgpd-doc.render.ts):
 *   # Título     → documento (quebra de página no PDF, <h1>)
 *   ## Seção     → <h2>
 *   ### Subseção → <h3>
 *   - item       → item de lista
 *   linha em branco separa parágrafos; demais linhas são parágrafos.
 *
 * Placeholders {{X}} são substituídos pelos dados do tenant na geração:
 *   ENTIDADE, CNPJ, MUNICIPIO, UF, ENDERECO, DPO_NOME, DPO_EMAIL, DPO_TELEFONE,
 *   DPO_ENDERECO, RESPONSAVEL_NOME, RESPONSAVEL_CARGO, OPERADORA_NOME,
 *   OPERADORA_CNPJ, DATA_EXTENSO, VERSAO.
 *
 * O super_admin pode editar este texto no Console da Plataforma; o default vive
 * aqui para que toda entidade nasça com uma documentação completa e válida.
 */

/** Metadados de cada placeholder — para a UI de edição do template (Gerenciador). */
export interface PlaceholderMeta {
  chave: string;
  rotulo: string;
  origem: 'tenant' | 'dpo' | 'entidade' | 'plataforma' | 'sistema';
}

export const LGPD_PLACEHOLDERS: PlaceholderMeta[] = [
  { chave: 'ENTIDADE', rotulo: 'Nome da entidade', origem: 'tenant' },
  { chave: 'CNPJ', rotulo: 'CNPJ da entidade', origem: 'tenant' },
  { chave: 'MUNICIPIO', rotulo: 'Município', origem: 'entidade' },
  { chave: 'UF', rotulo: 'UF', origem: 'tenant' },
  { chave: 'ENDERECO', rotulo: 'Endereço da entidade', origem: 'entidade' },
  { chave: 'DPO_NOME', rotulo: 'Nome do Encarregado (DPO)', origem: 'dpo' },
  { chave: 'DPO_EMAIL', rotulo: 'E-mail do DPO', origem: 'dpo' },
  { chave: 'DPO_TELEFONE', rotulo: 'Telefone do DPO', origem: 'dpo' },
  { chave: 'DPO_ENDERECO', rotulo: 'Endereço do DPO', origem: 'dpo' },
  { chave: 'RESPONSAVEL_NOME', rotulo: 'Autoridade signatária', origem: 'entidade' },
  { chave: 'RESPONSAVEL_CARGO', rotulo: 'Cargo da autoridade', origem: 'entidade' },
  { chave: 'OPERADORA_NOME', rotulo: 'Operadora (provedora)', origem: 'plataforma' },
  { chave: 'OPERADORA_CNPJ', rotulo: 'CNPJ da operadora', origem: 'plataforma' },
  { chave: 'DATA_EXTENSO', rotulo: 'Data por extenso', origem: 'sistema' },
  { chave: 'VERSAO', rotulo: 'Versão do documento', origem: 'sistema' },
];

export const LGPD_TEMPLATE_PADRAO = `# DOCUMENTAÇÃO DE PRIVACIDADE E SEGURANÇA DA INFORMAÇÃO

PROGRAMA DE GOVERNANÇA EM PRIVACIDADE E SEGURANÇA DA INFORMAÇÃO

Conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais – LGPD)

{{ENTIDADE}}
CNPJ nº {{CNPJ}} • {{MUNICIPIO}} – {{UF}}

Documentos integrantes deste pacote:
- I. Política de Privacidade e Proteção de Dados Pessoais
- II. Política de Segurança da Informação (PSI)
- III. Registro das Operações de Tratamento de Dados (RoPA)
- IV. Relatório de Medidas Técnicas e Administrativas de Segurança

Versão {{VERSAO}} • {{DATA_EXTENSO}} • Classificação: Uso Externo / Público
Aprovado por: {{RESPONSAVEL_NOME}} – {{RESPONSAVEL_CARGO}}

# DOCUMENTO I — POLÍTICA DE PRIVACIDADE E PROTEÇÃO DE DADOS PESSOAIS

## 1. Objetivo e compromisso

A {{ENTIDADE}}, inscrita no CNPJ nº {{CNPJ}}, com sede em {{ENDERECO}}, {{MUNICIPIO}}/{{UF}} (doravante "Entidade" ou "Controladora"), apresenta esta Política de Privacidade para demonstrar seu compromisso com a privacidade e a proteção dos dados pessoais dos cidadãos, servidores, fornecedores e demais titulares com quem se relaciona no exercício de suas competências públicas.

Este documento estabelece, de forma clara e transparente, como a Entidade coleta, registra, armazena, utiliza, compartilha e elimina dados pessoais, em conformidade com a Lei nº 13.709/2018 (LGPD), a Lei de Acesso à Informação (Lei nº 12.527/2011), o Marco Civil da Internet (Lei nº 12.965/2014) e as orientações da Autoridade Nacional de Proteção de Dados (ANPD).

## 2. Definições

Para os fins desta Política, aplicam-se as definições do art. 5º da LGPD, destacando-se:
- Dado pessoal: informação relacionada a pessoa natural identificada ou identificável.
- Dado pessoal sensível: dado sobre origem racial ou étnica, convicção religiosa, opinião política, filiação sindical, dado referente à saúde, à vida sexual, genético ou biométrico.
- Titular: pessoa natural a quem se referem os dados pessoais objeto de tratamento (em regra, o cidadão).
- Tratamento: toda operação realizada com dados pessoais (coleta, uso, acesso, armazenamento, compartilhamento, eliminação, entre outras).
- Controlador: a quem competem as decisões sobre o tratamento — neste caso, a {{ENTIDADE}}.
- Operador: quem realiza o tratamento em nome do controlador — neste caso, a {{OPERADORA_NOME}}, provedora da plataforma digital.
- Encarregado (DPO): pessoa indicada para atuar como canal de comunicação entre o controlador, os titulares e a ANPD.

## 3. Âmbito de aplicação e papéis

A {{ENTIDADE}} atua como CONTROLADORA dos dados pessoais tratados no exercício de suas atribuições legais (atendimento ao cidadão, e-SIC, Ouvidoria, transparência, serviços públicos, denúncias, gestão de pessoas, entre outros).

A {{OPERADORA_NOME}} (CNPJ nº {{OPERADORA_CNPJ}}) atua como OPERADORA, realizando o tratamento de dados pessoais por conta e ordem da Entidade, no âmbito do desenvolvimento, hospedagem e operação da plataforma digital. O tratamento observa estritamente as instruções documentadas da Controladora e os limites contratuais, com isolamento lógico entre entidades (Row-Level Security), criptografia e registro de auditoria.

Esta Política aplica-se a todos os tratamentos realizados pela Entidade e por seus operadores.

## 4. Princípios

Todo tratamento de dados pessoais observa os princípios do art. 6º da LGPD, em especial: finalidade, adequação, necessidade (minimização), livre acesso, qualidade dos dados, transparência, segurança, prevenção, não discriminação e responsabilização e prestação de contas (accountability).

## 5. Dados coletados e finalidades

A {{ENTIDADE}} trata apenas os dados estritamente necessários ao cumprimento de suas finalidades públicas. As principais categorias são:

### 5.1. Dados de identificação e contato
Nome, CPF, RG, endereço, e-mail e telefone de cidadãos, servidores, representantes e fornecedores, para identificação, atendimento de solicitações e comunicação.

### 5.2. Dados de manifestações (e-SIC, Ouvidoria e denúncias)
Conteúdo de pedidos de acesso à informação, manifestações de ouvidoria e denúncias, eventualmente com identificação do manifestante, tratados para apuração e resposta nos prazos legais (LAI 12.527/2011 e Lei 13.460/2017). Denúncias podem ser tratadas de forma anônima ou com sigilo do denunciante.

### 5.3. Dados técnicos e registros de acesso (logs)
Endereços IP e registros de acesso a aplicações, tratados para segurança da informação, prevenção a fraudes e cumprimento do Marco Civil da Internet.

### 5.4. Dados de navegação
Quando o titular acessa o portal, podem ser coletados dados de navegação por meio de cookies e tecnologias similares, conforme o aviso de cookies do portal.

### 5.5. Dados de recursos humanos
Dados de servidores e prestadores necessários à gestão de pessoas e ao cumprimento de obrigações legais e previdenciárias.

## 6. Bases legais

O tratamento fundamenta-se nas hipóteses dos arts. 7º e 11 da LGPD, conforme a finalidade, com destaque para: execução de políticas públicas e cumprimento de obrigação legal ou regulatória pela administração pública (art. 7º, II e III); exercício regular de direitos; e consentimento (art. 7º, I), quando aplicável. O tratamento de dados sensíveis observa as hipóteses do art. 11.

## 7. Compartilhamento de dados

Os dados pessoais não são comercializados. O compartilhamento ocorre apenas quando necessário e restringe-se a:
- Órgãos públicos e autoridades de controle, para cumprimento de obrigações legais e regulatórias ou em atendimento a requisições legais;
- Operadores e provedores de tecnologia, estritamente para a operação dos serviços, resguardados por contratos com cláusulas de confidencialidade e proteção de dados;
- Demais entes públicos, quando indispensável à prestação do serviço solicitado pelo titular.

## 8. Transferência internacional de dados

Em razão da eventual utilização de provedores de nuvem, dados pessoais poderão ser transferidos para outros países. Nesses casos, são adotadas as salvaguardas dos arts. 33 a 36 da LGPD, exigindo-se nível de proteção compatível com a legislação brasileira.

## 9. Cookies e tecnologias de rastreamento

O portal pode utilizar cookies necessários ao funcionamento, bem como cookies de desempenho e analíticos. O titular pode gerenciar suas preferências pelo navegador ou pelos avisos de consentimento, quando disponíveis.

## 10. Retenção e eliminação

Os dados pessoais são armazenados pelo tempo necessário ao cumprimento das finalidades ou pelos prazos legais aplicáveis (entre os quais a legislação de arquivos públicos, o Marco Civil da Internet e a legislação previdenciária e fiscal). Esgotado o prazo ou cessada a finalidade, os dados são eliminados de forma segura, ressalvadas as hipóteses do art. 16 da LGPD.

## 11. Segurança da informação

A Entidade e seus operadores adotam medidas técnicas e administrativas aptas a proteger os dados pessoais contra acessos não autorizados e situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão, nos termos do art. 46 da LGPD, detalhadas na PSI e no Relatório de Medidas anexos.

## 12. Direitos dos titulares

A Entidade assegura aos titulares o exercício dos direitos do art. 18 da LGPD, mediante requisição ao Encarregado, incluindo:
- confirmação da existência de tratamento;
- acesso aos dados;
- correção de dados incompletos, inexatos ou desatualizados;
- anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;
- portabilidade dos dados, observados os segredos comercial e industrial;
- eliminação dos dados tratados com base no consentimento;
- informação sobre as entidades com as quais a Entidade compartilhou dados;
- revogação do consentimento.

As requisições podem ser feitas pelo portal, na área de privacidade, ou diretamente ao Encarregado.

## 13. Encarregado (DPO) e canal de atendimento

As requisições de titulares e comunicações relativas à proteção de dados devem ser encaminhadas ao Encarregado pelo Tratamento de Dados Pessoais da {{ENTIDADE}}:
- Encarregado (DPO): {{DPO_NOME}}
- E-mail: {{DPO_EMAIL}}
- Telefone: {{DPO_TELEFONE}}
- Endereço: {{DPO_ENDERECO}}

## 14. Incidentes de segurança

Na hipótese de incidente de segurança que possa acarretar risco ou dano relevante aos titulares, a Entidade adota as providências de contenção e mitigação e realiza a comunicação à ANPD e aos titulares afetados nos prazos e condições da Resolução CD/ANPD nº 15/2024.

## 15. Alterações desta Política

Esta Política poderá ser atualizada a qualquer tempo para refletir mudanças legais, regulatórias ou operacionais. A versão vigente será sempre identificada por número e data, recomendando-se a consulta periódica.

## 16. Legislação aplicável

Esta Política é regida pela legislação brasileira, em especial a LGPD e as normas de direito público aplicáveis à administração municipal.

{{MUNICIPIO}} – {{UF}}, {{DATA_EXTENSO}}.

{{RESPONSAVEL_NOME}}
{{RESPONSAVEL_CARGO}}
{{ENTIDADE}} – CNPJ nº {{CNPJ}}

# DOCUMENTO II — POLÍTICA DE SEGURANÇA DA INFORMAÇÃO (PSI)

## 1. Objetivo e abrangência

Esta Política de Segurança da Informação (PSI) estabelece as diretrizes e normas para proteger os ativos de informação da {{ENTIDADE}} e dos titulares de dados contra perda, acesso não autorizado, destruição, alteração ou indisponibilidade, garantindo a Confidencialidade, a Integridade e a Disponibilidade da informação (Tríade CID).

Esta PSI aplica-se a todos os servidores, estagiários, prestadores de serviço e terceiros que acessem informações, sistemas, redes e ambientes sob gestão da Entidade, bem como aos seus operadores de tecnologia.

## 2. Referências normativas

Esta PSI observa, no que aplicável: a Lei nº 13.709/2018 (LGPD), em especial os arts. 46 a 49; o Marco Civil da Internet (Lei nº 12.965/2014); o Guia Orientativo de Segurança da Informação e a Resolução CD/ANPD nº 15/2024 da ANPD; e as boas práticas das normas ABNT NBR ISO/IEC 27001 e 27002.

## 3. Princípios

A gestão de segurança da informação é pautada no gerenciamento de riscos e nos princípios da Tríade CID, do menor privilégio (need to know), da segregação de funções, da defesa em profundidade e da segurança desde a concepção (security by design and by default).

## 4. Papéis e responsabilidades

- Autoridade máxima da Entidade: aprova esta PSI, provê recursos e patrocina a cultura de segurança e privacidade.
- Encarregado (DPO): atua como canal com titulares e ANPD e zela pela conformidade com a LGPD.
- Gestor de Tecnologia/Segurança: implementa, mantém e monitora os controles técnicos e a resposta a incidentes.
- Servidores e prestadores: cumprem esta PSI, zelam pelos ativos e reportam incidentes e vulnerabilidades.
- Operadores e fornecedores: aderem às obrigações de segurança e confidencialidade estabelecidas em contrato.

## 5. Classificação e tratamento da informação

As informações são classificadas conforme sua criticidade e sensibilidade (por exemplo: pública, interna, confidencial e restrita). Dados pessoais e, especialmente, dados pessoais sensíveis recebem o nível de proteção mais elevado, com restrição de acesso, criptografia e registro de operações.

## 6. Controle de acesso e gestão de identidades

- O acesso a sistemas, redes, servidores e bancos de dados é restrito a usuários autorizados, segundo o princípio do menor privilégio (controle baseado em papéis – RBAC);
- As credenciais são individuais, pessoais e intransferíveis, sendo vedado o compartilhamento de contas ou senhas;
- É exigida Autenticação de Múltiplos Fatores (MFA) para acesso a sistemas e bases com dados pessoais, sempre que tecnicamente disponível;
- Os acessos são revisados periodicamente e revogados imediatamente em caso de desligamento ou término de contrato.

## 7. Gestão de senhas e credenciais

- Senhas fortes (no mínimo 8 caracteres, mesclando maiúsculas, minúsculas, números e símbolos);
- Proibição de senhas padrão de fábrica e de reutilização entre serviços;
- Segredos de aplicação (tokens, chaves de API, senhas de banco, certificados) nunca são versionados em código; são mantidos em cofre de segredos, com rotação periódica e revogação imediata em caso de exposição.

## 8. Proteção de estações e endpoints

- Equipamentos com solução de antivírus/EDR atualizada e gerenciada;
- Bloqueio automático de estações por inatividade;
- Restrição à transferência de dados pessoais para mídias externas; quando imprescindível, com cifragem;
- Guarda adequada e descarte seguro de documentos físicos com dados pessoais.

## 9. Segurança no desenvolvimento e na plataforma

- Segregação de ambientes de desenvolvimento, homologação e produção, com dados de produção protegidos;
- Revisão de código e testes de segurança antes da implantação;
- Isolamento lógico entre entidades na plataforma multilocatário (Row-Level Security) para impedir acesso cruzado;
- Gestão de segredos fora do código, validação de entradas, proteção contra vulnerabilidades web comuns e registro de auditoria das operações sensíveis.

## 10. Cópias de segurança e continuidade

- Rotinas regulares de backup dos dados e configurações;
- Cópias em locais seguros e redundantes, com pelo menos uma protegida contra alteração, e restauração testada periodicamente.

## 11. Criptografia e proteção de dados

- Dados em trânsito protegidos por conexões cifradas (TLS/HTTPS, VPN);
- Dados pessoais em repouso protegidos por criptografia e/ou pseudonimização, conforme a criticidade.

## 12. Segurança das comunicações e redes

- Proteção de perímetro por firewall e, quando aplicável, Web Application Firewall (WAF);
- Acessos remotos exclusivamente por conexões seguras e cifradas;
- Proteção do correio eletrônico por antispam, filtros e antivírus.

## 13. Gestão de vulnerabilidades e atualizações

- Aplicação rotineira de patches e atualizações;
- Antivírus/antimalware atualizados e varreduras periódicas;
- Remoção de dados indevidamente expostos e revisão de configurações.

## 14. Gestão de incidentes de segurança

Qualquer suspeita de violação, vazamento, perda de equipamento ou infecção por malware deve ser comunicada imediatamente ao Gestor de Tecnologia e à autoridade competente. A Entidade mantém procedimentos para detectar, isolar, mitigar e erradicar ameaças e para registrar os incidentes. Incidentes que possam acarretar risco ou dano relevante aos titulares são comunicados à ANPD e aos titulares afetados nos prazos da Resolução CD/ANPD nº 15/2024.

## 15. Conformidade, auditoria e revisão

O cumprimento desta PSI é monitorado continuamente. A Política é revisada periodicamente, no mínimo a cada doze meses, ou sempre que houver mudança legal, regulatória, tecnológica ou organizacional relevante.

{{MUNICIPIO}} – {{UF}}, {{DATA_EXTENSO}}.

{{RESPONSAVEL_NOME}}
{{RESPONSAVEL_CARGO}}
{{ENTIDADE}} – CNPJ nº {{CNPJ}}

# DOCUMENTO III — REGISTRO DAS OPERAÇÕES DE TRATAMENTO DE DADOS (RoPA)

Em cumprimento ao art. 37 da LGPD e em conformidade com o modelo de registro publicado pela ANPD, a {{ENTIDADE}} mantém o mapeamento de suas principais atividades de tratamento de dados pessoais.

## Informações do agente de tratamento

- Organização: {{ENTIDADE}}
- CNPJ: {{CNPJ}}
- Endereço: {{ENDERECO}}, {{MUNICIPIO}}/{{UF}}
- Encarregado (DPO): {{DPO_NOME}} – {{DPO_EMAIL}}
- Operadora de tecnologia: {{OPERADORA_NOME}} (CNPJ nº {{OPERADORA_CNPJ}})
- Data do registro / Versão: {{DATA_EXTENSO}} – v. {{VERSAO}}

## ATIVIDADE 1 — ATENDIMENTO AO CIDADÃO E PROTOCOLO

- Papel da Entidade: Controladora
- Finalidade e base legal: registrar e responder solicitações, requerimentos e protocolos. Execução de políticas públicas e obrigação legal (art. 7º, II e III).
- Dados pessoais: nome, CPF, contato e conteúdo da solicitação.
- Categorias de titulares: cidadãos em geral.
- Compartilhamento: órgãos internos competentes e operador de tecnologia.
- Período de armazenamento: conforme tabela de temporalidade de arquivos públicos.
- Medidas de segurança: controle de acesso, isolamento por entidade (RLS), criptografia de tráfego e auditoria.

## ATIVIDADE 2 — ACESSO À INFORMAÇÃO (e-SIC) E OUVIDORIA

- Papel da Entidade: Controladora
- Finalidade e base legal: receber e responder pedidos de informação (LAI 12.527/2011) e manifestações de ouvidoria (Lei 13.460/2017). Obrigação legal (art. 7º, II).
- Dados pessoais: identificação do solicitante (quando não anônimo), contato e teor da manifestação.
- Categorias de titulares: cidadãos, servidores.
- Compartilhamento: órgãos internos responsáveis pela resposta.
- Período de armazenamento: prazos legais da LAI e da legislação de arquivos.
- Medidas de segurança: sigilo do solicitante quando cabível, controle de acesso e auditoria.

## ATIVIDADE 3 — DENÚNCIAS E APP DO CIDADÃO

- Papel da Entidade: Controladora
- Finalidade e base legal: receber e tratar denúncias e demandas (inclusive georreferenciadas). Exercício de competência pública (art. 7º, II e III).
- Dados pessoais: contato do denunciante (quando identificado), localização da ocorrência; possibilidade de denúncia anônima.
- Categorias de titulares: cidadãos.
- Compartilhamento: órgãos de fiscalização e atendimento internos.
- Período de armazenamento: até a conclusão da apuração e prazos de arquivo.
- Medidas de segurança: anonimização quando aplicável, controle de acesso e auditoria.

## ATIVIDADE 4 — GESTÃO DE PESSOAS (SERVIDORES E PRESTADORES)

- Papel da Entidade: Controladora
- Finalidade e base legal: administração do vínculo e cumprimento de obrigações trabalhistas e previdenciárias. Obrigação legal (art. 7º, II).
- Dados pessoais: nome, CPF, RG, dados funcionais e bancários.
- Categorias de titulares: servidores e prestadores.
- Compartilhamento: órgãos previdenciários, fazendários e de controle.
- Período de armazenamento: prazos da legislação trabalhista e previdenciária.
- Medidas de segurança: acesso restrito a RH, guarda de documentos e auditoria.

## ATIVIDADE 5 — OPERAÇÃO DA PLATAFORMA DIGITAL (PORTAL E SISTEMAS)

- Papel da Entidade: Controladora (a {{OPERADORA_NOME}} atua como Operadora)
- Finalidade e base legal: desenvolvimento, hospedagem e operação do portal e sistemas. Tratamento realizado por conta e ordem da Controladora (arts. 39 e 7º da LGPD).
- Dados pessoais: cadastro de usuários, contatos e dados transacionais dos serviços.
- Categorias de titulares: cidadãos e servidores.
- Compartilhamento: restrito à Controladora e a subprovedores de infraestrutura sob contrato.
- Período de armazenamento: definido pela Controladora; ao término do contrato, devolvidos ou eliminados.
- Medidas de segurança: isolamento lógico por entidade (RLS), criptografia, controle de acesso e auditoria.

{{MUNICIPIO}} – {{UF}}, {{DATA_EXTENSO}}.

{{RESPONSAVEL_NOME}}
{{RESPONSAVEL_CARGO}}
{{ENTIDADE}} – CNPJ nº {{CNPJ}}

# DOCUMENTO IV — RELATÓRIO DE MEDIDAS TÉCNICAS E ADMINISTRATIVAS DE SEGURANÇA

A {{ENTIDADE}} atesta que adota e mantém, com o apoio de seus operadores de tecnologia, o escopo de medidas técnicas, administrativas e operacionais descrito a seguir, para a proteção de dados pessoais e a segurança da informação, nos termos dos arts. 46 a 49 da LGPD, em linha com o checklist da ANPD.

## 1. Política de Segurança da Informação
- PSI e Política de Privacidade formalmente adotadas, com revisão periódica, no mínimo anual.

## 2. Conscientização e treinamento
- Ações de conscientização da equipe sobre LGPD e prevenção a phishing e engenharia social;
- Canal para comunicação interna de incidentes e vulnerabilidades.

## 3. Gerenciamento de contratos
- Cláusulas de segurança, confidencialidade e proteção de dados em contratos com operadores e fornecedores;
- Definição clara das relações controlador–operador.

## 4. Controle de acesso
- Acessos sob modelo RBAC e princípio do menor privilégio;
- MFA para sistemas e bases com dados pessoais;
- Gestão de senhas com requisitos de complexidade e cofre de segredos;
- Revogação imediata de acessos no desligamento.

## 5. Segurança dos dados armazenados
- Backups periódicos com armazenamento seguro e redundante;
- Criptografia e pseudonimização conforme a criticidade;
- Minimização da coleta e descarte seguro de mídias e documentos.

## 6. Segurança das comunicações
- Conexões cifradas (TLS/HTTPS) e túneis VPN;
- Firewall e, quando aplicável, WAF, com regras restritivas;
- Proteção de e-mail por antispam e antivírus.

## 7. Gerenciamento de vulnerabilidades
- Aplicação rotineira de patches e atualizações;
- Antivírus/EDR gerenciado e varreduras periódicas.

## 8. Isolamento multilocatário
- Segregação lógica entre entidades por Row-Level Security (RLS), impedindo acesso cruzado de dados.

## 9. Gestão de incidentes
- Procedimentos de detecção, contenção, mitigação e erradicação, com registro dos eventos e comunicação à ANPD e aos titulares nos prazos da Resolução CD/ANPD nº 15/2024.

{{MUNICIPIO}} – {{UF}}, {{DATA_EXTENSO}}.

{{RESPONSAVEL_NOME}}
{{RESPONSAVEL_CARGO}}
{{ENTIDADE}} – CNPJ nº {{CNPJ}}`;
