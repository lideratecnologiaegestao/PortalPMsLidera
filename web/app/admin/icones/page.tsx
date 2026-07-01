'use client';

/**
 * Galeria geral de Ícones e Emojis — referência para uso em todo o portal.
 * Busca, agrupado por categoria, clique para COPIAR (nome do ícone ou o emoji).
 */
import { useMemo, useState } from 'react';
import { AdminHeader, Aviso, ui } from '../_components/ui';
import { Icone, CATALOGO, CATEGORIAS_ICONE } from '../../../lib/icones';
import { EMOJIS, CATEGORIAS_EMOJI } from '../../../lib/emojis';

export default function GaleriaIconesPage() {
  const [aba, setAba] = useState<'icone' | 'emoji'>('icone');
  const [q, setQ] = useState('');
  const [copiado, setCopiado] = useState('');

  const termo = q.trim().toLowerCase();
  const icones = useMemo(
    () => (termo ? CATALOGO.filter((i) => i.nome.includes(termo) || i.termos.includes(termo) || i.cat.toLowerCase().includes(termo)) : CATALOGO),
    [termo],
  );
  const emojis = useMemo(
    () => (termo ? EMOJIS.filter((i) => i.termos.includes(termo) || i.cat.toLowerCase().includes(termo)) : EMOJIS),
    [termo],
  );

  async function copiar(valor: string) {
    try { await navigator.clipboard.writeText(valor); setCopiado(valor); setTimeout(() => setCopiado(''), 1500); }
    catch { /* sem clipboard: ignora */ }
  }

  return (
    <div className="space-y-4">
      <AdminHeader title="Ícones e Emojis" description="Galeria de referência. Clique para copiar o nome do ícone (use nos campos de ícone) ou o emoji.">
        <div className="inline-flex overflow-hidden rounded border border-border">
          {(['icone', 'emoji'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setAba(t)}
              className={`px-4 py-1.5 text-sm font-semibold ${aba === t ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
              {t === 'icone' ? 'Ícones' : 'Emojis'}
            </button>
          ))}
        </div>
      </AdminHeader>

      {copiado && <Aviso tipo="ok">Copiado: <strong>{copiado}</strong></Aviso>}

      <input type="search" className={ui.input} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={aba === 'icone' ? 'Buscar ícone (ex.: saúde, ônibus, dinheiro)…' : 'Buscar emoji (ex.: vacina, festa)…'} />

      {aba === 'icone' ? (
        <div className="space-y-6">
          {CATEGORIAS_ICONE.map((cat) => {
            const itens = icones.filter((i) => i.cat === cat);
            if (itens.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg/60">{cat}</h2>
                <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
                  {itens.map((i) => (
                    <li key={i.nome}>
                      <button type="button" onClick={() => copiar(i.nome)} title={`Copiar "${i.nome}"`}
                        className="flex w-full flex-col items-center gap-1 rounded border border-border bg-bg p-3 text-center hover:border-primary hover:bg-muted">
                        <Icone nome={i.nome} size={26} className="text-fg" />
                        <span className="w-full truncate text-[10px] text-fg/60">{i.nome}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {icones.length === 0 && <p className="py-8 text-center text-sm text-fg/50">Nenhum ícone encontrado.</p>}
        </div>
      ) : (
        <div className="space-y-6">
          {CATEGORIAS_EMOJI.map((cat) => {
            const itens = emojis.filter((i) => i.cat === cat);
            if (itens.length === 0) return null;
            return (
              <section key={cat}>
                <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-fg/60">{cat}</h2>
                <ul className="grid grid-cols-6 gap-2 sm:grid-cols-10 md:grid-cols-12">
                  {itens.map((i) => (
                    <li key={i.e}>
                      <button type="button" onClick={() => copiar(i.e)} title={`Copiar ${i.e} (${i.termos})`}
                        className="flex h-11 w-full items-center justify-center rounded border border-border bg-bg text-2xl leading-none hover:border-primary hover:bg-muted">
                        <span aria-hidden="true">{i.e}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
          {emojis.length === 0 && <p className="py-8 text-center text-sm text-fg/50">Nenhum emoji encontrado.</p>}
        </div>
      )}
    </div>
  );
}
