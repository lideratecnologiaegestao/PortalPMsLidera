/**
 * Página pública de um formulário eletrônico.
 * Server Component: busca a definição do form via SSR (no-store) e renderiza
 * o shell estático. O FormRenderer (Client Component) faz o submit via fetch.
 *
 * Fronteira de camadas: tudo via API, nunca banco/storage direto.
 * Tenant via `x-forwarded-host` + `__h=<host>` para cache isolado.
 */
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getFormularioPublico } from '../../../lib/formularios';
import FormRenderer from './FormRenderer';
import PageContainer from '../../../components/portal/PageContainer';

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const host = headers().get('host') ?? '';
  const form = await getFormularioPublico(params.slug, host);
  if (!form) return { title: 'Formulário não encontrado' };
  return {
    title: form.titulo,
    description: form.descricao ?? `Preencha o formulário: ${form.titulo}`,
  };
}

export default async function FormularioPublicoPage({ params }: Props) {
  const host = headers().get('host') ?? '';
  const form = await getFormularioPublico(params.slug, host);

  if (!form) notFound();

  return (
    <PageContainer>
      {/* Cabeçalho da página */}
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="font-heading text-2xl font-bold text-fg">{form.titulo}</h1>
        {form.descricao && (
          <p className="mt-2 text-fg/70 text-sm leading-relaxed">{form.descricao}</p>
        )}
      </header>

      {/* Aviso de login obrigatório */}
      {form.loginObrigatorio && (
        <div
          role="note"
          className="mb-6 rounded border border-warning/40 bg-warning/10 p-4 text-sm text-fg"
        >
          <strong>Atenção:</strong> este formulário requer que você esteja logado como cidadão
          para enviar.{' '}
          <a href="/cidadao" className="text-primary underline">
            Acessar área do cidadão
          </a>
        </div>
      )}

      {/* Renderizador do formulário (Client Component) */}
      <FormRenderer slug={params.slug} formulario={form} />
    </PageContainer>
  );
}
