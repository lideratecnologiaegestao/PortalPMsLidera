'use client';

/**
 * Admin — Agenda Administrativa (calendário unificado).
 * Calendário mensal com os itens próprios (feriados, reuniões, datas
 * comemorativas, pontos facultativos, programações…) + overlay read-only de
 * eventos das secretarias (somente leitura). CRUD dos itens próprios.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import { AdminApiError } from '../../../lib/admin-api';
import Calendario from './Calendario';
import {
  agendaAdminIntervalo, atualizarAgendaItem, corDoItem, criarAgendaItem, excluirAgendaItem,
  tipoLabel, TIPOS_AGENDA, type AgendaItem, type AgendaItemView,
} from '../../../lib/agenda';

// Tipos oferecidos no formulário (todos os tipos municipais são criáveis).
const TIPOS_FORM = TIPOS_AGENDA;

/** Intervalo da grade (domingo da 1ª semana até +42 dias) p/ cobrir o calendário. */
function intervaloGrade(mesRef: Date): { de: string; ate: string } {
  const primeiro = new Date(mesRef.getFullYear(), mesRef.getMonth(), 1);
  const de = new Date(primeiro);
  de.setDate(1 - primeiro.getDay());
  const ate = new Date(de);
  ate.setDate(de.getDate() + 42);
  return { de: de.toISOString(), ate: ate.toISOString() };
}

