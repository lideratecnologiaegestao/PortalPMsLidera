'use client';

/**
 * Configuração do Atendimento Omnichannel.
 * Roles: ADMIN_PREFEITURA (verificado no backend).
 * WCAG 2.1 AA, pt-BR.
 */

import { useEffect, useState } from 'react';
import { AdminApiError, adminDelete, adminGet, adminPost, adminPut } from '../../../../lib/admin-api';
import { AtendimentoConfigAdmin, AtendimentoTag, HorarioItem } from '../../../../lib/atendimento';
import { AdminHeader, Aviso, Modal, ui } from '../../_components/ui';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const HORARIO_VAZIO: HorarioItem[] = Array.from({ length: 7 }, (_, i) => ({
  diaSemana: i,
  horaInicio: '08:00',
  horaFim: '18:00',
  ativo: i >= 1 && i <= 5, // seg–sex ativo por padrão
}));

// ─── Componente ───────────────────────────────────────────────────────────────

export default function AtendimentoConfigPage() {
  // Config geral
  const [config, setConfig] = useState<AtendimentoConfigAdmin>({
    atendimentoHumanoAtivo: false,
    iaChatWidgetAtivo: false,
    atendimentoSaudacao: '',
    atendimentoMensagemForaExp: '',
    atendimentoAvisoLgpd: '',
    atendimentoTimezone: 'America/Cuiaba',
    atendimentoInatividadeMin: 30,
    evolutionInstancia: '',
  });
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  // Horário
  const [horario, setHorario] = useState<HorarioItem[]>(HORARIO_VAZIO);
  const [salvandoHorario, setSalvandoHorario] = useState(false);

  // Tags
  const [tags, setTags] = useState<AtendimentoTag[]>([]);
  const [modalTag, setModalTag] = useState(false);
  const [tagNome, setTagNome] = useState('');
  const [tagCor, setTagCor] = useState('#1351b4');
  const [salvandoTag, setSalvandoTag] = useState(false);
  const [deletandoTagId, setDeletandoTagId] = useState<string | null>(null);

  // Feedback
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');

  function feedback(msg: string) {
    setOk(msg);
    setTimeout(() => setOk(''), 3000);
  }

  // ── Carrega config e horário ───────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      adminGet<AtendimentoConfigAdmin>('/api/admin/atendimento/config').catch(() => null),
      adminGet<AtendimentoTag[]>('/api/admin/atendimento/tags').catch(() => []),
    ]).then(([cfg, tgs]) => {
      if (cfg) setConfig(cfg);
      // O horário pode vir embutido no config ou num campo separado
      const cfgAny = cfg as (AtendimentoConfigAdmin & { horario?: HorarioItem[] }) | null;
      if (cfgAny?.horario && Array.isArray(cfgAny.horario)) {
        // Preenche os 7 dias garantindo todos os dias
        const map = Object.fromEntries(cfgAny.horario.map((h) => [h.diaSemana, h]));
        setHorario(HORARIO_VAZIO.map((d) => map[d.diaSemana] ?? d));
      }
      setTags(tgs as AtendimentoTag[]);
    });
  }, []);

  // ── Salva config geral ────────────────────────────────────────────────────
  async function salvarConfig(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoConfig(true);
    setErro('');
    try {
      await adminPut('/api/admin/atendimento/config', config);
      feedback('Configurações salvas com sucesso.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar configurações.');
    } finally {
      setSalvandoConfig(false);
    }
  }

  // ── Salva horário ─────────────────────────────────────────────────────────
  async function salvarHorario(e: React.FormEvent) {
    e.preventDefault();
    setSalvandoHorario(true);
    setErro('');
    try {
      await adminPut('/api/admin/atendimento/config/horario', { horario });
      feedback('Horário de atendimento salvo.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao salvar horário.');
    } finally {
      setSalvandoHorario(false);
    }
  }

  function atualizarHorario(idx: number, campo: keyof HorarioItem, valor: unknown) {
    setHorario((prev) => prev.map((h, i) => i === idx ? { ...h, [campo]: valor } : h));
  }

  // ── Tag: criar ────────────────────────────────────────────────────────────
  async function criarTag(e: React.FormEvent) {
    e.preventDefault();
    if (!tagNome.trim()) return;
    setSalvandoTag(true);
    setErro('');
    try {
      const nova = await adminPost<AtendimentoTag>('/api/admin/atendimento/tags', {
        nome: tagNome.trim(),
        cor: tagCor,
      });
      setTags((prev) => [...prev, nova]);
      setTagNome('');
      setTagCor('#1351b4');
      setModalTag(false);
      feedback('Tag criada.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao criar tag.');
    } finally {
      setSalvandoTag(false);
    }
  }

  // ── Tag: deletar ──────────────────────────────────────────────────────────
  async function deletarTag(id: string) {
    if (!confirm('Remover esta tag? Ela será desvinculada de todas as conversas.')) return;
    setDeletandoTagId(id);
    setErro('');
    try {
      await adminDelete(`/api/admin/atendimento/tags/${id}`);
      setTags((prev) => prev.filter((t) => t.id !== id));
      feedback('Tag removida.');
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Falha ao remover tag.');
    } finally {
      setDeletandoTagId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-16">
      <div className="flex items-center justify-between gap-3">
        <AdminHeader
          title="Configuração do Atendimento"
          description="Gerencie flags, mensagens, expediente e tags."
        />
        <a href="/admin/atendimento" className={ui.btnGhost + ' text-sm'}>
          ← Caixa de entrada
        </a>
      </div>

      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      {/* ── Seção 1: Flags e mensagens ─────────────────────────────────── */}
      <section aria-labelledby="sec-geral" className={ui.card + ' p-5'}>
        <h2 id="sec-geral" className="mb-4 font-heading text-base font-bold">Configurações gerais</h2>
        <form onSubmit={salvarConfig} className="space-y-4">
          {/* Flags */}
          <fieldset className="rounded border border-border p-3">
            <legend className="px-1 text-xs font-semibold text-fg/70">Ativação</legend>
            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.atendimentoHumanoAtivo}
                  onChange={(e) => setConfig((c) => ({ ...c, atendimentoHumanoAtivo: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Atendimento humano ativo (exibe o widget no portal)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.iaChatWidgetAtivo}
                  onChange={(e) => setConfig((c) => ({ ...c, iaChatWidgetAtivo: e.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                Bot IA ativo no widget
              </label>
            </div>
          </fieldset>

          {/* Mensagens */}
          <div>
            <label htmlFor="cfg-saudacao" className={ui.label}>
              Mensagem de saudação
              <span className="ml-1 font-normal text-fg/50">(exibida ao abrir o widget)</span>
            </label>
            <textarea
              id="cfg-saudacao"
              value={config.atendimentoSaudacao ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, atendimentoSaudacao: e.target.value }))}
              rows={2}
              className={ui.input + ' mt-1 resize-none'}
              placeholder="Olá! Como podemos ajudá-lo hoje?"
            />
          </div>
          <div>
            <label htmlFor="cfg-fora-exp" className={ui.label}>
              Mensagem fora do expediente
            </label>
            <textarea
              id="cfg-fora-exp"
              value={config.atendimentoMensagemForaExp ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, atendimentoMensagemForaExp: e.target.value }))}
              rows={2}
              className={ui.input + ' mt-1 resize-none'}
              placeholder="Nosso atendimento está encerrado no momento…"
            />
          </div>
          <div>
            <label htmlFor="cfg-lgpd" className={ui.label}>
              Aviso LGPD
              <span className="ml-1 font-normal text-fg/50">(deixe vazio para não exibir)</span>
            </label>
            <textarea
              id="cfg-lgpd"
              value={config.atendimentoAvisoLgpd ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, atendimentoAvisoLgpd: e.target.value }))}
              rows={2}
              className={ui.input + ' mt-1 resize-none'}
              placeholder="Seus dados serão usados exclusivamente para fins de atendimento…"
            />
          </div>

          {/* Timezone e inatividade */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="cfg-tz" className={ui.label}>Fuso horário</label>
              <select
                id="cfg-tz"
                value={config.atendimentoTimezone ?? 'America/Cuiaba'}
                onChange={(e) => setConfig((c) => ({ ...c, atendimentoTimezone: e.target.value }))}
                className={ui.input + ' mt-1'}
              >
                <option value="America/Manaus">America/Manaus (UTC-4)</option>
                <option value="America/Cuiaba">America/Cuiaba (UTC-4)</option>
                <option value="America/Sao_Paulo">America/Sao_Paulo (UTC-3)</option>
                <option value="America/Fortaleza">America/Fortaleza (UTC-3)</option>
                <option value="America/Belem">America/Belem (UTC-3)</option>
                <option value="America/Recife">America/Recife (UTC-3)</option>
                <option value="America/Bahia">America/Bahia (UTC-3)</option>
                <option value="America/Porto_Velho">America/Porto_Velho (UTC-4)</option>
                <option value="America/Boa_Vista">America/Boa_Vista (UTC-4)</option>
                <option value="America/Rio_Branco">America/Rio_Branco (UTC-5)</option>
                <option value="America/Noronha">America/Noronha (UTC-2)</option>
              </select>
            </div>
            <div>
              <label htmlFor="cfg-inativ" className={ui.label}>
                Inatividade (minutos)
                <span className="ml-1 font-normal text-fg/50">para encerrar automaticamente</span>
              </label>
              <input
                id="cfg-inativ"
                type="number"
                min={5}
                max={1440}
                value={config.atendimentoInatividadeMin ?? 30}
                onChange={(e) => setConfig((c) => ({ ...c, atendimentoInatividadeMin: Number(e.target.value) }))}
                className={ui.input + ' mt-1'}
              />
            </div>
          </div>

          {/* Evolution API */}
          <div>
            <label htmlFor="cfg-evolution" className={ui.label}>
              Instância Evolution API (WhatsApp)
              <span className="ml-1 font-normal text-fg/50">(nome da instância configurada no servidor)</span>
            </label>
            <input
              id="cfg-evolution"
              type="text"
              value={config.evolutionInstancia ?? ''}
              onChange={(e) => setConfig((c) => ({ ...c, evolutionInstancia: e.target.value }))}
              className={ui.input + ' mt-1'}
              placeholder="prefeitura-atendimento"
            />
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={salvandoConfig} className={ui.btn}>
              {salvandoConfig ? 'Salvando…' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Seção 2: Expediente ────────────────────────────────────────── */}
      <section aria-labelledby="sec-horario" className={ui.card + ' p-5'}>
        <h2 id="sec-horario" className="mb-4 font-heading text-base font-bold">Horário de atendimento</h2>
        <form onSubmit={salvarHorario}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={ui.th + ' w-28'}>Dia</th>
                  <th className={ui.th}>Ativo</th>
                  <th className={ui.th}>Início</th>
                  <th className={ui.th}>Fim</th>
                </tr>
              </thead>
              <tbody>
                {horario.map((h, idx) => (
                  <tr key={h.diaSemana} className={h.ativo ? '' : 'opacity-50'}>
                    <td className={ui.td + ' font-medium'}>
                      {DIAS_SEMANA[h.diaSemana]}
                    </td>
                    <td className={ui.td}>
                      <label className="sr-only">{DIAS_SEMANA[h.diaSemana]} ativo</label>
                      <input
                        type="checkbox"
                        checked={h.ativo}
                        onChange={(e) => atualizarHorario(idx, 'ativo', e.target.checked)}
                        className="h-4 w-4 accent-primary"
                        aria-label={`${DIAS_SEMANA[h.diaSemana]}: ativo`}
                      />
                    </td>
                    <td className={ui.td}>
                      <input
                        type="time"
                        value={h.horaInicio}
                        onChange={(e) => atualizarHorario(idx, 'horaInicio', e.target.value)}
                        disabled={!h.ativo}
                        aria-label={`${DIAS_SEMANA[h.diaSemana]}: hora de início`}
                        className="rounded border border-border bg-bg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      />
                    </td>
                    <td className={ui.td}>
                      <input
                        type="time"
                        value={h.horaFim}
                        onChange={(e) => atualizarHorario(idx, 'horaFim', e.target.value)}
                        disabled={!h.ativo}
                        aria-label={`${DIAS_SEMANA[h.diaSemana]}: hora de fim`}
                        className="rounded border border-border bg-bg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button type="submit" disabled={salvandoHorario} className={ui.btn}>
              {salvandoHorario ? 'Salvando…' : 'Salvar horário'}
            </button>
          </div>
        </form>
      </section>

      {/* ── Seção 3: Tags ─────────────────────────────────────────────── */}
      <section aria-labelledby="sec-tags" className={ui.card + ' p-5'}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="sec-tags" className="font-heading text-base font-bold">Tags de atendimento</h2>
          <button
            onClick={() => { setTagNome(''); setTagCor('#1351b4'); setModalTag(true); }}
            className={ui.btn + ' py-1.5 text-xs'}
          >
            + Nova tag
          </button>
        </div>

        {tags.length === 0 ? (
          <p className="text-sm text-fg/50">Nenhuma tag cadastrada.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Lista de tags">
              <thead>
                <tr>
                  <th className={ui.th}>Cor</th>
                  <th className={ui.th}>Nome</th>
                  <th className={ui.th + ' text-right'}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {tags.map((t) => (
                  <tr key={t.id}>
                    <td className={ui.td}>
                      <span
                        className="inline-block h-5 w-10 rounded border border-border/50"
                        style={{ backgroundColor: t.cor || '#888' }}
                        aria-label={`Cor: ${t.cor}`}
                      />
                    </td>
                    <td className={ui.td}>
                      <TagChip nome={t.nome} cor={t.cor} />
                    </td>
                    <td className={ui.td + ' text-right'}>
                      <button
                        onClick={() => deletarTag(t.id)}
                        disabled={deletandoTagId === t.id}
                        className={ui.btnDanger + ' py-0.5 px-2 text-xs'}
                        aria-label={`Remover tag ${t.nome}`}
                      >
                        {deletandoTagId === t.id ? 'Removendo…' : 'Remover'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: nova tag */}
      <Modal open={modalTag} onClose={() => setModalTag(false)} title="Nova tag">
        <form onSubmit={criarTag} className="space-y-4">
          <div>
            <label htmlFor="tag-nome" className={ui.label}>Nome</label>
            <input
              id="tag-nome"
              type="text"
              value={tagNome}
              onChange={(e) => setTagNome(e.target.value)}
              required
              maxLength={50}
              placeholder="Ex.: urgente, tributação, obra…"
              className={ui.input + ' mt-1'}
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="tag-cor" className={ui.label}>Cor</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                id="tag-cor"
                type="color"
                value={tagCor}
                onChange={(e) => setTagCor(e.target.value)}
                className="h-10 w-14 cursor-pointer rounded border border-border"
              />
              <span
                className="inline-block rounded px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: tagCor }}
              >
                {tagNome || 'Prévia'}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalTag(false)} className={ui.btnGhost}>Cancelar</button>
            <button type="submit" disabled={salvandoTag || !tagNome.trim()} className={ui.btn}>
              {salvandoTag ? 'Criando…' : 'Criar tag'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Sub-componente inline (evita import circular) ────────────────────────────
function TagChip({ nome, cor }: { nome: string; cor: string }) {
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: cor || '#888' }}
    >
      {nome}
    </span>
  );
}
