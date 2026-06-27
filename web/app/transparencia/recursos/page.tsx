import {
  getSaldoPorFonte,
  getCaixaEquivalentes,
  getArrecadadoPeriodo,
} from '../../../lib/transparencia';

type SP = Record<string, string | undefined>;

export const metadata = { title: 'Recursos por fonte — Transparência' };

const r$ = (n: number) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

function TabelaFontes({
  titulo,
  descricao,
  total,
  itens,
  rotuloValor,
}: {
  titulo: string;
  descricao: string;
  total: number;
  itens: { fonte: string | null; nome: string | null; valor: number }[];
  rotuloValor: string;
}) {
  return (
    <section className="rounded border border-border p-4">
      <h2 className="font-heading text-lg font-bold">{titulo}</h2>
      <p className="mb-2 text-sm text-fg/70">{descricao}</p>
      <p className="mb-3 text-xl font-bold text-primary">{r$(total)}</p>
      {itens.length === 0 ? (
        <p className="text-sm text-fg/60">Sem dados para esta entidade.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="p-2">Fonte de recurso</th>
                <th scope="col" className="p-2 text-right">{rotuloValor}</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((f, i) => (
                <tr key={i} className="border-b border-border/50">
                  <td className="p-2">{f.nome ?? f.fonte ?? '—'}{f.nome && f.fonte ? <span className="text-fg/40"> ({f.fonte})</span> : null}</td>
                  <td className="p-2 text-right tabular-nums whitespace-nowrap">{r$(f.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default async function RecursosPage({ searchParams }: { searchParams: SP }) {
  const de = searchParams.de?.trim() || undefined;
  const ate = searchParams.ate?.trim() || undefined;

  const [saldo, caixa, arrecadado] = await Promise.all([
    getSaldoPorFonte().catch(() => null),
    getCaixaEquivalentes().catch(() => null),
    de && ate ? getArrecadadoPeriodo(de, ate).catch(() => null) : Promise.resolve(null),
  ]);

  const semDados = (!saldo || saldo.fontes.length === 0) && (!caixa || caixa.fontes.length === 0);

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 space-y-5">
      <nav aria-label="Trilha" className="text-sm">
        <a href="/transparencia" className="underline">Transparência</a> › Recursos por fonte
      </nav>
      <h1 className="font-heading text-2xl font-bold">Recursos por fonte</h1>
      <p className="text-fg/80">
        Disponibilidade financeira e caixa por <strong>fonte de recurso</strong>, e receita
        arrecadada por período — a partir da contabilidade oficial (APLIC/TCE-MT). Valores em reais.
      </p>

      {semDados ? (
        <div className="rounded border border-border bg-muted/30 p-6 text-center text-fg/70">
          Ainda não há dados contábeis publicados para esta entidade.
        </div>
      ) : (
        <>
          <TabelaFontes
            titulo="Saldo disponível por fonte"
            descricao="Disponibilidade de recursos por destinação (controle orçamentário 8.2.1.1)."
            total={saldo?.total ?? 0}
            rotuloValor="Saldo"
            itens={(saldo?.fontes ?? []).map((f) => ({ fonte: f.fonte, nome: f.nome, valor: f.saldo }))}
          />

          <TabelaFontes
            titulo="Caixa e equivalentes de caixa"
            descricao="Saldo em caixa, bancos e aplicações financeiras (conta 1.1.1), por fonte."
            total={caixa?.total ?? 0}
            rotuloValor="Saldo"
            itens={(caixa?.fontes ?? []).map((f) => ({ fonte: f.fonte, nome: f.nome, valor: f.saldo }))}
          />

          {/* Arrecadação por período */}
          <section className="rounded border border-border p-4">
            <h2 className="font-heading text-lg font-bold">Arrecadação por período</h2>
            <p className="mb-2 text-sm text-fg/70">
              Receita realizada (conta 6.2.1.2) entre duas datas, total e por fonte.
            </p>
            <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-sm">
                De
                <input type="date" name="de" defaultValue={de}
                  className="rounded border border-border bg-bg px-2 py-1" />
              </label>
              <label className="flex flex-col text-sm">
                Até
                <input type="date" name="ate" defaultValue={ate}
                  className="rounded border border-border bg-bg px-2 py-1" />
              </label>
              <button type="submit" className="rounded bg-primary px-3 py-1 text-primary-fg">Consultar</button>
            </form>

            {arrecadado && 'arrecadadoTotal' in arrecadado ? (
              <>
                <p className="mb-3 text-xl font-bold text-primary">
                  {r$(arrecadado.arrecadadoTotal)}{' '}
                  <span className="text-sm font-normal text-fg/60">
                    ({arrecadado.periodo.de} a {arrecadado.periodo.ate})
                  </span>
                </p>
                {arrecadado.porFonte.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th scope="col" className="p-2">Fonte de recurso</th>
                          <th scope="col" className="p-2 text-right">Arrecadado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {arrecadado.porFonte.map((f, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="p-2">{f.nome ?? f.fonte ?? '—'}</td>
                            <td className="p-2 text-right tabular-nums whitespace-nowrap">{r$(f.arrecadado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-fg/60">Escolha um período (de/até) e clique em Consultar.</p>
            )}
          </section>

          <p className="text-xs text-fg/50">
            Quer perguntar em linguagem natural? O assistente do portal responde
            &ldquo;quanto arrecadei de tal data a tal data&rdquo;, &ldquo;saldo por fonte&rdquo; e
            &ldquo;saldo de caixa&rdquo; com os mesmos números oficiais.
          </p>
        </>
      )}
    </section>
  );
}
