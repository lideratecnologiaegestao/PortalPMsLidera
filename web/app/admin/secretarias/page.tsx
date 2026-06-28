'use client';

/**
 * Admin — Secretarias
 * Endpoints:
 *   GET  /api/admin/secretarias?page=&pageSize=
 *   POST /api/admin/secretarias
 *   PUT  /api/admin/secretarias/:id
 *   DELETE /api/admin/secretarias/:id
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  qs,
  type Pagina,
  AdminApiError,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import { googleMapsLink, wazeLink } from '../../../lib/geo-links';

// ─── Tipo ────────────────────────────────────────────────────────────────────

interface Secretaria {
  id: string;
  nome: string;
  tipo?: string;
  sigla?: string;
  responsavel?: string;
  secretarioCargo?: string;
  secretarioBio?: string;
  fotoUrl?: string;
  descricao?: string;
  sobre?: string;
  competencias?: string;
  endereco?: string;
  cep?: string;
  horario?: string;
  email?: string;
  telefone?: string;
  ordem: number;
  ativo: boolean;
}

interface Trabalho { id: string; titulo: string; descricao?: string | null; imagemUrl?: string | null; data?: string | null }

function secretariaVazia(): Omit<Secretaria, 'id'> {
  return {
    nome: '', tipo: 'secretaria', sigla: '', responsavel: '', secretarioCargo: '', secretarioBio: '',
    fotoUrl: '', descricao: '', sobre: '', competencias: '', endereco: '', cep: '', horario: '',
    email: '', telefone: '', ordem: 0, ativo: true,
  };
}

// ─── Modal criar / editar ─────────────────────────────────────────────────────

function ModalSecretaria({
  open,
  editando,
  onClose,
  onSalvo,
}: {
  open: boolean;
  editando: Secretaria | null;
  onClose: () => void;
  onSalvo: () => void;
}) {
  const [form, setForm] = useState<Omit<Secretaria, 'id'>>(secretariaVazia());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [pickerAberto, setPickerAberto] = useState(false);
  const [trabalhos, setTrabalhos] = useState<Trabalho[]>([]);
  const [novoTr, setNovoTr] = useState({ titulo: '', descricao: '', imagemUrl: '', data: '' });
  const [pickerTr, setPickerTr] = useState(false);

  const carregarTrabalhos = useCallback(async () => {
    if (!editando) { setTrabalhos([]); return; }
    try { setTrabalhos(await adminGet<Trabalho[]>(`/api/admin/secretarias/${editando.id}/trabalhos`)); }
    catch { setTrabalhos([]); }
  }, [editando]);

  async function addTrabalho() {
    if (!editando || !novoTr.titulo.trim()) return;
    try {
      await adminPost(`/api/admin/secretarias/${editando.id}/trabalhos`, { ...novoTr, ordem: trabalhos.length + 1 });
      setNovoTr({ titulo: '', descricao: '', imagemUrl: '', data: '' });
      await carregarTrabalhos();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao adicionar trabalho.'); }
  }
  async function delTrabalho(id: string) {
    try { await adminDelete(`/api/admin/secretarias/trabalhos/${id}`); setTrabalhos((t) => t.filter((x) => x.id !== id)); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover.'); }
  }

  useEffect(() => { if (open) carregarTrabalhos(); }, [open, carregarTrabalhos]);

  useEffect(() => {
    if (open) {
      setErro('');
      setForm(
        editando
          ? {
              nome: editando.nome,
              tipo: editando.tipo ?? 'secretaria',
              sigla: editando.sigla ?? '',
              responsavel: editando.responsavel ?? '',
              secretarioCargo: editando.secretarioCargo ?? '',
              secretarioBio: editando.secretarioBio ?? '',
              fotoUrl: editando.fotoUrl ?? '',
              descricao: editando.descricao ?? '',
              sobre: editando.sobre ?? '',
              competencias: editando.competencias ?? '',
              endereco: editando.endereco ?? '',
              cep: editando.cep ?? '',
              horario: editando.horario ?? '',
              email: editando.email ?? '',
              telefone: editando.telefone ?? '',
              ordem: editando.ordem,
              ativo: editando.ativo,
            }
          : secretariaVazia(),
      );
    }
  }, [open, editando]);

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro('');
    try {
      if (editando) {
        await adminPut(`/api/admin/secretarias/${editando.id}`, form);
      } else {
        await adminPost('/api/admin/secretarias', form);
      }
      onSalvo();
      onClose();
    } catch (err) {
      setErro(err instanceof AdminApiError ? err.message : 'Erro ao salvar secretaria.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editando ? 'Editar secretaria' : 'Nova secretaria'}
    >
      <form onSubmit={salvar} className="space-y-4" noValidate>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}

        {/* Nome */}
        <div>
          <label htmlFor="sec-nome" className={ui.label}>
            Nome <span aria-hidden="true">*</span>
          </label>
          <input
            id="sec-nome"
            type="text"
            required
            className={ui.input}
            value={form.nome}
            onChange={(e) => set('nome', e.target.value)}
            placeholder="ex.: Secretaria Municipal de Saúde"
          />
        </div>

        {/* Tipo de órgão */}
        <div>
          <label htmlFor="sec-tipo" className={ui.label}>Tipo de órgão</label>
          <select id="sec-tipo" className={ui.input} value={form.tipo} onChange={(e) => set('tipo', e.target.value)}>
            <option value="gabinete">Gabinete do Prefeito</option>
            <option value="secretaria">Secretaria</option>
            <option value="departamento">Departamento</option>
            <option value="procuradoria">Procuradoria Jurídica</option>
            <option value="controladoria">Controladoria Interna</option>
            <option value="contabilidade">Contabilidade</option>
            <option value="autarquia">Autarquia</option>
            <option value="fundacao">Fundação</option>
            <option value="fundo">Fundo</option>
            <option value="empresa">Empresa Pública</option>
            <option value="outro">Outro</option>
          </select>
          <p className="mt-1 text-xs text-fg/60">Define onde o órgão aparece na <a href="/institucional/estrutura" className="text-primary hover:underline" target="_blank" rel="noreferrer">Estrutura</a>. Procuradoria/Controladoria/Contabilidade ficam em destaque; o Gabinete recebe o cadastro das autoridades.</p>
        </div>

        {/* Sigla e Responsável */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sec-sigla" className={ui.label}>
              Sigla
            </label>
            <input
              id="sec-sigla"
              type="text"
              className={ui.input}
              value={form.sigla}
              onChange={(e) => set('sigla', e.target.value)}
              placeholder="ex.: SMS"
            />
          </div>
          <div>
            <label htmlFor="sec-responsavel" className={ui.label}>
              Responsável (Secretário/a)
            </label>
            <input
              id="sec-responsavel"
              type="text"
              className={ui.input}
              value={form.responsavel}
              onChange={(e) => set('responsavel', e.target.value)}
              placeholder="Nome completo"
            />
          </div>
        </div>

        <div>
          <label htmlFor="sec-cargo" className={ui.label}>Cargo do/a secretário/a</label>
          <input id="sec-cargo" type="text" className={ui.input} value={form.secretarioCargo} onChange={(e) => set('secretarioCargo', e.target.value)} placeholder="ex.: Secretário(a) Municipal de Obras" />
        </div>

        <div>
          <label htmlFor="sec-bio" className={ui.label}>Mini-currículo do/a secretário/a <span className="text-fg/50">(aceita HTML)</span></label>
          <textarea id="sec-bio" rows={3} className={ui.input} value={form.secretarioBio} onChange={(e) => set('secretarioBio', e.target.value)} placeholder="Formação, trajetória…" />
        </div>

        {/* Foto */}
        <div>
          <label htmlFor="sec-fotoUrl" className={ui.label}>
            Foto do/a secretário/a
          </label>
          <div className="mt-1 flex gap-2">
            <input
              id="sec-fotoUrl"
              type="url"
              className={`flex-1 ${ui.input}`}
              value={form.fotoUrl}
              onChange={(e) => set('fotoUrl', e.target.value)}
              placeholder="https://..."
              aria-describedby="sec-foto-hint"
            />
            <button
              type="button"
              className={ui.btnGhost}
              onClick={() => setPickerAberto(true)}
              aria-label="Escolher foto da biblioteca de mídia"
            >
              Escolher imagem
            </button>
          </div>
          <p id="sec-foto-hint" className="mt-1 text-xs text-fg/60">
            Informe uma URL ou selecione da Biblioteca de Mídia.
          </p>
          {form.fotoUrl && (
            <div className="mt-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={form.fotoUrl}
                alt={`Foto de ${form.responsavel || 'responsável pela secretaria'}`}
                className="h-20 w-20 rounded-full border border-border object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>

        {/* Descrição */}
        <div>
          <label htmlFor="sec-descricao" className={ui.label}>
            Descrição
          </label>
          <textarea
            id="sec-descricao"
            rows={2}
            className={ui.input}
            value={form.descricao}
            onChange={(e) => set('descricao', e.target.value)}
            placeholder="Resumo curto (1-2 linhas) exibido no topo."
          />
        </div>

        <div>
          <label htmlFor="sec-sobre" className={ui.label}>Sobre a secretaria <span className="text-fg/50">(aceita HTML)</span></label>
          <textarea id="sec-sobre" rows={4} className={ui.input} value={form.sobre} onChange={(e) => set('sobre', e.target.value)} placeholder="<p>Texto institucional…</p>" />
        </div>

        <div>
          <label htmlFor="sec-comp" className={ui.label}>Competências <span className="text-fg/50">(aceita HTML — ex.: &lt;ul&gt;&lt;li&gt;)</span></label>
          <textarea id="sec-comp" rows={4} className={ui.input} value={form.competencias} onChange={(e) => set('competencias', e.target.value)} placeholder="<ul><li>Atribuição 1</li><li>Atribuição 2</li></ul>" />
        </div>

        {/* Email e Telefone */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="sec-email" className={ui.label}>
              E-mail
            </label>
            <input
              id="sec-email"
              type="email"
              className={ui.input}
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="secretaria@municipio.gov.br"
            />
          </div>
          <div>
            <label htmlFor="sec-telefone" className={ui.label}>
              Telefone
            </label>
            <input
              id="sec-telefone"
              type="tel"
              className={ui.input}
              value={form.telefone}
              onChange={(e) => set('telefone', e.target.value)}
              placeholder="(00) 0000-0000"
            />
          </div>
        </div>

        {/* Endereço / CEP / Horário */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="sec-end" className={ui.label}>Endereço</label>
            <input id="sec-end" type="text" className={ui.input} value={form.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, nº, bairro, cidade — UF" />
          </div>
          <div>
            <label htmlFor="sec-cep" className={ui.label}>CEP</label>
            <input id="sec-cep" type="text" className={ui.input} value={form.cep} onChange={(e) => set('cep', e.target.value)} placeholder="00000-000" />
          </div>
          <div>
            <label htmlFor="sec-hor" className={ui.label}>Horário de atendimento</label>
            <input id="sec-hor" type="text" className={ui.input} value={form.horario} onChange={(e) => set('horario', e.target.value)} placeholder="Seg a sex, 7h-13h" />
          </div>
        </div>

        {/* Ordem */}
        <div>
          <label htmlFor="sec-ordem" className={ui.label}>
            Ordem de exibição
          </label>
          <input
            id="sec-ordem"
            type="number"
            min={0}
            className={ui.input}
            value={form.ordem}
            onChange={(e) => set('ordem', Number(e.target.value))}
          />
        </div>

        {/* Ativo */}
        <div className="flex items-center gap-2">
          <input
            id="sec-ativo"
            type="checkbox"
            checked={form.ativo}
            onChange={(e) => set('ativo', e.target.checked)}
            className="h-4 w-4 rounded border-border accent-primary"
          />
          <label htmlFor="sec-ativo" className="text-sm font-semibold">
            Secretaria ativa
          </label>
        </div>

        {/* Trabalhos realizados (modo edição) */}
        {editando && (
          <div className="rounded border border-border p-3">
            <h3 className="mb-2 text-sm font-semibold">Trabalhos realizados</h3>
            {trabalhos.length === 0 ? (
              <p className="text-sm text-fg/60">Nenhum trabalho cadastrado.</p>
            ) : (
              <ul className="mb-3 space-y-1">
                {trabalhos.map((t) => (
                  <li key={t.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
                    <span><span className="font-semibold">{t.titulo}</span>{t.imagemUrl ? ' 🖼️' : ''}</span>
                    <button type="button" className="text-danger hover:underline" onClick={() => delTrabalho(t.id)}>remover</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><label className={ui.label}>Título</label><input className={ui.input} value={novoTr.titulo} onChange={(e) => setNovoTr({ ...novoTr, titulo: e.target.value })} /></div>
              <div className="col-span-2"><label className={ui.label}>Descrição</label><input className={ui.input} value={novoTr.descricao} onChange={(e) => setNovoTr({ ...novoTr, descricao: e.target.value })} /></div>
              <div><label className={ui.label}>Data</label><input type="date" className={ui.input} value={novoTr.data} onChange={(e) => setNovoTr({ ...novoTr, data: e.target.value })} /></div>
              <div className="flex items-end gap-2">
                <button type="button" className={ui.btnGhost} onClick={() => setPickerTr(true)}>{novoTr.imagemUrl ? 'Imagem ✓' : 'Imagem…'}</button>
                <button type="button" className={ui.btn} onClick={addTrabalho}>Adicionar</button>
              </div>
            </div>
          </div>
        )}

        {/* Unidades do órgão: agora em modal próprio, acionado por botão na lista. */}
        {editando && (
          <p className="rounded border border-dashed border-border bg-muted/20 p-3 text-xs text-fg/60">
            As <strong>unidades do órgão</strong> (com endereço, GPS, horário e foto da
            fachada) são gerenciadas em um cadastro próprio: feche e use o botão{' '}
            <strong>“Unidades”</strong> na linha desta secretaria.
          </p>
        )}

        {/* Autoridades — só no Gabinete */}
        {editando && form.tipo === 'gabinete' && <AutoridadesManager orgaoId={editando.id} />}

        {/* Ações */}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={ui.btnGhost} onClick={onClose} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" className={ui.btn} disabled={salvando} aria-busy={salvando}>
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </form>

      <MediaPicker
        open={pickerAberto}
        onClose={() => setPickerAberto(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) set('fotoUrl', asset.urlPublica);
          setPickerAberto(false);
        }}
      />
      <MediaPicker
        open={pickerTr}
        onClose={() => setPickerTr(false)}
        tipo="imagem"
        onSelect={(asset) => {
          if (asset.urlPublica) setNovoTr((t) => ({ ...t, imagemUrl: asset.urlPublica! }));
          setPickerTr(false);
        }}
      />
    </Modal>
  );
}

// ─── Gestor de Unidades (modal próprio) ───────────────────────────────────────

interface Unidade {
  id: string; nome: string; sigla?: string | null; responsavel?: string | null; cargo?: string | null;
  telefone?: string | null; email?: string | null; endereco?: string | null; cep?: string | null;
  horario?: string | null; fotoUrl?: string | null; latitude?: number | null; longitude?: number | null; ordem: number;
}
const unidadeVazia = {
  id: '' as string, nome: '', sigla: '', responsavel: '', cargo: '', telefone: '', email: '',
  endereco: '', cep: '', horario: '', fotoUrl: '', latitude: '', longitude: '', ordem: 0,
};

/** Modal dedicado: lista + cadastro completo das unidades de um órgão. */
function ModalUnidades({ orgao, onClose }: { orgao: Secretaria | null; onClose: () => void }) {
  return (
    <Modal open={!!orgao} onClose={onClose} title={orgao ? `Unidades — ${orgao.nome}` : 'Unidades do órgão'}>
      {orgao && <UnidadesManager orgaoId={orgao.id} />}
      <div className="flex justify-end pt-3">
        <button type="button" className={ui.btn} onClick={onClose}>Concluir</button>
      </div>
    </Modal>
  );
}

function UnidadesManager({ orgaoId }: { orgaoId: string }) {
  const [lista, setLista] = useState<Unidade[]>([]);
  const [form, setForm] = useState({ ...unidadeVazia });
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);
  const [gpsMsg, setGpsMsg] = useState('');

  const carregar = useCallback(() => {
    adminGet<Unidade[]>(`/api/admin/secretarias/${orgaoId}/unidades`).then(setLista).catch(() => setLista([]));
  }, [orgaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  function s<K extends keyof typeof unidadeVazia>(k: K, v: (typeof unidadeVazia)[K]) { setForm((p) => ({ ...p, [k]: v })); }
  function editar(u: Unidade) {
    setGpsMsg('');
    setForm({
      id: u.id, nome: u.nome, sigla: u.sigla ?? '', responsavel: u.responsavel ?? '', cargo: u.cargo ?? '',
      telefone: u.telefone ?? '', email: u.email ?? '', endereco: u.endereco ?? '', cep: u.cep ?? '',
      horario: u.horario ?? '', fotoUrl: u.fotoUrl ?? '',
      latitude: u.latitude != null ? String(u.latitude) : '', longitude: u.longitude != null ? String(u.longitude) : '',
      ordem: u.ordem ?? 0,
    });
  }

  /** Usa o GPS do dispositivo para preencher lat/lng (útil em visita à unidade). */
  function capturarGps() {
    setGpsMsg('');
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setErro('Geolocalização não suportada neste navegador.'); return; }
    setGpsMsg('Obtendo localização…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((p) => ({ ...p, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) }));
        setGpsMsg('Coordenadas capturadas do dispositivo.');
      },
      () => { setGpsMsg(''); setErro('Não foi possível obter a localização (permissão negada?).'); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  /** Aceita colar "lat, lng" (formato que o Google Maps copia) em qualquer dos campos. */
  function colarCoord(e: React.ClipboardEvent<HTMLInputElement>) {
    const txt = e.clipboardData.getData('text');
    const m = txt.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (m) { e.preventDefault(); setForm((p) => ({ ...p, latitude: m[1], longitude: m[2] })); setGpsMsg('Coordenadas coladas do mapa.'); }
  }

  async function salvar() {
    if (!form.nome.trim()) { setErro('Informe o nome da unidade.'); return; }
    setErro('');
    const body = {
      nome: form.nome, sigla: form.sigla || undefined, responsavel: form.responsavel || undefined,
      cargo: form.cargo || undefined, telefone: form.telefone || undefined, email: form.email || undefined,
      endereco: form.endereco || undefined, cep: form.cep || undefined, horario: form.horario || undefined,
      fotoUrl: form.fotoUrl || undefined,
      latitude: form.latitude.trim() === '' ? null : Number(form.latitude),
      longitude: form.longitude.trim() === '' ? null : Number(form.longitude),
      ordem: Number(form.ordem) || 0,
    };
    try {
      if (form.id) await adminPut(`/api/admin/secretarias/unidades/${form.id}`, body);
      else await adminPost(`/api/admin/secretarias/${orgaoId}/unidades`, body);
      setForm({ ...unidadeVazia }); setGpsMsg(''); carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar unidade.'); }
  }
  async function remover(id: string) {
    try { await adminDelete(`/api/admin/secretarias/unidades/${id}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover.'); }
  }

  const latNum = form.latitude.trim() === '' ? null : Number(form.latitude);
  const lngNum = form.longitude.trim() === '' ? null : Number(form.longitude);
  const ponto = { latitude: latNum, longitude: lngNum, endereco: form.endereco, cep: form.cep };
  const gLink = googleMapsLink(ponto);
  const wLink = wazeLink(ponto);

  return (
    <div className="space-y-3">
      <p className="text-xs text-fg/60">
        Cadastre os locais de atendimento da secretaria. Com endereço e/ou coordenadas, o cidadão
        abre direto no Google Maps ou no Waze a partir da página pública.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {lista.length > 0 && (
        <ul className="space-y-1">
          {lista.map((u) => (
            <li key={u.id} className="flex items-center justify-between rounded bg-muted/40 px-3 py-1.5 text-sm">
              <span>
                <span className="font-semibold">{u.nome}</span>{u.responsavel ? ` — ${u.responsavel}` : ''}
                {(u.latitude != null && u.longitude != null) ? ' 📍' : u.endereco ? ' 🗺️' : ''}
              </span>
              <span className="flex gap-2">
                <button type="button" className="text-primary hover:underline" onClick={() => editar(u)}>editar</button>
                <button type="button" className="text-danger hover:underline" onClick={() => remover(u.id)}>remover</button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded border border-border p-3">
        <h3 className="mb-2 text-sm font-semibold">{form.id ? 'Editar unidade' : 'Nova unidade'}</h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2"><label className={ui.label}>Nome da unidade *</label><input className={ui.input} value={form.nome} onChange={(e) => s('nome', e.target.value)} placeholder="ex.: Departamento de Vigilância Sanitária" /></div>
          <div><label className={ui.label}>Sigla</label><input className={ui.input} value={form.sigla} onChange={(e) => s('sigla', e.target.value)} /></div>
          <div><label className={ui.label}>Ordem</label><input type="number" className={ui.input} value={form.ordem} onChange={(e) => s('ordem', Number(e.target.value))} /></div>
          <div><label className={ui.label}>Responsável</label><input className={ui.input} value={form.responsavel} onChange={(e) => s('responsavel', e.target.value)} /></div>
          <div><label className={ui.label}>Cargo</label><input className={ui.input} value={form.cargo} onChange={(e) => s('cargo', e.target.value)} placeholder="ex.: Diretor(a)" /></div>
          <div><label className={ui.label}>Telefone</label><input className={ui.input} value={form.telefone} onChange={(e) => s('telefone', e.target.value)} /></div>
          <div><label className={ui.label}>E-mail</label><input className={ui.input} value={form.email} onChange={(e) => s('email', e.target.value)} /></div>

          {/* Localização */}
          <div className="col-span-2"><label className={ui.label}>Endereço</label><input className={ui.input} value={form.endereco} onChange={(e) => s('endereco', e.target.value)} placeholder="Rua, nº, bairro, cidade — UF" /></div>
          <div><label className={ui.label}>CEP</label><input className={ui.input} value={form.cep} onChange={(e) => s('cep', e.target.value)} placeholder="00000-000" /></div>
          <div><label className={ui.label}>Horário de atendimento</label><input className={ui.input} value={form.horario} onChange={(e) => s('horario', e.target.value)} placeholder="Seg a sex, 7h-13h" /></div>

          {/* Coordenadas (GPS) */}
          <div><label className={ui.label}>Latitude</label><input className={ui.input} value={form.latitude} onChange={(e) => s('latitude', e.target.value)} onPaste={colarCoord} inputMode="decimal" placeholder="-15.601" /></div>
          <div><label className={ui.label}>Longitude</label><input className={ui.input} value={form.longitude} onChange={(e) => s('longitude', e.target.value)} onPaste={colarCoord} inputMode="decimal" placeholder="-56.097" /></div>
          <div className="col-span-2 flex flex-wrap items-center gap-2">
            <button type="button" className={ui.btnGhost} onClick={capturarGps}>📍 Usar localização atual</button>
            {(latNum != null && lngNum != null) && (
              <button type="button" className="text-xs text-danger hover:underline" onClick={() => setForm((p) => ({ ...p, latitude: '', longitude: '' }))}>limpar coordenadas</button>
            )}
            {gLink && <a href={gLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">conferir no Google Maps ↗</a>}
            {wLink && <a href={wLink} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">conferir no Waze ↗</a>}
          </div>
          <p className="col-span-2 text-xs text-fg/55">
            Dica: no Google Maps, toque e segure no local, copie as coordenadas e cole no campo Latitude
            (ele divide automaticamente). {gpsMsg && <span className="text-success">{gpsMsg}</span>}
          </p>

          {/* Foto da fachada */}
          <div className="col-span-2">
            <label className={ui.label}>Foto da fachada</label>
            <div className="mt-1 flex gap-2">
              <input type="url" className={`flex-1 ${ui.input}`} value={form.fotoUrl} onChange={(e) => s('fotoUrl', e.target.value)} placeholder="https://..." />
              <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)} aria-label="Escolher foto da fachada na biblioteca">Escolher imagem</button>
            </div>
            {form.fotoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.fotoUrl} alt="Fachada da unidade" className="mt-2 h-24 w-40 rounded border border-border object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
            )}
          </div>

          <div className="col-span-2 flex justify-end gap-2">
            {form.id && <button type="button" className={ui.btnGhost} onClick={() => { setForm({ ...unidadeVazia }); setGpsMsg(''); }}>Cancelar edição</button>}
            <button type="button" className={ui.btn} onClick={salvar}>{form.id ? 'Salvar unidade' : 'Adicionar unidade'}</button>
          </div>
        </div>
      </div>

      <MediaPicker open={picker} onClose={() => setPicker(false)} tipo="imagem" onSelect={(a) => { if (a.urlPublica) s('fotoUrl', a.urlPublica); setPicker(false); }} />
    </div>
  );
}

// ─── Gestor de Autoridades (Gabinete) ─────────────────────────────────────────

interface Autoridade { id: string; cargo: string; nome: string; fotoUrl?: string | null; email?: string | null; telefone?: string | null; bio?: string | null; ordem: number }
const CARGOS_AUTORIDADE = [
  { v: 'prefeito', l: 'Prefeito(a)' },
  { v: 'vice_prefeito', l: 'Vice-prefeito(a)' },
  { v: 'primeira_dama', l: 'Primeira-dama / Primeiro-cavalheiro' },
  { v: 'chefe_gabinete', l: 'Chefe de Gabinete' },
  { v: 'outro', l: 'Outro' },
];
const autoridadeVazia = { id: '' as string, cargo: 'prefeito', nome: '', fotoUrl: '', email: '', telefone: '', bio: '', ordem: 0 };

function AutoridadesManager({ orgaoId }: { orgaoId: string }) {
  const [lista, setLista] = useState<Autoridade[]>([]);
  const [form, setForm] = useState({ ...autoridadeVazia });
  const [erro, setErro] = useState('');
  const [picker, setPicker] = useState(false);

  const carregar = useCallback(() => {
    adminGet<Autoridade[]>(`/api/admin/secretarias/${orgaoId}/autoridades`).then(setLista).catch(() => setLista([]));
  }, [orgaoId]);
  useEffect(() => { carregar(); }, [carregar]);

  function s<K extends keyof typeof autoridadeVazia>(k: K, v: (typeof autoridadeVazia)[K]) { setForm((p) => ({ ...p, [k]: v })); }
  function editar(a: Autoridade) { setForm({ id: a.id, cargo: a.cargo, nome: a.nome, fotoUrl: a.fotoUrl ?? '', email: a.email ?? '', telefone: a.telefone ?? '', bio: a.bio ?? '', ordem: a.ordem ?? 0 }); }
  function rotulo(c: string) { return CARGOS_AUTORIDADE.find((x) => x.v === c)?.l ?? c; }

  async function salvar() {
    if (!form.nome.trim()) { setErro('Informe o nome.'); return; }
    setErro('');
    const body = { cargo: form.cargo, nome: form.nome, fotoUrl: form.fotoUrl || undefined, email: form.email || undefined, telefone: form.telefone || undefined, bio: form.bio || undefined, ordem: Number(form.ordem) || 0 };
    try {
      if (form.id) await adminPut(`/api/admin/secretarias/autoridades/${form.id}`, body);
      else await adminPost(`/api/admin/secretarias/${orgaoId}/autoridades`, body);
      setForm({ ...autoridadeVazia }); carregar();
    } catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao salvar.'); }
  }
  async function remover(id: string) {
    try { await adminDelete(`/api/admin/secretarias/autoridades/${id}`); carregar(); }
    catch (e) { setErro(e instanceof AdminApiError ? e.message : 'Falha ao remover.'); }
  }

  return (
    <div className="rounded border border-primary/40 bg-primary/5 p-3">
      <h3 className="mb-2 text-sm font-semibold">Autoridades do Gabinete</h3>
      <p className="mb-2 text-xs text-fg/60">Prefeito, vice, primeira-dama e chefe de gabinete — aparecem em destaque no topo da Estrutura.</p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {lista.length > 0 && (
        <ul className="mb-3 space-y-1">
          {lista.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded bg-bg px-3 py-1.5 text-sm">
              <span><span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">{rotulo(a.cargo)}</span> <span className="font-semibold">{a.nome}</span></span>
              <span className="flex gap-2">
                <button type="button" className="text-primary hover:underline" onClick={() => editar(a)}>editar</button>
                <button type="button" className="text-danger hover:underline" onClick={() => remover(a.id)}>remover</button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div><label className={ui.label}>Cargo</label>
          <select className={ui.input} value={form.cargo} onChange={(e) => s('cargo', e.target.value)}>
            {CARGOS_AUTORIDADE.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </div>
        <div><label className={ui.label}>Nome *</label><input className={ui.input} value={form.nome} onChange={(e) => s('nome', e.target.value)} /></div>
        <div><label className={ui.label}>E-mail</label><input className={ui.input} value={form.email} onChange={(e) => s('email', e.target.value)} /></div>
        <div><label className={ui.label}>Telefone</label><input className={ui.input} value={form.telefone} onChange={(e) => s('telefone', e.target.value)} /></div>
        <div className="col-span-2"><label className={ui.label}>Mini-bio (aceita HTML)</label><textarea rows={2} className={ui.input} value={form.bio} onChange={(e) => s('bio', e.target.value)} /></div>
        <div className="col-span-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button type="button" className={ui.btnGhost} onClick={() => setPicker(true)}>{form.fotoUrl ? 'Foto ✓' : 'Foto…'}</button>
            {form.fotoUrl && <button type="button" className="text-xs text-danger hover:underline" onClick={() => s('fotoUrl', '')}>remover</button>}
          </div>
          <div className="flex gap-2">
            {form.id && <button type="button" className={ui.btnGhost} onClick={() => setForm({ ...autoridadeVazia })}>Cancelar</button>}
            <button type="button" className={ui.btn} onClick={salvar}>{form.id ? 'Salvar' : 'Adicionar'}</button>
          </div>
        </div>
      </div>
      <MediaPicker open={picker} onClose={() => setPicker(false)} tipo="imagem" onSelect={(a) => { if (a.urlPublica) s('fotoUrl', a.urlPublica); setPicker(false); }} />
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function SecretariasAdminPage() {
  const [secretarias, setSecretarias] = useState<Secretaria[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [msgOk, setMsgOk] = useState('');

  const [modalAberto, setModalAberto] = useState(false);
  const [editando, setEditando] = useState<Secretaria | null>(null);
  const [unidadesDe, setUnidadesDe] = useState<Secretaria | null>(null);

  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const data = await adminGet<Pagina<Secretaria>>(
        `/api/admin/secretarias${qs({ page, pageSize: PAGE_SIZE })}`,
      );
      setSecretarias(data.items);
      setTotal(data.total);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao carregar secretarias.');
    } finally {
      setCarregando(false);
    }
  }, [page]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function abrirNovo() {
    setEditando(null);
    setModalAberto(true);
  }

  function abrirEditar(s: Secretaria) {
    setEditando(s);
    setModalAberto(true);
  }

  async function excluir(id: string) {
    setExcluindo(true);
    setErro('');
    try {
      await adminDelete(`/api/admin/secretarias/${id}`);
      setMsgOk('Secretaria excluída com sucesso.');
      setConfirmandoId(null);
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Erro ao excluir secretaria.');
    } finally {
      setExcluindo(false);
    }
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <AdminHeader
        title="Secretarias"
        description="Gerencie as secretarias municipais exibidas no portal."
      >
        <button type="button" className={ui.btn} onClick={abrirNovo}>
          + Nova secretaria
        </button>
      </AdminHeader>

      {msgOk && <Aviso tipo="ok">{msgOk}</Aviso>}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}

      {/* Tabela */}
      {carregando ? (
        <p aria-live="polite" aria-busy="true" className="py-12 text-center text-sm text-fg/60">
          Carregando secretarias…
        </p>
      ) : secretarias.length === 0 ? (
        <p className="py-12 text-center text-sm text-fg/60">
          Nenhuma secretaria cadastrada. Clique em &ldquo;Nova secretaria&rdquo; para começar.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm" aria-label="Lista de secretarias">
            <thead>
              <tr>
                <th scope="col" className={ui.th}>
                  Ordem
                </th>
                <th scope="col" className={ui.th}>
                  Nome
                </th>
                <th scope="col" className={ui.th}>
                  Sigla
                </th>
                <th scope="col" className={ui.th}>
                  Responsável
                </th>
                <th scope="col" className={ui.th}>
                  Status
                </th>
                <th scope="col" className={ui.th}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {secretarias.map((s) => (
                <tr key={s.id}>
                  <td className={ui.td}>{s.ordem}</td>
                  <td className={ui.td}>
                    <span className="font-medium">{s.nome}</span>
                  </td>
                  <td className={ui.td}>
                    {s.sigla ? (
                      <span className={`${ui.badge} bg-muted text-fg`}>{s.sigla}</span>
                    ) : (
                      <span className="text-xs text-fg/40">—</span>
                    )}
                  </td>
                  <td className={ui.td}>{s.responsavel || <span className="text-fg/40">—</span>}</td>
                  <td className={ui.td}>
                    <span
                      className={`${ui.badge} ${
                        s.ativo
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-fg/60'
                      }`}
                    >
                      {s.ativo ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className={ui.td}>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => abrirEditar(s)}
                        aria-label={`Editar secretaria "${s.nome}"`}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={ui.btnGhost}
                        onClick={() => setUnidadesDe(s)}
                        aria-label={`Gerenciar unidades de "${s.nome}"`}
                      >
                        Unidades
                      </button>
                      {confirmandoId === s.id ? (
                        <>
                          <button
                            type="button"
                            className={ui.btnDanger}
                            onClick={() => excluir(s.id)}
                            disabled={excluindo}
                            aria-busy={excluindo}
                          >
                            {excluindo ? 'Excluindo…' : 'Confirmar exclusão'}
                          </button>
                          <button
                            type="button"
                            className={ui.btnGhost}
                            onClick={() => setConfirmandoId(null)}
                            disabled={excluindo}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className={ui.btnDanger}
                          onClick={() => setConfirmandoId(s.id)}
                          aria-label={`Excluir secretaria "${s.nome}"`}
                        >
                          Excluir
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação */}
      {totalPaginas > 1 && (
        <nav aria-label="Paginação de secretarias" className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className={ui.btnGhost}
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            aria-label="Página anterior"
          >
            ← Anterior
          </button>
          <span className="text-sm text-fg/70">
            Página {page} de {totalPaginas} ({total} registros)
          </span>
          <button
            type="button"
            className={ui.btnGhost}
            disabled={page >= totalPaginas}
            onClick={() => setPage((p) => p + 1)}
            aria-label="Próxima página"
          >
            Próxima →
          </button>
        </nav>
      )}

      {/* Modal criar / editar */}
      <ModalSecretaria
        open={modalAberto}
        editando={editando}
        onClose={() => setModalAberto(false)}
        onSalvo={() => {
          setMsgOk(
            editando ? 'Secretaria atualizada com sucesso.' : 'Secretaria criada com sucesso.',
          );
          carregar();
        }}
      />

      {/* Modal de unidades do órgão */}
      <ModalUnidades orgao={unidadesDe} onClose={() => setUnidadesDe(null)} />
    </div>
  );
}
