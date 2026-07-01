/**
 * Página pública: Agenda Administrativa — calendário de eventos, reuniões,
 * feriados, datas comemorativas e programações da prefeitura.
 */
import type { Metadata } from 'next';
import AgendaPublica from './AgendaPublica';

export const metadata: Metadata = {
  title: 'Agenda Administrativa',
  description: 'Calendário de eventos, reuniões, feriados e datas comemorativas.',
};

export default function AgendaPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="mb-1 font-heading text-2xl font-bold text-fg">Agenda Administrativa</h1>
      <p className="mb-4 text-fg/70">
        Eventos, reuniões, feriados, pontos facultativos e datas comemorativas.
      </p>
      <AgendaPublica />
    </main>
  );
}
