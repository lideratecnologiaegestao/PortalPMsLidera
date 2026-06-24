'use client';

/**
 * Painel administrativo do módulo Campanhas.
 *
 * Seções:
 *  - Aviso de ano eleitoral (§6 do CONTRATO-fase1.md)
 *  - Biblioteca de presets (GET /api/admin/campanhas/biblioteca)
 *  - Minhas campanhas (GET /api/admin/campanhas + ações CRUD)
 *  - Editor (Modal) com todas as capacidades do §2
 *
 * Convenções obrigatórias:
 *  - Cores via CSS variables (bg-primary, text-fg, etc.) — nunca cor fixa
 *  - Acessibilidade WCAG 2.1 AA: HTML semântico, foco visível, aria-live
 *  - Gotcha do Modal compartilhado: foco controlado só na abertura (não por campo)
 *  - Upload via API multipart — MediaPicker para seleção de imagens
 */

import { useCallback, useEffect, useState } from 'react';
import {
  adminGet,
  adminPost,
  adminPut,
  adminPatch,
  adminDelete,
  AdminApiError,
} from '../../../lib/admin-api';
import { AdminHeader, Aviso, Modal, ui } from '../_components/ui';
import MediaPicker from '../_components/MediaPicker';
import { useSessaoAdmin } from '../../../lib/session-context';

/* ------------------------------------------------------------------ */
/* Tipos                                                                */
/* ------------------------------------------------------------------ */

interface CampaignTemplate {
  id: string;
  key: string;
  nome: string;
  categoria: string;
  descricao: string | null;
  icone: string | null;
  configDefault: Record<string, unknown>;
  sugestao: Record<string, unknown>;
  prioridadeSugerida: number;
}

interface Campaign {
  id: string;
  templateKey: string | null;
  nome: string;
  status: 'draft' | 'scheduled' | 'active' | 'paused' | 'ended' | 'archived';
  startsAt: string | null;
  endsAt: string | null;
  prioridade: number;
  recorrencia: RecorrenciaConfig | null;
  config: CampanhaConfig;
}

/* ---------- sub-tipos de config ---------- */
interface TemaConfig {
  corPrimaria: string;
  corPrimariaFg?: string;
  corDestaque: string;
  corSecundaria?: string;
  aplicarEm?: 'todo' | 'home';
}
interface FaixaConfig {
  mensagem: string;
  link?: string;
  corBg: string;
  corTexto: string;
  dismissivel?: boolean;
}
interface BannerConfig {
  imagemUrl: string;
  alt: string;
  link?: string;
  posicao?: 'home_topo' | 'home_secao';
}
interface PopupConfig {
  titulo: string;
  subtitulo?: string;
  descricao: string;
  bullets?: string[];
  imagemUrl?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  frequencia?: 'sempre' | 'dia' | 'sessao';
  paginaAlvo?: string;
  reabrirAposDias?: number;
}
interface PaginaConfig {
  slug: string;
  autoDespublica?: boolean;
}
interface EfeitoConfig {
  nome: 'aedes-overlay' | 'copa-overlay';
  params: Record<string, unknown>;
  /** Escopo de página: ''/ausente = todas; '/' = só a home; '/rota' = exata/prefixo. */
  paginaAlvo?: string;
  /** Mostra ao visitante o botão "Parar efeito" (default true). */
  permitirParar?: boolean;
  /** Encerra o efeito após N segundos (0 = enquanto estiver na página). */
  duracaoSegundos?: number;
}
interface SeloConfig {
  texto: string;
  cor?: string;
  link?: string;
}
interface CampanhaConfig {
  tema?: TemaConfig;
  faixa?: FaixaConfig;
  banner?: BannerConfig;
  popup?: PopupConfig;
  pagina?: PaginaConfig;
  efeito?: EfeitoConfig;
  selo?: SeloConfig;
}

interface RecorrenciaConfig {
  tipo: 'none' | 'annual' | 'seasonal';
  inicio?: string;
  fim?: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<Campaign['status'], string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  active: 'Ativa',
  paused: 'Pausada',
  ended: 'Encerrada',
  archived: 'Arquivada',
};

const STATUS_BADGE_CLS: Record<Campaign['status'], string> = {
  draft: 'bg-muted text-fg/70',
  scheduled: 'bg-primary/10 text-primary',
  active: 'bg-success/20 text-success',
  paused: 'bg-warning/20 text-warning',
  ended: 'bg-muted text-fg/50',
  archived: 'bg-muted text-fg/40',
};

const CATEGORIA_LABEL: Record<string, string> = {
  saude: 'Saúde',
  civico: 'Cívico',
  sazonal: 'Sazonal',
  fiscal: 'Fiscal',
  ambiental: 'Ambiental',
  cultural: 'Cultural',
  administrativo: 'Administrativo',
};

function dtLocal(v: string | null) {
  return v ? String(v).slice(0, 16) : '';
}

function dtFmt(v: string | null) {
  if (!v) return '—';
  try {
    return new Date(v).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return v;
  }
}

/* ------------------------------------------------------------------ */
/* Estado inicial do editor                                             */
/* ------------------------------------------------------------------ */

const CONFIG_VAZIO: CampanhaConfig = {};

const FORM_VAZIO = {
  nome: '',
  startsAt: '',
  endsAt: '',
  prioridade: 100,
  recorrenciaTipo: 'none' as 'none' | 'annual' | 'seasonal',
  recorrenciaInicio: '',
  recorrenciaFim: '',
  // capacidades (toggles)
  tempoHabilitado: false,
  tema: { corPrimaria: '#1351b4', corPrimariaFg: '#ffffff', corDestaque: '#f0a830', corSecundaria: '', aplicarEm: 'todo' as 'todo' | 'home' },
  faixaHabilitada: false,
  faixa: { mensagem: '', link: '', corBg: '#1351b4', corTexto: '#ffffff', dismissivel: true },
  bannerHabilitado: false,
  banner: { imagemUrl: '', alt: '', link: '', posicao: 'home_topo' as 'home_topo' | 'home_secao' },
  popupHabilitado: false,
  popup: {
    titulo: '', subtitulo: '', descricao: '', bullets: [''],
    imagemUrl: '', ctaLabel: '', ctaUrl: '',
    frequencia: 'dia' as 'sempre' | 'dia' | 'sessao',
    paginaAlvo: '', reabrirAposDias: 7,
  },
  paginaHabilitada: false,
  pagina: { slug: '', autoDespublica: true },
  efeitoHabilitado: false,
  // Controles comuns do efeito (valem para qualquer efeito)
  efeitoPaginaAlvo: '' as string, // '' = todas; '/' = só home; '/rota' = específica
  efeitoPermitirParar: true,
  efeitoDuracaoSegundos: 0,
  efeito: {
    nome: 'aedes-overlay' as 'aedes-overlay' | 'copa-overlay',
    // aedes params
    aedesQtd: 6, aedesKills: 3, aedesLockScroll: true,
    aedesCorPrimaria: '#294961', aedesCorDestaque: '#16B6C4',
    aedesTitulo: 'Pegue a raquete e elimine os pernilongos', aedesSubtitulo: 'Campanha contra a dengue',
    aedesDescricao: '', aedesBullets: [''],
    aedesCtaLabel: 'Denunciar foco do mosquito', aedesCtaUrl: '#', aedesReobrirDias: 7,
    // copa params
    copaIntensidade: 'media' as 'leve' | 'media' | 'forte',
    copaFaixa: true, copaMensagem: 'Vai, Brasil!',
    copaBolas: true, copaBandeiras: true, copaConfete: true, copaFitas: true,
    copaBall: '', copaFlag: '',
  },
  seloHabilitado: false,
  selo: { texto: '', cor: '#1351b4', link: '' },
};

