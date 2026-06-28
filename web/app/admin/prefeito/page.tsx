'use client';

/**
 * Admin — Prefeito(a) / Vice e ex-prefeitos
 * Endpoints:
 *   GET    /api/admin/prefeitos
 *   POST   /api/admin/prefeitos
 *   PUT    /api/admin/prefeitos/:id
 *   DELETE /api/admin/prefeitos/:id
 */

import { useCallback, useEffect, useState } from 'react';
import { adminDelete, adminGet, adminPost, adminPut, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';

interface Prefeito {
  id: string; tipo: string; nome: string; genero: string; partido?: string | null; fotoUrl?: string | null;
  mandatoInicio?: number | null; mandatoFim?: number | null; atual: boolean;
  resumo?: string | null; historia?: string | null; email?: string | null; telefone?: string | null;
  ordem: number; ativo: boolean;
}

function vazio() {
  return {
    id: '' as string, tipo: 'prefeito', nome: '', genero: 'masculino', partido: '', fotoUrl: '',
    mandatoInicio: '', mandatoFim: '', atual: false, resumo: '', historia: '', email: '', telefone: '',
    ordem: 0, ativo: true,
  };
}

function mandato(p: Prefeito): string {
  if (p.mandatoInicio && p.mandatoFim) return `${p.mandatoInicio}–${p.mandatoFim}`;
  if (p.mandatoInicio) return p.atual ? `${p.mandatoInicio}–atual` : `${p.mandatoInicio}`;
  return '—';
}

function ModalPrefeito({ open, editando, onClose, onSalvo }: {
  open: boolean; editando: Prefeito | null; onClose: () => void; onSalvo: () => void;
}) {
  const [form, setForm] = useState(vazio());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErro('');
    setForm(editando ? {
      id: editando.id, tipo: editando.tipo, nome: editando.nome, genero: editando.genero,
      partido: editando.partido ?? '', fotoUrl: editando.fotoUrl ?? '',
      mandatoInicio: editando.mandatoInicio != null ? String(editando.mandatoInicio) : '',
      mandatoFim: editando.mandatoFim != null ? String(editando.mandatoFim) : '',
      atual: editando.atual, resumo: editando.resumo ?? '', historia: editando.historia ?? '',
      email: editando.email ?? '', telefone: editando.telefone ?? '', ordem: editando.ordem, ativo: editando.ativo,
    } : vazio());
  }, [open, editando]);

  function s<K extends keyof ReturnType<typeof vazio>>(k: K, v: ReturnType<typeof vazio>[K]) { setForm((p) => ({ ...p, [k]: v })); }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro('');
    const body = {
      tipo: form.tipo, nome: form.nome, genero: form.genero,
      partido: form.partido || undefined, fotoUrl: form.fotoUrl || undefined,
      mandatoInicio: form.mandatoInicio === '' ? null : Number(form.mandatoInicio),
      mandatoFim: form.mandatoFim === '' ? null : Number(form.mandatoFim),
      atual: form.atual, resumo: form.resumo || undefined, historia: form.historia || undefined,
      email: form.email || undefined, telefone: form.telefone || undefined,
      ordem: Number(form.ordem) || 0, ativo: form.ativo,
    };
    try {
      if (editando) await adminPut(`/api/admin/prefeitos/${editando.id}`, body);
      else await adminPost('/api/admin/prefeitos', body);
      onSalvo(); onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar.');
    } finally { setSalvando(false); }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar registro' : 'Novo prefeito / vice'}>
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={ui.label}>Cargo</label>
            <select className={ui.input} value={form.tipo} onChange={(e) => s('tipo', e.target.value)}>
              <option value="prefeito">Prefeito(a)</option>
              <option value="vice">Vice-prefeito(a)</option>
            </select>
          </div>
          <div>
            <label className={ui.label}>Gênero (rótulo)</label>
            <select className={ui.input} value={form.genero} onChange={(e) => s('genero', e.target.value)}>
              <option value="masculino">Masculino — “O Prefeito”</option>
              <option value="feminino">Feminino — “A Prefeita”</option>
            </select>
          </div>
        </div>

        <div>
          <label className={ui.label}>Nome <span aria-hidden>*</span></label>
          <input required className={ui.input} value={form.nome} onChange={(e) => s('nome', e.target.value)} placeholder="Nome completo" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={ui.label}>Partido</label>
            <input className={ui.input} value={form.partido} onChange={(e) => s('partido', e.target.value)} placeholder="ex.: PT" />
          </div>
          <div>
            <label className={ui.label}>Mandato — início</label>
            <input type="number" min={1500} max={2200} className={ui.input} value={form.mandatoInicio} onChange={(e) => s('mandatoInicio', e.target.value)} placeholder="2021" />
          </div>
          <div>
            <label className={ui.label}>Mandato — fim</label>
            <input type="number" min={1500} max={2200} className={ui.input} value={form.mandatoFim} onChange={(e) => s('mandatoFim', e.target.value)} placeholder="2024" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input id="pf-atual" type="checkbox" checked={form.atual} onChange={(e) => s('atual', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
          <label htmlFor="pf-atual" className="text-sm font-semibold">É o titular atual (aparece no topo da página)</label>
        </div>
        <p className="-mt-2 text-xs text-fg/55">Marcar como atual desmarca automaticamente o anterior do mesmo cargo. Quem não é atual entra na galeria de ex-prefeitos.</p>

        {/* Foto */}
        <div>
          <label className={ui.label}>Foto</label>
          <div className="mt-1 flex gap-2">
            <input type="url" className={`flex-1 ${ui.input}`} value={form.fotoUrl} onChange={(e) => s('fotoUrl', e.target.value)} placeholder="https://..." />
            <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>Escolher imagem</button>
          </div>
          {form.fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.fotoUrl} alt="Pré-visualização" className="mt-2 h-28 w-24 rounded border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          )}
        </div>

        <div>
          <label className={ui.label}>Resumo (linha curta)</label>
          <input className={ui.input} value={form.resumo} onChange={(e) => s('resumo', e.target.value)} placeholder="Ex.: Prefeito eleito em 2020, 2º mandato." />
        </div>

        <div>
          <label className={ui.label}>História / biografia <span className="text-fg/50">(aceita HTML)</span></label>
          <textarea rows={5} className={ui.input} value={form.historia} onChange={(e) => s('historia', e.target.value)} placeholder="<p>Trajetória, realizações…</p>" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={ui.label}>E-mail</label><input type="email" className={ui.input} value={form.email} onChange={(e) => s('email', e.target.value)} /></div>
          <div><label className={ui.label}>Telefone</label><input className={ui.input} value={form.telefone} onChange={(e) => s('telefone', e.target.value)} /></div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div><label className={ui.label}>Ordem</label><input type="number" className={ui.input} value={form.ordem} onChange={(e) => s('ordem', Number(e.target.value))} /></div>
          <div className="flex items-end gap-2">
            <input id="pf-ativo" type="checkbox" checked={form.ativo} onChange={(e) => s('ativo', e.target.checked)} className="h-4 w-4 rounded border-border accent-primary" />
            <label htmlFor="pf-ativo" className="pb-2 text-sm font-semibold">Ativo (visível no site)</label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>Cancelar</button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </form>

      <MediaPicker open={picker} onClose={() => setPicker(false)} tipo="imagem" onSelect={(a) => { if (a.urlPublica) s('fotoUrl', a.urlPublica); setPicker(false); }} />
    </Modal>
  );
}

