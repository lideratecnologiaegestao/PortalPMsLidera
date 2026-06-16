'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, qs, Pagina, AdminApiError } from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

const CATEGORIA_LABEL: Record<string, string> = {
  buraco_via: 'Buraco na via',
  terreno_abandonado: 'Terreno abandonado',
  animal_abandonado: 'Animal abandonado',
  iluminacao_publica: 'Iluminação pública',
  coleta_lixo: 'Lixo / entulho',
  arvore_risco: 'Poda de árvore',
  sinalizacao: 'Sinalização',
  outro: 'Outro',
};

const STATUS_LABEL: Record<string, string> = {
  aberto: 'Aberto',
  triagem: 'Em triagem',
  em_atendimento: 'Em atendimento',
  resolvido: 'Resolvido',
  reaberto: 'Reaberto',
  cancelado: 'Cancelado',
  duplicado: 'Duplicado',
};

const STATUS_CORES: Record<string, string> = {
  aberto: 'bg-muted text-fg',
  triagem: 'bg-warning text-secondary-fg',
  em_atendimento: 'bg-primary text-primary-fg',
  resolvido: 'bg-success text-primary-fg',
  reaberto: 'bg-warning text-secondary-fg',
  cancelado: 'bg-muted text-fg',
  duplicado: 'bg-muted text-fg',
};

// transições que a equipe pode aplicar (o backend valida o enum)
const STATUS_ACOES = ['triagem', 'em_atendimento', 'resolvido', 'reaberto', 'cancelado', 'duplicado'];

interface ChamadoItem {
  id: string;
  protocolo: string;
  categoria: string;
  status: string;
  descricao: string;
  bairro: string | null;
  endereco: string | null;
  anonimo: boolean;
  criado_em: string;
  num_fotos: number;
  fotoUrl: string | null;
}

interface ChamadoDetalhe {
  id: string;
  protocolo: string;
  categoria: string;
  status: string;
  descricao: string;
  bairro: string | null;
  endereco: string | null;
  anonimo: boolean;
  criado_em: string;
  resolvido_em: string | null;
  lat: number;
  lng: number;
  atualizacoes: { status: string; comentario: string | null; criado_em: string }[];
  fotos: { id: string; url: string }[];
}

