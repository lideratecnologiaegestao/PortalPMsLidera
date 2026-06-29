import type { Metadata } from 'next';
import PaginaLegal from '../../components/portal/PaginaLegal';

export const metadata: Metadata = {
  title: 'Termos de Uso',
  description: 'Termos de uso do portal do município.',
};

export default function TermosPage() {
  return <PaginaLegal tipo="termos" tituloPadrao="Termos de Uso" />;
}
