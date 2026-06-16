'use client';

/**
 * Documentação LGPD da entidade (responsável / DPO).
 * Permite gerar/atualizar, baixar (PDF/TXT/HTML) e publicar em
 * /privacidade/sobre-lgpd. O conteúdo vem do template global da plataforma,
 * preenchido com os dados da entidade (configurados pelo Gerenciador).
 */

import { useCallback, useEffect, useState } from 'react';
import { AdminApiError, adminGet, adminPost, adminPut, adminDownload } from '../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../_components/ui';

interface DadosLgpd {
  dpoTelefone?: string;
  dpoEndereco?: string;
  enderecoEntidade?: string;
  municipio?: string;
  responsavelNome?: string;
  responsavelCargo?: string;
}
interface DocEstado {
  gerado: boolean;
  publicado: boolean;
  versao: number | null;
  geradoEm: string | null;
  publicadoEm: string | null;
  dados: DadosLgpd;
  temHtml: boolean;
}

function fmtData(iso: string | null): string {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)); }
  catch { return iso; }
}

export default function LgpdDocumentacaoPage() {
  const [estado, setEstado] = useState<DocEstado | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [acao, setAcao] = useState<'' | 'gerar' | 'publicar' | 'baixar'>('');
  const [feedback, setFeedback] = useState<{ tipo: 'ok' | 'erro'; msg: string } | null>(null);

  // Campos complementares editáveis pelo responsável
  const [d, setD] = useState<DadosLgpd>({});
  function set<K extends keyof DadosLgpd>(k: K, v: string) { setD((p) => ({ ...p, [k]: v })); }

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const e = await adminGet<DocEstado>('/api/lgpd/admin/documentacao');
      setEstado(e);
      setD(e.dados ?? {});
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof AdminApiError ? err.message : 'Falha ao carregar.' });
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function gerar() {
    setAcao('gerar'); setFeedback(null);
    try {
      const e = await adminPost<DocEstado>('/api/lgpd/admin/documentacao/gerar', d);
      setEstado(e); setD(e.dados ?? {});
      setFeedback({ tipo: 'ok', msg: `Documentação gerada (versão ${e.versao}). Revise e publique para deixá-la visível em /privacidade/sobre-lgpd.` });
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof AdminApiError ? err.message : 'Falha ao gerar.' });
    } finally { setAcao(''); }
  }

  async function publicar(publicado: boolean) {
    setAcao('publicar'); setFeedback(null);
    try {
      const e = await adminPut<DocEstado>('/api/lgpd/admin/documentacao/publicacao', { publicado });
      setEstado(e);
      setFeedback({ tipo: 'ok', msg: publicado ? 'Documentação publicada em /privacidade/sobre-lgpd.' : 'Documentação despublicada.' });
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof AdminApiError ? err.message : 'Falha ao publicar.' });
    } finally { setAcao(''); }
  }

  async function baixar(formato: 'pdf' | 'txt' | 'html') {
    setAcao('baixar'); setFeedback(null);
    try {
      await adminDownload(`/api/lgpd/admin/documentacao/download?formato=${formato}`, `documentacao-lgpd.${formato}`);
    } catch (err) {
      setFeedback({ tipo: 'erro', msg: err instanceof AdminApiError ? err.message : 'Falha ao baixar.' });
    } finally { setAcao(''); }
  }

  const inp = `mt-1 ${ui.input}`;

  return (
    <main className="space-y-6 p-4 md:p-6">
      <AdminHeader
        title="Documentação LGPD"
        description="Gere o pacote de documentação LGPD da entidade (Política de Privacidade, PSI, RoPA e Relatório de Medidas), baixe e publique na página pública."
      />

      <div aria-live="polite">
        {feedback && <Aviso tipo={feedback.tipo === 'ok' ? 'ok' : 'erro'}>{feedback.msg}</Aviso>}
      </div>

      {carregando ? (
        <p className="py-10 text-center text-sm text-fg/60" role="status">Carregando…</p>
      ) : (
        <div className="space-y-6">
          {/* Estado atual */}
          <section className={`${ui.card} p-4`}>
            <h2 className="font-heading text-base font-bold">Situação</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-fg/60">Documentação</dt>
                <dd className="font-semibold">{estado?.gerado ? `Gerada (v${estado.versao})` : 'Não gerada'}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg/60">Última geração</dt>
                <dd className="font-semibold">{fmtData(estado?.geradoEm ?? null)}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg/60">Publicação</dt>
                <dd className={`font-semibold ${estado?.publicado ? 'text-success' : 'text-fg/60'}`}>
                  {estado?.publicado ? 'Publicada' : 'Não publicada'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg/60">Página pública</dt>
                <dd>
                  <a href="/privacidade/sobre-lgpd" target="_blank" rel="noopener noreferrer"
                    className="font-semibold text-primary underline">/privacidade/sobre-lgpd ↗</a>
                </dd>
              </div>
            </dl>
          </section>

          {/* Dados complementares */}
          <section className={`${ui.card} p-4 space-y-4`}>
            <div>
              <h2 className="font-heading text-base font-bold">Dados da documentação</h2>
              <p className="text-sm text-fg/60">
                O nome da entidade, CNPJ e o Encarregado (DPO) vêm do cadastro da entidade. Complete abaixo
                os demais campos usados no documento.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">Telefone do DPO
                <input className={inp} value={d.dpoTelefone ?? ''} onChange={(e) => set('dpoTelefone', e.target.value)} placeholder="(65) 0000-0000" />
              </label>
              <label className="block text-sm font-medium">Endereço do DPO
                <input className={inp} value={d.dpoEndereco ?? ''} onChange={(e) => set('dpoEndereco', e.target.value)} placeholder="Endereço para correspondência" />
              </label>
              <label className="block text-sm font-medium sm:col-span-2">Endereço da entidade
                <input className={inp} value={d.enderecoEntidade ?? ''} onChange={(e) => set('enderecoEntidade', e.target.value)} placeholder="Ex.: Av. Principal, 100, Centro" />
              </label>
              <label className="block text-sm font-medium">Município
                <input className={inp} value={d.municipio ?? ''} onChange={(e) => set('municipio', e.target.value)} placeholder="(detecta do nome se vazio)" />
              </label>
              <span />
              <label className="block text-sm font-medium">Autoridade signatária
                <input className={inp} value={d.responsavelNome ?? ''} onChange={(e) => set('responsavelNome', e.target.value)} placeholder="Nome de quem assina" />
              </label>
              <label className="block text-sm font-medium">Cargo da autoridade
                <input className={inp} value={d.responsavelCargo ?? ''} onChange={(e) => set('responsavelCargo', e.target.value)} placeholder="Ex.: Prefeito(a) Municipal" />
              </label>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={gerar} disabled={acao === 'gerar'} className={ui.btn} aria-busy={acao === 'gerar'}>
                {acao === 'gerar' ? 'Gerando…' : estado?.gerado ? 'Atualizar documentação' : 'Gerar documentação'}
              </button>
            </div>
          </section>

          {/* Download + publicação */}
          <section className={`${ui.card} p-4 space-y-4`}>
            <h2 className="font-heading text-base font-bold">Baixar e publicar</h2>
            {!estado?.gerado ? (
              <p className="text-sm text-fg/60">Gere a documentação acima para habilitar o download e a publicação.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => baixar('pdf')} disabled={acao === 'baixar'} className={ui.btnGhost}>Baixar PDF</button>
                  <button type="button" onClick={() => baixar('txt')} disabled={acao === 'baixar'} className={ui.btnGhost}>Baixar TXT</button>
                  <button type="button" onClick={() => baixar('html')} disabled={acao === 'baixar'} className={ui.btnGhost}>Baixar HTML</button>
                </div>
                <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
                  {estado.publicado ? (
                    <>
                      <span className="text-sm text-success">Publicada em /privacidade/sobre-lgpd desde {fmtData(estado.publicadoEm)}.</span>
                      <button type="button" onClick={() => publicar(false)} disabled={acao === 'publicar'}
                        className="rounded border border-danger px-3 py-1.5 text-sm font-semibold text-danger disabled:opacity-60">
                        Despublicar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-fg/70">A documentação ainda não está visível ao público.</span>
                      <button type="button" onClick={() => publicar(true)} disabled={acao === 'publicar'} className={ui.btn}>
                        {acao === 'publicar' ? 'Publicando…' : 'Publicar em /privacidade/sobre-lgpd'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
