import { getDicionario, Dicionario } from '../../../lib/transparencia';
import { apiBase } from '../../../lib/auth-shared';
import { CONJUNTOS } from '../../../lib/transparencia-conjuntos';

export const metadata = {
  title: 'Dados Abertos — Transparência',
  description:
    'Catálogo de dados abertos do município: download em CSV/JSON, API pública, dicionário de dados e licença aberta (CC BY 4.0).',
};

// conjuntos servidos com endpoint próprio (.csv/.json) vs. genérico (/dataset/)
const VIA_TRANSP = new Set(['despesas', 'receitas', 'folha']);

function nomeConjunto(key: string): string {
  const c = CONJUNTOS.find((x) => x.key === key);
  if (c) return c.nome;
  if (key === 'documentos') return 'Documentos e Planejamento';
  return key;
}

function exportUrls(key: string): { csv: string; json: string } {
  if (VIA_TRANSP.has(key)) {
    return {
      csv: `${apiBase}/api/transparencia/${key}.csv`,
      json: `${apiBase}/api/transparencia/${key}.json`,
    };
  }
  return {
    csv: `${apiBase}/api/transparencia/dataset/${key}/csv`,
    json: `${apiBase}/api/transparencia/dataset/${key}/json`,
  };
}

export default async function DadosAbertosPage() {
  let dic: Dicionario | null = null;
  try {
    dic = await getDicionario();
  } catch {
    dic = null;
  }

  const conjuntos = dic ? Object.entries(dic.conjuntos) : [];

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Dados Abertos
      </nav>
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">Dados Abertos</h1>
        <p className="max-w-3xl text-fg/80">
          Todos os conjuntos do Portal da Transparência estão disponíveis em
          formato aberto e legível por máquina, com acesso automatizado por API.
          Os dados são primários, atualizados e acompanhados de dicionário.
        </p>
        {dic && (
          <p className="text-sm text-fg/70">
            Formatos: {dic.formatos.join(', ')} · Licença:{' '}
            <a href={dic.licenca.url} className="underline" target="_blank" rel="noopener noreferrer">
              {dic.licenca.nome}
            </a>
          </p>
        )}
      </header>

      {!dic && (
        <p className="rounded border border-border p-4 text-fg/60">
          Catálogo temporariamente indisponível.
        </p>
      )}

      <div className="space-y-4">
        {conjuntos.map(([key, conj]) => {
          const urls = exportUrls(key);
          return (
            <details key={key} className="rounded border border-border p-4">
              <summary className="cursor-pointer">
                <span className="font-heading text-lg font-semibold text-primary">
                  {nomeConjunto(key)}
                </span>
                <span className="ml-2 text-sm text-fg/70">{conj.descricao}</span>
              </summary>

              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  Baixar:{' '}
                  <a href={urls.csv} className="underline">CSV</a>
                  {' · '}
                  <a href={urls.json} className="underline">JSON (API)</a>
                </p>
                <p className="text-xs text-fg/60">
                  Chave natural: {conj.chaveNatural.join(', ')}
                </p>
                <table className="w-full border-collapse text-sm">
                  <caption className="sr-only">Dicionário de dados de {nomeConjunto(key)}</caption>
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th scope="col" className="p-2">Campo</th>
                      <th scope="col" className="p-2">Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(conj.campos).map(([campo, desc]) => (
                      <tr key={campo} className="border-b border-border/50">
                        <td className="p-2 font-mono text-xs">{campo}</td>
                        <td className="p-2">{desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
