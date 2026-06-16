// Reorganiza o menu do CABECALHO em dropdowns curtos, deduplicados e completos.
// Idempotente: move/cria/reordena por href|label; remove duplicatas conhecidas.
import { login, getJson, postJson, putJson, delJson } from './lib/api.mjs';

const LOCAL = 'cabecalho';

// Estrutura desejada (2 niveis — o nav so renderiza grupo -> itens).
const TARGET = [
  { kind: 'link', label: 'Início', href: '/' },
  { kind: 'group', label: 'A Prefeitura', icone: 'building', items: [
    ['Estrutura Organizacional', '/institucional/estrutura'],
    ['Prefeita', '/institucional/prefeita'],
    ['Vice-Prefeito', '/institucional/vice-prefeito'],
    ['Ex-Prefeitos', '/institucional/ex-prefeitos'],
    ['História', '/institucional/historia'],
    ['Símbolos e Hino', '/institucional/simbolos-e-hino'],
    ['Economia', '/institucional/economia'],
    ['Demografia', '/institucional/demografia'],
    ['Contatos', '/institucional/contatos'],
    ['Perguntas Frequentes', '/institucional/faq'],
  ] },
  { kind: 'group', label: 'Secretarias', icone: 'building', items: [
    ['Todas as Secretarias', '/secretarias'],
    ['Secretaria de Administração e Planejamento', '/secretarias/secretaria-de-administracao'],
    ['Secretaria de Agricultura', '/secretarias/secretaria-de-agricultura'],
    ['Secretaria de Assistência Social', '/secretarias/secretaria-de-assistencia-social'],
    ['Controle Interno', '/secretarias/controle-interno'],
    ['Secretaria de Cultura, Turismo, Esporte e Lazer', '/secretarias/secretaria-de-cultura-turismo-esporte-lazer'],
    ['Secretaria de Educação', '/secretarias/secretaria-de-educacao'],
    ['Secretaria de Finanças', '/secretarias/secretaria-de-financas'],
    ['Gabinete da Prefeita', '/secretarias/gabinete-da-prefeita'],
    ['Secretaria de Governo', '/secretarias/secretaria-de-governo'],
    ['Secretaria de Habitação e Chefe de Gabinete', '/secretarias/secretaria-de-habitacao'],
    ['Secretaria de Meio Ambiente e Turismo', '/secretarias/secretaria-de-meio-ambiente'],
    ['Secretaria de Obras', '/secretarias/secretaria-de-obras'],
    ['Secretaria de Saúde', '/secretarias/secretaria-de-saude'],
  ] },
  { kind: 'link', label: 'Serviços', href: '/servicos' },
  { kind: 'group', label: 'Transparência', reuse: ['Transparência'], keepChildren: true },
  { kind: 'group', label: 'Legislação', icone: 'file', reuse: ['Documentos Oficiais'], items: [
    ['Leis', '/documentos/leis'],
    ['Decretos', '/documentos/decretos'],
    ['Portarias', '/documentos/portarias'],
    ['Instruções Normativas', '/documentos/instrucoes-normativas'],
    ['Atos Normativos', '/documentos/atos-normativos'],
    ['Alvarás', '/documentos/alvaras'],
    ['Documentos Diversos', '/documentos/documentos-diversos'],
  ] },
  { kind: 'group', label: 'Licitações e Contratos', icone: 'file', items: [
    ['Licitações', '/licitacoes'],
    ['Contratos', '/contratos'],
    ['Convênios', '/convenios'],
    ['Concursos e Seletivos', '/concursos'],
    ['Conselhos Municipais', '/conselhos'],
    ['Planejamento Orçamentário', '/documentos/planejamento-orcamentario'],
    ['Prestação de Contas', '/documentos/prestacao-de-contas'],
  ] },
  { kind: 'group', label: 'Comunicação', items: [
    ['Notícias', '/noticias'],
    ['Galeria', '/galeria'],
    ['Diário Oficial', '/diario-oficial'],
  ] },
  { kind: 'group', label: 'Ouvidoria e e-SIC', reuse: ['Ouvidoria'], items: [
    ['Ouvidoria', '/ouvidoria'],
    ['e-SIC', '/esic'],
    ['Estatísticas e-SIC', '/esic/estatisticas'],
  ] },
];

const DELETE_HREFS = ['/documentos/portarias-e-resolucoes', '/documentos/contratos'];

let flat = [];
function flatten(tree) {
  flat = [];
  (function walk(items, parentId) {
    for (const it of items || []) { flat.push({ id: it.id, label: it.label, href: it.href || null, tipo: it.tipo, parentId }); walk(it.children, it.id); }
  })(tree, null);
}
const porHref = (h) => flat.filter((x) => x.href === h);
const porLabelLeaf = (l) => flat.filter((x) => x.label === l && x.tipo !== 'grupo');

async function run() {
  await login();
  flatten(await getJson(`/api/admin/menus?local=${LOCAL}`));
  console.log(`Itens atuais: ${flat.length}`);

  let ordemTop = 0;
  for (const node of TARGET) {
    if (node.kind === 'link') {
      let its = porHref(node.href); if (!its.length) its = porLabelLeaf(node.label);
      if (its.length) { await putJson(`/api/admin/menus/${its[0].id}`, { parentId: null, label: node.label, ordem: ordemTop, ativo: true }); for (const d of its.slice(1)) await delJson(`/api/admin/menus/${d.id}`); }
      else await postJson('/api/admin/menus', { local: LOCAL, label: node.label, tipo: 'interno', href: node.href, ordem: ordemTop, ativo: true });
      console.log(`LINK  ${node.label}`); ordemTop++; continue;
    }
    // grupo
    let grp = flat.find((x) => x.tipo === 'grupo' && x.parentId == null && (x.label === node.label || (node.reuse || []).includes(x.label)));
    let grpId;
    if (grp) { grpId = grp.id; await putJson(`/api/admin/menus/${grpId}`, { label: node.label, ordem: ordemTop, ativo: true, ...(node.icone ? { icone: node.icone } : {}) }); }
    else { const g = await postJson('/api/admin/menus', { local: LOCAL, label: node.label, tipo: 'grupo', ordem: ordemTop, ativo: true, ...(node.icone ? { icone: node.icone } : {}) }); grpId = g.id; }
    console.log(`GRUPO ${node.label}${grp ? ' (reusado)' : ' (novo)'}`); ordemTop++;
    if (node.keepChildren) continue;

    let oc = 0;
    for (const [label, href] of node.items) {
      let its = porHref(href); if (!its.length) its = porLabelLeaf(label);
      if (its.length) { await putJson(`/api/admin/menus/${its[0].id}`, { parentId: grpId, label, ordem: oc, ativo: true }); for (const d of its.slice(1)) await delJson(`/api/admin/menus/${d.id}`); }
      else { await postJson('/api/admin/menus', { local: LOCAL, parentId: grpId, label, tipo: 'interno', href, ordem: oc, ativo: true }); console.log(`   + criado ${label}`); }
      oc++;
    }
  }

  for (const h of DELETE_HREFS) for (const it of porHref(h)) { await delJson(`/api/admin/menus/${it.id}`); console.log(`DEL   ${h}`); }
  console.log('== menu reorganizado ==');
}
run().catch((e) => { console.error(e); process.exit(1); });
