'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import {
  AdminApiError,
  adminGet,
  adminPatch,
  adminPost,
  qs,
} from '../../../lib/admin-api';
import { apiBase } from '../../../lib/auth-shared';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';

// ─── Tipos ───────────────────────────────────────────────────────────────────

type Categoria =
  | 'acesso_indevido'
  | 'vazamento'
  | 'perda'
  | 'ransomware'
  | 'indisponibilidade'
  | 'erro_humano'
  | 'outro';

type Severidade = 'baixa' | 'media' | 'alta' | 'critica';

type IncidenteStatus =
  | 'registrado'
  | 'em_avaliacao'
  | 'em_contencao'
  | 'comunicado'
  | 'encerrado';

interface IncidenteResumo {
  id: string;
  titulo: string;
  categoria: Categoria;
  severidade: Severidade;
  status: IncidenteStatus;
  detectadoEm: string;
  prazoComunicacaoEm: string;
  comunicacaoAtrasada: boolean;
  comunicadoAnpd: boolean;
  comunicadoTitulares: boolean;
  titularesAfetadosEstimados: number | null;
}

interface IncidenteDetalhe extends IncidenteResumo {
  descricao: string;
  natureza: string | null;
  dadosAfetados: string[];
  ocorridoEm: string | null;
  riscoDescricao: string | null;
  riscoNivel: string | null;
  medidasContencao: string | null;
  medidasMitigacao: string | null;
  comunicadoAnpdEm: string | null;
  comunicadoAnpdProtocolo: string | null;
  comunicadoTitularesEm: string | null;
  comunicadoTitularesMeio: string | null;
  responsavelId: string | null;
  criadoEm: string;
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<Categoria, string> = {
  acesso_indevido: 'Acesso indevido',
  vazamento: 'Vazamento',
  perda: 'Perda de dados',
  ransomware: 'Ransomware',
  indisponibilidade: 'Indisponibilidade',
  erro_humano: 'Erro humano',
  outro: 'Outro',
};

const SEVERIDADE_LABEL: Record<Severidade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  critica: 'Crítica',
};

const SEVERIDADE_COR: Record<Severidade, string> = {
  baixa: 'bg-success/20 text-success',
  media: 'bg-warning/20 text-warning',
  alta: 'bg-danger/10 text-danger',
  critica: 'bg-danger text-white',
};

const STATUS_LABEL: Record<IncidenteStatus, string> = {
  registrado: 'Registrado',
  em_avaliacao: 'Em avaliação',
  em_contencao: 'Em contenção',
  comunicado: 'Comunicado',
  encerrado: 'Encerrado',
};

const STATUS_COR: Record<IncidenteStatus, string> = {
  registrado: 'bg-muted text-fg',
  em_avaliacao: 'bg-warning/20 text-warning',
  em_contencao: 'bg-danger/10 text-danger',
  comunicado: 'bg-secondary/10 text-secondary',
  encerrado: 'bg-success/20 text-success',
};

const DADOS_AFETADOS_OPCOES = [
  { value: 'nome', label: 'Nome' },
  { value: 'email', label: 'E-mail' },
  { value: 'cpf', label: 'CPF' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'endereco', label: 'Endereço' },
  { value: 'geolocalizacao', label: 'Geolocalização' },
  { value: 'foto', label: 'Foto' },
  { value: 'dado_saude', label: 'Dado de saúde' },
  { value: 'dado_financeiro', label: 'Dado financeiro' },
  { value: 'senha_hash', label: 'Hash de senha' },
  { value: 'govbr_sub', label: 'Identificador gov.br' },
  { value: 'historico_manifestacoes', label: 'Histórico de manifestações' },
  { value: 'outro', label: 'Outro' },
];

