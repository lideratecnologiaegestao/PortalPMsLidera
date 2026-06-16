// Carta de Servicos MELHORADA: cria os servicos do cidadao que hoje vivem nos
// sistemas externos (Agili/GWS/leismunicipais) DENTRO do nosso modulo, com
// urlExterna, categoria, publico-alvo e destaque. API-only (nao raspa o site).
// Idempotente: duplicata de slug e ignorada.
import { login, postJson } from './lib/api.mjs';
import { Ledger } from './lib/state.mjs';

const A = 'http://agiliblue.agilicloud.com.br/portal/prefbaraomelgaco-mt/#';
const PORTAL = 'http://portal.prefbaraodemelgaco-mt.agilicloud.com.br';

const SERVICOS = [
  { titulo: '2ª via de IPTU e Guias', slug: 'iptu-2-via', categoria: 'Tributos', publicoAlvo: 'cidadao', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/guiasIptu`, custo: 'Gratuito (emissão)', destaque: true,
    descricao: 'Emita a 2ª via do carnê de IPTU e demais guias de tributos municipais.', requisitos: 'Inscrição imobiliária ou CPF/CNPJ do contribuinte.' },
  { titulo: 'Alvará de Funcionamento', slug: 'alvara-de-funcionamento', categoria: 'Licenças e Alvarás', publicoAlvo: 'empresa', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/alvara`,
    descricao: 'Solicite e acompanhe o alvará de funcionamento de estabelecimentos.', requisitos: 'CNPJ, contrato social e documentos do imóvel.' },
  { titulo: 'Emissão de Certidões', slug: 'certidoes', categoria: 'Certidões', publicoAlvo: 'cidadao', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/certidao`, custo: 'Gratuito', destaque: true,
    descricao: 'Emita certidões municipais (negativa de débitos, regularidade e outras).', requisitos: 'CPF/CNPJ ou inscrição municipal.' },
  { titulo: 'Nota Fiscal de Serviços Eletrônica (NFS-e)', slug: 'nfse', categoria: 'Tributos', publicoAlvo: 'empresa', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/`,
    descricao: 'Emissão e consulta de Notas Fiscais de Serviços Eletrônicas.', requisitos: 'Cadastro mobiliário ativo e login do prestador.' },
  { titulo: 'Extrato de Débitos e Dívida Ativa', slug: 'extrato-debitos', categoria: 'Tributos', publicoAlvo: 'cidadao', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/guias`,
    descricao: 'Consulte débitos, parcelamentos e a situação da dívida ativa.', requisitos: 'CPF/CNPJ ou inscrição.' },
  { titulo: 'Portal do Contribuinte', slug: 'portal-do-contribuinte', categoria: 'Tributos', publicoAlvo: 'cidadao', orgaoResponsavel: 'Secretaria de Finanças', urlExterna: `${A}/`,
    descricao: 'Acesso unificado aos serviços tributários do município.' },
  { titulo: 'Portal da Transparência', slug: 'portal-transparencia-externo', categoria: 'Transparência', publicoAlvo: 'cidadao', orgaoResponsavel: 'Controle Interno', urlExterna: 'https://transparencia.agilicloud.com.br/prefbaraomelgaco-mt', destaque: true,
    descricao: 'Receitas, despesas, empenhos, folha e demais dados fiscais do município.' },
  { titulo: 'Consulta de Licitações', slug: 'consulta-licitacoes', categoria: 'Licitações', publicoAlvo: 'empresa', orgaoResponsavel: 'Secretaria de Administração', urlExterna: `${PORTAL}/Cidadao/ConsultaLicitacoes.aspx`,
    descricao: 'Acompanhe processos licitatórios, editais e resultados.' },
  { titulo: 'Holerite do Servidor', slug: 'holerite-servidor', categoria: 'Recursos Humanos', publicoAlvo: 'servidor', orgaoResponsavel: 'Secretaria de Administração', urlExterna: `${PORTAL}/Usuario/Login.aspx`,
    descricao: 'Consulta de contracheque e informações funcionais do servidor.', requisitos: 'Matrícula e senha do servidor.' },
  { titulo: 'Legislação Municipal', slug: 'legislacao-municipal-externo', categoria: 'Legislação', publicoAlvo: 'cidadao', orgaoResponsavel: 'Gabinete da Prefeita', urlExterna: 'https://leismunicipais.com.br/prefeitura/mt/baraodemelgaco',
    descricao: 'Acervo de leis municipais consolidadas e pesquisáveis.' },
];

async function run() {
  const ledger = await new Ledger('servicos').load();
  await login();
  console.log(`== Carta de Servicos melhorada (${SERVICOS.length} servicos externos) ==`);
  let novos = 0, pulados = 0;
  let ordem = 100;
  for (const s of SERVICOS) {
    if (ledger.has(s.slug)) { pulados++; continue; }
    try {
      await postJson('/api/admin/servicos', {
        ...s, etapas: [{ titulo: 'Acessar o sistema', descricao: 'Clique no botão de acesso ao serviço.' }],
        canaisAtendimento: 'Online (link) e presencial na secretaria responsável.',
        prazoAtendimento: s.prazoAtendimento || 'Imediato (online)', custo: s.custo || 'Gratuito',
        publicado: true, destaque: !!s.destaque, ordem: ordem++,
      });
      await ledger.set(s.slug, { titulo: s.titulo });
      console.log(`OK  ${s.titulo}  (${s.categoria})`);
      novos++;
    } catch (e) {
      if (String(e.message).match(/400|409|j[aá]|duplicad/i)) { console.log(`SKIP (existe): ${s.slug}`); await ledger.set(s.slug, { nota: 'ja existe' }); pulados++; }
      else console.error(`ERRO ${s.slug}: ${String(e.message).slice(0, 140)}`);
    }
  }
  console.log(`== fim servicos: novos=${novos} pulados=${pulados} ==`);
}
run().catch((e) => { console.error(e); process.exit(1); });
