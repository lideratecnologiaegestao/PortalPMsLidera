-- =====================================================================
-- 108 — Hino de Minas Gerais ("Oh! Minas Gerais")
-- =====================================================================
-- MG não possui hino OFICIAL. Por decisão editorial, adota-se a canção
-- tradicional "Oh! Minas Gerais" (José Duduca de Morais e Manoel Araújo) como
-- hino do estado no Diário. oficial=true → o gerador do PDF passa a incluí-la.
-- Idempotente (UPDATE por UF; a linha já existe da migração 107).
-- =====================================================================

UPDATE hinos_estaduais SET
  estado = 'Minas Gerais',
  titulo = 'Hino de Minas Gerais (Oh! Minas Gerais)',
  autores = 'José Duduca de Morais e Manoel Araújo',
  fonte = 'Canção tradicional mineira (adoção editorial)',
  oficial = true,
  atualizado_em = now(),
  letra = 'Ó, Minas Gerais
Ó, Minas Gerais
Quem te conhece
Não esquece jamais
Ó, Minas Gerais

Ó, Minas Gerais
Ó, Minas Gerais
Quem te conhece
Não esquece jamais
Ó, Minas Gerais

Tuas terras que são altaneiras
O teu céu é do puro anil
És bonita, ó, terra mineira
Esperança do nosso Brasil

Tua Lua é a mais prateada
Que ilumina o nosso torrão
És formosa, ó, terra encantada
És orgulho da nossa nação

Ó, Minas Gerais
Ó, Minas Gerais
Quem te conhece
Não esquece jamais
Ó, Minas Gerais

Ó, Minas Gerais
Ó, Minas Gerais
Quem te conhece
Não esquece jamais
Ó, Minas Gerais

Teus regatos a enfeitam de ouro
Os teus rios carreiam diamantes
Que faiscam estrelas de aurora
Entre matas e penhas gigantes

Tuas montanhas são preitos de ferro
Que se erguem da pátria alcantil
Nos teus ares, suspiram serestas
És altar deste imenso Brasil'
WHERE uf = 'MG';
