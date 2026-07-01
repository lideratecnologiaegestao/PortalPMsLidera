/**
 * Página pública: validação de autenticidade de certificado da Escola
 * Cidadã. Server Component — SSR. WCAG 2.1 AA. Não indexada (privacidade).
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { validarCertificado } from '../../../lib/portal-api';

// Validação deve refletir o estado atual — sem cache de página.
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'Validação de certificado',
    description: 'Verifique a autenticidade de um certificado emitido pela Escola Cidadã.',
    robots: { index: false, follow: false },
  };
}

function formatarData(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return '—';
  }
}

export default async function ValidarCertificado({ params }: { params: { codigo: string } }) {
  const codigo = decodeURIComponent(params.codigo);
  const resultado = await validarCertificado(codigo);
  const cert = resultado.valido ? resultado.certificado : null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <nav aria-label="Trilha" className="text-sm text-muted-fg">
        <Link href="/escola" className="underline">Escola Cidadã</Link> <span aria-hidden>›</span> Validação
      </nav>

      <h1 className="mt-4 text-2xl font-bold text-fg">Validação de certificado</h1>

      {resultado.valido && cert ? (
        <section
          aria-labelledby="ok-h"
          className="mt-6 rounded-lg border border-border bg-card p-6"
        >
          <p
            id="ok-h"
            className="inline-flex items-center gap-2 rounded bg-primary px-3 py-1 text-sm font-semibold text-primary-fg"
          >
            <span aria-hidden>✓</span> Certificado autêntico
          </p>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm text-muted-fg">Aluno(a)</dt>
              <dd className="font-medium text-card-fg">{cert.nomeAluno}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-fg">Curso</dt>
              <dd className="font-medium text-card-fg">{cert.tituloCurso}</dd>
            </div>
            {cert.cargaHoraria != null && (
              <div>
                <dt className="text-sm text-muted-fg">Carga horária</dt>
                <dd className="font-medium text-card-fg">{cert.cargaHoraria} horas</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-muted-fg">Emitido em</dt>
              <dd className="font-medium text-card-fg">{formatarData(cert.emitidoEm)}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-fg">Código de validação</dt>
              <dd className="font-mono font-medium text-card-fg">{cert.codigo}</dd>
            </div>
          </dl>
        </section>
      ) : (
        <section
          aria-labelledby="erro-h"
          className="mt-6 rounded-lg border border-border bg-card p-6"
        >
          <p id="erro-h" className="font-semibold text-fg">
            Certificado não encontrado
          </p>
          <p className="mt-2 text-sm text-muted-fg">
            Não localizamos nenhum certificado com o código <span className="font-mono">{codigo}</span>.
            Confira se o código foi digitado corretamente.
          </p>
        </section>
      )}

      <p className="mt-8">
        <Link href="/escola" className="text-primary underline">← Voltar para a Escola Cidadã</Link>
      </p>
    </main>
  );
}
