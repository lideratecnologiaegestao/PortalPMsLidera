# Portfólio Comercial — Portal de Prefeitura

Material de apresentação para **vender o Portal de Prefeitura** (plataforma SaaS multi-tenant) a gestores municipais. Pasta exclusiva dos materiais de marketing/comercial.

## Conteúdo desta pasta

| Arquivo | Para quê serve |
|---------|----------------|
| **`Portfolio-Portal-Prefeitura.docx`** | Portfólio em Word (A4), com capa, 14 seções e gráficos. Edite/imprima/envie por e-mail. |
| **`index.html`** | Mesma apresentação em página web — abre offline (duplo clique), responsiva, ideal para projetar numa reunião ou gerar PDF (Ctrl+P → Salvar como PDF). |
| `assets/` | Gráficos (PNG) usados no `.docx` — gerados automaticamente. |
| `gerar_portfolio_docx.py` | Script que **gera os gráficos e o `.docx`**. Reexecute após editar o conteúdo. |

## Como apresentar

- **Reunião presencial / projetor:** abra `index.html` no navegador (tela cheia, F11).
- **Enviar por e-mail / WhatsApp:** envie o `Portfolio-Portal-Prefeitura.docx` ou exporte o `index.html` para PDF.
- **Imprimir:** tanto o `.docx` quanto o `index.html` (`Ctrl+P`) têm layout próprio para impressão.

## Como regenerar o `.docx` (após editar o conteúdo)

Requer Python 3 com as bibliotecas `python-docx`, `matplotlib` e `Pillow`:

```bash
pip install python-docx matplotlib Pillow
cd portfolio
python gerar_portfolio_docx.py
```

O script recria `assets/*.png` e `Portfolio-Portal-Prefeitura.docx`. Todo o texto e os gráficos
ficam no próprio script — é o ponto único para ajustar mensagens, números e cores.
Para editar o HTML, altere diretamente `index.html` (CSS e SVG estão embutidos no arquivo).

## Seções (ambos os formatos)

1. O desafio das prefeituras → a solução
2. Visão geral da plataforma + arquitetura
3. Modelo SaaS multi-tenant
4. Catálogo de 20+ módulos (6 áreas)
5. Conformidade legal nativa (LAI, Lei 13.460, LC 131/LRF, LGPD, WCAG/eMAG, PNTP, gov.br)
6. Transparência e PNTP (selo Diamante)
7. Segurança & privacidade (RLS, RBAC, LGPD, auditoria)
8. App do Cidadão (mobile)
9. Inteligência Artificial aplicada
10. Prova de entrega — caso real (Barão de Melgaço: 455 notícias + 1.180 documentos)
11. Implantação flexível (nuvem GCP/AWS ou on-premise)
12. Roadmap
13. Por que a Lidera
14. Chamada para ação / contato

## Observações

- **Sem dados sensíveis.** O material não contém segredos, credenciais nem dados pessoais.
- **Marca:** o logotipo oficial da Lidera está em `Logos/` (SVG vetorial). O HTML usa o SVG
  diretamente (nav, hero e rodapé); o `.docx` usa `assets/logo_lidera.png` (rasterização do
  SVG colorido) na capa. Para trocar o logo, substitua os arquivos em `Logos/` e re-rasterize
  o PNG (ou troque `assets/logo_lidera.png`).
- **Personalizar:** cores, contato e preços ("sob consulta") são placeholders — ajuste no
  `gerar_portfolio_docx.py` (Word) e no `index.html` (web).
- Contato usado: **Lidera Tecnologia e Gestão** · www.lideratecnologia.com.br · lideraabrange@gmail.com · demo `https://prefeitura.lidera.app.br`.