type FormState = typeof FORM_VAZIO;

/* ------------------------------------------------------------------ */
/* Componente principal                                                 */
/* ------------------------------------------------------------------ */

export default function CampanhasAdminPage() {
  const sessao = useSessaoAdmin();
  const isSuperAdmin = sessao.role === 'super_admin';

  /* estado global */
  const [biblioteca, setBiblioteca] = useState<CampaignTemplate[]>([]);
  const [campanhas, setCampanhas] = useState<Campaign[]>([]);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [carregando, setCarregando] = useState(true);

  /* estado do editor */
  const [modalAberto, setModalAberto] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({ ...FORM_VAZIO });
  const [salvando, setSalvando] = useState(false);
  const [erroModal, setErroModal] = useState('');

  /* MediaPicker */
  const [pickerAberto, setPickerAberto] = useState<'banner' | 'popup' | null>(null);

  /* semear */
  const [semeando, setSemeando] = useState(false);

  /* aba da biblioteca */
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('');

  /* ---------------------------------------------------------------- */
  /* Carga                                                              */
  /* ---------------------------------------------------------------- */

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [bib, camp] = await Promise.all([
        adminGet<CampaignTemplate[]>('/api/admin/campanhas/biblioteca'),
        adminGet<Campaign[]>('/api/admin/campanhas'),
      ]);
      setBiblioteca(bib);
      setCampanhas(camp);
      setErro('');
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao carregar campanhas.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  /* ---------------------------------------------------------------- */
  /* Semear biblioteca (super_admin)                                    */
  /* ---------------------------------------------------------------- */

  async function semear() {
    if (!confirm('Semear/atualizar a biblioteca global de presets? Esta ação sobrescreve os templates padrão.')) return;
    setSemeando(true);
    try {
      await adminPost('/api/admin/campanhas/_semear');
      setAviso('Biblioteca semeada com sucesso.');
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao semear.');
    } finally {
      setSemeando(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Instalar preset                                                    */
  /* ---------------------------------------------------------------- */

  async function instalar(templateKey: string) {
    try {
      const campanha = await adminPost<Campaign>('/api/admin/campanhas/instalar', { templateKey });
      setAviso(`Campanha "${campanha.nome}" criada como rascunho.`);
      carregar();
      abrirEditor(campanha);
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao instalar preset.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Abrir editor                                                       */
  /* ---------------------------------------------------------------- */

  function abrirNova() {
    setEditId(null);
    setForm({ ...FORM_VAZIO });
    setErroModal('');
    setModalAberto(true);
  }

  function abrirEditor(c: Campaign) {
    setEditId(c.id);
    const cfg = c.config ?? {};
    const rec = c.recorrencia ?? { tipo: 'none' };
    setForm({
      nome: c.nome,
      startsAt: dtLocal(c.startsAt),
      endsAt: dtLocal(c.endsAt),
      prioridade: c.prioridade ?? 100,
      recorrenciaTipo: (rec.tipo as 'none' | 'annual' | 'seasonal') ?? 'none',
      recorrenciaInicio: rec.inicio ?? '',
      recorrenciaFim: rec.fim ?? '',
      // tema
      tempoHabilitado: !!cfg.tema,
      tema: {
        corPrimaria: cfg.tema?.corPrimaria ?? '#1351b4',
        corPrimariaFg: cfg.tema?.corPrimariaFg ?? '#ffffff',
        corDestaque: cfg.tema?.corDestaque ?? '#f0a830',
        corSecundaria: cfg.tema?.corSecundaria ?? '',
        aplicarEm: cfg.tema?.aplicarEm ?? 'todo',
      },
      // faixa
      faixaHabilitada: !!cfg.faixa,
      faixa: {
        mensagem: cfg.faixa?.mensagem ?? '',
        link: cfg.faixa?.link ?? '',
        corBg: cfg.faixa?.corBg ?? '#1351b4',
        corTexto: cfg.faixa?.corTexto ?? '#ffffff',
        dismissivel: cfg.faixa?.dismissivel !== false,
      },
      // banner
      bannerHabilitado: !!cfg.banner,
      banner: {
        imagemUrl: cfg.banner?.imagemUrl ?? '',
        alt: cfg.banner?.alt ?? '',
        link: cfg.banner?.link ?? '',
        posicao: cfg.banner?.posicao ?? 'home_topo',
      },
      // popup
      popupHabilitado: !!cfg.popup,
      popup: {
        titulo: cfg.popup?.titulo ?? '',
        subtitulo: cfg.popup?.subtitulo ?? '',
        descricao: cfg.popup?.descricao ?? '',
        bullets: cfg.popup?.bullets?.length ? cfg.popup.bullets : [''],
        imagemUrl: cfg.popup?.imagemUrl ?? '',
        ctaLabel: cfg.popup?.ctaLabel ?? '',
        ctaUrl: cfg.popup?.ctaUrl ?? '',
        frequencia: cfg.popup?.frequencia ?? 'dia',
        paginaAlvo: cfg.popup?.paginaAlvo ?? '',
        reabrirAposDias: cfg.popup?.reabrirAposDias ?? 7,
      },
      // pagina
      paginaHabilitada: !!cfg.pagina,
      pagina: {
        slug: cfg.pagina?.slug ?? '',
        autoDespublica: cfg.pagina?.autoDespublica !== false,
      },
      // efeito
      efeitoHabilitado: !!cfg.efeito,
      efeitoPaginaAlvo: (cfg.efeito?.paginaAlvo as string) ?? '',
      efeitoPermitirParar: cfg.efeito?.permitirParar !== false,
      efeitoDuracaoSegundos: (cfg.efeito?.duracaoSegundos as number) ?? 0,
      efeito: {
        nome: (cfg.efeito?.nome as 'aedes-overlay' | 'copa-overlay') ?? 'aedes-overlay',
        aedesQtd: (cfg.efeito?.params as Record<string, unknown>)?.quantidadeMosquitos as number ?? 6,
        aedesKills: (cfg.efeito?.params as Record<string, unknown>)?.kills as number ?? 3,
        aedesLockScroll: (cfg.efeito?.params as Record<string, unknown>)?.lockScroll !== false,
        aedesCorPrimaria: (cfg.efeito?.params as Record<string, unknown>)?.corPrimaria as string ?? '#294961',
        aedesCorDestaque: (cfg.efeito?.params as Record<string, unknown>)?.corDestaque as string ?? '#f0a830',
        aedesTitulo: (cfg.efeito?.params as Record<string, unknown>)?.titulo as string ?? 'Combate ao Aedes aegypti',
        aedesSubtitulo: (cfg.efeito?.params as Record<string, unknown>)?.subtitulo as string ?? '10 minutos contra a dengue',
        aedesDescricao: (cfg.efeito?.params as Record<string, unknown>)?.descricao as string ?? '',
        aedesBullets: ((cfg.efeito?.params as Record<string, unknown>)?.bullets as string[]) ?? [''],
        aedesCtaLabel: (cfg.efeito?.params as Record<string, unknown>)?.ctaLabel as string ?? 'Denunciar foco do mosquito',
        aedesCtaUrl: (cfg.efeito?.params as Record<string, unknown>)?.ctaUrl as string ?? '#',
        aedesReobrirDias: (cfg.efeito?.params as Record<string, unknown>)?.reabrirAposDias as number ?? 7,
        copaIntensidade: ((cfg.efeito?.params as Record<string, unknown>)?.intensidade as 'leve' | 'media' | 'forte') ?? 'media',
        copaFaixa: (cfg.efeito?.params as Record<string, unknown>)?.faixa !== false,
        copaMensagem: (cfg.efeito?.params as Record<string, unknown>)?.mensagem as string ?? 'Vai, Brasil!',
        copaBolas: (cfg.efeito?.params as Record<string, unknown>)?.bolas !== false,
        copaBandeiras: (cfg.efeito?.params as Record<string, unknown>)?.bandeiras !== false,
        copaConfete: (cfg.efeito?.params as Record<string, unknown>)?.confete !== false,
        copaFitas: (cfg.efeito?.params as Record<string, unknown>)?.fitas !== false,
        copaBall: (cfg.efeito?.params as Record<string, unknown>)?.ball as string ?? '',
        copaFlag: (cfg.efeito?.params as Record<string, unknown>)?.flag as string ?? '',
      },
      // selo
      seloHabilitado: !!cfg.selo,
      selo: {
        texto: cfg.selo?.texto ?? '',
        cor: cfg.selo?.cor ?? '#1351b4',
        link: cfg.selo?.link ?? '',
      },
    });
    setErroModal('');
    setModalAberto(true);
  }

  /* ---------------------------------------------------------------- */
  /* Montar config para salvar                                          */
  /* ---------------------------------------------------------------- */

  function montarConfig(f: FormState): CampanhaConfig {
    const config: CampanhaConfig = {};

    if (f.tempoHabilitado) {
      config.tema = {
        corPrimaria: f.tema.corPrimaria,
        corDestaque: f.tema.corDestaque,
        ...(f.tema.corPrimariaFg ? { corPrimariaFg: f.tema.corPrimariaFg } : {}),
        ...(f.tema.corSecundaria ? { corSecundaria: f.tema.corSecundaria } : {}),
        aplicarEm: f.tema.aplicarEm,
      };
    }
    if (f.faixaHabilitada && f.faixa.mensagem.trim()) {
      config.faixa = {
        mensagem: f.faixa.mensagem.trim(),
        corBg: f.faixa.corBg,
        corTexto: f.faixa.corTexto,
        dismissivel: f.faixa.dismissivel,
        ...(f.faixa.link ? { link: f.faixa.link } : {}),
      };
    }
    if (f.bannerHabilitado && f.banner.imagemUrl) {
      config.banner = {
        imagemUrl: f.banner.imagemUrl,
        alt: f.banner.alt,
        posicao: f.banner.posicao,
        ...(f.banner.link ? { link: f.banner.link } : {}),
      };
    }
    if (f.popupHabilitado && f.popup.titulo.trim()) {
      config.popup = {
        titulo: f.popup.titulo.trim(),
        descricao: f.popup.descricao,
        frequencia: f.popup.frequencia,
        reabrirAposDias: Number(f.popup.reabrirAposDias) || 7,
        ...(f.popup.subtitulo ? { subtitulo: f.popup.subtitulo } : {}),
        ...(f.popup.bullets.filter(Boolean).length ? { bullets: f.popup.bullets.filter(Boolean) } : {}),
        ...(f.popup.imagemUrl ? { imagemUrl: f.popup.imagemUrl } : {}),
        ...(f.popup.ctaLabel ? { ctaLabel: f.popup.ctaLabel } : {}),
        ...(f.popup.ctaUrl ? { ctaUrl: f.popup.ctaUrl } : {}),
        ...(f.popup.paginaAlvo ? { paginaAlvo: f.popup.paginaAlvo } : {}),
      };
    }
    if (f.paginaHabilitada && f.pagina.slug.trim()) {
      config.pagina = { slug: f.pagina.slug.trim(), autoDespublica: f.pagina.autoDespublica };
    }
    if (f.efeitoHabilitado) {
      if (f.efeito.nome === 'aedes-overlay') {
        config.efeito = {
          nome: 'aedes-overlay',
          params: {
            quantidadeMosquitos: Number(f.efeito.aedesQtd) || 6,
            kills: Number(f.efeito.aedesKills) || 3,
            lockScroll: f.efeito.aedesLockScroll,
            corPrimaria: f.efeito.aedesCorPrimaria,
            corDestaque: f.efeito.aedesCorDestaque,
            titulo: f.efeito.aedesTitulo,
            subtitulo: f.efeito.aedesSubtitulo,
            descricao: f.efeito.aedesDescricao,
            bullets: f.efeito.aedesBullets.filter(Boolean),
            ctaLabel: f.efeito.aedesCtaLabel,
            ctaUrl: f.efeito.aedesCtaUrl,
            reabrirAposDias: Number(f.efeito.aedesReobrirDias) || 7,
          },
        };
      } else {
        config.efeito = {
          nome: 'copa-overlay',
          params: {
            intensidade: f.efeito.copaIntensidade,
            faixa: f.efeito.copaFaixa,
            mensagem: f.efeito.copaMensagem,
            bolas: f.efeito.copaBolas,
            bandeiras: f.efeito.copaBandeiras,
            confete: f.efeito.copaConfete,
            fitas: f.efeito.copaFitas,
            ...(f.efeito.copaBall ? { ball: f.efeito.copaBall } : {}),
            ...(f.efeito.copaFlag ? { flag: f.efeito.copaFlag } : {}),
          },
        };
      }
      // Controles comuns do efeito (escopo de página / parar / duração)
      if (config.efeito) {
        if (f.efeitoPaginaAlvo) config.efeito.paginaAlvo = f.efeitoPaginaAlvo;
        config.efeito.permitirParar = f.efeitoPermitirParar;
        const dur = Number(f.efeitoDuracaoSegundos) || 0;
        if (dur > 0) config.efeito.duracaoSegundos = dur;
      }
    }
    if (f.seloHabilitado && f.selo.texto.trim()) {
      config.selo = {
        texto: f.selo.texto.trim(),
        ...(f.selo.cor ? { cor: f.selo.cor } : {}),
        ...(f.selo.link ? { link: f.selo.link } : {}),
      };
    }

    return config;
  }

  /* ---------------------------------------------------------------- */
  /* Salvar (criar ou editar)                                           */
  /* ---------------------------------------------------------------- */

  async function salvar() {
    setErroModal('');
    if (!form.nome.trim()) { setErroModal('Informe o nome da campanha.'); return; }

    const config = montarConfig(form);
    const recorrencia: RecorrenciaConfig = form.recorrenciaTipo === 'none'
      ? { tipo: 'none' }
      : form.recorrenciaTipo === 'annual'
        ? { tipo: 'annual' }
        : { tipo: 'seasonal', inicio: form.recorrenciaInicio, fim: form.recorrenciaFim };

    const body = {
      nome: form.nome.trim(),
      startsAt: form.startsAt || null,
      endsAt: form.endsAt || null,
      prioridade: Number(form.prioridade) || 100,
      config,
      recorrencia,
    };

    setSalvando(true);
    try {
      if (editId) {
        await adminPut(`/api/admin/campanhas/${editId}`, body);
      } else {
        await adminPost('/api/admin/campanhas', body);
      }
      setModalAberto(false);
      setAviso('Campanha salva com sucesso.');
      carregar();
    } catch (e) {
      setErroModal(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Toggle de status                                                   */
  /* ---------------------------------------------------------------- */

  async function toggleStatus(c: Campaign) {
    const novoStatus = c.status === 'active' ? 'paused' : 'active';
    try {
      await adminPatch(`/api/admin/campanhas/${c.id}/status`, { status: novoStatus });
      setAviso(`Campanha "${c.nome}" ${novoStatus === 'active' ? 'ativada' : 'pausada'}.`);
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao alterar status.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Excluir                                                            */
  /* ---------------------------------------------------------------- */

  async function excluir(c: Campaign) {
    if (!confirm(`Excluir a campanha "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await adminDelete(`/api/admin/campanhas/${c.id}`);
      setAviso('Campanha excluída.');
      carregar();
    } catch (e) {
      setErro(e instanceof AdminApiError ? e.message : 'Falha ao excluir.');
    }
  }

  /* ---------------------------------------------------------------- */
  /* Helper set de campos do form                                       */
  /* ---------------------------------------------------------------- */

  function sf<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }
  function sfObj<K extends keyof FormState>(k: K, sub: Partial<FormState[K]>) {
    setForm((p) => ({ ...p, [k]: { ...(p[k] as object), ...(sub as object) } }));
  }

  /* ---------------------------------------------------------------- */
  /* Ano eleitoral (Lei 9.504/97)                                       */
  /* ---------------------------------------------------------------- */
  const anoAtual = new Date().getFullYear();
  // Eleições municipais: anos pares; federais: anos pares também — todos os anos pares têm vedações
  const eAnoEleitoral = anoAtual % 2 === 0;

  /* ---------------------------------------------------------------- */
  /* Categorias disponíveis na biblioteca                              */
  /* ---------------------------------------------------------------- */
  const categorias = Array.from(new Set(biblioteca.map((t) => t.categoria)));
  const bibliotecaFiltrada = categoriaFiltro
    ? biblioteca.filter((t) => t.categoria === categoriaFiltro)
    : biblioteca;

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */

  return (
    <div>
      <AdminHeader
        title="Campanhas"
        description="Gerencie campanhas sazonais, temáticas e cívicas exibidas no portal: banners, popups, temas, faixas e efeitos especiais."
      >
        <button className={ui.btn} onClick={abrirNova}>
          Nova campanha
        </button>
        {isSuperAdmin && (
          <button
            className={ui.btnGhost}
            onClick={semear}
            disabled={semeando}
            title="Atualiza a biblioteca global de presets (apenas super_admin)"
          >
            {semeando ? 'Semeando…' : 'Semear biblioteca'}
          </button>
        )}
      </AdminHeader>

      {/* Aviso de ano eleitoral §6 */}
      {eAnoEleitoral && (
        <div
          role="note"
          aria-label="Aviso de ano eleitoral"
          className="mb-4 rounded border border-warning bg-warning/10 p-4 text-sm"
        >
          <p className="font-semibold text-fg">
            Ano eleitoral — atenção às vedações da Lei 9.504/97
          </p>
          <p className="mt-1 text-fg/80">
            Em {anoAtual}, a Lei das Eleições proíbe propaganda institucional de atos,
            programas, obras, serviços e campanhas dos órgãos públicos durante os 3 meses
            anteriores ao pleito, salvo nos casos autorizados em lei (art. 73).
            Recomenda-se pausar ou agendar campanhas fora do período vedado e consultar
            o jurídico do município. <strong>Este sistema não garante conformidade
            eleitoral — a responsabilidade é do gestor e do órgão público.</strong>
          </p>
        </div>
      )}

      {/* Mensagens globais */}
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {aviso && <Aviso tipo="ok">{aviso}</Aviso>}

      {/* ============================================================ */}
      {/* SEÇÃO 1: Biblioteca de presets                               */}
      {/* ============================================================ */}
      <section aria-labelledby="sec-biblioteca" className="mb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="sec-biblioteca" className="font-heading text-lg font-bold">
            Biblioteca de presets
          </h2>
          {/* Filtro por categoria */}
          {categorias.length > 0 && (
            <div className="flex items-center gap-2">
              <label htmlFor="filtro-categoria" className="text-sm font-medium">
                Categoria:
              </label>
              <select
                id="filtro-categoria"
                className="rounded border border-border bg-bg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value)}
              >
                <option value="">Todas</option>
                {categorias.map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORIA_LABEL[cat] ?? cat}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {carregando ? (
          <p className="text-sm text-fg/60" aria-live="polite">Carregando biblioteca…</p>
        ) : biblioteca.length === 0 ? (
          <p className="text-sm text-fg/60">
            Nenhum preset disponível.{isSuperAdmin && ' Use "Semear biblioteca" para popular os presets padrão.'}
          </p>
        ) : (
          <ul
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Presets de campanhas disponíveis"
          >
            {bibliotecaFiltrada.map((t) => (
              <li key={t.id} className={`${ui.card} p-4 flex flex-col gap-2`}>
                <div className="flex items-start gap-3">
                  {t.icone && (
                    <span className="text-2xl" aria-hidden="true">{t.icone}</span>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{t.nome}</p>
                    <p className="text-xs text-fg/60 mt-0.5">
                      {CATEGORIA_LABEL[t.categoria] ?? t.categoria}
                    </p>
                  </div>
                </div>
                {t.descricao && (
                  <p className="text-xs text-fg/70">{t.descricao}</p>
                )}
                <div className="mt-auto pt-2">
                  <button
                    className={ui.btn}
                    onClick={() => instalar(t.key)}
                    aria-label={`Instalar preset "${t.nome}"`}
                  >
                    Usar / Instalar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ============================================================ */}
      {/* SEÇÃO 2: Minhas campanhas                                     */}
      {/* ============================================================ */}
      <section aria-labelledby="sec-campanhas">
        <h2 id="sec-campanhas" className="mb-3 font-heading text-lg font-bold">
          Minhas campanhas
        </h2>

        {carregando ? (
          <p className="text-sm text-fg/60" aria-live="polite">Carregando campanhas…</p>
        ) : campanhas.length === 0 ? (
          <p className="text-sm text-fg/60">
            Nenhuma campanha cadastrada. Instale um preset ou crie uma campanha personalizada.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" aria-label="Tabela de campanhas do tenant">
              <thead>
                <tr>
                  <th className={ui.th}>Nome</th>
                  <th className={ui.th}>Status</th>
                  <th className={ui.th}>Período</th>
                  <th className={ui.th}>Prioridade</th>
                  <th className={ui.th}>Capacidades</th>
                  <th className={`${ui.th} text-right`}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => {
                  const caps = Object.keys(c.config ?? {});
                  return (
                    <tr key={c.id}>
                      <td className={ui.td}>
                        <span className="font-medium">{c.nome}</span>
                        {c.templateKey && (
                          <span className="ml-1 text-xs text-fg/50">({c.templateKey})</span>
                        )}
                      </td>
                      <td className={ui.td}>
                        <span className={`${ui.badge} ${STATUS_BADGE_CLS[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className={ui.td}>
                        <span className="whitespace-nowrap">
                          {dtFmt(c.startsAt)} — {dtFmt(c.endsAt)}
                        </span>
                      </td>
                      <td className={ui.td}>{c.prioridade}</td>
                      <td className={ui.td}>
                        {caps.length > 0 ? (
                          <span className="text-xs text-fg/70">{caps.join(', ')}</span>
                        ) : (
                          <span className="text-xs text-fg/40">—</span>
                        )}
                      </td>
                      <td className={`${ui.td} text-right`}>
                        <div className="flex justify-end gap-2 flex-wrap">
                          {/* Ligar/Desligar */}
                          {(c.status === 'active' || c.status === 'paused' || c.status === 'draft' || c.status === 'scheduled') && (
                            <button
                              className="text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                              onClick={() => toggleStatus(c)}
                              aria-label={c.status === 'active' ? `Pausar campanha "${c.nome}"` : `Ativar campanha "${c.nome}"`}
                            >
                              {c.status === 'active' ? 'Desligar' : 'Ligar'}
                            </button>
                          )}
                          <button
                            className="text-xs font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            onClick={() => abrirEditor(c)}
                            aria-label={`Editar campanha "${c.nome}"`}
                          >
                            Editar
                          </button>
                          <button
                            className="text-xs font-medium text-danger hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
                            onClick={() => excluir(c)}
                            aria-label={`Excluir campanha "${c.nome}"`}
                          >
                            Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ============================================================ */}
      {/* EDITOR (Modal)                                                */}
      {/* ============================================================ */}
      <Modal
        open={modalAberto}
        onClose={() => setModalAberto(false)}
        title={editId ? 'Editar campanha' : 'Nova campanha'}
      >
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">

          {/* --- Dados básicos --- */}
          <fieldset className="space-y-3">
            <legend className="font-semibold text-sm mb-2">Dados básicos</legend>

            <div>
              <label htmlFor="camp-nome" className={ui.label}>
                Nome da campanha <span aria-hidden="true" className="text-danger">*</span>
              </label>
              <input
                id="camp-nome"
                className={ui.input}
                value={form.nome}
                onChange={(e) => sf('nome', e.target.value)}
                placeholder="Ex.: Dengue Zero 2026"
                required
                aria-required="true"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="camp-inicio" className={ui.label}>Início</label>
                <input
                  id="camp-inicio"
                  type="datetime-local"
                  className={ui.input}
                  value={form.startsAt}
                  onChange={(e) => sf('startsAt', e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="camp-fim" className={ui.label}>Fim</label>
                <input
                  id="camp-fim"
                  type="datetime-local"
                  className={ui.input}
                  value={form.endsAt}
                  onChange={(e) => sf('endsAt', e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="camp-prioridade" className={ui.label}>
                  Prioridade
                </label>
                <input
                  id="camp-prioridade"
                  type="number"
                  min={1}
                  max={9999}
                  className={ui.input}
                  value={form.prioridade}
                  onChange={(e) => sf('prioridade', Number(e.target.value))}
                />
                <p className="mt-1 text-xs text-fg/60">Maior número = maior precedência em conflito.</p>
              </div>
              <div>
                <label htmlFor="camp-recorrencia" className={ui.label}>Recorrência</label>
                <select
                  id="camp-recorrencia"
                  className={ui.input}
                  value={form.recorrenciaTipo}
                  onChange={(e) => sf('recorrenciaTipo', e.target.value as 'none' | 'annual' | 'seasonal')}
                >
                  <option value="none">Sem recorrência</option>
                  <option value="annual">Anual</option>
                  <option value="seasonal">Sazonal (MM-DD)</option>
                </select>
              </div>
            </div>

            {form.recorrenciaTipo === 'seasonal' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="camp-rec-inicio" className={ui.label}>Início sazonal (MM-DD)</label>
                  <input
                    id="camp-rec-inicio"
                    type="text"
                    className={ui.input}
                    value={form.recorrenciaInicio}
                    onChange={(e) => sf('recorrenciaInicio', e.target.value)}
                    placeholder="Ex.: 10-01"
                    pattern="\d{2}-\d{2}"
                  />
                </div>
                <div>
                  <label htmlFor="camp-rec-fim" className={ui.label}>Fim sazonal (MM-DD)</label>
                  <input
                    id="camp-rec-fim"
                    type="text"
                    className={ui.input}
                    value={form.recorrenciaFim}
                    onChange={(e) => sf('recorrenciaFim', e.target.value)}
                    placeholder="Ex.: 10-31"
                    pattern="\d{2}-\d{2}"
                  />
                </div>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Tema                                          */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-tema"
                checked={form.tempoHabilitado}
                onChange={(e) => sf('tempoHabilitado', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-tema" className="cursor-pointer select-none">
                  Tema de cores
                </label>
              </legend>
            </div>
            {form.tempoHabilitado && (
              <div className="ml-7 space-y-3">
                <Aviso tipo="ok">
                  O backend valida o contraste WCAG AA ao salvar. Se as cores reprovarem,
                  o erro aparecerá abaixo. Ajuste as cores até passar.
                </Aviso>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="tema-cor-primaria" className={ui.label}>Cor primária</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.tema.corPrimaria} onChange={(e) => sfObj('tema', { corPrimaria: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor primária" />
                      <input id="tema-cor-primaria" className={`${ui.input} font-mono`} value={form.tema.corPrimaria} onChange={(e) => sfObj('tema', { corPrimaria: e.target.value })} placeholder="#1351b4" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="tema-cor-primaria-fg" className={ui.label}>Cor texto sobre primária</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.tema.corPrimariaFg} onChange={(e) => sfObj('tema', { corPrimariaFg: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor do texto sobre primária" />
                      <input id="tema-cor-primaria-fg" className={`${ui.input} font-mono`} value={form.tema.corPrimariaFg} onChange={(e) => sfObj('tema', { corPrimariaFg: e.target.value })} placeholder="#ffffff" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="tema-cor-destaque" className={ui.label}>Cor de destaque</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.tema.corDestaque} onChange={(e) => sfObj('tema', { corDestaque: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor de destaque" />
                      <input id="tema-cor-destaque" className={`${ui.input} font-mono`} value={form.tema.corDestaque} onChange={(e) => sfObj('tema', { corDestaque: e.target.value })} placeholder="#f0a830" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="tema-cor-secundaria" className={ui.label}>Cor secundária (opcional)</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.tema.corSecundaria || '#cccccc'} onChange={(e) => sfObj('tema', { corSecundaria: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor secundária" />
                      <input id="tema-cor-secundaria" className={`${ui.input} font-mono`} value={form.tema.corSecundaria} onChange={(e) => sfObj('tema', { corSecundaria: e.target.value })} placeholder="#... (opcional)" />
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="tema-aplicar-em" className={ui.label}>Aplicar em</label>
                  <select id="tema-aplicar-em" className={ui.input} value={form.tema.aplicarEm} onChange={(e) => sfObj('tema', { aplicarEm: e.target.value as 'todo' | 'home' })}>
                    <option value="todo">Todo o portal</option>
                    <option value="home">Apenas a home</option>
                  </select>
                </div>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Faixa                                         */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-faixa"
                checked={form.faixaHabilitada}
                onChange={(e) => sf('faixaHabilitada', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-faixa" className="cursor-pointer select-none">
                  Faixa (ribbon) no topo
                </label>
              </legend>
            </div>
            {form.faixaHabilitada && (
              <div className="ml-7 space-y-3">
                <div>
                  <label htmlFor="faixa-mensagem" className={ui.label}>
                    Mensagem <span aria-hidden="true" className="text-danger">*</span>
                  </label>
                  <input id="faixa-mensagem" className={ui.input} value={form.faixa.mensagem} onChange={(e) => sfObj('faixa', { mensagem: e.target.value })} placeholder="Ex.: Campanha de vacinação — saiba mais" />
                </div>
                <div>
                  <label htmlFor="faixa-link" className={ui.label}>Link (opcional)</label>
                  <input id="faixa-link" className={ui.input} value={form.faixa.link} onChange={(e) => sfObj('faixa', { link: e.target.value })} placeholder="https://... ou /rota" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="faixa-cor-bg" className={ui.label}>Cor de fundo</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.faixa.corBg} onChange={(e) => sfObj('faixa', { corBg: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor de fundo da faixa" />
                      <input id="faixa-cor-bg" className={`${ui.input} font-mono`} value={form.faixa.corBg} onChange={(e) => sfObj('faixa', { corBg: e.target.value })} placeholder="#1351b4" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="faixa-cor-texto" className={ui.label}>Cor do texto</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.faixa.corTexto} onChange={(e) => sfObj('faixa', { corTexto: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor do texto da faixa" />
                      <input id="faixa-cor-texto" className={`${ui.input} font-mono`} value={form.faixa.corTexto} onChange={(e) => sfObj('faixa', { corTexto: e.target.value })} placeholder="#ffffff" />
                    </div>
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.faixa.dismissivel} onChange={(e) => sfObj('faixa', { dismissivel: e.target.checked })} className="h-4 w-4 rounded border-border" />
                  Permitir fechar (dismissível)
                </label>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Banner                                        */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-banner"
                checked={form.bannerHabilitado}
                onChange={(e) => sf('bannerHabilitado', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-banner" className="cursor-pointer select-none">
                  Banner de imagem
                </label>
              </legend>
            </div>
            {form.bannerHabilitado && (
              <div className="ml-7 space-y-3">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className={ui.btnGhost}
                    onClick={() => setPickerAberto('banner')}
                  >
                    Selecionar imagem…
                  </button>
                  {form.banner.imagemUrl ? (
                    <span className="text-sm text-fg/70 truncate max-w-xs">{form.banner.imagemUrl}</span>
                  ) : (
                    <span className="text-sm text-fg/50">Nenhuma imagem selecionada</span>
                  )}
                </div>
                <div>
                  <label htmlFor="banner-alt" className={ui.label}>
                    Texto alternativo (alt) <span aria-hidden="true" className="text-danger">*</span>
                  </label>
                  <input
                    id="banner-alt"
                    className={ui.input}
                    value={form.banner.alt}
                    onChange={(e) => sfObj('banner', { alt: e.target.value })}
                    placeholder="Descrição acessível da imagem (obrigatório)"
                    required
                    aria-required="true"
                    aria-describedby="banner-alt-hint"
                  />
                  <p id="banner-alt-hint" className="mt-1 text-xs text-fg/60">
                    Descreva o conteúdo da imagem para leitores de tela. Campo obrigatório por acessibilidade.
                  </p>
                </div>
                <div>
                  <label htmlFor="banner-link" className={ui.label}>Link ao clicar (opcional)</label>
                  <input id="banner-link" className={ui.input} value={form.banner.link} onChange={(e) => sfObj('banner', { link: e.target.value })} placeholder="https://... ou /rota" />
                </div>
                <div>
                  <label htmlFor="banner-posicao" className={ui.label}>Posição</label>
                  <select id="banner-posicao" className={ui.input} value={form.banner.posicao} onChange={(e) => sfObj('banner', { posicao: e.target.value as 'home_topo' | 'home_secao' })}>
                    <option value="home_topo">Topo da home</option>
                    <option value="home_secao">Seção da home</option>
                  </select>
                </div>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Popup                                         */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-popup"
                checked={form.popupHabilitado}
                onChange={(e) => sf('popupHabilitado', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-popup" className="cursor-pointer select-none">
                  Pop-up modal
                </label>
              </legend>
            </div>
            {form.popupHabilitado && (
              <div className="ml-7 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="popup-titulo" className={ui.label}>
                      Título <span aria-hidden="true" className="text-danger">*</span>
                    </label>
                    <input id="popup-titulo" className={ui.input} value={form.popup.titulo} onChange={(e) => sfObj('popup', { titulo: e.target.value })} placeholder="Ex.: Vacinação Gratuita" />
                  </div>
                  <div>
                    <label htmlFor="popup-subtitulo" className={ui.label}>Subtítulo (opcional)</label>
                    <input id="popup-subtitulo" className={ui.input} value={form.popup.subtitulo} onChange={(e) => sfObj('popup', { subtitulo: e.target.value })} placeholder="Texto de apoio" />
                  </div>
                </div>
                <div>
                  <label htmlFor="popup-descricao" className={ui.label}>Descrição</label>
                  <textarea id="popup-descricao" className={`${ui.input} min-h-[80px]`} value={form.popup.descricao} onChange={(e) => sfObj('popup', { descricao: e.target.value })} placeholder="Texto principal do popup" />
                </div>
                <div>
                  <label className={ui.label}>Bullets (máx. 6)</label>
                  <div className="space-y-2">
                    {form.popup.bullets.map((b, i) => (
                      <div key={i} className="flex gap-2">
                        <input
                          className={ui.input}
                          value={b}
                          onChange={(ev) => sfObj('popup', { bullets: form.popup.bullets.map((x, j) => j === i ? ev.target.value : x) })}
                          placeholder={`Item ${i + 1}`}
                          aria-label={`Bullet ${i + 1}`}
                        />
                        {form.popup.bullets.length > 1 && (
                          <button
                            type="button"
                            className="text-sm text-danger hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-danger"
                            onClick={() => sfObj('popup', { bullets: form.popup.bullets.filter((_, j) => j !== i) })}
                            aria-label={`Remover bullet ${i + 1}`}
                          >
                            remover
                          </button>
                        )}
                      </div>
                    ))}
                    {form.popup.bullets.length < 6 && (
                      <button
                        type="button"
                        className="text-sm text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                        onClick={() => sfObj('popup', { bullets: [...form.popup.bullets, ''] })}
                      >
                        + adicionar bullet
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className={ui.btnGhost} onClick={() => setPickerAberto('popup')}>
                    Selecionar imagem (opcional)…
                  </button>
                  {form.popup.imagemUrl && (
                    <span className="text-sm text-fg/70 truncate max-w-xs">{form.popup.imagemUrl}</span>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="popup-cta-label" className={ui.label}>Rótulo do botão (CTA)</label>
                    <input id="popup-cta-label" className={ui.input} value={form.popup.ctaLabel} onChange={(e) => sfObj('popup', { ctaLabel: e.target.value })} placeholder="Ex.: Saiba mais" />
                  </div>
                  <div>
                    <label htmlFor="popup-cta-url" className={ui.label}>URL do botão (CTA)</label>
                    <input id="popup-cta-url" className={ui.input} value={form.popup.ctaUrl} onChange={(e) => sfObj('popup', { ctaUrl: e.target.value })} placeholder="https://... ou /rota" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label htmlFor="popup-frequencia" className={ui.label}>Frequência</label>
                    <select id="popup-frequencia" className={ui.input} value={form.popup.frequencia} onChange={(e) => sfObj('popup', { frequencia: e.target.value as 'sempre' | 'dia' | 'sessao' })}>
                      <option value="sempre">Sempre</option>
                      <option value="dia">Uma vez por dia</option>
                      <option value="sessao">Uma vez por sessão</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="popup-reabrir" className={ui.label}>Reabrir após (dias)</label>
                    <input id="popup-reabrir" type="number" min={0} className={ui.input} value={form.popup.reabrirAposDias} onChange={(e) => sfObj('popup', { reabrirAposDias: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label htmlFor="popup-pagina" className={ui.label}>Página alvo (opcional)</label>
                    <input id="popup-pagina" className={ui.input} value={form.popup.paginaAlvo} onChange={(e) => sfObj('popup', { paginaAlvo: e.target.value })} placeholder="/ ou /servicos" />
                  </div>
                </div>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Página de campanha                            */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-pagina"
                checked={form.paginaHabilitada}
                onChange={(e) => sf('paginaHabilitada', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-pagina" className="cursor-pointer select-none">
                  Página de campanha (CMS)
                </label>
              </legend>
            </div>
            {form.paginaHabilitada && (
              <div className="ml-7 space-y-3">
                <div>
                  <label htmlFor="pagina-slug" className={ui.label}>Slug da página</label>
                  <input id="pagina-slug" className={ui.input} value={form.pagina.slug} onChange={(e) => sfObj('pagina', { slug: e.target.value })} placeholder="Ex.: outubro-rosa-2026" />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.pagina.autoDespublica} onChange={(e) => sfObj('pagina', { autoDespublica: e.target.checked })} className="h-4 w-4 rounded border-border" />
                  Auto-despublicar ao fim da campanha (Fase 2)
                </label>
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Efeito interativo                             */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-efeito"
                checked={form.efeitoHabilitado}
                onChange={(e) => sf('efeitoHabilitado', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-efeito" className="cursor-pointer select-none">
                  Efeito interativo
                </label>
              </legend>
            </div>
            {form.efeitoHabilitado && (
              <div className="ml-7 space-y-3">
                <div>
                  <label htmlFor="efeito-nome" className={ui.label}>Tipo de efeito</label>
                  <select
                    id="efeito-nome"
                    className={ui.input}
                    value={form.efeito.nome}
                    onChange={(e) => sfObj('efeito', { nome: e.target.value as 'aedes-overlay' | 'copa-overlay' })}
                  >
                    <option value="aedes-overlay">Combate ao Aedes aegypti</option>
                    <option value="copa-overlay">Copa / Evento festivo</option>
                  </select>
                </div>

                {/* Comportamento do efeito — vale para qualquer efeito */}
                <div className="space-y-3 rounded border border-border p-3">
                  <p className="text-xs font-semibold text-fg/60 uppercase tracking-wide">Comportamento do efeito</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="efeito-escopo" className={ui.label}>Onde exibir</label>
                      <select
                        id="efeito-escopo"
                        className={ui.input}
                        value={form.efeitoPaginaAlvo === '' ? 'todas' : form.efeitoPaginaAlvo === '/' ? 'home' : 'especifica'}
                        onChange={(e) => {
                          const v = e.target.value;
                          sf(
                            'efeitoPaginaAlvo',
                            v === 'todas'
                              ? ''
                              : v === 'home'
                              ? '/'
                              : form.efeitoPaginaAlvo && form.efeitoPaginaAlvo !== '/'
                              ? form.efeitoPaginaAlvo
                              : '/servicos',
                          );
                        }}
                      >
                        <option value="todas">Todas as páginas</option>
                        <option value="home">Somente a Home</option>
                        <option value="especifica">Página específica…</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="efeito-duracao" className={ui.label}>Duração (segundos · 0 = sem limite)</label>
                      <input
                        id="efeito-duracao"
                        type="number"
                        min={0}
                        max={86400}
                        className={ui.input}
                        value={form.efeitoDuracaoSegundos}
                        onChange={(e) => sf('efeitoDuracaoSegundos', Number(e.target.value))}
                      />
                    </div>
                  </div>
                  {form.efeitoPaginaAlvo !== '' && form.efeitoPaginaAlvo !== '/' && (
                    <div>
                      <label htmlFor="efeito-rota" className={ui.label}>Rota (ex.: /servicos — vale para a rota e suas sub-rotas)</label>
                      <input
                        id="efeito-rota"
                        type="text"
                        className={ui.input}
                        value={form.efeitoPaginaAlvo}
                        onChange={(e) => sf('efeitoPaginaAlvo', e.target.value)}
                        placeholder="/servicos"
                      />
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.efeitoPermitirParar}
                      onChange={(e) => sf('efeitoPermitirParar', e.target.checked)}
                    />
                    Permitir que o visitante pare o efeito (recomendado — acessibilidade)
                  </label>
                </div>

                {form.efeito.nome === 'aedes-overlay' && (
                  <div className="space-y-3 rounded border border-border p-3">
                    <p className="text-xs font-semibold text-fg/60 uppercase tracking-wide">Parâmetros — Aedes Overlay (jogo da raquete)</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="aedes-qtd" className={ui.label}>Qtd. mosquitos (1–12)</label>
                        <input id="aedes-qtd" type="number" min={1} max={12} className={ui.input} value={form.efeito.aedesQtd} onChange={(e) => sfObj('efeito', { aedesQtd: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label htmlFor="aedes-kills" className={ui.label}>Meta de eliminações</label>
                        <input id="aedes-kills" type="number" min={1} max={30} className={ui.input} value={form.efeito.aedesKills} onChange={(e) => sfObj('efeito', { aedesKills: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label htmlFor="aedes-reabrir" className={ui.label}>Reabrir após (dias)</label>
                        <input id="aedes-reabrir" type="number" min={0} className={ui.input} value={form.efeito.aedesReobrirDias} onChange={(e) => sfObj('efeito', { aedesReobrirDias: Number(e.target.value) })} />
                      </div>
                      <div className="flex items-center">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={form.efeito.aedesLockScroll} onChange={(e) => sfObj('efeito', { aedesLockScroll: e.target.checked })} />
                          Travar a navegação até eliminar / pular
                        </label>
                      </div>
                      <div>
                        <label htmlFor="aedes-cor-primaria" className={ui.label}>Cor primária</label>
                        <div className="flex gap-2 items-center">
                          <input type="color" value={form.efeito.aedesCorPrimaria} onChange={(e) => sfObj('efeito', { aedesCorPrimaria: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor primária do efeito Aedes" />
                          <input id="aedes-cor-primaria" className={`${ui.input} font-mono`} value={form.efeito.aedesCorPrimaria} onChange={(e) => sfObj('efeito', { aedesCorPrimaria: e.target.value })} />
                        </div>
                      </div>
                      <div>
                        <label htmlFor="aedes-cor-destaque" className={ui.label}>Cor de destaque</label>
                        <div className="flex gap-2 items-center">
                          <input type="color" value={form.efeito.aedesCorDestaque} onChange={(e) => sfObj('efeito', { aedesCorDestaque: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor de destaque do efeito Aedes" />
                          <input id="aedes-cor-destaque" className={`${ui.input} font-mono`} value={form.efeito.aedesCorDestaque} onChange={(e) => sfObj('efeito', { aedesCorDestaque: e.target.value })} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label htmlFor="aedes-titulo" className={ui.label}>Título do popup</label>
                      <input id="aedes-titulo" className={ui.input} value={form.efeito.aedesTitulo} onChange={(e) => sfObj('efeito', { aedesTitulo: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="aedes-subtitulo" className={ui.label}>Subtítulo</label>
                      <input id="aedes-subtitulo" className={ui.input} value={form.efeito.aedesSubtitulo} onChange={(e) => sfObj('efeito', { aedesSubtitulo: e.target.value })} />
                    </div>
                    <div>
                      <label htmlFor="aedes-descricao" className={ui.label}>Descrição</label>
                      <textarea id="aedes-descricao" className={`${ui.input} min-h-[60px]`} value={form.efeito.aedesDescricao} onChange={(e) => sfObj('efeito', { aedesDescricao: e.target.value })} />
                    </div>
                    <div>
                      <label className={ui.label}>Bullets</label>
                      <div className="space-y-2">
                        {form.efeito.aedesBullets.map((b, i) => (
                          <div key={i} className="flex gap-2">
                            <input
                              className={ui.input}
                              value={b}
                              onChange={(ev) => sfObj('efeito', { aedesBullets: form.efeito.aedesBullets.map((x, j) => j === i ? ev.target.value : x) })}
                              placeholder={`Dica ${i + 1}`}
                              aria-label={`Dica ${i + 1} do Aedes Overlay`}
                            />
                            {form.efeito.aedesBullets.length > 1 && (
                              <button type="button" className="text-sm text-danger hover:underline" onClick={() => sfObj('efeito', { aedesBullets: form.efeito.aedesBullets.filter((_, j) => j !== i) })} aria-label={`Remover dica ${i + 1}`}>remover</button>
                            )}
                          </div>
                        ))}
                        {form.efeito.aedesBullets.length < 6 && (
                          <button type="button" className="text-sm text-primary hover:underline" onClick={() => sfObj('efeito', { aedesBullets: [...form.efeito.aedesBullets, ''] })}>+ adicionar dica</button>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="aedes-cta-label" className={ui.label}>Rótulo CTA</label>
                        <input id="aedes-cta-label" className={ui.input} value={form.efeito.aedesCtaLabel} onChange={(e) => sfObj('efeito', { aedesCtaLabel: e.target.value })} />
                      </div>
                      <div>
                        <label htmlFor="aedes-cta-url" className={ui.label}>URL CTA</label>
                        <input id="aedes-cta-url" className={ui.input} value={form.efeito.aedesCtaUrl} onChange={(e) => sfObj('efeito', { aedesCtaUrl: e.target.value })} />
                      </div>
                    </div>
                  </div>
                )}

                {form.efeito.nome === 'copa-overlay' && (
                  <div className="space-y-3 rounded border border-border p-3">
                    <p className="text-xs font-semibold text-fg/60 uppercase tracking-wide">Parâmetros — Copa Overlay</p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="copa-intensidade" className={ui.label}>Intensidade</label>
                        <select id="copa-intensidade" className={ui.input} value={form.efeito.copaIntensidade} onChange={(e) => sfObj('efeito', { copaIntensidade: e.target.value as 'leve' | 'media' | 'forte' })}>
                          <option value="leve">Leve</option>
                          <option value="media">Média</option>
                          <option value="forte">Forte</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="copa-mensagem" className={ui.label}>Mensagem da faixa</label>
                        <input id="copa-mensagem" className={ui.input} value={form.efeito.copaMensagem} onChange={(e) => sfObj('efeito', { copaMensagem: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.efeito.copaFaixa} onChange={(e) => sfObj('efeito', { copaFaixa: e.target.checked })} className="h-4 w-4" /> Faixa</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.efeito.copaBolas} onChange={(e) => sfObj('efeito', { copaBolas: e.target.checked })} className="h-4 w-4" /> Bolas</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.efeito.copaBandeiras} onChange={(e) => sfObj('efeito', { copaBandeiras: e.target.checked })} className="h-4 w-4" /> Bandeiras</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.efeito.copaConfete} onChange={(e) => sfObj('efeito', { copaConfete: e.target.checked })} className="h-4 w-4" /> Confete</label>
                      <label className="flex items-center gap-2"><input type="checkbox" checked={form.efeito.copaFitas} onChange={(e) => sfObj('efeito', { copaFitas: e.target.checked })} className="h-4 w-4" /> Fitas</label>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label htmlFor="copa-ball" className={ui.label}>URL da bola (opcional)</label>
                        <input id="copa-ball" className={ui.input} value={form.efeito.copaBall} onChange={(e) => sfObj('efeito', { copaBall: e.target.value })} placeholder="URL de imagem personalizada" />
                      </div>
                      <div>
                        <label htmlFor="copa-flag" className={ui.label}>URL da bandeira (opcional)</label>
                        <input id="copa-flag" className={ui.input} value={form.efeito.copaFlag} onChange={(e) => sfObj('efeito', { copaFlag: e.target.value })} placeholder="URL de imagem personalizada" />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <hr className="border-border" />

          {/* -------------------------------------------------------- */}
          {/* CAPACIDADE: Selo                                          */}
          {/* -------------------------------------------------------- */}
          <fieldset className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="cap-selo"
                checked={form.seloHabilitado}
                onChange={(e) => sf('seloHabilitado', e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <legend className="font-semibold text-sm">
                <label htmlFor="cap-selo" className="cursor-pointer select-none">
                  Selo / bloco
                </label>
              </legend>
            </div>
            {form.seloHabilitado && (
              <div className="ml-7 space-y-3">
                <div>
                  <label htmlFor="selo-texto" className={ui.label}>Texto do selo</label>
                  <input id="selo-texto" className={ui.input} value={form.selo.texto} onChange={(e) => sfObj('selo', { texto: e.target.value })} placeholder="Ex.: Campanha Oficial" />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="selo-cor" className={ui.label}>Cor</label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={form.selo.cor || '#1351b4'} onChange={(e) => sfObj('selo', { cor: e.target.value })} className="h-9 w-12 rounded border border-border bg-bg cursor-pointer" aria-label="Escolher cor do selo" />
                      <input id="selo-cor" className={`${ui.input} font-mono`} value={form.selo.cor} onChange={(e) => sfObj('selo', { cor: e.target.value })} placeholder="#1351b4" />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="selo-link" className={ui.label}>Link (opcional)</label>
                    <input id="selo-link" className={ui.input} value={form.selo.link} onChange={(e) => sfObj('selo', { link: e.target.value })} placeholder="https://... ou /rota" />
                  </div>
                </div>
              </div>
            )}
          </fieldset>

          {/* Erro do modal */}
          {erroModal && <Aviso tipo="erro">{erroModal}</Aviso>}

          {/* Ações */}
          <div className="flex justify-end gap-2 pt-1 border-t border-border">
            <button className={ui.btnGhost} onClick={() => setModalAberto(false)}>
              Cancelar
            </button>
            <button className={ui.btn} disabled={salvando} onClick={salvar}>
              {salvando ? 'Salvando…' : 'Salvar campanha'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ============================================================ */}
      {/* MediaPicker: banner                                           */}
      {/* ============================================================ */}
      <MediaPicker
        open={pickerAberto === 'banner'}
        onClose={() => setPickerAberto(null)}
        tipo="imagem"
        onSelect={(asset) => {
          sfObj('banner', { imagemUrl: asset.urlPublica ?? '' });
          setPickerAberto(null);
        }}
      />

      {/* MediaPicker: popup */}
      <MediaPicker
        open={pickerAberto === 'popup'}
        onClose={() => setPickerAberto(null)}
        tipo="imagem"
        onSelect={(asset) => {
          sfObj('popup', { imagemUrl: asset.urlPublica ?? '' });
          setPickerAberto(null);
        }}
      />
    </div>
  );
}
