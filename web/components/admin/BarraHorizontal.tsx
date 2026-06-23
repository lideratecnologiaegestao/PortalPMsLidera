'use client';

/**
 * Gráfico de barras horizontais acessível — sem lib externa.
 * Inclui tabela <caption> + dados para leitores de tela (aria-hidden nas barras).
 *
 * Props:
 *  - itens: Array<{ rotulo: string; valor: number; cor?: string }>
 *  - titulo: string (legenda da tabela equivalente)
 *  - colunaRotulo: string (label da coluna de rótulo)
 *  - colunaValor: string (label da coluna de valor)
 */

export interface BarraItem {
  rotulo: string;
  valor: number;
  cor?: string; // classe Tailwind de fundo, ex: 'bg-primary'
}

export default function BarraHorizontal({
  itens,
  titulo,
  colunaRotulo = 'Item',
  colunaValor = 'Total',
  altura = 'h-4',
}: {
  itens: BarraItem[];
  titulo: string;
  colunaRotulo?: string;
  colunaValor?: string;
  altura?: string;
}) {
  const max = Math.max(...itens.map((i) => i.valor), 1);

  return (
    <div>
      {/* Representação visual (aria-hidden — tabela abaixo é a fonte de verdade) */}
      <div aria-hidden="true" className="space-y-2">
        {itens.map((item) => (
          <div key={item.rotulo} className="flex items-center gap-2 text-sm">
            <span className="w-32 shrink-0 truncate text-right text-fg/70">{item.rotulo}</span>
            <div className="flex-1 rounded bg-muted overflow-hidden">
              <div
                className={`${altura} rounded ${item.cor ?? 'bg-primary'} transition-all`}
                style={{ width: `${(item.valor / max) * 100}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-semibold text-fg">{item.valor}</span>
          </div>
        ))}
      </div>

      {/* Tabela equivalente para leitores de tela */}
      <table className="sr-only">
        <caption>{titulo}</caption>
        <thead>
          <tr>
            <th scope="col">{colunaRotulo}</th>
            <th scope="col">{colunaValor}</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((item) => (
            <tr key={item.rotulo}>
              <td>{item.rotulo}</td>
              <td>{item.valor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
