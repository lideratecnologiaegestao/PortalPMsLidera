/**
 * Hinos oficiais da União (domínio público) — reproduzidos nas páginas finais
 * do Diário Oficial. Textos oficiais fixos.
 * - Hino Nacional Brasileiro: letra de Joaquim Osório Duque-Estrada, música de
 *   Francisco Manuel da Silva (Lei nº 5.700/1971).
 * - Hino à Bandeira Nacional: letra de Olavo Bilac, música de Francisco Braga.
 */

export interface HinoTexto {
  titulo: string;
  autores?: string | null;
  letra: string;
}

export const HINO_NACIONAL: HinoTexto = {
  titulo: 'Hino Nacional Brasileiro',
  autores: 'Letra: Joaquim Osório Duque-Estrada · Música: Francisco Manuel da Silva',
  letra: `Ouviram do Ipiranga as margens plácidas
De um povo heroico o brado retumbante,
E o sol da liberdade, em raios fúlgidos,
Brilhou no céu da Pátria nesse instante.

Se o penhor dessa igualdade
Conseguimos conquistar com braço forte,
Em teu seio, ó liberdade,
Desafia o nosso peito a própria morte!

Ó Pátria amada,
Idolatrada,
Salve! Salve!

Brasil, um sonho intenso, um raio vívido
De amor e de esperança à terra desce,
Se em teu formoso céu, risonho e límpido,
A imagem do Cruzeiro resplandece.

Gigante pela própria natureza,
És belo, és forte, impávido colosso,
E o teu futuro espelha essa grandeza.

Terra adorada,
Entre outras mil,
És tu, Brasil,
Ó Pátria amada!
Dos filhos deste solo és mãe gentil,
Pátria amada,
Brasil!

Deitado eternamente em berço esplêndido,
Ao som do mar e à luz do céu profundo,
Fulguras, ó Brasil, florão da América,
Iluminado ao sol do Novo Mundo!

Do que a terra, mais garrida,
Teus risonhos, lindos campos têm mais flores;
"Nossos bosques têm mais vida",
"Nossa vida" no teu seio "mais amores".

Ó Pátria amada,
Idolatrada,
Salve! Salve!

Brasil, de amor eterno seja símbolo
O lábaro que ostentas estrelado,
E diga o verde-louro dessa flâmula
– Paz no futuro e glória no passado.

Mas, se ergues da justiça a clava forte,
Verás que um filho teu não foge à luta,
Nem teme, quem te adora, a própria morte.

Terra adorada,
Entre outras mil,
És tu, Brasil,
Ó Pátria amada!
Dos filhos deste solo és mãe gentil,
Pátria amada,
Brasil!`,
};

export const HINO_BANDEIRA: HinoTexto = {
  titulo: 'Hino à Bandeira Nacional',
  autores: 'Letra: Olavo Bilac · Música: Francisco Braga',
  letra: `Salve, lindo pendão da esperança,
Salve, símbolo augusto da paz!
Tua nobre presença à lembrança
A grandeza da Pátria nos traz.

Recebe o afeto que se encerra
Em nosso peito juvenil,
Querido símbolo da terra,
Da amada terra do Brasil!

Salve, lindo pendão da esperança,
Salve, símbolo augusto da paz!
Tua nobre presença à lembrança
A grandeza da Pátria nos traz.

Em teu seio formoso retratas
Este céu de puríssimo azul,
A verdura sem par destas matas,
E o esplendor do Cruzeiro do Sul.

Salve, lindo pendão da esperança,
Salve, símbolo augusto da paz!
Tua nobre presença à lembrança
A grandeza da Pátria nos traz.

Contemplando o teu vulto sagrado,
Compreendemos o nosso dever,
E o Brasil, por seus filhos amado,
Poderoso e feliz há de ser!

Salve, lindo pendão da esperança,
Salve, símbolo augusto da paz!
Tua nobre presença à lembrança
A grandeza da Pátria nos traz.

Sobre a imensa Nação Brasileira,
Nos momentos de festa ou de dor,
Paira sempre, sagrada bandeira,
Pavilhão da justiça e do amor!`,
};
