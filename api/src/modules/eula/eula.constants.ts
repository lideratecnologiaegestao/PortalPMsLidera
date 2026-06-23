/**
 * Versão vigente e conteúdo do Termo de Sigilo e Responsabilidade da Ouvidoria.
 * ADR-0005 Fase 3.
 *
 * Ao alterar o `versao`, todos os ouvidores e assistentes de ouvidoria serão
 * solicitados a aceitar novamente antes de acessar as manifestações.
 */
export const EULA_OUVIDORIA = {
  versao: '1.0',
  titulo: 'Termo de Sigilo e Responsabilidade — Ouvidoria',
  texto: `
1. FINALIDADE E ÂMBITO DE APLICAÇÃO

O presente Termo de Sigilo e Responsabilidade regula o acesso e o tratamento das informações obtidas por servidores públicos no exercício das funções de Ouvidor e Assistente de Ouvidoria junto ao sistema eletrônico de gestão de manifestações da prefeitura. Ao aceitar este Termo, o usuário declara ter lido, compreendido e concordado integralmente com as disposições aqui estabelecidas, como condição indispensável ao acesso ao ambiente de gestão de manifestações.

2. SIGILO DA FONTE (CF/88, ART. 5º, INCISO XIV)

A Constituição Federal, em seu art. 5º, inciso XIV, assegura a todos o acesso à informação e o sigilo da fonte, quando necessário ao exercício profissional. No contexto da Ouvidoria Pública, o sigilo da fonte constitui garantia fundamental ao cidadão que registra manifestações, denúncias e reclamações. O usuário se compromete a não revelar, por qualquer meio — verbal, escrito, eletrônico ou por inferência — a identidade de nenhum manifestante, ainda que a manifestação seja pública ou não seja classificada como sigilosa.

3. PROTEÇÃO DE DADOS PESSOAIS (LGPD — LEI 13.709/2018)

As informações contidas no sistema incluem dados pessoais e, em determinados casos, dados pessoais sensíveis (art. 5º, incisos I e II, da LGPD). O tratamento desses dados somente é autorizado para o cumprimento das finalidades legítimas da Ouvidoria, nos termos do art. 7º, inciso II (cumprimento de obrigação legal), e observadas as bases legais aplicáveis. O usuário deverá adotar as medidas técnicas e administrativas aptas a proteger os dados pessoais de acessos não autorizados e de situações acidentais ou ilícitas de destruição, perda, alteração, comunicação ou difusão, na forma do art. 46 da LGPD.

4. RESTRIÇÃO DE USO DAS INFORMAÇÕES

As informações acessadas por meio do sistema somente poderão ser utilizadas no estrito exercício das atribuições funcionais de Ouvidor ou Assistente de Ouvidoria. É expressamente vedado: (a) divulgar, compartilhar ou transmitir informações ou dados a pessoas não autorizadas, dentro ou fora do órgão; (b) utilizar as informações para fins pessoais, comerciais ou políticos; (c) reproduzir, copiar ou armazenar dados fora dos sistemas homologados pela prefeitura; (d) acessar manifestações que não estejam sob sua responsabilidade funcional.

5. RESPONSABILIDADE CIVIL E ADMINISTRATIVA

A violação das obrigações assumidas neste Termo poderá ensejar: (a) responsabilização administrativa, nos termos da legislação estatutária ou celetista aplicável ao servidor público municipal; (b) responsabilização civil por danos materiais e morais causados ao manifestante, ao órgão ou a terceiros; (c) responsabilização penal, quando a conduta configurar crime, especialmente os previstos nos arts. 153 (divulgação de segredo), 325 (violação de sigilo funcional) e 339 (denunciação caluniosa) do Código Penal, e no art. 66 da Lei 9.605/1998. A Prefeitura preservará os registros de aceite deste Termo para fins de comprovação e accountability, nos termos do art. 37 da LGPD.

6. REGISTRO DE ATIVIDADES E AUDITORIA

O sistema registra automaticamente todas as operações realizadas pelo usuário, incluindo data, hora, endereço IP e tipo de ação. Esses registros constituem evidência auditável e poderão ser utilizados em processos administrativos, judiciais ou de fiscalização pelos órgãos de controle, como Ministério Público, Tribunal de Contas e Autoridade Nacional de Proteção de Dados (ANPD).

7. VIGÊNCIA E REVISÃO

Este Termo entra em vigor no momento do aceite eletrônico e permanece válido enquanto o usuário exercer as funções de Ouvidor ou Assistente de Ouvidoria. A Prefeitura poderá revisar este Termo a qualquer tempo, mediante publicação de nova versão. A cada nova versão, o usuário deverá proceder ao novo aceite antes de retomar o acesso ao sistema, configurando a versão vigente o conjunto de obrigações aplicáveis.

8. DECLARAÇÃO DE CIÊNCIA

Ao aceitar eletronicamente este Termo, o usuário declara: (a) ter lido e compreendido integralmente todas as suas cláusulas; (b) estar ciente de suas responsabilidades legais e funcionais quanto ao sigilo e à proteção dos dados pessoais; (c) comprometer-se a observar fielmente as disposições aqui estabelecidas durante todo o período em que exercer as funções de Ouvidor ou Assistente de Ouvidoria.
`.trim(),
} as const;

export type EulaOuvidoria = typeof EULA_OUVIDORIA;

/** Roles obrigados a aceitar o EULA antes de acessar o painel de ouvidoria. */
export const EULA_ROLES_OBRIGADOS = ['ouvidor', 'assistente_ouvidoria'] as const;
