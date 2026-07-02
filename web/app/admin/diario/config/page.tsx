'use client';

/**
 * /admin/diario/config — Layout do PDF do Diário Oficial.
 * Colunas do corpo (1 ou 2), cabeçalho (brasão + nome), rodapé institucional
 * (nome/endereço/horário/CNPJ) e páginas finais com os hinos.
 */

import { useEffect, useState } from 'react';
import { AdminApiError, adminGet, adminPatch } from '../../../../lib/admin-api';
import { AdminHeader, Aviso, ui } from '../../_components/ui';

interface DiarioConfig {
  colunas: number;
  cabecalhoAtivo: boolean;
  rodapeAtivo: boolean;
  incluirHinos: boolean;
  endereco: string | null;
  horarioAtendimento: string | null;
  telefone: string | null;
}

const PADRAO: DiarioConfig = {
  colunas: 2, cabecalhoAtivo: true, rodapeAtivo: true, incluirHinos: true,
  endereco: '', horarioAtendimento: '', telefone: '',
};

export default function DiarioConfigPage() {
  const [cfg, setCfg] = useState<DiarioConfig>(PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  useEffect(() => {
    adminGet<DiarioConfig>('/api/admin/diario/config')
      .then((c) => setCfg({ ...c, endereco: c.endereco ?? '', horarioAtendimento: c.horarioAtendimento ?? '', telefone: c.telefone ?? '' }))
      .catch(() => setErro('Falha ao carregar as configurações.'))
      .finally(() => setCarregando(false));
  }, []);

  function set<K extends keyof DiarioConfig>(k: K, v: DiarioConfig[K]) {
    setCfg((p) => ({ ...p, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    setSalvando(true);
    try {
      const salvo = await adminPatch<DiarioConfig>('/api/admin/diario/config', cfg);
      setCfg({ ...salvo, endereco: salvo.endereco ?? '', horarioAtendimento: salvo.horarioAtendimento ?? '', telefone: salvo.telefone ?? '' });
      setOk('Configurações salvas. Elas valem para as próximas edições publicadas.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="max-w-2xl space-y-4 p-4 md:p-6">
      <AdminHeader
        title="Layout do Diário Oficial"
        description="Personalize colunas, cabeçalho, rodapé e as páginas de hinos do PDF. Vale para as próximas edições publicadas (use 'Regerar PDF' para aplicar a uma já publicada)."
      >
        <a href="/admin/diario" className="rounded border border-border px-3 py-2 text-sm hover:bg-muted">← Voltar ao Diário</a>
      </AdminHeader>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {carregando ? (
        <p className="text-sm text-fg/60">Carregando…</p>
      ) : (
        <form onSubmit={salvar} className={`${ui.card} space-y-5 p-4`}>
          {/* Colunas */}
          <div>
            <label htmlFor="colunas" className={ui.label}>Colunas do corpo</label>
            <select
              id="colunas"
              value={cfg.colunas}
              onChange={(e) => set('colunas', Number(e.target.value))}
              className={`${ui.input} mt-1 max-w-xs`}
            >
              <option value={1}>1 coluna</option>
              <option value={2}>2 colunas</option>
            </select>
          </div>

          {/* Toggles */}
          <fieldset className="space-y-2">
            <legend className={ui.label}>Elementos do PDF</legend>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.cabecalhoAtivo} onChange={(e) => set('cabecalhoAtivo', e.target.checked)} />
              Cabeçalho (brasão + nome da entidade em todas as páginas)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.rodapeAtivo} onChange={(e) => set('rodapeAtivo', e.target.checked)} />
              Rodapé institucional (nome, CNPJ, endereço, horário)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.incluirHinos} onChange={(e) => set('incluirHinos', e.target.checked)} />
              Páginas finais com hinos (município, estado, à bandeira e nacional) + brasão
            </label>
          </fieldset>

          {/* Dados do rodapé */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm font-semibold">Dados institucionais do rodapé</p>
            <p className="text-xs text-fg/60">Nome e CNPJ vêm do cadastro da entidade. Endereço e horário são informados aqui.</p>
            <div>
              <label htmlFor="endereco" className={ui.label}>Endereço</label>
              <input id="endereco" value={cfg.endereco ?? ''} onChange={(e) => set('endereco', e.target.value)}
                className={`${ui.input} mt-1`} placeholder="Rua, nº, bairro, cidade — UF, CEP" />
            </div>
            <div>
              <label htmlFor="horario" className={ui.label}>Horário de atendimento</label>
              <input id="horario" value={cfg.horarioAtendimento ?? ''} onChange={(e) => set('horarioAtendimento', e.target.value)}
                className={`${ui.input} mt-1`} placeholder="Seg. a Sex., 8h às 14h" />
            </div>
            <div>
              <label htmlFor="telefone" className={ui.label}>Telefone (opcional)</label>
              <input id="telefone" value={cfg.telefone ?? ''} onChange={(e) => set('telefone', e.target.value)}
                className={`${ui.input} mt-1 max-w-xs`} placeholder="(00) 0000-0000" />
            </div>
          </div>

          <button type="submit" disabled={salvando} className={ui.btn}>
            {salvando ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </form>
      )}
    </main>
  );
}