function transicoesValidas(status: IncidenteStatus): IncidenteStatus[] {
  switch (status) {
    case 'registrado':
      return ['em_avaliacao'];
    case 'em_avaliacao':
      return ['em_contencao', 'comunicado', 'encerrado'];
    case 'em_contencao':
      return ['comunicado', 'encerrado'];
    case 'comunicado':
      return ['encerrado'];
    default:
      return [];
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatarDataSimples(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

// ─── Modal: Registrar incidente ───────────────────────────────────────────────

function ModalRegistrar({
  open,
  onClose,
  onRegistrado,
}: {
  open: boolean;
  onClose: () => void;
  onRegistrado: () => void;
}) {
  const idBase = useId();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [categoria, setCategoria] = useState<Categoria | ''>('');
  const [severidade, setSeveridade] = useState<Severidade | ''>('');
  const [dadosAfetados, setDadosAfetados] = useState<string[]>([]);
  const [titularesEstimados, setTitularesEstimados] = useState('');
  const [ocorridoEm, setOcorridoEm] = useState('');
  const [riscoDescricao, setRiscoDescricao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!open) {
      setTitulo('');
      setDescricao('');
      setCategoria('');
      setSeveridade('');
      setDadosAfetados([]);
      setTitularesEstimados('');
      setOcorridoEm('');
      setRiscoDescricao('');
      setErro('');
    }
  }, [open]);

  function toggleDado(value: string) {
    setDadosAfetados((prev) =>
      prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim() || !descricao.trim() || !categoria || !severidade) {
      setErro('Preencha todos os campos obrigatórios.');
      return;
    }
    if (dadosAfetados.length === 0) {
      setErro('Selecione ao menos uma categoria de dados afetados.');
      return;
    }
    setSalvando(true);
    setErro('');
    try {
      await adminPost('/api/lgpd/incidentes', {
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        categoria,
        severidade,
        dadosAfetados,
        titularesAfetadosEstimados: titularesEstimados
          ? parseInt(titularesEstimados, 10)
          : undefined,
        ocorridoEm: ocorridoEm || undefined,
        riscoDescricao: riscoDescricao.trim() || undefined,
      });
      onRegistrado();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao registrar incidente.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar incidente de segurança">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Título */}
        <div>
          <label htmlFor={`${idBase}-titulo`} className={ui.label}>
            Título <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${idBase}-titulo`}
            className={`${ui.input} mt-1`}
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            required
            maxLength={300}
            placeholder="Descreva brevemente o incidente"
          />
        </div>

        {/* Descrição */}
        <div>
          <label htmlFor={`${idBase}-descricao`} className={ui.label}>
            Descrição detalhada <span aria-hidden="true">*</span>
          </label>
          <textarea
            id={`${idBase}-descricao`}
            className={`${ui.input} mt-1 min-h-[88px] resize-y`}
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            required
            placeholder="Descreva o ocorrido, como foi detectado e o impacto potencial…"
          />
        </div>

        {/* Categoria + Severidade */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idBase}-categoria`} className={ui.label}>
              Categoria <span aria-hidden="true">*</span>
            </label>
            <select
              id={`${idBase}-categoria`}
              className={`${ui.input} mt-1`}
              value={categoria}
              onChange={(e) => setCategoria(e.target.value as Categoria | '')}
              required
            >
              <option value="">Selecione…</option>
              {(Object.keys(CATEGORIA_LABEL) as Categoria[]).map((c) => (
                <option key={c} value={c}>{CATEGORIA_LABEL[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${idBase}-severidade`} className={ui.label}>
              Severidade <span aria-hidden="true">*</span>
            </label>
            <select
              id={`${idBase}-severidade`}
              className={`${ui.input} mt-1`}
              value={severidade}
              onChange={(e) => setSeveridade(e.target.value as Severidade | '')}
              required
            >
              <option value="">Selecione…</option>
              {(Object.keys(SEVERIDADE_LABEL) as Severidade[]).map((s) => (
                <option key={s} value={s}>{SEVERIDADE_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dados afetados */}
        <fieldset>
          <legend className={`${ui.label} mb-2`}>
            Categorias de dados afetados <span aria-hidden="true">*</span>
          </legend>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {DADOS_AFETADOS_OPCOES.map((opt) => {
              const checkId = `${idBase}-dado-${opt.value}`;
              return (
                <div key={opt.value} className="flex items-center gap-2">
                  <input
                    id={checkId}
                    type="checkbox"
                    className="h-4 w-4 rounded border-border accent-primary focus:ring-2 focus:ring-primary"
                    checked={dadosAfetados.includes(opt.value)}
                    onChange={() => toggleDado(opt.value)}
                  />
                  <label htmlFor={checkId} className="text-sm cursor-pointer">
                    {opt.label}
                  </label>
                </div>
              );
            })}
          </div>
        </fieldset>

        {/* Titulares estimados + data ocorrência */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idBase}-titulares`} className={ui.label}>
              Titulares afetados (estimativa)
            </label>
            <input
              id={`${idBase}-titulares`}
              type="number"
              min="0"
              className={`${ui.input} mt-1`}
              value={titularesEstimados}
              onChange={(e) => setTitularesEstimados(e.target.value)}
              placeholder="0"
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-ocorrido`} className={ui.label}>
              Data/hora da ocorrência
            </label>
            <input
              id={`${idBase}-ocorrido`}
              type="datetime-local"
              className={`${ui.input} mt-1`}
              value={ocorridoEm}
              onChange={(e) => setOcorridoEm(e.target.value)}
            />
          </div>
        </div>

        {/* Descrição do risco */}
        <div>
          <label htmlFor={`${idBase}-risco`} className={ui.label}>
            Avaliação do risco ao titular
          </label>
          <textarea
            id={`${idBase}-risco`}
            className={`${ui.input} mt-1 min-h-[72px] resize-y`}
            value={riscoDescricao}
            onChange={(e) => setRiscoDescricao(e.target.value)}
            placeholder="Descreva o risco potencial aos titulares afetados…"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className={ui.btnGhost} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando}>
            {salvando ? 'Registrando…' : 'Registrar incidente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── Modal: Detalhe / edição ──────────────────────────────────────────────────

function ModalDetalheIncidente({
  open,
  detalhe,
  onClose,
  onAtualizado,
}: {
  open: boolean;
  detalhe: IncidenteDetalhe | null;
  onClose: () => void;
  onAtualizado: () => void;
}) {
  const idBase = useId();
  const [novoStatus, setNovoStatus] = useState<IncidenteStatus | ''>('');
  const [medidasContencao, setMedidasContencao] = useState('');
  const [medidasMitigacao, setMedidasMitigacao] = useState('');
  const [riscoDescricao, setRiscoDescricao] = useState('');
  const [riscoNivel, setRiscoNivel] = useState('');
  const [comunicadoAnpd, setComunicadoAnpd] = useState(false);
  const [comunicadoAnpdEm, setComunicadoAnpdEm] = useState('');
  const [comunicadoAnpdProtocolo, setComunicadoAnpdProtocolo] = useState('');
  const [comunicadoTitulares, setComunicadoTitulares] = useState(false);
  const [comunicadoTitularesEm, setComunicadoTitularesEm] = useState('');
  const [comunicadoTitularesMeio, setComunicadoTitularesMeio] = useState('');
  const [titularesEstimados, setTitularesEstimados] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    if (!open || !detalhe) return;
    setNovoStatus('');
    setMedidasContencao(detalhe.medidasContencao ?? '');
    setMedidasMitigacao(detalhe.medidasMitigacao ?? '');
    setRiscoDescricao(detalhe.riscoDescricao ?? '');
    setRiscoNivel(detalhe.riscoNivel ?? '');
    setComunicadoAnpd(detalhe.comunicadoAnpd);
    setComunicadoAnpdEm(detalhe.comunicadoAnpdEm ?? '');
    setComunicadoAnpdProtocolo(detalhe.comunicadoAnpdProtocolo ?? '');
    setComunicadoTitulares(detalhe.comunicadoTitulares);
    setComunicadoTitularesEm(detalhe.comunicadoTitularesEm ?? '');
    setComunicadoTitularesMeio(detalhe.comunicadoTitularesMeio ?? '');
    setTitularesEstimados(detalhe.titularesAfetadosEstimados?.toString() ?? '');
    setErro('');
    setMsgOk('');
  }, [open, detalhe]);

  if (!detalhe) return null;

  const transicoes = transicoesValidas(detalhe.status);
  const ehFinal = detalhe.status === 'encerrado';

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    if (!detalhe) return;
    setSalvando(true);
    setErro('');
    setMsgOk('');
    try {
      const payload: Record<string, unknown> = {
        medidasContencao: medidasContencao.trim() || undefined,
        medidasMitigacao: medidasMitigacao.trim() || undefined,
        riscoDescricao: riscoDescricao.trim() || undefined,
        riscoNivel: riscoNivel || undefined,
        comunicadoAnpd,
        comunicadoAnpdEm: comunicadoAnpd ? comunicadoAnpdEm || undefined : undefined,
        comunicadoAnpdProtocolo: comunicadoAnpd
          ? comunicadoAnpdProtocolo.trim() || undefined
          : undefined,
        comunicadoTitulares,
        comunicadoTitularesEm: comunicadoTitulares
          ? comunicadoTitularesEm || undefined
          : undefined,
        comunicadoTitularesMeio: comunicadoTitulares
          ? comunicadoTitularesMeio || undefined
          : undefined,
        titularesAfetadosEstimados: titularesEstimados
          ? parseInt(titularesEstimados, 10)
          : undefined,
      };
      if (novoStatus) payload.status = novoStatus;
      await adminPatch(`/api/lgpd/incidentes/${detalhe.id}`, payload);
      setMsgOk('Incidente atualizado com sucesso.');
      onAtualizado();
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 422) {
        setErro('Transição de status inválida ou dados insuficientes.');
      } else {
        setErro(err instanceof AdminApiError ? err.message : 'Erro ao atualizar.');
      }
    } finally {
      setSalvando(false);
    }
  }

  async function handleExportar() {
    if (!detalhe) return;
    setExportando(true);
    try {
      const res = await fetch(`${apiBase}/api/lgpd/incidentes/${detalhe.id}/relatorio`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incidente-${detalhe.id.slice(0, 8)}-relatorio.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro('Erro ao exportar relatório.');
    } finally {
      setExportando(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Incidente: ${detalhe.titulo}`}>
      <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
        {/* Dados gerais */}
        <section aria-label="Dados do incidente" className="rounded border border-border p-3 text-sm space-y-2">
          <div className="flex flex-wrap gap-2 items-center">
            <span className={`${ui.badge} ${SEVERIDADE_COR[detalhe.severidade]}`}>
              {SEVERIDADE_LABEL[detalhe.severidade]}
            </span>
            <span className={`${ui.badge} ${STATUS_COR[detalhe.status]}`}>
              {STATUS_LABEL[detalhe.status]}
            </span>
            {detalhe.comunicacaoAtrasada && (
              <span className={`${ui.badge} bg-danger/10 text-danger`} role="status">
                Comunicação atrasada
              </span>
            )}
          </div>
          <p><span className="text-fg/60">Categoria:</span> {CATEGORIA_LABEL[detalhe.categoria] ?? detalhe.categoria}</p>
          <p><span className="text-fg/60">Detectado em:</span> {formatarData(detalhe.detectadoEm)}</p>
          {detalhe.ocorridoEm && (
            <p><span className="text-fg/60">Ocorrido em:</span> {formatarData(detalhe.ocorridoEm)}</p>
          )}
          <p>
            <span className="text-fg/60">Prazo de comunicação:</span>{' '}
            <strong className={detalhe.comunicacaoAtrasada ? 'text-danger' : ''}>
              {formatarData(detalhe.prazoComunicacaoEm)}
            </strong>
          </p>
          {detalhe.titularesAfetadosEstimados !== null && (
            <p>
              <span className="text-fg/60">Titulares afetados (est.):</span>{' '}
              {detalhe.titularesAfetadosEstimados.toLocaleString('pt-BR')}
            </p>
          )}
          <p className="text-fg/70 mt-1">{detalhe.descricao}</p>
          {detalhe.dadosAfetados && detalhe.dadosAfetados.length > 0 && (
            <div>
              <span className="text-fg/60">Dados afetados: </span>
              {detalhe.dadosAfetados.join(', ')}
            </div>
          )}
        </section>

        {/* Comunicações */}
        <section aria-label="Comunicações realizadas" className="text-sm space-y-1">
          <p className="font-semibold text-xs uppercase tracking-wide text-fg/50 mb-1">Comunicações</p>
          <div className="flex flex-wrap gap-2">
            <span className={`${ui.badge} ${detalhe.comunicadoAnpd ? 'bg-success/20 text-success' : 'bg-muted text-fg/50'}`}>
              ANPD: {detalhe.comunicadoAnpd ? `Sim (${formatarDataSimples(detalhe.comunicadoAnpdEm)})` : 'Não'}
            </span>
            <span className={`${ui.badge} ${detalhe.comunicadoTitulares ? 'bg-success/20 text-success' : 'bg-muted text-fg/50'}`}>
              Titulares: {detalhe.comunicadoTitulares ? `Sim (${formatarDataSimples(detalhe.comunicadoTitularesEm)})` : 'Não'}
            </span>
          </div>
        </section>

        {/* Formulário de atualização */}
        <form onSubmit={handleSalvar} noValidate className="border-t border-border pt-4 space-y-4">
          <p className="font-semibold text-sm">Atualizar incidente</p>

          {erro && <Aviso tipo="erro">{erro}</Aviso>}
          {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}

          {/* Novo status */}
          {!ehFinal && transicoes.length > 0 && (
            <div>
              <label htmlFor={`${idBase}-status`} className={ui.label}>
                Avançar status
              </label>
              <select
                id={`${idBase}-status`}
                className={`${ui.input} mt-1`}
                value={novoStatus}
                onChange={(e) => setNovoStatus(e.target.value as IncidenteStatus | '')}
              >
                <option value="">Manter status atual</option>
                {transicoes.map((t) => (
                  <option key={t} value={t}>{STATUS_LABEL[t]}</option>
                ))}
              </select>
            </div>
          )}

          {/* Titulares estimados */}
          <div>
            <label htmlFor={`${idBase}-titulares`} className={ui.label}>
              Titulares afetados (estimativa)
            </label>
            <input
              id={`${idBase}-titulares`}
              type="number"
              min="0"
              className={`${ui.input} mt-1`}
              value={titularesEstimados}
              onChange={(e) => setTitularesEstimados(e.target.value)}
            />
          </div>

          {/* Risco */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idBase}-risco-desc`} className={ui.label}>
                Descrição do risco
              </label>
              <textarea
                id={`${idBase}-risco-desc`}
                className={`${ui.input} mt-1 min-h-[72px] resize-y`}
                value={riscoDescricao}
                onChange={(e) => setRiscoDescricao(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor={`${idBase}-risco-nivel`} className={ui.label}>
                Nível de risco
              </label>
              <select
                id={`${idBase}-risco-nivel`}
                className={`${ui.input} mt-1`}
                value={riscoNivel}
                onChange={(e) => setRiscoNivel(e.target.value)}
              >
                <option value="">Selecione…</option>
                <option value="baixo">Baixo</option>
                <option value="medio">Médio</option>
                <option value="alto">Alto</option>
                <option value="critico">Crítico</option>
              </select>
            </div>
          </div>

          {/* Medidas */}
          <div>
            <label htmlFor={`${idBase}-contencao`} className={ui.label}>
              Medidas de contenção
            </label>
            <textarea
              id={`${idBase}-contencao`}
              className={`${ui.input} mt-1 min-h-[72px] resize-y`}
              value={medidasContencao}
              onChange={(e) => setMedidasContencao(e.target.value)}
              placeholder="Ações tomadas para conter o incidente…"
            />
          </div>
          <div>
            <label htmlFor={`${idBase}-mitigacao`} className={ui.label}>
              Medidas de mitigação
            </label>
            <textarea
              id={`${idBase}-mitigacao`}
              className={`${ui.input} mt-1 min-h-[72px] resize-y`}
              value={medidasMitigacao}
              onChange={(e) => setMedidasMitigacao(e.target.value)}
              placeholder="Ações para mitigar recorrência e lições aprendidas…"
            />
          </div>

          {/* Comunicação ANPD */}
          <fieldset className="rounded border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-semibold">Comunicação à ANPD</legend>
            <div className="flex items-center gap-2">
              <input
                id={`${idBase}-anpd-check`}
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={comunicadoAnpd}
                onChange={(e) => setComunicadoAnpd(e.target.checked)}
              />
              <label htmlFor={`${idBase}-anpd-check`} className="text-sm">
                Incidente comunicado à ANPD
              </label>
            </div>
            {comunicadoAnpd && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${idBase}-anpd-em`} className={ui.label}>
                    Data da comunicação
                  </label>
                  <input
                    id={`${idBase}-anpd-em`}
                    type="datetime-local"
                    className={`${ui.input} mt-1`}
                    value={comunicadoAnpdEm}
                    onChange={(e) => setComunicadoAnpdEm(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={`${idBase}-anpd-protocolo`} className={ui.label}>
                    Protocolo ANPD
                  </label>
                  <input
                    id={`${idBase}-anpd-protocolo`}
                    className={`${ui.input} mt-1`}
                    value={comunicadoAnpdProtocolo}
                    onChange={(e) => setComunicadoAnpdProtocolo(e.target.value)}
                    placeholder="Número do protocolo"
                  />
                </div>
              </div>
            )}
          </fieldset>

          {/* Comunicação Titulares */}
          <fieldset className="rounded border border-border p-3 space-y-3">
            <legend className="px-1 text-sm font-semibold">Comunicação aos titulares</legend>
            <div className="flex items-center gap-2">
              <input
                id={`${idBase}-tit-check`}
                type="checkbox"
                className="h-4 w-4 rounded border-border accent-primary"
                checked={comunicadoTitulares}
                onChange={(e) => setComunicadoTitulares(e.target.checked)}
              />
              <label htmlFor={`${idBase}-tit-check`} className="text-sm">
                Titulares comunicados
              </label>
            </div>
            {comunicadoTitulares && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${idBase}-tit-em`} className={ui.label}>
                    Data da comunicação
                  </label>
                  <input
                    id={`${idBase}-tit-em`}
                    type="datetime-local"
                    className={`${ui.input} mt-1`}
                    value={comunicadoTitularesEm}
                    onChange={(e) => setComunicadoTitularesEm(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={`${idBase}-tit-meio`} className={ui.label}>
                    Meio de comunicação
                  </label>
                  <select
                    id={`${idBase}-tit-meio`}
                    className={`${ui.input} mt-1`}
                    value={comunicadoTitularesMeio}
                    onChange={(e) => setComunicadoTitularesMeio(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    <option value="email">E-mail</option>
                    <option value="portal">Portal</option>
                    <option value="imprensa">Imprensa</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>
            )}
          </fieldset>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleExportar}
              disabled={exportando}
              className={ui.btnGhost}
            >
              {exportando ? 'Exportando…' : 'Exportar relatório (JSON)'}
            </button>
            <button type="button" onClick={onClose} className={ui.btnGhost} disabled={salvando}>
              Fechar
            </button>
            {!ehFinal && (
              <button type="submit" className={ui.btn} disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar alterações'}
              </button>
            )}
          </div>
        </form>
      </div>
    </Modal>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function LgpdIncidentesPage() {
  const [lista, setLista] = useState<IncidenteResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroSeveridade, setFiltroSeveridade] = useState('');

  // Modais
  const [modalRegistrar, setModalRegistrar] = useState(false);
  const [detalhe, setDetalhe] = useState<IncidenteDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<IncidenteResumo[]>(
        `/api/lgpd/incidentes${qs({ status: filtroStatus, severidade: filtroSeveridade })}`,
      );
      setLista(data);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar incidentes.');
    } finally {
      setCarregando(false);
    }
  }, [filtroStatus, filtroSeveridade]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrirDetalhe(id: string) {
    setCarregandoDetalhe(true);
    setErro('');
    try {
      const d = await adminGet<IncidenteDetalhe>(`/api/lgpd/incidentes/${id}`);
      setDetalhe(d);
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao carregar incidente.');
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <AdminHeader
        title="Incidentes de Segurança (LGPD)"
        description="Registre, gerencie e comunique incidentes de segurança envolvendo dados pessoais (LGPD, art. 48)."
      >
        <button onClick={() => setModalRegistrar(true)} className={ui.btn}>
          + Registrar incidente
        </button>
      </AdminHeader>

      {/* Filtros */}
      <section aria-label="Filtros" className="flex flex-wrap gap-3 items-end">
        <div>
          <label htmlFor="filtro-status" className={`${ui.label} text-xs`}>
            Status
          </label>
          <select
            id="filtro-status"
            className={`${ui.input} mt-1 w-44`}
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
          >
            <option value="">Todos</option>
            {(Object.keys(STATUS_LABEL) as IncidenteStatus[]).map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filtro-severidade" className={`${ui.label} text-xs`}>
            Severidade
          </label>
          <select
            id="filtro-severidade"
            className={`${ui.input} mt-1 w-36`}
            value={filtroSeveridade}
            onChange={(e) => setFiltroSeveridade(e.target.value)}
          >
            <option value="">Todas</option>
            {(Object.keys(SEVERIDADE_LABEL) as Severidade[]).map((s) => (
              <option key={s} value={s}>{SEVERIDADE_LABEL[s]}</option>
            ))}
          </select>
        </div>
        <button onClick={carregar} disabled={carregando} className={ui.btnGhost}>
          {carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </section>

      {/* Feedbacks */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      <section
        aria-label="Lista de incidentes"
        aria-live="polite"
        aria-busy={carregando}
      >
        {carregando ? (
          <p className="py-8 text-center text-sm text-fg/60" role="status">
            Carregando…
          </p>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-fg/60">
            Nenhum incidente registrado.
          </p>
        ) : (
          <div className={`${ui.card} overflow-x-auto`}>
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr>
                  <th className={ui.th} scope="col">Título</th>
                  <th className={ui.th} scope="col">Categoria</th>
                  <th className={ui.th} scope="col">Severidade</th>
                  <th className={ui.th} scope="col">Status</th>
                  <th className={ui.th} scope="col">Detectado em</th>
                  <th className={ui.th} scope="col">Prazo comunicação</th>
                  <th className={ui.th} scope="col">ANPD / Titulares</th>
                  <th className={ui.th} scope="col">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lista.map((inc) => (
                  <tr key={inc.id} className="hover:bg-muted/30 transition-colors">
                    <td className={`${ui.td} max-w-[200px]`}>
                      <span className="line-clamp-2 font-semibold text-sm">
                        {inc.titulo}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className="text-xs">{CATEGORIA_LABEL[inc.categoria] ?? inc.categoria}</span>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} ${SEVERIDADE_COR[inc.severidade]}`}>
                        {SEVERIDADE_LABEL[inc.severidade]}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <span className={`${ui.badge} ${STATUS_COR[inc.status]}`}>
                        {STATUS_LABEL[inc.status]}
                      </span>
                    </td>
                    <td className={ui.td}>
                      <time dateTime={inc.detectadoEm} className="text-xs text-fg/70">
                        {formatarDataSimples(inc.detectadoEm)}
                      </time>
                    </td>
                    <td className={ui.td}>
                      <div className="space-y-0.5">
                        <time dateTime={inc.prazoComunicacaoEm} className="text-xs text-fg/70">
                          {formatarDataSimples(inc.prazoComunicacaoEm)}
                        </time>
                        {inc.comunicacaoAtrasada && (
                          <span className={`${ui.badge} block bg-danger/10 text-danger`} role="status">
                            Atrasada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={ui.td}>
                      <div className="flex flex-col gap-0.5">
                        <span
                          className={`${ui.badge} ${inc.comunicadoAnpd ? 'bg-success/20 text-success' : 'bg-muted text-fg/50'}`}
                          aria-label={`ANPD: ${inc.comunicadoAnpd ? 'comunicado' : 'pendente'}`}
                        >
                          ANPD {inc.comunicadoAnpd ? 'sim' : 'não'}
                        </span>
                        <span
                          className={`${ui.badge} ${inc.comunicadoTitulares ? 'bg-success/20 text-success' : 'bg-muted text-fg/50'}`}
                          aria-label={`Titulares: ${inc.comunicadoTitulares ? 'comunicados' : 'pendente'}`}
                        >
                          Titulares {inc.comunicadoTitulares ? 'sim' : 'não'}
                        </span>
                      </div>
                    </td>
                    <td className={`${ui.td} whitespace-nowrap`}>
                      <button
                        type="button"
                        onClick={() => abrirDetalhe(inc.id)}
                        disabled={carregandoDetalhe}
                        className={ui.btnGhost}
                        aria-label={`Abrir incidente: ${inc.titulo}`}
                      >
                        Ver / Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal registrar */}
      <ModalRegistrar
        open={modalRegistrar}
        onClose={() => setModalRegistrar(false)}
        onRegistrado={carregar}
      />

      {/* Modal detalhe */}
      <ModalDetalheIncidente
        open={detalhe !== null}
        detalhe={detalhe}
        onClose={() => setDetalhe(null)}
        onAtualizado={() => {
          carregar();
          // mantém o modal aberto para mostrar msgOk — fecha apenas no botão Fechar
        }}
      />
    </main>
  );
}
