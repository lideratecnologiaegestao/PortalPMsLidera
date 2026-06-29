import type { Metadata } from 'next';
import PaginaLegal from '../../components/portal/PaginaLegal';

export const metadata: Metadata = {
  title: 'Privacidade (LGPD)',
  description: 'Política de privacidade e proteção de dados pessoais (LGPD) do município.',
};

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      tipo="privacidade"
      tituloPadrao="Privacidade (LGPD)"
      extra={
        <p className="mb-4 text-sm text-fg/70">
          Veja também a <a href="/privacidade/sobre-lgpd" className="text-primary hover:underline">documentação completa de LGPD</a> do município.
        </p>
      }
    />
  );
}
