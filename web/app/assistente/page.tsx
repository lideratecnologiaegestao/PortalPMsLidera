'use client';

import { useState } from 'react';
import { apiBase } from '../../lib/auth-shared';
import ChatMarkdown from '../../components/portal/ChatMarkdown';

interface Fonte { titulo: string; slug: string }

export default function AssistentePage() {
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState<string | null>(null);
  const [fontes, setFontes] = useState<Fonte[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function perguntar(e: React.FormEvent) {
    e.preventDefault();
    if (!pergunta.trim()) return;
    setCarregando(true);
    setErro(null);
    setResposta(null);
    setFontes([]);
    try {
      const res = await fetch(`${apiBase}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pergunta }),
      });
      if (res.status === 403) throw new Error('O assistente de IA não está habilitado nesta prefeitura.');
      if (!res.ok) throw new Error('Não foi possível obter uma resposta agora.');
      const data = await res.json();
      setResposta(data.resposta);
      setFontes(data.fontes ?? []);
    } catch (e) {
      setErro(String(e instanceof Error ? e.message : e));
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-8 space-y-4">
      <h1 className="font-heading text-2xl font-bold">Assistente virtual</h1>
      <p className="rounded border border-border bg-muted/30 p-2 text-xs text-fg/70">
        As respostas são geradas por IA com base no conteúdo oficial publicado e
        podem conter imprecisões — não substituem um ato oficial. Não inclua
        dados pessoais na sua pergunta.
      </p>

      <form onSubmit={perguntar} className="flex gap-2">
        <input
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
          placeholder="Como faço para solicitar a 2ª via do IPTU?"
          className="flex-1 rounded border border-border bg-bg px-3 py-2"
          aria-label="Sua pergunta"
        />
        <button
          type="submit"
          disabled={carregando}
          className="rounded bg-primary px-4 py-2 text-primary-fg disabled:opacity-60"
        >
          {carregando ? '...' : 'Perguntar'}
        </button>
      </form>

      {erro && <p className="text-danger">{erro}</p>}

      {resposta && (
        <div className="space-y-3 rounded border border-border p-4">
          <ChatMarkdown>{resposta}</ChatMarkdown>
          {fontes.length > 0 && (
            <div className="border-t border-border pt-2 text-sm">
              <span className="font-semibold">Fontes:</span>
              <ul className="list-inside list-disc">
                {fontes.map((f, i) => (
                  <li key={i}>
                    <a href={`/${f.slug}`} className="underline">{f.titulo}</a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
