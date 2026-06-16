// Importa paginas institucionais avulsas (Ouvidoria + LGPD) -> Paginas CMS.
// Atualiza as politicas LGPD ja semeadas (mesmo slug) com o conteudo real.
import { ORIGEM, getHtml } from './lib/http.mjs';
import { limparItemK2, texto } from './lib/clean.mjs';
import { login, rehospedarHtml, upsertPaginaCms } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const PAGINAS = [
  { de: '/sobre-a-ouvidoria', slug: 'ouvidoria/sobre', titulo: 'Sobre a Ouvidoria' },
  { de: '/como-surgiu-a-ouvidoria', slug: 'ouvidoria/historico', titulo: 'Como Surgiu a Ouvidoria' },
  { de: '/perguntas-e-resposta-mais-frequentes', slug: 'ouvidoria/perguntas-frequentes', titulo: 'Perguntas Frequentes (Ouvidoria/SIC)' },
  { de: '/sobre-a-lgpd', slug: 'privacidade/sobre-lgpd', titulo: 'Sobre a LGPD' },
  { de: '/politica-de-privacidade-lgpd', slug: 'privacidade/politica', titulo: 'Política de Privacidade e Proteção de Dados' },
  { de: '/politica-de-cookies-lgpd', slug: 'privacidade/cookies', titulo: 'Política de Cookies' },
  { de: '/termo-de-uso-lgpd', slug: 'privacidade/termo-de-uso', titulo: 'Termo de Uso' },
  { de: '/conheca-a-o-responsavel-lgpd', slug: 'privacidade/encarregado', titulo: 'Encarregado de Dados (DPO)' },
  { de: '/unidade-de-atendimento', slug: 'esic/unidade-de-atendimento', titulo: 'Unidade de Atendimento (SIC Presencial)' },
  { de: '/perguntas-frequentes', slug: 'esic/perguntas-frequentes', titulo: 'Perguntas Frequentes (e-SIC)' },
];

async function run() {
  const redirects = await new Ledger('redirects').load();
  await login();
  console.log(`== Paginas Ouvidoria/LGPD (${PAGINAS.length}) ==`);
  for (const p of PAGINAS) {
    try {
      const { html: cru } = await getHtml(ORIGEM + p.de);
      const { html } = limparItemK2(cru, { origem: ORIGEM });
      if (texto(html).length < 30) { console.log(`AVISO conteudo curto: ${p.de}`); }
      const corpoHtml = await rehospedarHtml(html, { categoriaSlug: 'noticias' });
      const { id, criado } = await upsertPaginaCms({ slug: p.slug, titulo: p.titulo, corpoHtml });
      await redirects.set(p.de, { paraSlug: p.slug, tipo: 'cms' });
      console.log(`OK  ${p.de} -> /${p.slug} (${criado ? 'criada' : 'atualizada'})`);
    } catch (e) { console.error(`ERRO ${p.de}: ${String(e.message).slice(0, 140)}`); }
  }
  console.log('== fim paginas ==');
}
run().catch((e) => { console.error(e); process.exit(1); });