function isoParaLocalInput(iso: string | null | undefined, soData: boolean): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return soData ? base : `${base}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function AgendaAdminPage() {
  const [mesRef, setMesRef] = useState(() => new Date());
  const [itens, setItens] = useState<AgendaItemView[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [tiposOcultos, setTiposOcultos] = useState<Set<string>>(new Set());
  const [edicao, setEdicao] = useState<Partial<AgendaItem> | null>(null); // modal CRUD
  const [detalhe, setDetalhe] = useState<AgendaItemView | null>(null); // item read-only

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const iv = intervaloGrade(mesRef);
      setItens(await agendaAdminIntervalo(iv.de, iv.ate));
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar a agenda.');
    } finally {
      setCarregando(false);
    }
  }, [mesRef]);
  useEffect(() => { carregar(); }, [carregar]);

  const visiveis = useMemo(
    () => itens.filter((i) => !tiposOcultos.has(i.tipo)),
    [itens, tiposOcultos],
  );

  function alternarTipo(v: string) {
    setTiposOcultos((s) => {
      const n = new Set(s);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });
  }

  function novo(data?: Date) {
    const base = data ?? new Date();
    base.setHours(9, 0, 0, 0);
    setEdicao({ tipo: 'evento', titulo: '', inicio: base.toISOString(), diaInteiro: false, recorrencia: 'nenhuma', publico: true, ativo: true });
  }

  function aoSelecionar(it: AgendaItemView) {
    if (it.editavel) {
      // carrega o item bruto p/ edição (id sem sufixo de ocorrência anual)
      const idbruto = it.id.split(':')[0];
      setEdicao({
        id: idbruto, tipo: it.tipo, titulo: it.titulo, descricao: it.descricao ?? undefined,
        local: it.local ?? undefined, link: it.link ?? undefined, inicio: it.inicio, fim: it.fim ?? undefined,
        diaInteiro: it.diaInteiro, cor: it.cor ?? undefined, destaque: it.destaque,
        recorrencia: it.recorrencia ?? 'nenhuma', publico: it.publico ?? true, ativo: true,
      });
    } else {
      setDetalhe(it);
    }
  }

  return (
    <div className="space-y-4">
      <AdminHeader title="Agenda Administrativa" description="Calendário de eventos, reuniões, feriados, pontos facultativos, datas comemorativas e programações. Os eventos das secretarias aparecem no calendário (somente leitura).">
        <button type="button" className={ui.btn} onClick={() => novo()}>+ Novo item</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Legenda / filtro por tipo */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo">
        {TIPOS_AGENDA.map((t) => {
          const off = tiposOcultos.has(t.v);
          return (
            <button
              key={t.v}
              type="button"
              onClick={() => alternarTipo(t.v)}
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${off ? 'opacity-40' : ''}`}
              style={{ borderColor: t.cor }}
              aria-pressed={!off}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.cor }} />
              {t.label}
            </button>
          );
        })}
      </div>

      <Calendario
        mesRef={mesRef}
        onMudarMes={setMesRef}
        itens={visiveis}
        onSelecionar={aoSelecionar}
        onNovoNoDia={(d) => novo(d)}
        carregando={carregando}
      />

      {edicao && (
        <ModalItem
          inicial={edicao}
          onClose={() => setEdicao(null)}
          onSalvo={() => { setEdicao(null); carregar(); }}
        />
      )}

      {detalhe && (
        <Modal open onClose={() => setDetalhe(null)} title={detalhe.titulo}>
          <div className="space-y-2 text-sm">
            <p><strong>Tipo:</strong> {tipoLabel(detalhe.tipo)} <span className="text-fg/50">(Evento — somente leitura)</span></p>
            <p><strong>Quando:</strong> {new Date(detalhe.inicio).toLocaleString('pt-BR')}</p>
            {detalhe.local && <p><strong>Local:</strong> {detalhe.local}</p>}
            {detalhe.link && <p><a className="text-primary underline" href={detalhe.link}>Abrir</a></p>}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Modal de criar/editar item ───────────────────────────────────────────────
function ModalItem({ inicial, onClose, onSalvo }: { inicial: Partial<AgendaItem>; onClose: () => void; onSalvo: () => void }) {
  const [f, setF] = useState<Partial<AgendaItem>>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const editando = !!inicial.id;
  const set = (p: Partial<AgendaItem>) => setF((x) => ({ ...x, ...p }));
  const diaInteiro = !!f.diaInteiro;

  async function salvar() {
    if (!f.titulo?.trim()) { setErro('Informe o título.'); return; }
    if (!f.inicio) { setErro('Informe a data/hora de início.'); return; }
    setSalvando(true); setErro('');
    try {
      const dto: Partial<AgendaItem> = {
        tipo: f.tipo || 'evento', titulo: f.titulo!.trim(), descricao: f.descricao || undefined,
        local: f.local || undefined, link: f.link || undefined, inicio: f.inicio!, fim: f.fim || undefined,
        diaInteiro: !!f.diaInteiro, cor: f.cor || undefined, recorrencia: f.recorrencia || 'nenhuma',
        destaque: !!f.destaque, publico: f.publico !== false, ativo: f.ativo !== false,
      };
      if (editando) await atualizarAgendaItem(inicial.id!, dto);
      else await criarAgendaItem(dto);
      onSalvo();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }
  async function excluir() {
    if (!editando || !confirm('Excluir este item da agenda?')) return;
    try { await excluirAgendaItem(inicial.id!); onSalvo(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.'); }
  }

  const localInput = diaInteiro ? 'date' : 'datetime-local';
  const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  return (
    <Modal open onClose={onClose} title={editando ? 'Editar item' : 'Novo item'}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="space-y-3">
        <div>
          <label className={ui.label}>Título *</label>
          <input className={ui.input} value={f.titulo ?? ''} onChange={(e) => set({ titulo: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={ui.label}>Tipo</label>
            <select className={ui.input} value={f.tipo ?? 'evento'} onChange={(e) => set({ tipo: e.target.value })}>
              {TIPOS_FORM.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={ui.label}>Cor (opcional)</label>
            <input type="color" className="h-9 w-full rounded border border-border" value={f.cor ?? corDoItem({ tipo: f.tipo ?? 'evento' })} onChange={(e) => set({ cor: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" className="h-4 w-4 accent-primary" checked={diaInteiro} onChange={(e) => set({ diaInteiro: e.target.checked })} />
          Dia inteiro
        </label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={ui.label}>Início *</label>
            <input type={localInput} className={ui.input} value={isoParaLocalInput(f.inicio, diaInteiro)} onChange={(e) => set({ inicio: toIso(e.target.value) })} />
          </div>
          <div>
            <label className={ui.label}>Fim</label>
            <input type={localInput} className={ui.input} value={isoParaLocalInput(f.fim, diaInteiro)} onChange={(e) => set({ fim: toIso(e.target.value) })} />
          </div>
        </div>
        <div>
          <label className={ui.label}>Local</label>
          <input className={ui.input} value={f.local ?? ''} onChange={(e) => set({ local: e.target.value })} />
        </div>
        <div>
          <label className={ui.label}>Descrição</label>
          <textarea className={ui.input} rows={2} value={f.descricao ?? ''} onChange={(e) => set({ descricao: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={ui.label}>Recorrência</label>
            <select className={ui.input} value={f.recorrencia ?? 'nenhuma'} onChange={(e) => set({ recorrencia: e.target.value })}>
              <option value="nenhuma">Não repete</option>
              <option value="anual">Anual (todo ano)</option>
            </select>
          </div>
          <div>
            <label className={ui.label}>Link (opcional)</label>
            <input className={ui.input} value={f.link ?? ''} onChange={(e) => set({ link: e.target.value })} placeholder="https://…" />
          </div>
        </div>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={f.publico !== false} onChange={(e) => set({ publico: e.target.checked })} />
            Público (aparece na agenda do portal)
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!f.destaque} onChange={(e) => set({ destaque: e.target.checked })} />
            Destaque
          </label>
        </div>

        <div className="flex justify-between gap-2 pt-1">
          {editando ? <button type="button" className={ui.btnDanger} onClick={excluir}>Excluir</button> : <span />}
          <div className="flex gap-2">
            <button type="button" className={ui.btnGhost} onClick={onClose}>Cancelar</button>
            <button type="button" className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
