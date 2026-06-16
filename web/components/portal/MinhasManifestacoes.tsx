'use client';

import { useEffect, useState } from 'react';
import { minhas, MinhaManifestacao, STATUS_LABEL } from '../../lib/ouvidoria';

const ABERTOS = ['registrada', 'em_analise', 'em_tratamento', 'aguardando_cidadao', 'prorrogada', 'recurso_1a_instancia', 'recurso_2a_instancia'];

export default function MinhasManifestacoes() {
  const [itens, setItens] = useState<MinhaManifestacao[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    minhas()
      .then(setItens)
      .catch((e) => setErro(e instanceof Error ? e.message : 'Falha ao carregar.'));
  }, []);

  if (erro) return <p className="text-sm text-danger">{erro}</p>;
  if (!itens) return <p className="text-sm text-fg/60">Carregando…</p>;
  if (itens.length === 0) {
    return (
      <p className="rounded border border-border p-4 text-sm text-fg/60">
        Você ainda não registrou manifestações.{' '}
        <a href="/ouvidoria" className="text-primary underline">Abrir na Ouvidoria</a> ou{' '}
        <a href="/esic" className="text-primary underline">fazer pedido e-SIC</a>.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {itens.map((m) => {
        const aberto = ABERTOS.includes(m.status);
        return (
          <li key={m.id} className="rounded border border-border p-3">
            <a href={`/acompanhar?protocolo=${encodeURIComponent(m.protocolo)}`}
              className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-mono text-sm font-semibold">{m.protocolo}</span>
                <span className="ml-2 text-sm">{m.assunto}</span>
                <span className="block text-xs text-fg/60">
                  {m.canal === 'esic' ? 'e-SIC' : 'Ouvidoria'} · aberto em {new Date(m.criadoEm).toLocaleDateString('pt-BR')}
                </span>
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${aberto ? 'bg-primary/10 text-primary' : 'bg-muted text-fg/70'}`}>
                {STATUS_LABEL[m.status] ?? m.status}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