export default function PrefeitoAdminPage() {
  const [lista, setLista] = useState<Prefeito[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<Prefeito | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try { setLista(await adminGet<Prefeito[]>('/api/admin/prefeitos')); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function excluir(id: string) {
    try { await adminDelete(`/api/admin/prefeitos/${id}`); setMsgOk('Registro excluído.'); setConfirmando(null); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir.'); }
  }

  return (
    <div className="space-y-4">
      <AdminHeader title="Prefeito / Prefeita" description="Cadastro do titular, vice e ex-prefeitos exibidos na página “A Prefeitura → O Prefeito(a)”.">
        <button type="button" className={ui.btn} onClick={() => { setEditando(null); setModal(true); }}>+ Novo</button>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p className="py-12 text-center text-sm text-fg/60">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg/60">Nenhum registro. Clique em “Novo” para cadastrar o prefeito.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Lista de prefeitos">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>Nome</th>
                <th scope="col" className={ui.th}>Cargo</th>
                <th scope="col" className={ui.th}>Mandato</th>
                <th scope="col" className={ui.th}>Situação</th>
                <th scope="col" className={ui.th}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id}>
                  <td className={ui.td}><span className="font-medium">{p.nome}</span></td>
                  <td className={ui.td}>
                    <span className={`${ui.badge} bg-muted text-fg`}>{p.tipo === 'vice' ? 'Vice' : 'Prefeito(a)'}</span>
                  </td>
                  <td className={ui.td}>{mandato(p)}</td>
                  <td className={ui.td}>
                    {p.atual ? <span className={`${ui.badge} bg-success/10 text-success`}>Atual</span> : <span className={`${ui.badge} bg-muted text-fg/60`}>Ex</span>}
                    {!p.ativo && <span className={`${ui.badge} ml-1 bg-muted text-fg/50`}>inativo</span>}
                  </td>
                  <td className={ui.td}>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className={ui.btnGhost} onClick={() => { setEditando(p); setModal(true); }}>Editar</button>
                      {confirmando === p.id ? (
                        <>
                          <button type="button" className={ui.btnDanger} onClick={() => excluir(p.id)}>Confirmar</button>
                          <button type="button" className={ui.btnGhost} onClick={() => setConfirmando(null)}>Cancelar</button>
                        </>
                      ) : (
                        <button type="button" className={ui.btnDanger} onClick={() => setConfirmando(p.id)}>Excluir</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModalPrefeito
        open={modal}
        editando={editando}
        onClose={() => setModal(false)}
        onSalvo={() => { setMsgOk(editando ? 'Registro atualizado.' : 'Registro criado.'); carregar(); }}
      />
    </div>
  );
}
