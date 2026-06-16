/**
 * Home do portal público (Server Component).
 * Compõe todas as seções: Hero, Trilhas, Acesso Rápido, Notícias,
 * Secretarias, Conformidade, Newsletter.
 *
 * Cada seção é um componente próprio com estado de vazio/fallback tratado.
 * API: SSR com revalidate=120 (ISR). Falha de API → seção oculta ou hero padrão.
 */

import type { Metadata } from 'next';
import { getThemeData } from '../lib/theme';
import { getBanners, getNoticias, getSecretarias, getHome, getServicosDestaque } from '../lib/portal-api';

import HeroBanners from '../components/portal/HeroBanners';
import TrilhasCidadao from '../components/portal/TrilhasCidadao';
import AcessoRapido from '../components/portal/AcessoRapido';
import SecaoServicos from '../components/portal/SecaoServicos';
import SecaoNoticias from '../components/portal/SecaoNoticias';
import SecaoSecretarias from '../components/portal/SecaoSecretarias';
import SecaoOuvidoriaEsic from '../components/portal/SecaoOuvidoriaEsic';
import DestaqueConformidade from '../components/portal/DestaqueConformidade';
import NewsletterForm from '../components/portal/NewsletterForm';

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { portal } = await getThemeData();
    return {
      title: `${portal.nome} — Portal Municipal`,
      description: `Portal oficial da Prefeitura de ${portal.nome} — ${portal.uf}. Serviços, transparência, ouvidoria e acesso à informação.`,
    };
  } catch {
    return {
      title: 'Portal Municipal',
      description: 'Portal oficial da prefeitura municipal.',
    };
  }
}

export default async function HomePage() {
  // Busca paralela de todos os dados públicos necessários para a home
  const [themeData, banners, noticiasResult, secretarias, home, servicosDestaque] = await Promise.all([
    getThemeData(),
    getBanners(),
    getNoticias({ pageSize: 6 }),
    getSecretarias(),
    getHome(),
    getServicosDestaque(),
  ]);

  const { portal } = themeData;

  return (
    <>
      {/* Hero / Banners — sem auto-rotação agressiva */}
      <HeroBanners banners={banners} nomeMunicipio={portal.nome} />

      {/* Trilhas por público */}
      <TrilhasCidadao />

      {/* Acesso rápido — configurável (colunas, cards por linha, slider) */}
      <AcessoRapido config={home?.config} atalhos={home?.atalhos} />

      {/* Serviços ao Cidadão — serviços marcados como destaque no admin */}
      <SecaoServicos servicos={servicosDestaque} />

      {/* Notícias — destaque + grade */}
      <SecaoNoticias noticias={noticiasResult.items} />

      {/* Secretarias */}
      <SecaoSecretarias secretarias={secretarias} />

      {/* Ouvidoria e e-SIC — indicadores e gráficos do atendimento */}
      <SecaoOuvidoriaEsic />

      {/* Conformidade: Transparência, Diário, Radar */}
      <DestaqueConformidade />

      {/* Newsletter */}
      <NewsletterForm />
    </>
  );
}
