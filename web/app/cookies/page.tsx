import type { Metadata } from 'next';
import PaginaLegal from '../../components/portal/PaginaLegal';

export const metadata: Metadata = {
  title: 'Aviso de Cookies',
  description: 'Aviso sobre o uso de cookies neste portal.',
};

export default function CookiesPage() {
  return <PaginaLegal tipo="cookies" tituloPadrao="Aviso de Cookies" />;
}
