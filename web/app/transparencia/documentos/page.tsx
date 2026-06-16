import { listarDocumentos, Documento } from '../../../lib/transparencia';
import { dataCurta } from '../../../lib/format';

export const metadata = {
  title: 'Documentos e Planejamento — Transparência',
  description:
    'PPA, LDO, LOA, RREO, RGF, Balanço Geral, Carta de Serviços, editais e contratos do município.',
};

// Rótulos e ordem de exibição das categorias (planejamento/prestação primeiro).
const CATEGORIAS: { key: string; label: string }[] = [
  { key: 'ppa', label: 'PPA — Plano Plurianual' },
  { key: 'ldo', label: 'LDO — Lei de Diretrizes Orçamentárias' },
  { key: 'loa', label: 'LOA — Lei Orçamentária Anual' },
  { key: 'rreo', label: 'RREO — Relatório Resumido da Execução Orçamentária' },
  { key: 'rgf', label: 'RGF — Relatório de Gestão Fiscal' },
  { key: 'balanco_geral', label: 'Balanço Geral' },
  { key: 'prestacao_contas', label: 'Prestação de Contas' },
  { key: 'plano_contratacoes', label: 'Plano de Contratações Anual' },
  { key: 'edital_licitacao', label: 'Editais de Licitação' },
  { key: 'contrato', label: 'Contratos (íntegra)' },
  { key: 'concurso', label: 'Editais de Concurso' },
  { key: 'carta_servicos', label: 'Carta de Serviços ao Usuário' },
  { key: 'regulamento_lai', label: 'Regulamentação da LAI' },
  { key: 'relatorio_estatistico_sic', label: 'Relatório Estatístico do e-SIC' },
];

/** Classifica a URL do documento para sinalizar ao cidadão o que é oficial. */
function statusDoc(url: string | null): { rotulo: string; cls: string; baixavel: boolean } {
  if (!url || /^https?:\/\/[^/]+\/doc\//i.test(url)) {
    return { rotulo: 'Pendente', cls: 'bg-warning/20 text-warning', baixavel: false };
  }
  if (url.includes('/transparencia/modelo/')) {
    return { rotulo: 'Modelo de exemplo', cls: 'bg-muted text-fg/70', baixavel: true };
  }
  return { rotulo: 'Oficial', cls: 'bg-success/20 text-success', baixavel: true };
}

export default async function DocumentosPage() {
  const res = await listarDocumentos('pageSize=200').catch(() => null);
  const docs: Documento[] = res?.data ?? [];

  const porCategoria = new Map<string, Documento[]>();
  for (const d of docs) {
    const lista = porCategoria.get(d.categoria) ?? [];
    lista.push(d);
    porCategoria.set(d.categoria, lista);
  }
  // categorias conhecidas (na ordem) + quaisquer extras ao final
  const extras = [...porCategoria.keys()].filter(
    (k) => !CATEGORIAS.some((c) => c.key === k),
  );
  const ordem = [...CATEGORIAS, ...extras.map((k) => ({ key: k, label: k }))];

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Documentos e Planejamento
      </nav>
      <header className="space-y-2">
        <h1 className="font-heading text-2xl font-bold">Documentos e Planejamento</h1>
        <p className="max-w-3xl text-fg/80">
          Instrumentos de planejamento e prestação de contas (LRF e LAI): PPA,
          LDO, LOA, relatórios fiscais, balanço geral, editais e contratos na
          íntegra. Documentos marcados como{' '}
          <span className="rounded bg-muted px-1 text-xs">Modelo de exemplo</span>{' '}
          são gerados pela plataforma e devem ser substituídos pelo arquivo
          oficial pela prefeitura.
        </p>
      </header>

      {docs.length === 0 && (
        <p className="rounded border border-border p-4 text-fg/60">
          Nenhum documento publicado até o momento.
        </p>
      )}

      <div className="space-y-6">
        {ordem.map(({ key, label }) => {
          const lista = porCategoria.get(key);
          if (!lista || lista.length === 0) return null;
          return (
            <div key={key} className="rounded border border-border p-4">
              <h2 className="font-heading text-lg font-semibold">{label}</h2>
              <ul className="mt-2 divide-y divide-border/60">
                {lista
                  .sort((a, b) => b.exercicio - a.exercicio)
                  .map((d) => {
                    const st = statusDoc(d.urlExterna);
                    return (
                      <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <div>
                          <p className="font-medium">{d.titulo}</p>
                          <p className="text-xs text-fg/60">
                            Exercício {d.exercicio}
                            {d.publicadoEm ? ` · publicado em ${dataCurta(d.publicadoEm)}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded px-2 py-0.5 text-xs ${st.cls}`}>{st.rotulo}</span>
                          {st.baixavel && d.urlExterna ? (
                            <a
                              href={d.urlExterna}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded bg-primary px-3 py-1 text-sm text-primary-fg"
                            >
                              Baixar
                            </a>
                          ) : (
                            <span className="text-xs text-fg/50">indisponível</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
