import {
  listarDespesas,
  listarReceitas,
  listarFolha,
  listarDataset,
  listarDocumentos,
} from '../../lib/transparencia';
import { dataHora } from '../../lib/format';
import { CONJUNTOS, TEMAS, ConjuntoDef } from '../../lib/transparencia-conjuntos';

export const metadata = {
  title: 'Portal da Transparência',
  description:
    'Receitas, despesas, licitações, contratos, obras, folha, documentos e dados abertos do município (LC 131/2009, LRF e LAI).',
};

interface Contagem {
  total: number;
  atualizado: string | null;
}

async function contar(c: ConjuntoDef): Promise<Contagem> {
  try {
    if (c.via === 'transp') {
      const r =
        c.key === 'despesas'
          ? await listarDespesas('pageSize=1')
          : c.key === 'receitas'
          ? await listarReceitas('pageSize=1')
          : await listarFolha('pageSize=1');
      return { total: r.total, atualizado: r.ultimaAtualizacao };
    }
    const r = await listarDataset(c.key, 'pageSize=1');
    return { total: r.total, atualizado: r.ultimaAtualizacao };
  } catch {
    return { total: 0, atualizado: null };
  }
}

/** Índice do Portal da Transparência: todos os conjuntos do PNTP por tema. */
export default async function TransparenciaPage() {
  const [contagens, docs] = await Promise.all([
    Promise.all(CONJUNTOS.map(contar)),
    listarDocumentos('pageSize=1').catch(() => ({ total: 0, ultimaAtualizacao: null })),
  ]);

  const porKey = new Map(CONJUNTOS.map((c, i) => [c.key, contagens[i]]));

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">Portal da Transparência</h1>
        <p className="max-w-3xl text-fg/80">
          Informações públicas do município em cumprimento à Lei de Acesso à
          Informação (Lei 12.527/2011), à Lei Complementar 131/2009 e à Lei de
          Responsabilidade Fiscal. Todos os conjuntos estão disponíveis também em{' '}
          <a href="/transparencia/dados-abertos" className="font-semibold text-primary underline">
            dados abertos
          </a>{' '}
          (CSV, JSON e API).
        </p>
      </header>

      {/* Destaques: documentos e dados abertos */}
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="/transparencia/documentos"
          className="rounded-lg border border-border bg-muted/30 p-4 transition hover:border-primary"
        >
          <span className="font-heading text-lg font-semibold text-primary">
            Documentos e Planejamento
          </span>
          <p className="text-sm text-fg/80">
            PPA, LDO, LOA, RREO, RGF, Balanço Geral, Carta de Serviços, editais e
            contratos na íntegra.
          </p>
          <p className="mt-2 text-sm text-fg/60">{docs.total.toLocaleString('pt-BR')} documentos</p>
        </a>
        <a
          href="/transparencia/dados-abertos"
          className="rounded-lg border border-border bg-muted/30 p-4 transition hover:border-primary"
        >
          <span className="font-heading text-lg font-semibold text-primary">Dados Abertos</span>
          <p className="text-sm text-fg/80">
            Catálogo de conjuntos com download em CSV/JSON, dicionário de dados e
            licença aberta (CC BY 4.0).
          </p>
          <p className="mt-2 text-sm text-fg/60">Acesso automatizado por API</p>
        </a>
      </div>

      {/* Conjuntos por tema */}
      {TEMAS.map((tema) => {
        const doTema = CONJUNTOS.filter((c) => c.tema === tema);
        if (doTema.length === 0) return null;
        return (
          <div key={tema} className="space-y-3">
            <h2 className="font-heading text-xl font-bold">{tema}</h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {doTema.map((c) => {
                const ct = porKey.get(c.key) ?? { total: 0, atualizado: null };
                return (
                  <li key={c.key} className="rounded border border-border p-4">
                    <a
                      href={`/transparencia/${c.slug}`}
                      className="font-heading text-lg font-semibold text-primary underline-offset-2 hover:underline"
                    >
                      {c.nome}
                    </a>
                    <p className="text-sm text-fg/80">{c.desc}</p>
                    <dl className="mt-2 text-sm text-fg/70">
                      <div className="flex gap-2">
                        <dt>Registros:</dt>
                        <dd>{ct.total.toLocaleString('pt-BR')}</dd>
                      </div>
                      <div className="flex gap-2">
                        <dt>Atualizado:</dt>
                        <dd>{dataHora(ct.atualizado)}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
