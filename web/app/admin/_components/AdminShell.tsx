'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { apiBase } from '../../../lib/auth-shared';
import { SessaoAdminProvider } from '../../../lib/session-context';
import type { Perfil } from '../../../lib/auth';

/* ------------------------------------------------------------------ */
/* Mapa de itens do menu                                                */
/* ------------------------------------------------------------------ */

const ROLE_LABEL: Record<string, string> = {
  servidor: 'Servidor',
  gestor: 'Gestor',
  admin_prefeitura: 'Administrador',
  ouvidor: 'Ouvidor',
  assistente_ouvidoria: 'Assistente de Ouvidoria',
  super_admin: 'Super Admin',
  cidadao: 'Cidadão',
};

interface MenuItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  /** Quando definido, o item só aparece para papéis incluídos neste conjunto. */
  apenasRoles?: Set<string>;
}

interface MenuGroup {
  group: string;
  items: MenuItem[];
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z"/>
    </svg>
  );
}
function IconFile() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/>
    </svg>
  );
}
function IconPages() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
  );
}
function IconNewspaper() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM8 17H5v-2h3v2zm0-4H5v-2h3v2zm0-4H5V7h3v2zm11 8H9v-2h10v2zm0-4H9v-2h10v2zm0-4H9V7h10v2z"/>
    </svg>
  );
}
function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
    </svg>
  );
}
function IconMail() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/>
    </svg>
  );
}
function IconMessage() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
    </svg>
  );
}
function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
    </svg>
  );
}
function IconPalette() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
    </svg>
  );
}
function IconPhoto() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-8.5-5.5 2.5 3.01L17.5 12l4.5 6H2l3.5-4.5z"/>
    </svg>
  );
}
function IconPerson() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
    </svg>
  );
}
function IconBanner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21 3H3c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H3V5h18v14zm-9-2 6-8H6l3.6 4.8 2.4-3.2L15 17z"/>
    </svg>
  );
}
function IconArticle() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
    </svg>
  );
}
function IconComment() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/>
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17 11V3H7v4H3v14h8v-4h2v4h8V11h-4zm-6 4H9v-2h2v2zm0-4H9V9h2v2zm0-4H9V5h2v2zm4 8h-2v-2h2v2zm0-4h-2V9h2v2zm4 4h-2v-2h2v2zm0-4h-2V9h2v2z"/>
    </svg>
  );
}
function IconMenus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M3 6h18v2H3V6zm3 5h12v2H6v-2zm3 5h6v2H9v-2z"/>
    </svg>
  );
}
function IconShield() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
    </svg>
  );
}
function IconMonitor() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21 3H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5l-1 1v2h8v-2l-1-1h5a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 14H3V5h18v12z"/>
    </svg>
  );
}
function IconBarChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M5 9h2v11H5V9zm4-5h2v16H9V4zm4 7h2v9h-2v-9zm4-4h2v13h-2V7z"/>
    </svg>
  );
}
function IconAlert() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
    </svg>
  );
}
function IconLock() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  );
}
function IconWarning() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
    </svg>
  );
}
function IconTv() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M21 3H3a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h6v2H7v2h10v-2h-2v-2h6a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 13H3V5h18v11z"/>
    </svg>
  );
}
function IconBrain() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/>
    </svg>
  );
}
function IconBook() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>
    </svg>
  );
}
function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M19 3h-1V1h-2v2H8V1H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 16H5V9h14v10zM5 7V5h14v2H5zm2 4h5v5H7z"/>
    </svg>
  );
}
function IconPhone() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M17 2H7c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H7V6h10v10zm-5 4c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm0-18c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>
    </svg>
  );
}

/**
 * Conjunto de papéis com acesso a Ouvidoria / e-SIC.
 * ADR-0005 Fase 1: apenas ouvidor, assistente_ouvidoria e super_admin
 * enxergam esses itens de menu.
 */
const ROLES_OUVIDORIA = new Set(['ouvidor', 'assistente_ouvidoria', 'super_admin']);

/**
 * Papéis que podem aprovar solicitações de acesso de servidor/gestor.
 * ADR-0005 Fase 2: admin_prefeitura e gestor.
 */
const ROLES_APROVACAO_ACESSO = new Set(['admin_prefeitura', 'gestor', 'super_admin']);

