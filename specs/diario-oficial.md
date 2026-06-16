# Spec — Diário Oficial

## 1. Objetivo
Publicar o Diário Oficial do município com validade jurídica.

## 2. Conformidade legal
Validade jurídica exige **assinatura digital ICP-Brasil**, **imutabilidade** e **carimbo de tempo**. A publicação eletrônica deve permitir verificação de autenticidade.

## 3. Requisitos funcionais
1. Compor e publicar edição (matérias por órgão).
2. Assinar a edição com certificado ICP-Brasil (A1/A3 ou nuvem).
3. Gerar hash + carimbo de tempo; tornar a edição imutável após publicada.
4. Verificação pública de autenticidade (hash/assinatura).
5. Busca por número/data/assunto + arquivo histórico.

## 4. Não-funcionais
Integridade comprovável; disponibilidade; acessibilidade do PDF/HTML; trilha de auditoria.

## 5. Modelo de dados
`diario_edicoes` (tenant_id + RLS): numero, data, conteudo/arquivo, hash, assinatura, timestamp ICP, publicado_em (imutável após publicação). Índices por (tenant_id, data).

## 6. Contrato de API
- `POST /api/diario` (role: gestor/admin) — criar rascunho.
- `POST /api/diario/:id/publicar` — assina + carimba + congela.
- `GET /api/diario/:numero` (público) — edição + verificação.
- `GET /api/diario/verificar?hash=` (público).

## 7. Fluxos
Rascunho → assinatura ICP → carimbo de tempo → publicado (imutável). Tentativa de alterar publicado é bloqueada.

## 8. Integrações
Provedor de assinatura/carimbo (ICP-Brasil), object storage para o artefato, fila para geração assíncrona.

## 9. LGPD/GDPR
Edições podem conter dados pessoais (atos de pessoal) — publicação com base legal de obrigação legal; minimização do que não é obrigatório.

## 10. Critérios de aceite
- Edição publicada é assinada, carimbada e verificável; imutabilidade garantida.
- Verificação pública detecta adulteração.
- Teste de isolamento RLS.

## 11. Fora de escopo
Emissão de certificados; diário consorciado intermunicipal.
