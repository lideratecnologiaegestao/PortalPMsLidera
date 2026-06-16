/** @type {import('next').NextConfig} */
const nextConfig = {
  // gera o bundle 'standalone' usado pela imagem Docker (server.js mínimo)
  output: 'standalone',
  reactStrictMode: true,

  // URLs amigáveis / preservação de links: as rotas curtas dos cadastros do
  // motor de Documentos apontam para /documentos/<slug>. (307 — não-permanente,
  // para não cravar cache caso um município use o mesmo slug numa página CMS.)
  async redirects() {
    return [
      { source: '/leis', destination: '/documentos/leis', permanent: false },
      { source: '/decretos', destination: '/documentos/decretos', permanent: false },
      { source: '/portarias', destination: '/documentos/portarias-e-resolucoes', permanent: false },
      { source: '/portarias-e-resolucoes', destination: '/documentos/portarias-e-resolucoes', permanent: false },
      { source: '/resolucoes', destination: '/documentos/portarias-e-resolucoes', permanent: false },
      { source: '/alvaras', destination: '/documentos/alvaras', permanent: false },
      { source: '/documentos-diversos', destination: '/documentos/documentos-diversos', permanent: false },
      { source: '/audiencias-publicas', destination: '/documentos/documentos-diversos?tipo=audiencia-publica', permanent: false },
    ];
  },
};

export default nextConfig;
