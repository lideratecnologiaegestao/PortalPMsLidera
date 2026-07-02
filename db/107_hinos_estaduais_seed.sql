-- =====================================================================
-- 107 — Seed: hinos estaduais (base global de símbolos oficiais)
-- =====================================================================
-- Letras extraídas do Wikisource/fontes oficiais (símbolos oficiais dos estados,
-- reproduzidos no Diário Oficial do próprio ente). 26 com letra oficial;
-- 1 sem hino oficial com letra (oficial=false → o gerador do PDF pula).
-- Idempotente (ON CONFLICT). Edite via SQL se precisar corrigir uma letra.
-- =====================================================================

INSERT INTO hinos_estaduais (uf, estado, titulo, letra, autores, fonte, oficial) VALUES
  ('AC', 'Acre', 'Hino do estado do Acre', 'Que este sol a brilhar soberano
Sobre as matas que o vêem com amor
Encha o peito de cada acreano
De nobreza, constância e valor...
Invencíveis e grandes na guerra,
Imitemos o exemplo sem par
Do amplo rio que briga com a terra
Vence-a e entra brigando com o mar

Fulge um astro na nossa bandeira
Que foi tinto no sangue de heróis
Adoremos na estrela altaneira
O mais belo e o melhor dos faróis

Triunfantes da luta voltando
Temos n''alma os encantos do céu
E na fronte serena, radiante,
Imortal e sagrado troféu
O Brasil a exultar acompanha
Nossos passos portanto é subir
Que da glória a divina montanha
Tem no cimo o arrebol do porvir

Fulge um astro na nossa bandeira
Que foi tinto no sangue de heróis
Adoremos na estrela altaneira
O mais belo e o melhor dos faróis

Possuímos um bem conquistado
Nobremente com armas na mão
Se o afrontarem, de cada soldado
Surgirá de repente um leão
Liberdade é o querido tesouro
Que depois do lutar nos seduz
Tal o rio que rola o sol de ouro
Lança um manto sublime de luz

Fulge um astro na nossa bandeira
Que foi tinto no sangue de heróis
Adoremos na estrela altaneira
O mais belo e o melhor dos faróis

Vamos ter como prêmio de guerra
Um consolo que as penas desfaz
Vendo as flores do amor sobre a terra
E no céu o arco-íris da paz
As esposas e mães carinhosas
A esperarem nos lares fiéis
Atapetam a porta de rosas
E cantando entretecem lauréis

Fulge um astro na nossa bandeira
Que foi tinto no sangue de heróis
Adoremos na estrela altaneira
O mais belo e o melhor dos faróis

Mas se audaz estrangeiro algum dia
Nossos brios de novo ofender
Lutaremos com a mesma energia
Sem recuar, sem cair, sem temer
E ergueremos, então, destas zonas
Um tal canto vibrante e viril
Que será como a voz do Amazonas
Ecoando por todo o Brasil

Fulge um astro na nossa bandeira
Que foi tinto no sangue de heróis
Adoremos na estrela altaneira
O mais belo e o melhor dos faróis.', 'Letra: Francisco Mangabeira; Melodia: Mozart Donizetti', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Acre', true),
  ('AL', 'Alagoas', 'Hino do estado de Alagoas', 'Alagoas, estrela radiosa,
Que refulge ao sorrir das manhãs,
Da República és filha donosa,
Magna Estrela entre estrelas irmãs.

A alma pulcra de nossos avós.
Como benção de amor e de paz,
Hoje paira, a fulgir sobre nós,
E maiores, mais fortes nos faz.

Tu, liberdade formosa,
Gloriosa hosana entoas:
Salve, ó terra vitoriosa!
Glória a terra de Alagoas!

Esta terra quem há que idolatre-a
Mais que os filhos que lhe são?
Nós beijamos o solo da Pátria
Como outrora o romano varão.

Nesta terra de sonhos ardentes,
Só, palpitam, como alma de sóis,
Corações, corações de valentes,
Almas grandes de grandes heróis!

Tu, Liberdade formosa,
Triunfal hosana entoas:
Salve, ó terra gloriosa!
Berço de heróis! Alagoas!

Ide, algemas que o pulso prendias
Desta Pátria, outros pulsos prender.
Nestes céus, nas azuis serranias,
Nós, só livres, podemos viver.

E se a luta voltar, hão-de os bravos
Ter a imagem da Pátria por fé.
Que Alagoas não procria escravos:
Vence ou morre!...Mas sempre de pé

Tu, Liberdade formosa,
Ridentes hinos entoas:
Salve, ó terra grandiosa
De luz, de paz, Alagoas!

Salve, ó terra que, entrando no templo.
Calmo e ovante, da indústria te vás;
Dando as tuas irmãs este exemplo
De trabalho e progresso na paz!

Sus! Os hinos de glórias já troam!...
A teus pés os rosais vêm florir!...
Os clarins e fanfarras ressoam,
Te levando em triunfo ao porvir!

Tu, liberdade formosa,
Ao trabalho hosanas entoas!
Salve, ó terra futurosa!
Glória a terra de Alagoas!', 'Letra: Luiz Mesquita; Melodia: Benedito Silva', 'https://pt.wikisource.org/wiki/Hino_do_estado_de_Alagoas', true),
  ('AP', 'Amapá', 'Canção do Amapá (Hino do estado do Amapá)', 'Eia povo destemido
Deste rincão brasileiro.
Seja sempre teu grito partido
De leal coração altaneiro.
Salve rico o torrão do Amapá
Solo fértil de imensos tesouros
Os teus filhos, alegres, confiam
Num futuro repleto de louros.

Se o momento chegar algum dia
De morrer pelo nosso Brasil
Hão de ver deste povo a porfia,
Pelejar nestes céus cor de anil.

Se o momento chegar algum dia
De morrer pelo nosso Brasil
Hão de ver deste povo a porfia,
Pelejar nestes céus cor de anil.

Heia povo herói, varonil
Descendente da raça guerreira
Ergue forte, leal, sobranceira,
A grandeza de nosso Brasil.
Salve rico o torrão do Amapá
Solo fértil de imensos tesouros
Os teus filhos, alegres, confiam
Num futuro repleto de louros.

Se o momento chegar algum dia
De morrer pelo nosso Brasil
Hão de ver deste povo a porfia,
Pelejar nestes céus cor de anil.

Se o momento chegar algum dia
De morrer pelo nosso Brasil
Hão de ver deste povo a porfia,
Pelejar nestes céus cor de anil.', 'Letra: Joaquim Gomes Diniz; Melodia: Oscar Santos', 'https://pt.wikisource.org/wiki/Can%C3%A7%C3%A3o_do_Amap%C3%A1', true),
  ('AM', 'Amazonas', 'Hino do estado do Amazonas', 'Nas paragens da história o passado
é de guerras, pesar e alegria,
é vitória pousando suas asas
sobre o verde da paz que nos guia.

Assim foi que nos tempos escuros
da conquista apoiada ao canhão,
nossos povos plantaram seu berço,
homens livres, na planta do chão.

Amazonas, de bravos que doam,
sem orgulho nem falsa nobreza,
aos que sonham, teu canto de lenda,
aos que lutam, mais vida e riqueza.

Hoje o tempo se faz claridade,
só triunfa a esperança que luta,
não há mais o mistério e das matas
um rumor de alvorada se escuta.

A palavra em ação se transforma
e a bandeira que nasce do povo
liberdade há de ter no seu pano,
os grilhões destruindo de novo.

Amazonas, de bravos que doam,
sem orgulho nem falsa nobreza,
aos que sonham, teu canto de lenda,
aos que lutam, mais vida e riqueza.

Tão radioso amanhece o futuro
nestes rios de pranto selvagem,
que os tambores da glória despertam
ao clarão de uma eterna paisagem.

Mas viver é destino dos fortes,
nos ensina, lutando, a floresta,
pela vida que vibra em seus ramos,
pelas aves, suas cores, sua festa.

Amazonas, de bravos que doam,
sem orgulho nem falsa nobreza,
aos que sonham, teu canto de lenda,
aos que lutam, mas vida e riqueza.', 'Letra: Jorge Tufic Alaúzo; Melodia: Cláudio Santoro', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Amazonas', true),
  ('BA', 'Bahia', 'Hino ao Dois de Julho - Hino do estado da Bahia', 'Nasce o sol ao 2 de Julho,
Brilha mais que no primeiro!
É sinal que neste dia
Até o sol, até o sol é brasileiro.

Nunca mais, nunca mais o despotismo
Regerá, regerá nossas ações!
Com tiranos não combinam
Brasileiros, brasileiros corações!(bis)
Com tiranos não combinam
Brasileiros, brasileiros corações!

Cresce! Oh! Filho de minh’alma
Para a Pátria defender!
O Brasil já tem jurado
Independência, independência ou morrer!

Nunca mais, nunca mais o despotismo
Regerá, regerá nossas ações!
Com tiranos não combinam
Brasileiros, brasileiros corações!(bis)
Com tiranos não combinam
Brasileiros, brasileiros corações!

Salve Oh! Rei das campinas
De Cabrito e Pirajá!
Nossa pátria, hoje livre,
Dos tiranos, dos tiranos não será!

Nunca mais, nunca mais o despotismo
Regerá, regerá nossas ações!
Com tiranos não combinam
Brasileiros, brasileiros corações!(bis)
Com tiranos não combinam
Brasileiros, brasileiros corações!', 'Letra: Ladislau dos Santos Titara; Melodia: José dos Santos Barreto', 'https://pt.wikisource.org/wiki/Hino_do_estado_da_Bahia', true),
  ('CE', 'Ceará', 'Hino do estado do Ceará', 'Terra do sol, do amor, terra da luz!
Soa o clarim que a tua glória conta!
Terra, o teu nome a fama aos céus remonta
Em clarão que seduz!
Nome que brilha - esplêndido luzeiro
Nos fulvos braços de ouro do cruzeiro!

Mudem-se em flor as pedras dos caminhos!
Chuvas de pratas rolem das estrelas...
E despertando, deslumbrada ao vê-las,
Ressoe a voz dos ninhos...
Há de florar nas rosas e nos cravos
Rubros o sangue ardente dos escravos.

Seja o teu verbo a voz do coração,
- Verbo de paz e amor do Sul ao Norte!
Ruja teu peito em luta contra a morte,
Acordando a amplidão,
Peito que deu alívio a quem sofria
E foi o sol iluminando o dia!

Tua jangada afoita enfune o pano!
Vento feliz conduza a vela ousada!
Que importa que o teu barco seja um nada.
Na vastidão do oceano,
Se à proa vão heróis e marinheiros
E vão no peito corações guerreiros?

Sim, nós te amamos, em aventuras de mágoas!
Porque esse chão que embebe a água dos rios
Há de florar em meses, nos estios
E bosques, pelas águas!
Selvas e rios, serras florestas
Brotem do solo em rumorosas festas!

Abra-se ao vento o teu pendão natal!
Sobre as revoltas águas dos teus mares!
E desfraldando diga aos céus e aos mares
A vitória imortal!
Que foi de sangue, em guerras leais e francas
E foi na paz, da cor das hóstias brancas.', 'Letra: Thomaz Lopes; Melodia: Alberto Nepomuceno', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Cear%C3%A1', true),
  ('DF', 'Distrito Federal', 'Hino a Brasília', 'Todo o Brasil vibrou
E nova luz brilhou
Quando Brasília fez maior a sua glória
Com esperança e fé
Era o gigante em pé
Vendo raiar outra alvorada em sua história

Com Brasília no coração
Epopeia surgiu do chão
O candango sorri feliz
Símbolo da força de um país!

Capital de um Brasil audaz
Bom na luta, melhor na paz
Salve o povo que assim te quis
Símbolo da força de um país!', 'Letra: Geir Campos; Melodia: Neusa Pinho França Almeida', 'https://pt.wikisource.org/wiki/Hino_a_Bras%C3%ADlia', true),
  ('ES', 'Espírito Santo', 'Hino do Estado do Espírito Santo', 'Surge ao longe a estrela prometida,
Que a luz sobre nós quer espalhar;
Quando ela ocultar-se no horizonte,
Há de o sol nossos feitos lumiar.

Nossos braços são fracos, que importa?
Temos fé, temos crença a fartar;
Supre a falta de idade e de força,
Peitos nobres, valentes, sem par.

Salve o povo espíritossantense!
Herdeiro de um passado glorioso,
Somos nós a falange do presente,
Em busca de um futuro esperançoso.

Saudemos nossos pais e mestres,
A Pátria, que estremece de alegria,
Na hora em que seus filhos, reunidos,
Dão exemplos de amor e de harmonia.

Venham louros, coroas, venham flores,
Ornar os troféus da mocidade;
Se as glórias do presente forem poucas;
Acenai para nós posteridade!

Salve o povo espíritossantense!
Herdeiro de um passado glorioso,
Somos nós a falange do presente,
Em busca de um futuro esperançoso.', 'Letra: Peçanha Póvoa; Melodia: Artur Napoleão', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Esp%C3%ADrito_Santo', true),
  ('GO', 'Goiás', 'Hino do Estado de Goiás', 'Santuário da Serra Dourada
Natureza dormindo no cio
Anhangüera, malícia e magia,
Bota fogo nas águas do rio.

Vermelho, de ouro assustado,
Foge o índio na sua canoa.
Anhangüera bateia o tempo:
— Levanta, arraial Vila Boa!

Terra Querida
Fruto da vida,
Recanto da Paz.
Cantemos aos céus,
Regência de Deus,
Louvor, louvor a Goiás!

A cortina se abre nos olhos,
Outro tempo agora nos traz.
É Goiânia, sonho e esperança,
É Brasília pulsando em Goiás!

O cerrado, os campos e as matas,
A indústria, gado, cereais.
Nossos jovens tecendo o futuro,
Poesia maior de Goiás!

Terra Querida
Fruto da vida,
Recanto da Paz.
Cantemos aos céus,
Regência de Deus,
Louvor, louvor a Goiás!

A colheita nas mãos operárias,
Benze a terra, minérios e mais:
— O Araguaia dentro dos olhos,
eu me perco de amor por Goiás!

Terra Querida
Fruto da vida,
Recanto da Paz.
Cantemos aos céus,
Regência de Deus,
Louvor, louvor a Goiás!', 'Letra: José Mendonça Teles; Melodia: Joaquim Jayme', 'https://pt.wikisource.org/wiki/Hino_do_estado_de_Goi%C3%A1s', true),
  ('MA', 'Maranhão', 'Hino do Estado do Maranhão', 'Entre o rumor das selvas seculares,
Ouviste um dia no espaço azul, vibrando,
O troar das bombardas nos combates,
E, após, um hino festival, soando.

Salve Pátria, Pátria amada!
Maranhão, Maranhão, berço de heróis,
Por divisa tens a glória
Por nume, nossos avós.

Era a guerra, a vitória, a morte e a vida
E, com a vitória, a glória entrelaçada,
Caía do invasor a audácia estranha,
Surgia do direito a luz dourada.

Reprimiste o flamengo aventureiro,
E o forçaste a no mar buscar guarida
E dois séculos depois, disseste ao luso:
- A liberdade é o sol que nos dá vida.

Quando às irmãs os braços estendeste,
Foi com a glória a fulgir no teu semblante
Sempre envolta na tua luz celeste,
Pátria de heróis, tens caminhado avante.

E na estrada esplendente do futuro,
Fitas o olhar, altiva e sobranceira,
Dê-te o porvir as glórias do passado
Seja de glória tua existência inteira.', 'Letra: Antônio Baptista Barbosa de Godois; Melodia: Antônio dos Reis Raiol', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Maranh%C3%A3o', true),
  ('MT', 'Mato Grosso', 'Hino do Estado de Mato Grosso', 'Limitando, qual novo colosso,
O ocidente do imenso Brasil,
Eis aqui, sempre em flor. Mato Grosso,
Nosso berço glorioso e gentil!
Eis a terra das minas faiscantes,
Eldorado como outros não há
Que o valor de imortais bandeirantes
Conquistou ao feroz Paiaguás!

Salve, terra de amor, terra do ouro,
Que sonhara Moreira Cabral!
Chova o céu dos seus dons o tesouro
Sobre ti, bela terra natal!

Terra noiva do Sol! Linda terra!
A quem lá, do teu céu todo azul,
Beija, ardente, o astro louro, na serra
E abençoa o Cruzeiro do Sul!
No teu verde planalto escampado,
E nos teus pantanais como o mar,
Vive solto aos milhões, o teu gado,
Em mimosas pastagens sem par!

Salve, terra de amor, terra do ouro,
Que sonhara Moreira Cabral!
Chova o céu dos seus dons o tesouro
Sobre ti, bela terra natal!

Hévea fina, erva-mate preciosa,
Palmas mil, são teus ricos florões,
E da fauna e da flora o índio goza,
A opulência em teus virgens sertões.
O diamante sorri nas grupiaras
Dos teus rios que jorram, a flux,
A hulha branca das águas tão claras,
Em cascatas de força e de luz.

Salve, terra de amor, terra do ouro,
Que sonhara Moreira Cabral!
Chova o céu dos seus dons o tesouro
Sobre ti, bela terra natal!

Dos teus bravos a glória se expande
De Dourados até Corumbá,
O ouro deu-te renome tão grande
Porém mais, nosso amor te dará!
Ouve, pois, nossas juras solenes
De fazermos em paz e união,
Teu progresso imortal como a fênix
Que ainda timbra o teu nobre brasão.

Salve, terra de amor, terra do ouro,
Que sonhara Moreira Cabral!
Chova o céu dos seus dons o tesouro
Sobre ti, bela terra natal!', 'Letra: Dom Aquino Corrêa; Melodia: Emílio Heine', 'https://pt.wikisource.org/wiki/Hino_do_estado_de_Mato_Grosso', true),
  ('MS', 'Mato Grosso do Sul', 'Hino do Estado de Mato Grosso do Sul', 'Os celeiros de farturas
Sob um céu de puro azul
Reforjaram em Mato Grosso do Sul
Uma gente audaz

Tuas matas e teus campos
O esplendor do Pantanal
E teus rios são tão ricos
Que não há igual

Estribilho:
A pujança e a grandeza
De fertilidades mil
São o orgulho e a certeza
Do futuro do Brasil

Moldurados pelas serras
Campos grandes: Vacaria
Rememoram desbravadores heróis
Tanta galhardia!

Vespasiano, Camisão
E o tenente Antônio João
Guaicurus, Ricardo Franco
Glória e tradição!

A pujança e a grandeza
De fertilidades mil
São o orgulho e a certeza
Do futuro do Brasil', 'Letra: Jorge Antonio Siufi e Otávio Gonçalves Gomes; Melodia: Radamés Gnattali', 'https://pt.wikisource.org/wiki/Hino_do_estado_de_Mato_Grosso_do_Sul', true),
  ('MG', 'Minas Gerais', 'Oh! Minas Gerais (hino extraoficial)', NULL, 'Letra de José Duduca de Moraes e Manoel Araújo; melodia adaptada da canção napolitana "Vieni sul mar"', 'https://pt.wikipedia.org/wiki/Hino_de_Minas_Gerais', false),
  ('PA', 'Pará', 'Hino do Pará', 'Salve, ó terra de ricas florestas,
Fecundadas ao sol do Equador!
Teu destino é viver entre festas,
Do progresso, da paz e do amor!
Salve, ó terra de ricas florestas,
Fecundadas ao sol do Equador!

Ó Pará, quanto orgulhas ser filho,
De um colosso, tão belo e tão forte;
Juncaremos de flores teu trilho,
Do Brasil, sentinela do Norte.
E a deixar de manter esse brilho,
Preferimos, mil vezes, a morte!

Salve, ó terra de rios gigantes,
D''Amazônia, princesa louçã!
Tudo em ti são encantos vibrantes,
Desde a indústria à rudeza pagã,
Salve, ó terra de rios gigantes,
D''Amazônia, princesa louçã!', 'Letra de Artur Teódulo Santos Porto; música de Nicolino Milano', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Par%C3%A1', true),
  ('PB', 'Paraíba', 'Hino do Estado da Paraíba', 'Salve, berço do heroísmo,
Paraíba, terra amada,
Via-láctea do civismo
Sob o céu do amor traçada!

No famoso diadema
Que da Pátria a fronte aclara
Pode haver mais ampla gema:
Não há pérola mais rara!

Quando repelindo o assalto
Do estrangeiro, combatias,
Teu valor brilhou tão alto
Que uma estrela parecias!

Nesse embate destemido
Teu denodo foi modelo:
Qual rubi rubro incendido
Flamejaste em Cabedelo!

Depois, quando o Sul, instante,
Clamou por teu braço forte,
O teu gládio lampejante
Foi o diamante do Norte!

Quando o brado dos escravos,
Fez acho em teu peito santo,
Raiou a esperança aos bravos,
Na esmeralda do teu manto.

Quando, enfim, a madrugada
De novembro nos deslumbra,
Como um sol a tua espada
Dardeja e espanca a penumbra!

De cada nação generosa,
De que deste o são exemplo,
Arde a lâmpada formosa,
Da república do templo.

Hoje um canto peregrino,
Podes erguer de ufania,
Podes chefiar num hino,
Teu colar de pedrarias.

Temos dos filhos que desvelas,
No peito couraça altiva.
E no seio das donzelas,
Gorgeios de patativa…

Tens um passado de glória,
Tens um presente sem jaça:
Do porvir canta a vitória
E, ao teu gesto a luz se faça!

Salve, berço do heroísmo,
Paraíba, terra amada,
Via-láctea do civismo
Sob o céu do amor traçada!', 'Letra de Francisco Aurélio de Figueiredo e Melo; música de Abdon Felinto Milanez', 'https://pt.wikisource.org/wiki/Hino_do_estado_da_Para%C3%ADba', true),
  ('PR', 'Paraná', 'Hino do Paraná', 'Entre os astros do Cruzeiro,
És o mais belo a fulgir
Paraná! Serás luzeiro!
Avante! Para o porvir!

O teu fulgor de mocidade,
Terra! Tens brilho de alvorada
Rumores de felicidade!
Canções e flores pela estrada.

Entre os astros do Cruzeiro,
És o mais belo a fulgir
Paraná! Serás luzeiro!
Avante! Para o porvir!

Outrora apenas panorama
De campos ermos e florestas
Vibras agora a tua fama
Pelos clarins das grandes festas!

Entre os astros do Cruzeiro,
És o mais belo a fulgir
Paraná! Serás luzeiro!
Avante! Para o porvir!

A glória... A glória... Santuário!
Que o povo aspire e que idolatre-a
E brilharás com brilho vário,
Estrela rútila da Pátria!

Entre os astros do Cruzeiro,
És o mais belo a fulgir
Paraná! Serás luzeiro!
Avante! Para o porvir!

Pela vitória da mais forte,
Lutar! Lutar! Chegada é a hora.
Para o Zenith! Eis o teu norte!
Terra! Já vem rompendo a aurora!

Entre os astros do Cruzeiro,
És o mais belo a fulgir
Paraná! Serás luzeiro!
Avante! Para o porvir!', 'Letra de Domingos Virgílio Nascimento; música de Bento João de Albuquerque Mossurunga', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Paran%C3%A1', true),
  ('PE', 'Pernambuco', 'Hino de Pernambuco', 'Coração do Brasil, em teu seio
Corre o sangue de heróis - rubro veio
Que há de sempre o valor traduzir.
És a fonte da vida e da história
Desse povo coberto de glória,
O primeiro, talvez, no porvir.

Salve ó terra dos altos coqueiros!
De belezas soberbo estendal!
Nova Roma de bravos guerreiros
Pernambuco imortal! Imortal!

Esses montes e vales e rios,
Proclamando o valor de teus brios,
Reproduzem batalhas cruéis.
No presente és a guarda avançada,
Sentinela indormida e sagrada
Que defende da pátria os lauréis.

Salve ó terra dos altos coqueiros!
De belezas soberbo estendal!
Nova Roma de bravos guerreiros
Pernambuco imortal! Imortal!

Do futuro és a crença, a esperança
Desse povo que altivo descansa
Como o atleta depois de lutar.
No passado o teu nome era um mito,
Era o sol a brilhar no infinito,
Era a glória na terra a brilhar.

Salve ó terra dos altos coqueiros!
De belezas soberbo estendal!
Nova Roma de bravos guerreiros
Pernambuco imortal! Imortal!

A República é filha de Olinda,
Alva estrela, que fulge e não finda
De esplender com seus raios de luz.
Liberdade, um teu filho proclama!
Dos escravos o peito se inflama
Ante o sol dessa Terra da Cruz!

Salve ó terra dos altos coqueiros!
De belezas soberbo estendal!
Nova Roma de bravos guerreiros
Pernambuco imortal! Imortal!', 'Letra de Oscar Brandão da Rocha; música de Nicolino Milano', 'https://pt.wikisource.org/wiki/Hino_do_estado_de_Pernambuco', true),
  ('PI', 'Piauí', 'Hino do Piauí', 'Salve a terra que aos céus arrebatas
Nossas almas nos dons que possuis
A esperança nos verdes das matas
A saudade das serras azuis

Piauí, terra querida
Filha do Sol do Equador
Pertencem-te a nossa vida
Nosso sonho, nosso amor!
As águas do Parnaíba
Rio abaixo, rio arriba
Espalhem pelo sertão
E levem pelas quebradas
Pelas várzeas e chapadas
Teu canto de exaltação

Desbravando-te os campos distantes
Na missão do trabalho e da paz
A aventura de dois bandeirantes
A semente da pátria nos traz

Piauí, terra querida
Filha do Sol do Equador
Pertencem-te a nossa vida
Nosso sonho, nosso amor!
As águas do Parnaíba
Rio abaixo, rio arriba
Espalhem pelo sertão
E levem pelas quebradas
Pelas várzeas e chapadas
Teu canto de exaltação

Sob o céu de imortal claridade
Nosso sangue vertemos por ti
Vendo a pátria pedir liberdade
O primeiro que luta é o Piauí

Piauí, terra querida
Filha do Sol do Equador
Pertencem-te a nossa vida
Nosso sonho, nosso amor!
As águas do Parnaíba
Rio abaixo, rio arriba
Espalhem pelo sertão
E levem pelas quebradas
Pelas várzeas e chapadas
Teu canto de exaltação.

Possas tu no trabalho fecundo
E com fé, fazer sempre melhor
Para que no concerto do mundo
O Brasil seja ainda maior

Piauí, terra querida
Filha do Sol do Equador
Pertencem-te a nossa vida
Nosso sonho, nosso amor!
As águas do Parnaíba
Rio abaixo, rio arriba
Espalhem pelo sertão
E levem pelas quebradas
Pelas várzeas e chapadas
Teu canto de exaltação

Possas tu conservando a pureza
Do teu povo leal progredir
Envolvendo na mesma grandeza
O passado, o presente e o porvir!

Piauí, terra querida
Filha do Sol do Equador
Pertencem-te a nossa vida
Nosso sonho, nosso amor!
As águas do Parnaíba
Rio abaixo, rio arriba
Espalhem pelo sertão
E levem pelas quebradas
Pelas várzeas e chapadas
Teu canto de exaltação', 'Letra de Antônio Francisco da Costa e Silva; música de Firmina Sobreira Cardoso e Leopoldo Damascena Ferreira', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Piau%C3%AD', true),
  ('RJ', 'Rio de Janeiro', 'Hino do Estado do Rio de Janeiro (Hino 15 de Novembro)', 'Fluminenses, avante! Marchemos!
Às conquistas da paz, povo nobre!
Somos livres, alegres brademos,
Que uma livre bandeira nos cobre.
Fluminenses, eia! Alerta!
Ódio eterno à escravidão!
Que na Pátria enfim liberta
Brilha à luz da redenção!
Nesta Pátria, do amor áureo templo,
Cantam hinos a Deus nossas almas;
Veja o mundo surpreso este exemplo,
De vitória, entre flores e palmas.
Fluminenses, eia! Alerta!...

Nunca mais, nunca mais nesta terra
Virão cetros mostrar falsos brilhos;
Neste solo que encantos encerra,
Livre Pátria terão nossos filhos.
Fluminenses, eia! Alerta!...
Ao cantar delirante dos hinos
Essa noite, dos tronos nascida,
Deste sol, aos clarões diamantinos,
Fugirá, sempre, sempre vencida.
Fluminenses, eia! Alerta!...
Nossos peitos serão baluartes
Em defesa da Pátria gigante;
Seja o lema do nosso estandarte:
Paz e amor! Fluminenses, avante!', 'Letra de Antônio José Soares de Souza Júnior; música de João Elias da Cunha', 'https://pt.wikisource.org/wiki/Hino_15_de_Novembro', true),
  ('RN', 'Rio Grande do Norte', 'Hino do Rio Grande do Norte', 'Rio Grande do Norte esplendente
Indomado guerreiro e gentil,
Nem tua alma domina o insolente,
Nem o alarde o teu peito viril!

Na vanguarda, na fúria da guerra
Já domaste o astuto holandês!
E nos pampas distantes quem erra,
Ninguém ousa afrontar-te outra vez!

Da tua alma nasceu Miguelinho,
Nós, como ele, nascemos também,
Do civismo no rude caminho,
Sua glória nos leva e sustém!

A tua alma transborda de glória!
No teu peito transborda o valor!
Nos arcanos revoltos da história
Potiguares é o povo senhor!

Foi de ti que o caminho encantado
Da Amazônia Caldeira encontrou,
Foi contigo o mistério escalado,
Foi por ti que o Brasil acordou!

Da conquista formaste a vanguarda,
Tua glória flutua em Belém!
Teu esforço o mistério inda guarda
Mas não pode negá-lo a ninguém!

É por ti que teus filhos descantam,
Nem te esquecem, distante, jamais!
Nem os bravos seus feitos suplantam
Nem teus filhos respeitam rivais!

A tua alma transborda de glória!
No teu peito transborda o valor!
Nos arcanos revoltos da história
Potiguares é o povo senhor!

Terra filha de sol deslumbrante,
És o peito da Pátria e de um mundo
A teus pés derramar trepidante,
Vem atlante o seu canto profundo!

Linda aurora que incende o teu seio,
Se recama florida e sem par,
Lembra uma harpa, é um salmo, um gorjeio,
Uma orquestra de luz sobre o mar!

Tuas noites profundas, tão belas,
Enchem a alma de funda emoção,
Quanto sonho na luz das estrelas,
Quanto adejo no teu coração

A tua alma transborda de glória!
No teu peito transborda o valor!
Nos arcanos revoltos da história
Potiguares é o povo senhor!', 'Letra de Dr. José Augusto Meira Dantas; música de José Domingos Brandão', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Rio_Grande_do_Norte', true),
  ('RS', 'Rio Grande do Sul', 'Hino Rio-Grandense', 'Como a aurora precursora
do farol da divindade
foi o Vinte de Setembro
o precursor da liberdade.

Mostremos valor, constância,
Nesta ímpia e injusta guerra,
Sirvam nossas façanhas
De modelo a toda terra,
De modelo a toda terra,
Sirvam nossas façanhas
De modelo a toda terra.

Mas não basta pra ser livre
Ser forte, aguerrido e bravo,
Povo que não tem virtude
Acaba por ser escravo.

Mostremos valor, constância,
Nesta ímpia e injusta guerra,
Sirvam nossas façanhas
De modelo a toda terra,
De modelo a toda terra,
Sirvam nossas façanhas
De modelo a toda terra.', 'Letra de Francisco Pinto da Fontoura (Serafim); música de Joaquim José de Mendanha; harmonização de Antônio Corte Real', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Rio_Grande_do_Sul', true),
  ('RO', 'Rondônia', 'Hino de Rondônia', 'Quando nosso céu se faz moldura
Para engalanar a natureza,
Nós, os Bandeirantes de Rondônia,
Nos orgulhamos de tanta beleza.

Como sentinelas avançadas,
Somos destemidos pioneiros
Que nestas paragens do poente
Gritam com força: somos brasileiros!

Nesta fronteira, de nossa pátria,
Rondônia trabalha febrilmente
E nas oficinas e nas escolas
A orquestração empolga toda gente,

Braços e mentes forjam cantando
A apoteose deste rincão
Que com orgulho exaltaremos,
Enquanto nos palpita o coração.

Azul, nosso céu é sempre azul,
Que Deus o mantenha sem rival,
Cristalino, muito puro,
E o conserve sempre assim.

Aqui, toda vida se engalana
De belezas tropicais,
Nossos lagos, nossos rios,
Nossas matas, tudo enfim…', 'Letra de Joaquim de Araújo Lima; música de José de Mello e Silva', 'https://rondonia.ro.gov.br/pc/sobre/hinos/hino-de-rondonia/', true),
  ('RR', 'Roraima', 'Hino de Roraima', 'Todos nós exaltamos Roraima
Que é uma terra de gente viril
É benesse das mãos de Jesus
Para um povo feliz, varonil

Amazônia do Norte da Pátria!
Mais bandeira pra o nosso Brasil
Caminhamos sorrindo, altaneiros
Almejamos ser bons brasileiros

Nós queremos te ver poderoso
Lindo berço, rincão Pacaraima!
Teu destino será glorioso
Nós te amamos, querido Roraima!

Tua flora, o minério e a fauna
São riquezas de grande valor
Tuas águas são limpas, são puras
Tuas forças traduzem vigor

Que beleza possui nossa Terra
Sinfonia que inspira o amor
O sucesso é a meta, o farol
No lavrado banhado de sol

Nós queremos te ver poderoso
Lindo berço, rincão Pacaraima!
Teu destino será glorioso
Nós te amamos, querido Roraima!', 'Letra de Dorval Magalhães; música de Dirson Félix Costa', 'https://abrasoffa.org.br/hino/hino-de-roraima/', true),
  ('SC', 'Santa Catarina', 'Hino de Santa Catarina', 'Sagremos num hino de estrelas e flores
Num canto sublime de glórias e luz
As festas que os livres frementes de ardores
Celebram nas terras gigantes da cruz

Quebram-se férreas cadeias
Rojam algemas no chão
Do povo nas epopeias
Fulge a luz da redenção

No céu peregrino da pátria gigante
Que é berço de glórias e berço de heróis
Levanta-se em ondas de luz deslumbrante
O Sol, liberdade cercada de sóis

Pela força do direito
Pela força da razão
Cai por terra o preconceito
Levanta-se uma nação

Não mais diferenças de sangues e raças
Não mais regalias sem termos fatais
A força está toda do povo nas massas
Irmãos somos todos e todos iguais

Da liberdade adorada
No deslumbrante clarão
Banha o povo a fronte ousada
E avigora o coração

O povo que é grande mas não vingativo
Que nunca a justiça e o direito calou
Com flores e festas deu vida ao cativo
Com festas e flores o trono esmagou

Quebrou-se a algema do escravo
E nesta grande nação
É cada homem um bravo
Cada bravo um cidadão', 'Letra: Horácio Nunes Pires; Música: José Brazilício de Souza', 'https://www.letras.mus.br/hinos-de-estados/126621/', true),
  ('SP', 'São Paulo', 'Hino dos Bandeirantes (Hino do Estado de São Paulo)', 'Paulista, pára um só instante
Dos teus quatro séculos ante
A tua terra sem fronteiras,
O teu São Paulo das "bandeiras"!

Deixa para trás o presente
Olha o passado à frente!
Vem com Martim Afonso a São Vicente!
Galga a Serra do Mar!

Além, lá no alto,
Bartira sonha sossegadamente
Na sua rede virgem do Planalto.
Espreita-a entre a folhagem de esmeralda;
Beija-lhe a Cruz de Estrelas da grinalda!

Agora, escuta!
Aí vem, moendo o cascalho,
Botas-de-nove-léguas, João Ramalho.
Serra-acima, dos baixos da restinga,
Vem subindo a roupeta
De Nóbrega e de Anchieta.
Contempla os Campos de Piratininga!

Este é o Colégio.
Adiante está o sertão.

Vai! Segue a "entrada"!
Enfrenta! Avança! Investe!
Norte-Sul, Leste-Oeste!

Em "bandeira" ou "monção",
Doma os índios bravios;
Rompe a selva, abre minas, vara rios!

No leito da jazida
Acorda a pedraria adormecida,
Retorce os braços rijos
E tira o ouro dos seus esconderijos!

Bateia, escorre a ganga,
Lavra, planta, povoa!
Depois volta à garoa!

E adivinha
Através dessa cortina
Na tardinha enfeitada de miçanga!
A Sagrada Colina
Ao Grito do Ipiranga!

Entreabre agora os véus
Do Cafezal, Senhor dos Horizontes!
Verás fluir por plainos, vales, montes,
Usinas, gares, silos, cais, arranha-céus!', 'Letra: Guilherme de Almeida; Música: Spartaco Rossi (versão mais difundida)', 'https://pt.wikisource.org/wiki/Hino_dos_Bandeirantes', true),
  ('SE', 'Sergipe', 'Hino de Sergipe (Alegrai-vos, Sergipanos)', 'Alegrai-vos, sergipanos,
Eis que surge a mais bela aurora
Do áureo jucundo dia
Que a Sergipe honra e decora.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

A bem de seus filhos todos,
Quis o Brasil se lembrar
De o seu imenso terreno
Em províncias separar.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Isto se fez, mas, contudo
Tão cômodo não ficou,
Como por más consequências
Depois se verificou.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Cansado da dependência
Com a província maior,
Sergipe ardente procura
Um bem mais consolador.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Alça a voz que o trono sobe,
Que ao Soberano excitou;
E curvo o trono a seus votos,
Independente ficou.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Eis, patrícios sergipanos,
Nossa dita singular,
Com doces e alegres cantos
Nós devemos festejar.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Mandemos porém ao longe
Essa espécie de rancor
Que ainda hoje alguém conserva
Aos da província maior.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

A união mais constante
Nos deverá consagrar,
Sustentando a liberdade
De que queremos gozar.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.

Se vier danosa intriga
Nossos lares habitar,
Desfeitos aos nossos gostos
Tudo em flor há de murchar.

O dia brilhante
Que vimos raiar,
Com cânticos doces
Vamos festejar.', 'Letra: Manoel Joaquim de Oliveira Campos; Música: Frei José de Santa Cecília', 'https://pt.wikipedia.org/wiki/Hino_de_Sergipe', true),
  ('TO', 'Tocantins', 'Hino do Tocantins', 'O sonho secular já se realizou
Mais um astro brilha dos céus, aos confins
Este povo forte
Do sofrido Norte
Teve melhor sorte
Nasce o Tocantins

Levanta altaneiro, contempla o futuro
Caminha seguro, persegue teus fins
Por tua beleza, por tuas riquezas
És o Tocantins!

Do bravo Ouvidor, a saga não parou
Contra a oligarquia, o povo se voltou
Somos brava gente
Simples, mas valente
Povo consciente
Sem medo e temor

Levanta altaneiro, contempla o futuro
Caminha seguro, persegue teus fins
Por tua beleza, por tuas riquezas
És o Tocantins!

De Segurado a Siqueira, o ideal seguiu
Contra tudo e contra todos, firme e forte
Contra a tirania
Da oligarquia
O povo queria
Libertar o Norte!

Levanta altaneiro, contempla o futuro
Caminha seguro, persegue teus fins
Por tua beleza, por tuas riquezas
És o Tocantins!

Teus campos, tuas matas, tua imensidão
Teu belo Araguaia lembra o paraíso
Tua rica história
Guardo na memória
Pela tua Glória
Morro, se preciso!

Levanta altaneiro, contempla o futuro
Caminha seguro, persegue teus fins
Por tua beleza, por tuas riquezas
És o Tocantins!

Pulsa no peito o orgulho da luta de Palmas
Feita com a alma que a beleza irradia
Vejo tua gente
Tua alma xerente
Teu povo valente
Que venceu um dia!

Levanta altaneiro, contempla o futuro
Caminha seguro, persegue teus fins
Por tua beleza, por tuas riquezas
És o Tocantins!', 'Letra: Liberato Costa Póvoa; Música: Abiezer Alves da Rocha', 'https://pt.wikisource.org/wiki/Hino_do_estado_do_Tocantins', true)
ON CONFLICT (uf) DO UPDATE SET
  estado = EXCLUDED.estado, titulo = EXCLUDED.titulo, letra = EXCLUDED.letra,
  autores = EXCLUDED.autores, fonte = EXCLUDED.fonte, oficial = EXCLUDED.oficial,
  atualizado_em = now();
