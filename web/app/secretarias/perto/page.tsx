'use client';

/**
 * "Unidades perto de mim" — usa a geolocalização do navegador e lista as
 * unidades de atendimento mais próximas (PostGIS no backend), com botões para
 * abrir no Google Maps / Waze ou copiar o endereço. Funciona em qualquer
 * navegador (inclusive no celular) sem depender do app nativo.
 */

import { useCallback, useState } from 'react';
import PageContainer from '../../../components/portal/PageContainer';
import SecaoTitulo from '../../../components/portal/SecaoTitulo';
import CopiarTexto from '../../../components/portal/CopiarTexto';
import { googleMapsLink, wazeLink, temLocalizacao, enderecoBusca } from '../../../lib/geo-links';

interface UnidadeProxima {
  id: string; nome: string; sigla: string | null; responsavel: string | null; cargo: string | null;
  telefone: string | null; email: string | null; endereco: string | null; cep: string | null;
  horario: string | null; fotoUrl: string | null; latitude: number; longitude: number; distanciaM: number;
  orgaoNome: string; orgaoSigla: string | null; orgaoSlug: string | null;
}

type Status = 'idle' | 'localizando' | 'carregando' | 'ok' | 'erro';

const RAIOS = [
  { v: 2000, l: '2 km' },
  { v: 5000, l: '5 km' },
  { v: 15000, l: '15 km' },
  { v: 50000, l: '50 km' },
];

function fmtDist(m: number): string {
  if (m < 1000) return `${m} m`;
  return `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

export default function UnidadesPertoPage() {
  const [status, setStatus] = useState<Status>('idle');
  const [erro, setErro] = useState('');
  const [unidades, setUnidades] = useState<UnidadeProxima[]>([]);
  const [raio, setRaio] = useState(5000);

  const buscar = useCallback((raioM: number) => {
    setErro('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('erro'); setErro('Seu navegador não suporta geolocalização.'); return;
    }
    setStatus('localizando');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setStatus('carregando');
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/secretarias/unidades/proximas?lat=${latitude}&lng=${longitude}&raio=${raioM}`, { cache: 'no-store' });
          if (!res.ok) throw new Error('falha');
          const data: UnidadeProxima[] = await res.json();
          setUnidades(data);
          setStatus('ok');
        } catch {
          setStatus('erro'); setErro('Não foi possível buscar as unidades. Tente novamente.');
        }
      },
      () => { setStatus('erro'); setErro('Não foi possível obter sua localização. Verifique a permissão do navegador.'); },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }, []);

  function trocarRaio(v: number) {
    setRaio(v);
    if (status === 'ok' || status === 'erro') buscar(v);
  }

  return (
    <PageContainer>
      <SecaoTitulo>Unidades perto de mim</SecaoTitulo>
      <p className="mb-4 max-w-2xl text-fg/70">
        Permita o acesso à sua localização para ver as unidades de atendimento mais próximas.
        Você pode abrir cada uma direto no Google Maps ou no Waze.
      </p>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="rounded bg-primary px-5 py-2.5 font-semibold text-primary-fg hover:opacity-90 disabled:opacity-60"
          onClick={() => buscar(raio)}
          disabled={status === 'localizando' || status === 'carregando'}
        >
          {status === 'localizando' ? 'Localizando…' : status === 'carregando' ? 'Buscando…' : '📍 Usar minha localização'}
        </button>
        <label className="flex items-center gap-2 text-sm text-fg/70">
          Distância:
          <select
            className="rounded border border-border bg-bg px-2 py-1.5 text-sm"
            value={raio}
            onChange={(e) => trocarRaio(Number(e.target.value))}
          >
            {RAIOS.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>
        </label>
      </div>

      {erro && (
        <p role="alert" className="mb-4 rounded border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>
      )}

      {status === 'ok' && unidades.length === 0 && (
        <p className="rounded border border-border bg-muted/30 px-4 py-6 text-center text-fg/70">
          Nenhuma unidade com localização cadastrada dentro de {fmtDist(raio)}. Tente aumentar a distância
          ou consulte a <a href="/institucional/estrutura" className="text-primary hover:underline">estrutura organizacional</a>.
        </p>
      )}

      {unidades.length > 0 && (
        <ul aria-live="polite" className="grid gap-4 sm:grid-cols-2">
          {unidades.map((u) => <Card key={u.id} u={u} />)}
        </ul>
      )}
    </PageContainer>
  );
}

function Card({ u }: { u: UnidadeProxima }) {
  const gLink = googleMapsLink(u);
  const wLink = wazeLink(u);
  const copiavel = enderecoBusca(u);
  return (
    <li className="overflow-hidden rounded-lg border border-border bg-bg shadow-sm">
      {u.fotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.fotoUrl} alt={`Fachada da unidade ${u.nome}`} className="h-40 w-full object-cover" loading="lazy" />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-heading text-base font-bold text-fg">{u.nome}{u.sigla ? <span className="font-normal text-fg/50"> ({u.sigla})</span> : null}</h2>
          <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{fmtDist(u.distanciaM)}</span>
        </div>
        <p className="text-xs text-fg/55">
          {u.orgaoSlug ? <a href={`/secretarias/${u.orgaoSlug}`} className="hover:underline">{u.orgaoNome}</a> : u.orgaoNome}
        </p>
        <div className="mt-2 space-y-1 text-sm">
          {u.endereco && <p className="text-fg/80">📍 {u.endereco}{u.cep ? ` — CEP ${u.cep}` : ''}</p>}
          {u.horario && <p className="text-fg/70">🕒 {u.horario}</p>}
          {u.telefone && <p><a href={`tel:${u.telefone}`} className="text-primary hover:underline">📞 {u.telefone}</a></p>}
        </div>
        {temLocalizacao(u) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {gLink && <a href={gLink} target="_blank" rel="noreferrer" className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg hover:opacity-90">Abrir no Google Maps</a>}
            {wLink && <a href={wLink} target="_blank" rel="noreferrer" className="rounded border border-primary px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/10">Abrir no Waze</a>}
            {copiavel && <CopiarTexto texto={copiavel} rotulo="Copiar endereço" />}
          </div>
        )}
      </div>
    </li>
  );
}
