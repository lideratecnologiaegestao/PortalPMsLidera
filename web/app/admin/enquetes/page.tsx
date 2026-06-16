'use client';

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, adminDelete, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

interface Opcao { id: string; texto: string; votos: number }
interface Enquete {
  id: string; pergunta: string; ativa: boolean; encerrada: boolean;
  opcoes: Opcao[]; _count?: { votos: number };
}

export default function EnquetesAdminPage() {
  const [lista, setLista] = useState<Enquete[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [pergunta, setPergunta] = useState('');
  const [opcoes, setOpcoes] = useState<string[]>(['', '']);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    adminGet<Enquete[]>('/api/admin/enquetes').then(setLista).catch((e) =>
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar.'));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  function abrirNova() { setEditId(null); setPergunta(''); setOpcoes(['', '']); setModal(true); }
  function abrirEdit(e: Enquete) {
    setEditId(e.id); setPergunta(e.pergunta);
    setOpcoes(e.opcoes.length ? e.opcoes.map((o) => o.texto) : ['', '']); setModal(true);
  }

  async function salvar() {
    setErro('');
    const ops = opcoes.map((o) => o.trim()).filter(Boolean);
    if (!pergunta.trim()) { setErro('Informe a pergunta.'); return; }
    if (ops.length < 2) { setErro('Informe ao menos 2 opções.'); return; }
    setSalvando(true);
    try {
      if (editId) await adminPut(`/api/admin/enquetes/${editId}`, { pergunta, opcoes: ops });
      else await adminPost('/api/admin/enquetes', { pergunta, opcoes: ops });
      setModal(false); setAviso('Enquete salva.'); carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally { setSalvando(false); }
  }

  async function acao(id: string, op: 'ativar' | 'encerrar') {
    try { await adminPost(`/api/admin/enquetes/${id}/${op}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha.'); }
  }
  async function excluir(id: string) {
    if (!confirm('Excluir esta enquete e seus votos?')) return;
    try { await adminDelete(`/api/admin/enquetes/${id}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha.'); }
  }

  return (
    <div>
      <AdminHeader title="Enquetes" description="Crie enquetes (poll) para a home. Apenas uma fica ativa por vez; voto anônimo.">
        <button className={ui.btn} onClick={abrirNova}>Nova enquete</button>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      <div className="space-y-3">
        {lista.map((e) => (
          <div key={e.id} className="rounded border border-border bg-bg p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-fg">{e.pergunta}</h3>
                  {e.ativa && <span className="rounded bg-success/20 px-2 py-0.5 text-xs font-semibold text-success">Ativa</span>}
                  {e.encerrada && <span className="rounded bg-muted px-2 py-0.5 text-xs text-fg/60">Encerrada</span>}
                </div>
                <p className="mt-1 text-xs text-fg/60">{e.opcoes.length} opções · {e._count?.votos ?? 0} voto(s)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!e.ativa && !e.encerrada && <button className={ui.btnGhost} onClick={() => acao(e.id, 'ativar')}>Ativar</button>}
                {e.ativa && <button className={ui.btnGhost} onClick={() => acao(e.id, 'encerrar')}>Encerrar</button>}
                <button className={ui.btnGhost} onClick={() => abrirEdit(e)}>Editar</button>
                <button className={ui.btnDanger} onClick={() => excluir(e.id)}>Excluir</button>
              </div>
            </div>
          </div>
        ))}
        {lista.length === 0 && <p className="text-sm text-fg/60">Nenhuma enquete ainda.</p>}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Editar enquete' : 'Nova enquete'}>
        <div className="space-y-3">
          <div>
            <label className={ui.label}>Pergunta</label>
            <input className={ui.input} value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Ex.: Qual obra é prioridade no bairro?" />
          </div>
          <div>
            <label className={ui.label}>Opções</label>
            <div className="space-y-2">
              {opcoes.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <input className={ui.input} value={o} onChange={(ev) => setOpcoes((p) => p.map((x, j) => (j === i ? ev.target.value : x)))} placeholder={`Opção ${i + 1}`} />
                  {opcoes.length > 2 && <button type="button" className="text-sm text-danger hover:underline" onClick={() => setOpcoes((p) => p.filter((_, j) => j !== i))}>remover</button>}
                </div>
              ))}
            </div>
            <button type="button" className="mt-2 text-sm text-primary hover:underline" onClick={() => setOpcoes((p) => [...p, ''])}>+ adicionar opção</button>
            {editId && <p className="mt-1 text-xs text-warning">Editar as opções zera os votos desta enquete.</p>}
          </div>
          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          <div className="flex justify-end gap-2 pt-2">
            <button className={ui.btnGhost} onClick={() => setModal(false)}>Cancelar</button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>{salvando ? 'Salvando…' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
