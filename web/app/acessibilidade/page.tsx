import type { Metadata } from 'next';
import PaginaLegal from '../../components/portal/PaginaLegal';

export const metadata: Metadata = {
  title: 'Política de Acessibilidade',
  description: 'Política de acessibilidade digital do município.',
};

export default function AcessibilidadePage() {
  return <PaginaLegal tipo="acessibilidade" tituloPadrao="Política de Acessibilidade" />;
}