const MENU_GROUPS: MenuGroup[] = [
  {
    group: 'Geral',
    items: [
      { href: '/admin', label: 'Painel', icon: <IconGrid /> },
    ],
  },
  {
    group: 'Página Inicial',
    items: [
      { href: '/admin/home', label: 'Layout da Home', icon: <IconGrid /> },
      { href: '/admin/banners', label: 'Banners', icon: <IconBanner /> },
      { href: '/admin/popups', label: 'Pop-ups', icon: <IconBanner /> },
      { href: '/admin/enquetes', label: 'Enquetes', icon: <IconList /> },
      { href: '/admin/campanhas', label: 'Campanhas', icon: <IconAlert /> },
    ],
  },
  {
    group: 'Conteúdo',
    items: [
      { href: '/admin/noticias', label: 'Notícias', icon: <IconArticle /> },
      {
        href: '/admin/comentarios',
        label: 'Comentários',
        icon: <IconComment />,
        apenasRoles: new Set(['gestor', 'admin_prefeitura', 'servidor', 'super_admin']),
      },
      { href: '/admin/secretarias', label: 'Secretarias', icon: <IconBuilding /> },
      { href: '/admin/prefeito', label: 'Prefeito / Prefeita', icon: <IconPerson /> },
      { href: '/admin/historia', label: 'História do Município', icon: <IconPages /> },
      { href: '/admin/hino-brasao', label: 'Hino e Brasão', icon: <IconPages /> },
      { href: '/admin/galeria', label: 'Galeria', icon: <IconPhoto /> },
      { href: '/admin/icones', label: 'Ícones e Emojis', icon: <IconPalette /> },
      { href: '/admin/midia', label: 'Mídia', icon: <IconPhoto /> },
      { href: '/admin/escola', label: 'Escola Cidadã', icon: <IconBook /> },
      { href: '/admin/agenda', label: 'Agenda Administrativa', icon: <IconCalendar /> },
      { href: '/admin/paginas', label: 'Páginas', icon: <IconPages /> },
      { href: '/admin/diario', label: 'Diário Oficial', icon: <IconNewspaper /> },
      { href: '/admin/servicos', label: 'Serviços', icon: <IconList /> },
      { href: '/admin/formularios', label: 'Formulários', icon: <IconList /> },
    ],
  },
  {
    group: 'Transparência',
    items: [
      { href: '/admin/documentos', label: 'Documentos', icon: <IconFile /> },
      { href: '/admin/licitacoes', label: 'Licitações', icon: <IconFile /> },
      { href: '/admin/contratos', label: 'Contratos', icon: <IconFile /> },
      { href: '/admin/convenios', label: 'Convênios', icon: <IconFile /> },
      { href: '/admin/concursos', label: 'Concursos', icon: <IconFile /> },
      { href: '/admin/conselhos', label: 'Conselhos', icon: <IconUsers /> },
      { href: '/admin/transparencia', label: 'Portal da Transparência', icon: <IconFile /> },
      { href: '/admin/conformidade', label: 'Conformidade PNTP', icon: <IconShield /> },
      { href: '/admin/aplic', label: 'Contas Públicas (APLIC)', icon: <IconBarChart /> },
      { href: '/admin/tipos', label: 'Tipos e Taxonomias', icon: <IconList /> },
    ],
  },
  {
    group: 'Atendimento e Ouvidoria',
    items: [
      { href: '/admin/atendimento', label: 'Chat Omnichannel', icon: <IconMessage /> },
      { href: '/admin/whatsapp/config', label: 'WhatsApp', icon: <IconMessage /> },
      { href: '/admin/chamados', label: 'Denúncias (App)', icon: <IconAlert /> },
      {
        href: '/admin/ouvidor',
        label: 'Painel do Ouvidor',
        icon: <IconMessage />,
        apenasRoles: ROLES_OUVIDORIA,
      },
      {
        href: '/admin/ouvidoria',
        label: 'Ouvidoria',
        icon: <IconMessage />,
        apenasRoles: ROLES_OUVIDORIA,
      },
      {
        href: '/admin/esic',
        label: 'e-SIC',
        icon: <IconMail />,
        apenasRoles: ROLES_OUVIDORIA,
      },
      {
        href: '/admin/minhas-atribuicoes',
        label: 'Minhas Atribuições',
        icon: <IconList />,
        apenasRoles: ROLES_OUVIDORIA,
      },
      { href: '/admin/paineis-tv', label: 'Painéis de TV', icon: <IconTv /> },
    ],
  },
  {
    group: 'Inteligência Artificial',
    items: [
      {
        href: '/admin/ia-conhecimento',
        label: 'Assistente IA (Conhecimento)',
        icon: <IconBrain />,
        apenasRoles: new Set(['gestor', 'admin_prefeitura', 'ti', 'super_admin']),
      },
    ],
  },
  {
    group: 'LGPD e Privacidade',
    items: [
      { href: '/admin/politicas', label: 'Políticas e Termos', icon: <IconFile /> },
      { href: '/admin/lgpd-conformidade', label: 'Conformidade LGPD', icon: <IconShield /> },
      { href: '/admin/lgpd-documentacao', label: 'Documentação LGPD', icon: <IconFile /> },
      { href: '/admin/lgpd-solicitacoes', label: 'Solicitações LGPD', icon: <IconLock /> },
      { href: '/admin/lgpd-incidentes', label: 'Incidentes de Segurança', icon: <IconWarning /> },
    ],
  },
  {
    group: 'Administração',
    items: [
      { href: '/admin/usuarios', label: 'Usuários', icon: <IconUsers /> },
      {
        href: '/admin/usuarios/solicitacoes',
        label: 'Solicitações de Acesso',
        icon: <IconLock />,
        apenasRoles: ROLES_APROVACAO_ACESSO,
      },
      { href: '/admin/grupos', label: 'Grupos e Permissões', icon: <IconShield /> },
      { href: '/admin/sessoes', label: 'Sessões Ativas', icon: <IconMonitor /> },
      { href: '/admin/usuarios-relatorio', label: 'Relatório de Usuários', icon: <IconBarChart /> },
      { href: '/admin/email', label: 'E-mail (SMTP)', icon: <IconMail /> },
      { href: '/admin/tema', label: 'Tema e Identidade', icon: <IconPalette /> },
      { href: '/admin/menus', label: 'Menus', icon: <IconMenus /> },
      {
        href: '/admin/app-cidadao',
        label: 'App do Cidadão',
        icon: <IconPhone />,
        apenasRoles: new Set(['admin_prefeitura', 'super_admin']),
      },
    ],
  },
  {
    group: 'Ajuda',
    items: [
      { href: '/admin/manual', label: 'Manual do Sistema', icon: <IconBook /> },
    ],
  },
  {
    group: 'Conta',
    items: [
      { href: '/admin/perfil', label: 'Meu Perfil', icon: <IconPerson /> },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Sidebar                                                              */
/* ------------------------------------------------------------------ */

function Sidebar({
  aberta,
  fechar,
  role,
}: {
  aberta: boolean;
  fechar: () => void;
  role: string;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Overlay mobile */}
      {aberta && (
        <div
          className="fixed inset-0 z-20 bg-fg/20 md:hidden"
          aria-hidden="true"
          onClick={fechar}
        />
      )}

      {/* Painel lateral */}
      <aside
        id="admin-sidebar"
        className={[
          'fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-border bg-bg transition-transform duration-200',
          'md:static md:translate-x-0',
          aberta ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
        aria-label="Barra lateral"
      >
        {/* Topo da sidebar */}
        <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3">
          <span className="font-heading text-base font-bold text-primary-fg">
            Painel Administrativo
          </span>
          {/* Botao fechar (mobile) */}
          <button
            type="button"
            className="rounded p-1 text-primary-fg hover:bg-primary-fg/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-fg md:hidden"
            aria-label="Fechar menu"
            onClick={fechar}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        {/* Itens de menu */}
        <nav aria-label="Menu administrativo" className="flex-1 overflow-y-auto py-3">
          {MENU_GROUPS.map((group) => {
            // Filtra itens que o papel atual não pode ver
            const itensFiltrados = group.items.filter(
              (item) => !item.apenasRoles || item.apenasRoles.has(role),
            );

            // Omite o grupo inteiro se não sobrar nenhum item visível
            if (itensFiltrados.length === 0) return null;

            return (
              <div key={group.group} className="mb-4">
                <p className="px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-fg/50">
                  {group.group}
                </p>
                <ul role="list">
                  {itensFiltrados.map((item) => {
                    const ativo =
                      item.href === '/admin'
                        ? pathname === '/admin'
                        : pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <li key={item.href}>
                        <a
                          href={item.href}
                          aria-current={ativo ? 'page' : undefined}
                          className={[
                            'flex items-center gap-3 px-4 py-2 text-sm transition-colors',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary',
                            ativo
                              ? 'border-l-4 border-primary bg-primary/10 font-semibold text-primary'
                              : 'border-l-4 border-transparent text-fg hover:bg-muted hover:text-fg',
                          ].join(' ')}
                          onClick={() => {
                            // fecha sidebar no mobile ao navegar
                            if (window.innerWidth < 768) fechar();
                          }}
                        >
                          <span aria-hidden="true">{item.icon}</span>
                          {item.label}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Menu de usuario (dropdown acessivel)                                */
/* ------------------------------------------------------------------ */

function UserDropdown({ perfil }: { perfil: Perfil }) {
  const [aberto, setAberto] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fecha com Esc ou clique fora
  const fechar = useCallback(() => setAberto(false), []);

  useEffect(() => {
    if (!aberto) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        fechar();
        btnRef.current?.focus();
      }
      // Navegacao por setas dentro do menu
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        if (!items || items.length === 0) return;
        const focused = document.activeElement as HTMLElement;
        const idx = Array.from(items).indexOf(focused);
        if (e.key === 'ArrowDown') {
          const next = items[(idx + 1) % items.length];
          next?.focus();
        } else {
          const prev = items[(idx - 1 + items.length) % items.length];
          prev?.focus();
        }
      }
    }

    function onClickFora(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        !btnRef.current?.contains(e.target as Node)
      ) {
        fechar();
      }
    }

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickFora);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickFora);
    };
  }, [aberto, fechar]);

  // Foca primeiro item quando abre
  useEffect(() => {
    if (aberto) {
      const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      first?.focus();
    }
  }, [aberto]);

  async function sair() {
    fechar();
    // Encerra a sessão: revoga o jti no Redis + limpa o cookie portal_session.
    // É o mesmo endpoint usado pelo login do cidadão (vale para login local também).
    await fetch(`${apiBase}/api/auth/govbr/logout`, {
      method: 'POST',
      credentials: 'include',
    }).catch(() => {});
    window.location.href = '/admin';
  }

  const roleLabel = ROLE_LABEL[perfil.role] ?? perfil.role;

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls="user-dropdown-menu"
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-2 rounded px-3 py-1.5 text-sm text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary transition-colors"
      >
        {/* Avatar initials */}
        <span
          aria-hidden="true"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-fg"
        >
          {perfil.nome.charAt(0).toUpperCase()}
        </span>
        <span className="max-w-[140px] truncate font-medium">{perfil.nome}</span>
        <span className="hidden rounded bg-muted px-1.5 py-0.5 text-xs text-fg/60 sm:inline">
          {roleLabel}
        </span>
        {/* Chevron */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
          fill="currentColor"
          className={`transition-transform ${aberto ? 'rotate-180' : ''}`}
        >
          <path d="M7 10l5 5 5-5z"/>
        </svg>
      </button>

      {aberto && (
        <div
          id="user-dropdown-menu"
          ref={menuRef}
          role="menu"
          aria-label="Menu do usuario"
          className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-border bg-bg shadow-lg"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-semibold text-fg">{perfil.nome}</p>
            <p className="truncate text-xs text-fg/50">{perfil.email}</p>
          </div>

          <a
            href="/admin/perfil"
            role="menuitem"
            tabIndex={0}
            className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            onClick={fechar}
          >
            <IconPerson />
            Alterar perfil
          </a>

          <a
            href="/cidadao"
            role="menuitem"
            tabIndex={0}
            className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            onClick={fechar}
          >
            <IconPerson />
            Painel do Cidadão
          </a>

          <a
            href="/"
            role="menuitem"
            tabIndex={0}
            className="flex items-center gap-2 px-3 py-2 text-sm text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
            onClick={fechar}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            Ir para o site
          </a>

          <div className="border-t border-border" />

          <button
            type="button"
            role="menuitem"
            tabIndex={0}
            onClick={sair}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-danger"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
              <path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/>
            </svg>
            Sair
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Topbar                                                               */
/* ------------------------------------------------------------------ */

function Topbar({
  perfil,
  onHamburguer,
  sidebarAberta,
}: {
  perfil: Perfil;
  onHamburguer: () => void;
  sidebarAberta: boolean;
}) {
  return (
    <header className="flex h-14 items-center gap-3 border-b border-border bg-bg px-4">
      {/* Botao hamburguer (mobile) */}
      <button
        type="button"
        aria-label={sidebarAberta ? 'Fechar menu lateral' : 'Abrir menu lateral'}
        aria-expanded={sidebarAberta}
        aria-controls="admin-sidebar"
        onClick={onHamburguer}
        className="rounded p-1.5 text-fg hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
        </svg>
      </button>

      {/* Titulo visivel apenas no desktop (a sidebar tem o titulo) */}
      <span className="hidden font-heading text-base font-bold text-fg md:block">
        Painel Administrativo
      </span>

      <div className="ml-auto">
        <UserDropdown perfil={perfil} />
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* AdminShell principal                                                  */
/* ------------------------------------------------------------------ */

export default function AdminShell({
  perfil,
  children,
}: {
  perfil: Perfil;
  children: React.ReactNode;
}) {
  const [sidebarAberta, setSidebarAberta] = useState(false);

  return (
    <SessaoAdminProvider sessao={{ id: perfil.id, role: perfil.role }}>
      <div className="flex h-screen flex-col bg-bg text-fg">
        <Topbar
          perfil={perfil}
          onHamburguer={() => setSidebarAberta((v) => !v)}
          sidebarAberta={sidebarAberta}
        />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar
            aberta={sidebarAberta}
            fechar={() => setSidebarAberta(false)}
            role={perfil.role}
          />

          <main
            id="admin-conteudo"
            className="flex-1 overflow-y-auto p-6"
            tabIndex={-1}
          >
            {/* Skip link target */}
            <a
              href="#admin-conteudo"
              className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-fg"
            >
              Ir para o conteudo principal
            </a>
            {children}
          </main>
        </div>
      </div>
    </SessaoAdminProvider>
  );
}
