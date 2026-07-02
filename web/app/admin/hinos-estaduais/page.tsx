'use client';

/**
 * /admin/hinos-estaduais — Editor da base de hinos estaduais.
 * Usados nas páginas finais do Diário (hino do estado, automático pela UF).
 * ATENÇÃO: base GLOBAL compartilhada entre todas as entidades da plataforma.
 */

import { useEffect, useMemo, useState } from 'react';
import { AdminApiError, adminGet, adminPut } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface HinoEstadual {
  uf: string;
  estado: string;
  titulo: string;
  autores: string | null;
  letra: string | null;
  fonte: string | null;
  oficial: boolean;
  atualizadoEm?: string;
}

export default function HinosEstaduaisPage() {
  const [lista, setLista] = useState<HinoEstadual[]>([]);
  const [uf, setUf] = useState('');
  const [form, setForm] = useState<HinoEstadual | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    adminGet<HinoEstadual[]>('/api/admin/hinos-estaduais')
      .then((l) => {
        setLista(l);
        if (l.length) {
          setUf(l[0].uf);
          setForm(l[0]);
        }
      })
      .catch(() => setErro('Falha ao carregar os hinos.'))
      .finally(() => setCarregando(false));
  }, []);

  function selecionar(novoUf: string) {
    setUf(novoUf);
    setOk('');
    setErro('');
    const h = lista.find((x) => x.uf === novoUf);
    setForm(h ? { ...h } : null);
  }

  function set<K extends keyof HinoEstadual>(k: K, v: HinoEstadual[K]) {
    setForm((p) => (p ? { ...p, [k]: v } : p));
  }

  const semLetra = useMemo(() => lista.filter((h) => !h.letra).length, [lista]);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSalvando(true);
    setErro('');
    setOk('');
    try {
      const salvo = await adminPut<HinoEstadual>(`/api/admin/hinos-estaduais/${form.uf}`, {
        titulo: form.titulo,
        autores: form.autores ?? '',
        letra: form.letra ?? '',
        fonte: form.fonte ?? '',
        oficial: form.oficial,
      });
      setLista((l) => l.map((x) => (x.uf === salvo.uf ? salvo : x)));
      setForm(salvo);
      setOk(`Hino de ${salvo.estado} salvo.`);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="space-y-4 p-4 md:p-6">
      <AdminHeader
        title="Hinos Estaduais"
        description="Letras dos hinos dos estados usadas nas páginas finais do Diário (o hino do estado é escolhido automaticamente pela UF da entidade)."
      >
        <a href="/admin/diario/config" className="rounded border border-border px-3 py-2 text-sm hover:bg-muted">← Layout do Diário</a>
      </AdminHeader>

      <p className="rounded border border-warning bg-warning/5 p-2 text-xs text-warning" role="note">
        ⚠️ Base <strong>compartilhada</strong> entre todas as entidades da plataforma: uma alteração aqui vale para
        todas as prefeituras/câmaras do mesmo estado. Marque <strong>“incluir no Diário”</strong> apenas quando a
        letra estiver conferida.
      </p>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {carregando ? (
        <p className="text-sm text-fg/60">Carregando…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[220px_1fr]">
          {/* Lista de estados */}
          <div className={`${ui.card} max-h-[70vh] overflow-auto p-1`}>
            <p className="px-2 py-1 text-xs text-fg/50">{lista.length} estados · {semLetra} sem letra</p>
            {lista.map((h) => (
              <button
                key={h.uf}
                type="button"
                onClick={() => selecionar(h.uf)}
                className={[
                  'flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm',
                  h.uf === uf ? 'bg-primary/10 font-semibold' : 'hover:bg-muted',
                ].join(' ')}
              >
                <span><span className="font-mono text-xs text-fg/60">{h.uf}</span> {h.estado}</span>
                {!h.letra ? (
                  <span className="rounded border border-danger px-1 text-[10px] text-danger">sem letra</span>
                ) : !h.oficial ? (
                  <span className="rounded border border-fg/30 px-1 text-[10px] text-fg/50">oculto</span>
                ) : (
                  <span className="rounded border border-success px-1 text-[10px] text-success">no Diário</span>
                )}
              </button>
            ))}
          </div>

          {/* Editor */}
          {form && (
            <form onSubmit={salvar} className={`${ui.card} space-y-3 p-4`}>
              <h2 className="font-heading text-lg font-bold">{form.estado} <span className="font-mono text-sm text-fg/50">({form.uf})</span></h2>
              <div>
                <label htmlFor="titulo" className={ui.label}>Título</label>
                <input id="titulo" value={form.titulo} onChange={(e) => set('titulo', e.target.value)} className={`${ui.input} mt-1`} />
              </div>
              <div>
                <label htmlFor="autores" className={ui.label}>Autores</label>
                <input id="autores" value={form.autores ?? ''} onChange={(e) => set('autores', e.target.value)}
                  className={`${ui.input} mt-1`} placeholder="Letra: … · Música: …" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.oficial} onChange={(e) => set('oficial', e.target.checked)} />
                Incluir este hino no Diário (letra conferida)
              </label>
              <div>
                <label htmlFor="letra" className={ui.label}>Letra</label>
                <textarea id="letra" value={form.letra ?? ''} onChange={(e) => set('letra', e.target.value)}
                  rows={16} className={`${ui.input} mt-1 font-mono text-sm`} placeholder="Uma linha por verso; linha em branco entre estrofes." />
                <p className="mt-1 text-xs text-fg/50">Preserve as quebras de linha: cada linha é um verso; deixe uma linha em branco entre estrofes.</p>
              </div>
              {form.fonte && <p className="text-xs text-fg/50">Fonte: {form.fonte}</p>}
              <button type="submit" disabled={salvando} className={ui.btn}>
                {salvando ? 'Salvando…' : 'Salvar hino'}
              </button>
            </form>
          )}
        </div>
      )}
    </main>
  );
}