const dataHora = (s: string) => new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function Badge({ status }: { status: string }) {
  return <span className={`${ui.badge} ${STATUS_CORES[status] ?? 'bg-muted text-fg'}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export default function ChamadosAdminPage() {
  const [status, setStatus] = useState('');
  const [categoria, setCategoria] = useState('');
  const [q, setQ] = useState('');
  const [busca, setBusca] = useState('');
  const [page, setPage] = useState(1);
  const [pagina, setPagina] = useState<Pagina<ChamadoItem> | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [idSel, setIdSel] = useState<string | null>(null);

  const carregar = useCallback(
    async (pg: number) => {
      setCarregando(true);
      setErro('');
      try {
        const data = await adminGet<Pagina<ChamadoItem>>(
          `/api/admin/chamados${qs({ status, categoria, q: busca, page: pg, pageSize: 20 })}`,
        );
        setPagina(data);
        setPage(pg);
      } catch (e) {
        setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar as denúncias.');
      } finally {
        setCarregando(false);
      }
    },
    [status, categoria, busca],
  );

  useEffect(() => {
    carregar(1);
  }, [carregar]);

  const totalPaginas = pagina ? Math.max(1, Math.ceil(pagina.total / pagina.pageSize)) : 1;

  return (
    <div>
      <AdminHeader
        title="Denúncias (App do Cidadão)"
        description="Demandas urbanas georreferenciadas: buracos, lixo, iluminação, animais e mais."
      />

      {/* Filtros */}
      <form
        className="mb-4 flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusca(q);
        }}
      >
        <div>
          <label className={ui.label}>Status</label>
          <select className={ui.input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.keys(STATUS_LABEL).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ui.label}>Categoria</label>
          <select className={ui.input} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="">Todas</option>
            {Object.keys(CATEGORIA_LABEL).map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        <div className="grow">
          <label className={ui.label}>Buscar</label>
          <input
            className={ui.input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Protocolo, descrição ou bairro…"
          />
        </div>
        <button type="submit" className={ui.btn}>
          Buscar
        </button>
      </form>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <div className={`${ui.card} overflow-x-auto`}>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={ui.th}>Foto</th>
              <th className={ui.th}>Protocolo</th>
              <th className={ui.th}>Categoria</th>
              <th className={ui.th}>Status</th>
              <th className={ui.th}>Bairro</th>
              <th className={ui.th}>Recebida</th>
            </tr>
          </thead>
          <tbody>
            {pagina?.items.map((c) => (
              <tr
                key={c.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => setIdSel(c.id)}
              >
                <td className={ui.td}>
                  {c.fotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`${apiBase}${c.fotoUrl}`}
                      alt="Foto da denúncia"
                      className="h-12 w-12 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-xs text-fg/50">
                      —
                    </div>
                  )}
                </td>
                <td className={ui.td}>
                  <span className="font-mono text-xs">{c.protocolo}</span>
                  {c.anonimo && <span className="ml-1 text-xs text-fg/50">(anônima)</span>}
                </td>
                <td className={ui.td}>{CATEGORIA_LABEL[c.categoria] ?? c.categoria}</td>
                <td className={ui.td}>
                  <Badge status={c.status} />
                </td>
                <td className={ui.td}>{c.bairro || '—'}</td>
                <td className={ui.td}>{dataHora(c.criado_em)}</td>
              </tr>
            ))}
            {pagina && pagina.items.length === 0 && !carregando && (
              <tr>
                <td className={ui.td} colSpan={6}>
                  Nenhuma denúncia encontrada com esses filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {pagina && pagina.total > 0 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-fg/70">
            {pagina.total} denúncia{pagina.total === 1 ? '' : 's'} · página {page} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <button className={ui.btnGhost} disabled={page <= 1 || carregando} onClick={() => carregar(page - 1)}>
              Anterior
            </button>
            <button
              className={ui.btnGhost}
              disabled={page >= totalPaginas || carregando}
              onClick={() => carregar(page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      {idSel && (
        <DetalheModal
          id={idSel}
          onFechar={() => setIdSel(null)}
          onAtualizado={() => {
            carregar(page);
          }}
        />
      )}
    </div>
  );
}

function DetalheModal({ id, onFechar, onAtualizado }: { id: string; onFechar: () => void; onAtualizado: () => void }) {
  const [det, setDet] = useState<ChamadoDetalhe | null>(null);
  const [erro, setErro] = useState('');
  const [novoStatus, setNovoStatus] = useState('');
  const [comentario, setComentario] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [okMsg, setOkMsg] = useState('');

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setDet(await adminGet<ChamadoDetalhe>(`/api/admin/chamados/${id}`));
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar o detalhe.');
    }
  }, [id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function aplicar() {
    if (!novoStatus) return;
    setSalvando(true);
    setErro('');
    setOkMsg('');
    try {
      await adminPost(`/api/admin/chamados/${id}/status`, { status: novoStatus, comentario: comentario || undefined });
      setComentario('');
      setNovoStatus('');
      setOkMsg('Status atualizado.');
      await carregar();
      onAtualizado();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao atualizar o status.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open onClose={onFechar} title={det ? `Denúncia ${det.protocolo}` : 'Denúncia'}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {!det ? (
        <p className="text-sm text-fg/70">Carregando…</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge status={det.status} />
            <span className="text-sm font-semibold">{CATEGORIA_LABEL[det.categoria] ?? det.categoria}</span>
            {det.anonimo && <span className="text-xs text-fg/50">denúncia anônima</span>}
          </div>

          <p className="whitespace-pre-wrap text-sm">{det.descricao}</p>

          <div className="text-sm text-fg/70">
            <div>
              <strong>Local:</strong> {det.endereco || det.bairro || '—'}
            </div>
            <div>
              <strong>Recebida:</strong> {dataHora(det.criado_em)}
              {det.resolvido_em && <> · <strong>Resolvida:</strong> {dataHora(det.resolvido_em)}</>}
            </div>
            {Number.isFinite(det.lat) && Number.isFinite(det.lng) && (
              <a
                className="text-primary underline"
                href={`https://www.google.com/maps?q=${det.lat},${det.lng}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver no mapa ({Number(det.lat).toFixed(5)}, {Number(det.lng).toFixed(5)})
              </a>
            )}
          </div>

          {/* Fotos */}
          {det.fotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {det.fotos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <a key={f.id} href={`${apiBase}${f.url}`} target="_blank" rel="noopener noreferrer">
                  <img
                    src={`${apiBase}${f.url}`}
                    alt="Foto da denúncia"
                    className="h-24 w-24 rounded border border-border object-cover"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Histórico */}
          <div>
            <h3 className="mb-1 text-sm font-semibold">Histórico</h3>
            {det.atualizacoes.length === 0 ? (
              <p className="text-sm text-fg/60">Sem atualizações ainda.</p>
            ) : (
              <ul className="space-y-1">
                {det.atualizacoes.map((a, i) => (
                  <li key={i} className="border-l-2 border-primary pl-2 text-sm">
                    <Badge status={a.status} /> <span className="text-fg/60">{dataHora(a.criado_em)}</span>
                    {a.comentario && <div className="text-fg/80">{a.comentario}</div>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Mudar status */}
          <div className="rounded border border-border p-3">
            <h3 className="mb-2 text-sm font-semibold">Atualizar status</h3>
            {okMsg && <Aviso tipo="ok">{okMsg}</Aviso>}
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className={ui.label}>Novo status</label>
                <select className={ui.input} value={novoStatus} onChange={(e) => setNovoStatus(e.target.value)}>
                  <option value="">Selecione…</option>
                  {STATUS_ACOES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grow">
                <label className={ui.label}>Comentário (opcional)</label>
                <input
                  className={ui.input}
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Ex.: equipe acionada, prazo estimado…"
                />
              </div>
              <button className={ui.btn} disabled={!novoStatus || salvando} onClick={aplicar}>
                {salvando ? 'Salvando…' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
