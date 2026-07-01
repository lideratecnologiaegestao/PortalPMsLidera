'use client';

/**
 * Seletor de Ícone/Emoji com pré-visualização (modal). Abas Ícones e Emojis,
 * busca por nome/termo, grade com preview, clique para escolher.
 *
 * onSelect(valor, tipo): para ícone, `valor` é o NOME do ícone (ex.: 'saude');
 * para emoji, `valor` é o caractere. `tipo` = 'icone' | 'emoji'.
 */
import { useMemo, useState } from 'react';
import { Modal, ui } from './ui';
import { Icone, CATALOGO } from '../../../lib/icones';
import { EMOJIS } from '../../../lib/emojis';

type Modo = 'icone' | 'emoji' | 'ambos';

export default function IconeEmojiPicker({
  open, onClose, onSelect, modo = 'ambos', valorAtual,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (valor: string, tipo: 'icone' | 'emoji') => void;
  modo?: Modo;
  valorAtual?: string | null;
}) {
  const [aba, setAba] = useState<'icone' | 'emoji'>(modo === 'emoji' ? 'emoji' : 'icone');
  const [q, setQ] = useState('');

  const termo = q.trim().toLowerCase();
  const icones = useMemo(
    () => (termo ? CATALOGO.filter((i) => i.nome.includes(termo) || i.termos.includes(termo) || i.cat.toLowerCase().includes(termo)) : CATALOGO),
    [termo],
  );
  const emojis = useMemo(
    () => (termo ? EMOJIS.filter((i) => i.termos.includes(termo) || i.cat.toLowerCase().includes(termo)) : EMOJIS),
    [termo],
  );

  const mostrarAbas = modo === 'ambos';

  return (
    <Modal open={open} onClose={onClose} title="Escolher ícone ou emoji">
      <div className="space-y-3">
        {mostrarAbas && (
          <div className="inline-flex overflow-hidden rounded border border-border">
            {(['icone', 'emoji'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setAba(t)}
                className={`px-4 py-1.5 text-sm font-semibold ${aba === t ? 'bg-primary text-primary-fg' : 'bg-bg text-fg hover:bg-muted'}`}>
                {t === 'icone' ? 'Ícones' : 'Emojis'}
              </button>
            ))}
          </div>
        )}

        <input
          type="search"
          className={ui.input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={aba === 'icone' ? 'Buscar ícone (ex.: saúde, ônibus, dinheiro)…' : 'Buscar emoji (ex.: vacina, calendário)…'}
          autoFocus
        />

        <div className="max-h-[55vh] overflow-y-auto rounded border border-border p-2">
          {aba === 'icone' ? (
            icones.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg/50">Nenhum ícone encontrado.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5 md:grid-cols-6">
                {icones.map((i) => (
                  <li key={i.nome}>
                    <button
                      type="button"
                      onClick={() => { onSelect(i.nome, 'icone'); onClose(); }}
                      title={`${i.nome} — ${i.cat}`}
                      className={`flex w-full flex-col items-center gap-1 rounded p-2 text-center hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${valorAtual === i.nome ? 'bg-primary/10 ring-1 ring-primary' : ''}`}
                    >
                      <Icone nome={i.nome} size={24} className="text-fg" />
                      <span className="w-full truncate text-[10px] text-fg/60">{i.nome}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : (
            emojis.length === 0 ? (
              <p className="py-8 text-center text-sm text-fg/50">Nenhum emoji encontrado.</p>
            ) : (
              <ul className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-10">
                {emojis.map((i) => (
                  <li key={i.e}>
                    <button
                      type="button"
                      onClick={() => { onSelect(i.e, 'emoji'); onClose(); }}
                      title={i.termos}
                      className={`flex h-10 w-full items-center justify-center rounded text-xl leading-none hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${valorAtual === i.e ? 'bg-primary/10 ring-1 ring-primary' : ''}`}
                    >
                      <span aria-hidden="true">{i.e}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs text-fg/50">{aba === 'icone' ? `${icones.length} ícones` : `${emojis.length} emojis`}</p>
          <button type="button" className={ui.btnGhost} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  );
}

/** Botão-campo reutilizável: mostra o ícone/emoji atual + abre o seletor. */
export function CampoIcone({
  valor, onChange, modo = 'icone', label,
}: {
  valor: string | null | undefined;
  onChange: (valor: string) => void;
  modo?: Modo;
  label?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const ehEmoji = !!valor && !CATALOGO.some((i) => i.nome === valor) && !/^[a-z0-9_-]+$/i.test(valor);
  return (
    <div>
      {label && <label className={ui.label}>{label}</label>}
      <div className="mt-1 flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-border bg-bg">
          {valor ? (ehEmoji ? <span className="text-lg" aria-hidden>{valor}</span> : <Icone nome={valor} size={20} className="text-fg" />) : <span className="text-xs text-fg/40">—</span>}
        </span>
        <button type="button" className={ui.btnGhost} onClick={() => setAberto(true)}>
          {valor ? 'Trocar' : 'Escolher'}
        </button>
        {valor && <button type="button" className="text-xs text-danger hover:underline" onClick={() => onChange('')}>remover</button>}
      </div>
      <IconeEmojiPicker open={aberto} onClose={() => setAberto(false)} onSelect={(v) => onChange(v)} modo={modo} valorAtual={valor} />
    </div>
  );
}
