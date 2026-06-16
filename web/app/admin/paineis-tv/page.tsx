'use client';

import { useState } from 'react';
import { adminPost, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface TokenResp {
  painel: string;
  token: string;
  path: string;
}

const PAINEIS = [
  {
    painel: 'ouvidoria' as const,
    titulo: 'Painel da Ouvidoria',
    desc: 'Operacional: manifestações abertas, SLA, prazos vencendo, denúncias e satisfação. Para a TV da sala da ouvidoria.',
  },
  {
    painel: 'prefeito' as const,
    titulo: 'Painel do Prefeito',
    desc: 'Executivo: visão consolidada da cidade, resolução, satisfação, tendência e demandas por secretaria. Para a TV do gabinete.',
  },
];

export default function PaineisTvPage() {
  const [links, setLinks] = useState<Record<string, string>>({});
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState('');
  const [copiado, setCopiado] = useState('');

  async function gerar(painel: 'ouvidoria' | 'prefeito') {
    setGerando(painel);
    setErro('');
    try {
      const r = await adminPost<TokenResp>('/api/painel/token', { painel });
      const url = `${window.location.origin}${r.path}`;
      setLinks((l) => ({ ...l, [painel]: url }));
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao gerar o link.');
    } finally {
      setGerando('');
    }
  }

  async function copiar(painel: string, url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(painel);
      setTimeout(() => setCopiado(''), 2000);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div>
      <AdminHeader
        title="Painéis de TV (Wallboard)"
        description="Gere o link para exibir um painel em tela cheia numa TV. O link tem token próprio — a TV não precisa de login."
      />

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      <div className="grid gap-4 md:grid-cols-2">
        {PAINEIS.map((p) => (
          <div key={p.painel} className={`${ui.card} p-5`}>
            <h2 className="font-heading text-lg font-bold">{p.titulo}</h2>
            <p className="mt-1 text-sm text-fg/70">{p.desc}</p>

            {links[p.painel] ? (
              <div className="mt-4 space-y-2">
                <label className={ui.label}>Link da TV</label>
                <input className={ui.input} readOnly value={links[p.painel]} onFocus={(e) => e.currentTarget.select()} />
                <div className="flex flex-wrap gap-2">
                  <button className={ui.btn} onClick={() => copiar(p.painel, links[p.painel])}>
                    {copiado === p.painel ? 'Copiado!' : 'Copiar link'}
                  </button>
                  <a className={ui.btnGhost} href={links[p.painel]} target="_blank" rel="noopener noreferrer">
                    Abrir em tela cheia
                  </a>
                  <button className={ui.btnGhost} onClick={() => gerar(p.painel)}>
                    Gerar novo
                  </button>
                </div>
                <p className="text-xs text-fg/50">
                  Abra na TV e pressione F11 (tela cheia). O link vale por 180 dias. Gere um novo para invalidar o anterior.
                </p>
              </div>
            ) : (
              <button className={`${ui.btn} mt-4`} disabled={gerando === p.painel} onClick={() => gerar(p.painel)}>
                {gerando === p.painel ? 'Gerando…' : 'Gerar link da TV'}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="mt-6 rounded border border-border bg-muted/30 p-4 text-sm text-fg/70">
        <strong>Como usar na TV:</strong> abra o navegador da Smart TV (ou de um mini-PC/TV Box conectado), cole o link,
        e pressione F11 para tela cheia. O painel atualiza sozinho a cada 30 segundos. Recomendado para telas de 50&quot; ou mais.
      </div>
    </div>
  );
}
