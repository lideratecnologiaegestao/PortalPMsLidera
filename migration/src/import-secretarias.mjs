// Importa as Secretarias do Joomla -> modulo Secretarias.
// Consolida a pagina "estrutura" (competencias/sobre) + "perfil" (secretario+foto).
// Reusa os slugs das 4 secretarias semeadas (vira dado real); cria as demais.
// Idempotente (upsert por slug). DRY: MIG_DRY=1.
import { ORIGEM, getHtml } from './lib/http.mjs';
import { limparItemK2, texto, extrairCampo, extrairEmail, extrairTelefone } from './lib/clean.mjs';
import { login, rehospedarHtml, upsertSecretaria } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const DRY = process.env.MIG_DRY === '1';

const SECRETARIAS = [
  { nome: 'Secretaria de Administração e Planejamento', sigla: 'SEMAD', slug: 'secretaria-de-administracao', estrutura: '/estrutura-da-secretaria-de-administracao', perfil: '/secretario-secretaria-de-administracao' },
  { nome: 'Secretaria de Saúde', sigla: 'SMS', slug: 'secretaria-de-saude', estrutura: '/estrutura-da-secretaria-de-saude', perfil: '/secretario-a' },
  { nome: 'Secretaria de Educação', sigla: 'SEMEC', slug: 'secretaria-de-educacao', estrutura: '/estrutura-da-secretaria-de-educacao', perfil: '/secretario-de-educacao' },
  { nome: 'Secretaria de Viação e Obras', sigla: 'SEINFRA', slug: 'secretaria-de-obras', estrutura: '/estrutura-da-secretaria-de-infraestrutura', perfil: '/secretario-de-infraestrutura' },
  { nome: 'Secretaria de Assistência Social', sigla: 'SETAS', slug: 'secretaria-de-assistencia-social', estrutura: '/estrutura-da-secretaria-de-assistencia-social', perfil: '/secretario-de-assisstencia-social' },
  { nome: 'Secretaria de Agricultura', sigla: 'SEMAGRI', slug: 'secretaria-de-agricultura', estrutura: '/estrutura-da-secretaria-de-agricultura', perfil: '/secretario-de-agricultura' },
  { nome: 'Secretaria de Cultura, Turismo, Esporte e Lazer', sigla: 'SECTEL', slug: 'secretaria-de-cultura-turismo-esporte-lazer', estrutura: '/estrutura-da-secretaria-de-cultura-turismo-esporte-e-lazer', perfil: '/secretario-de-cultura-turismo-esporte-e-lazer' },
  { nome: 'Secretaria de Finanças', sigla: 'SEFIN', slug: 'secretaria-de-financas', estrutura: '/estrutura-da-secretaria-de-financas', perfil: '/secretario-de-financas' },
  { nome: 'Secretaria de Habitação e Chefe de Gabinete', sigla: 'SEHAB', slug: 'secretaria-de-habitacao', estrutura: '/estrutura-da-secretaria-de-habitacao-e-chefe-de-gabinete', perfil: '/secretario-secretaria-de-habitacao-e-chefe-de-gabinete' },
  { nome: 'Secretaria de Meio Ambiente e Turismo', sigla: 'SEMA', slug: 'secretaria-de-meio-ambiente', estrutura: '/estrutura-da-secretaria-de-meio-ambiente', perfil: '/secretaria-de-meio-ambiente' },
  { nome: 'Secretaria de Governo', sigla: 'SEGOV', slug: 'secretaria-de-governo', estrutura: '/estrutura-da-secretaria-de-governo', perfil: '/secretario-de-governo' },
  { nome: 'Gabinete da Prefeita', sigla: 'GAB', slug: 'gabinete-da-prefeita', estrutura: '/estrutura-gabinete-da-prefeita', perfil: '/chefe-gabinete-da-prefeita' },
  { nome: 'Controle Interno', sigla: 'CI', slug: 'controle-interno', estrutura: '/estrutura-do-controle-interno', perfil: '/perfil-controle-interno' },
];

async function pagina(url) {
  try { const { html } = await getHtml(ORIGEM + url); return limparItemK2(html, { origem: ORIGEM }); }
  catch (e) { return { html: '', titulo: '', imagens: [], _erro: e.message }; }
}

async function run() {
  const redirects = await new Ledger('redirects').load();
  const ledger = await new Ledger('secretarias').load();
  if (!DRY) await login();
  console.log(`== Secretarias (${SECRETARIAS.length}) ${DRY ? '[DRY]' : ''} ==`);
  let ordem = 0;

  for (const s of SECRETARIAS) {
    try {
      const est = await pagina(s.estrutura);
      const per = await pagina(s.perfil);
      const txtAll = texto(est.html) + ' ' + texto(per.html);
      const responsavel = (extrairCampo(texto(per.html), 'Nome') || '').replace(/^completo:?\s*/i, '').trim() || null;
      const email = extrairEmail(txtAll);
      const telefone = extrairTelefone(txtAll);
      const descricao = texto(est.html).slice(0, 180) || null;

      if (DRY) {
        console.log(`\n--- ${s.nome}  (/${s.slug})`);
        console.log(`  estrutura: ${texto(est.html).length} chars | perfil: ${texto(per.html).length} chars | foto: ${per.imagens.length}`);
        console.log(`  responsavel: ${responsavel || '(?)'} | email: ${email || '-'} | tel: ${telefone || '-'}`);
        continue;
      }

      const sobre = await rehospedarHtml(est.html, { categoriaSlug: 'noticias' });
      let fotoUrl = null;
      if (per.imagens[0]) {
        try { const { uploadMidiaFromUrl } = await import('./lib/api.mjs'); fotoUrl = await uploadMidiaFromUrl(per.imagens[0].src, { alt: responsavel || s.nome, categoriaSlug: 'galeria' }); } catch {}
      }

      const dados = { nome: s.nome, sigla: s.sigla, slug: s.slug, descricao, sobre, ativo: true, ordem: ordem++,
        ...(responsavel ? { responsavel } : {}), ...(email ? { email } : {}), ...(telefone ? { telefone } : {}), ...(fotoUrl ? { fotoUrl } : {}) };

      const { id, criado } = await upsertSecretaria(dados);
      await ledger.set(s.slug, { id, nome: s.nome, responsavel, origemEstrutura: s.estrutura });
      await redirects.set(s.perfil, { paraSlug: `secretarias/${s.slug}`, tipo: 'secretaria' });
      await redirects.set(s.estrutura, { paraSlug: `secretarias/${s.slug}`, tipo: 'secretaria' });
      console.log(`OK  ${s.nome}  ->  /secretarias/${s.slug}  (${criado ? 'criada' : 'atualizada'})  resp=${responsavel || '?'}`);
    } catch (e) {
      console.error(`ERRO ${s.nome}: ${e.message}`);
    }
  }
  console.log('== fim secretarias ==');
}

run().catch((e) => { console.error(e); process.exit(1); });
