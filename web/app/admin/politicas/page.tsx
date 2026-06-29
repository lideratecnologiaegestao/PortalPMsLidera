'use client';

/**
 * Admin — Documentos legais versionados (Acessibilidade, Privacidade/LGPD,
 * Aviso de Cookies). Cada um tem editor próprio + histórico de versões.
 *   GET/PUT /api/admin/politicas/:tipo
 *   GET     /api/admin/politicas/:tipo/versoes
 *   GET     /api/admin/politicas/:tipo/versoes/:id
 *   POST    /api/admin/politicas/:tipo/versoes/:id/restaurar
 */

import { useCallback, useEffect, useState } from 'react';
import { adminGet, adminPost, adminPut, AdminApiError } from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import EditorRico from '../_components/EditorRico';
import ConteudoRico from '../../../components/portal/ConteudoRico';

type Tipo = 'acessibilidade' | 'privacidade' | 'cookies';
const TABS: { v: Tipo; l: string; href: string }[] = [
  { v: 'acessibilidade', l: 'Acessibilidade', href: '/acessibilidade' },
  { v: 'privacidade', l: 'Privacidade (LGPD)', href: '/privacidade' },
  { v: 'cookies', l: 'Aviso de Cookies', href: '/cookies' },
];

interface Doc { titulo: string | null; conteudo: string; formato: string; versao: number }
interface VersaoMeta { id: string; versao: number; titulo: string | null; formato: string; criadoEm: string }
interface VersaoFull extends VersaoMeta { conteudo: string }

const fmtData = (s: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s));

export default function PoliticasAdminPage() {
  const [tipo, setTipo] = useState<Tipo>('acessibilidade');
  const [form, setForm] = useState<Doc>({ titulo: '', conteudo: '', formato: 'html', versao: 0 });
  const [versoes, setVersoes] = useState<VersaoMeta[]>([]);
  const [aba, setAba] = useState<'editar' | 'ver'>('editar');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [verVersao, setVerVersao] = useState<VersaoFull | null>(null);

  const carregar = useCallback(async (t: Tipo) => {
    setCarregando(true); setErro(''); setMsgOk('');
    try {
      const [d, vs] = await Promise.all([
        adminGet<Doc>(`/api/admin/politicas/${t}`),
        adminGet<VersaoMeta[]>(`/api/admin/politicas/${t}/versoes`),
      ]);
      setForm({ titulo: d.titulo ?? '', conteudo: d.conteudo ?? '', formato: d.formato || 'html', versao: d.versao ?? 0 });
      setVersoes(vs);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar.'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { carregar(tipo); setAba('editar'); }, [tipo, carregar]);

  async function salvar() {
    setSalvando(true); setErro(''); setMsgOk('');
    try {
      await adminPut(`/api/admin/politicas/${tipo}`, { titulo: form.titulo || undefined, conteudo: form.conteudo, formato: form.formato });
      setMsgOk('Salvo (nova versão criada). A página pública já reflete a alteração.');
      await carregar(tipo);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Erro ao salvar.'); }
    finally { setSalvando(false); }
  }

  async function abrirVersao(id: string) {
    try { setVerVersao(await adminGet<VersaoFull>(`/api/admin/politicas/${tipo}/versoes/${id}`)); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao abrir versão.'); }
  }
  async function restaurar(id: string) {
    if (!confirm('Restaurar esta versão? O conteúdo atual será substituído (uma nova versão será criada).')) return;
    try {
      await adminPost(`/api/admin/politicas/${tipo}/versoes/${id}/restaurar`, {});
      setVerVersao(null); setMsgOk('Versão restaurada.'); await carregar(tipo);
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao restaurar.'); }
  }

  const tabAtual = TABS.find((t) => t.v === tipo)!;

  return (
    <div className="space-y-4">
      <AdminHeader title="Documentos legais" description="Política de Acessibilidade, Privacidade (LGPD) e Aviso de Cookies — versionados. Os links ficam fixos no rodapé do portal.">
        <a href={tabAtual.href} target="_blank" rel="noreferrer" className={ui.btnGhost}>Ver página ↗</a>
      </AdminHeader>

      {/* Abas por documento */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => (
          <button key={t.v} type="button" onClick={() => setTipo(t.v)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tipo === t.v ? 'border-primary text-primary' : 'border-transparent text-fg/60 hover:text-fg'}`}>
            {t.l}
          </button>
        ))}
      </div>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {carregando ? (
        <p className="py-12 text-center text-sm text-fg/60">Carregando…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <div className="space-y-3">
            <div>
              <label className={ui.label}>Título <span className="text-fg/50">(opcional)</span></label>
              <input className={ui.input} value={form.titulo ?? ''} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} placeholder={tabAtual.l} />
            </div>
            <EditorRico
              conteudo={form.conteudo}
              formato={form.formato}
              onConteudo={(v) => setForm((p) => ({ ...p, conteudo: v }))}
              onFormato={(f) => setForm((p) => ({ ...p, formato: f }))}
              aba={aba}
              onAba={setAba}
              rows={16}
            />
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-fg/55">{form.versao > 0 ? `Versão atual: ${form.versao}` : 'Ainda não publicado'}</span>
              <button type="button" className={ui.btn} onClick={salvar} disabled={salvando} aria-busy={salvando}>{salvando ? 'Salvando…' : 'Salvar nova versão'}</button>
            </div>
          </div>

          {/* Histórico de versões */}
          <aside>
            <h3 className="mb-2 text-sm font-semibold">Histórico de versões</h3>
            {versoes.length === 0 ? (
              <p className="text-xs text-fg/55">Nenhuma versão ainda.</p>
            ) : (
              <ul className="space-y-1">
                {versoes.map((v) => (
                  <li key={v.id} className="rounded border border-border bg-bg px-3 py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">v{v.versao}</span>
                      <span className="text-xs text-fg/55">{fmtData(v.criadoEm)}</span>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs">
                      <button type="button" className="text-primary hover:underline" onClick={() => abrirVersao(v.id)}>ver</button>
                      <button type="button" className="text-primary hover:underline" onClick={() => restaurar(v.id)}>restaurar</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}

      <Modal open={!!verVersao} onClose={() => setVerVersao(null)} title={verVersao ? `Versão ${verVersao.versao}` : 'Versão'}>
        {verVersao && (
          <div className="space-y-3">
            <ConteudoRico formato={verVersao.formato} conteudo={verVersao.conteudo} />
            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button type="button" className={ui.btnGhost} onClick={() => setVerVersao(null)}>Fechar</button>
              <button type="button" className={ui.btn} onClick={() => restaurar(verVersao.id)}>Restaurar esta versão</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
