/**
 * Biblioteca de presets de campanhas institucionais.
 *
 * Cada preset traz:
 *  - configDefault: capacidades + params prontos para customização.
 *  - sugestao: período/recorrência/prioridade sugeridos.
 *
 * As cores foram escolhidas a partir das causas consolidadas e validadas para
 * contraste WCAG AA (deriveFg() garante fg #fff ou #000 com ≥ 4.5:1).
 *
 * autonomous: false — disparo autônomo é Fase 2. Apenas recorrencia é gravada.
 */

import { deriveFg } from '../capabilities/wcag';

// ---------------------------------------------------------------------------
// Helper: monta um preset de tema com fg derivado automaticamente
// ---------------------------------------------------------------------------
function tema(corPrimaria: string, corDestaque?: string) {
  return {
    corPrimaria,
    corPrimariaFg: deriveFg(corPrimaria),
    ...(corDestaque ? { corDestaque } : {}),
    aplicarEm: 'todo',
  };
}

// ---------------------------------------------------------------------------
// Tipos internos
// ---------------------------------------------------------------------------
export interface BibliotecaPreset {
  key: string;
  nome: string;
  categoria: string;
  descricao: string;
  icone: string;
  configDefault: Record<string, unknown>;
  sugestao: Record<string, unknown>;
  prioridadeSugerida: number;
  ativo: boolean;
}

// ---------------------------------------------------------------------------
// Biblioteca
// ---------------------------------------------------------------------------
export const BIBLIOTECA_PRESETS: BibliotecaPreset[] = [

  // ==========================================================================
  // EFEITOS ESPECIAIS
  // ==========================================================================

  {
    key: 'dengue',
    nome: 'Combate à Dengue / Aedes aegypti',
    categoria: 'saude',
    descricao: 'Campanha de combate ao mosquito Aedes aegypti. Usa o efeito interativo do overlay do mosquito, popup de orientação e faixa de alerta. Período chuvoso (outubro–maio em MT).',
    icone: '🦟',
    configDefault: {
      efeito: {
        nome: 'aedes-overlay',
        params: {
          quantidadeMosquitos: 6,
          kills: 3,
          corPrimaria: '#294961',
          corDestaque: '#16B6C4',
          zIndex: 9000,
          titulo: 'Pegue a raquete e elimine os pernilongos',
          subtitulo: 'Campanha contra a dengue',
          descricao: 'Elimine criadouros de água parada em sua casa e ajude a proteger toda a comunidade.',
          bullets: [
            'Verifique vasos, pneus, caixas d\'água e calhas',
            'Mantenha recipientes tampados',
            'Jogue fora o lixo que acumula água',
          ],
          ctaLabel: 'Denunciar foco do mosquito',
          ctaUrl: '/ouvidoria',
          reabrirAposDias: 7,
        },
      },
      popup: {
        titulo: 'Alerta: Dengue',
        descricao: 'Estamos no período de risco para a dengue. Elimine criadouros de água parada e proteja sua família.',
        bullets: [
          'Verifique vasos, pneus e caixas d\'água',
          'Mantenha lixo fechado',
          'Procure o posto de saúde se tiver febre',
        ],
        ctaLabel: 'Saiba mais',
        ctaUrl: '/servicos/saude',
        frequencia: 'dia',
        reabrirAposDias: 3,
      },
      faixa: {
        mensagem: '🦟 Alerta Dengue: elimine água parada e proteja sua família!',
        corBg: '#c8372d',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'seasonal', inicio: '10-01', fim: '05-31' },
      prioridade: 200,
    },
    prioridadeSugerida: 200,
    ativo: true,
  },

  {
    key: 'copa',
    nome: 'Copa do Mundo / Jogos do Brasil',
    categoria: 'cultural',
    descricao: 'Decoração verde-amarela para jogos do Brasil. Efeito visual com confetes e bandeirinhas. Datas configuradas manualmente conforme calendário FIFA.',
    icone: '⚽',
    configDefault: {
      efeito: {
        nome: 'copa-overlay',
        params: {
          intensidade: 'media',
          faixa: true,
          mensagem: 'Vai, Brasil! 🇧🇷',
          bolas: true,
          bandeiras: true,
          confete: true,
          fitas: true,
        },
      },
      faixa: {
        mensagem: '⚽ Vai, Brasil! Torcemos juntos pela nossa seleção! 🇧🇷',
        corBg: '#009c3b',
        corTexto: '#ffdf00',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'none' },
      prioridade: 150,
    },
    prioridadeSugerida: 150,
    ativo: true,
  },

  // ==========================================================================
  // MESES COLORIDOS PRIORITÁRIOS (tema + faixa + popup)
  // ==========================================================================

  {
    key: 'setembro-amarelo',
    nome: 'Setembro Amarelo — Prevenção ao Suicídio',
    categoria: 'saude',
    descricao: 'Valorização da vida e prevenção ao suicídio. Campanha prioritária de saúde mental.',
    icone: '💛',
    configDefault: {
      tema: tema('#f5c518'),
      faixa: {
        mensagem: '💛 Setembro Amarelo: a vida é o bem mais precioso. Cuide-se e cuide de quem você ama.',
        corBg: '#f5c518',
        corTexto: deriveFg('#f5c518'),
        dismissivel: true,
      },
      popup: {
        titulo: 'Setembro Amarelo',
        subtitulo: 'Mês de Prevenção ao Suicídio',
        descricao: 'A vida é o bem mais precioso. Se você ou alguém que conhece está passando por um momento difícil, peça ajuda.',
        bullets: [
          'CVV (Centro de Valorização da Vida): ligue 188',
          'Atendimento 24h, gratuito e sigiloso',
          'Você não está sozinho(a)',
        ],
        ctaLabel: 'Saiba mais',
        ctaUrl: '/servicos/saude',
        frequencia: 'dia',
        reabrirAposDias: 7,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '09-01',
      endsAt: '09-30',
      prioridade: 300,
    },
    prioridadeSugerida: 300,
    ativo: true,
  },

  {
    key: 'outubro-rosa',
    nome: 'Outubro Rosa — Câncer de Mama',
    categoria: 'saude',
    descricao: 'Prevenção e diagnóstico precoce do câncer de mama. Campanha prioritária.',
    icone: '🎀',
    configDefault: {
      tema: tema('#e91e8c'),
      faixa: {
        mensagem: '🎀 Outubro Rosa: previna-se! Faça sua mamografia e cuide da sua saúde.',
        corBg: '#e91e8c',
        corTexto: '#ffffff',
        dismissivel: true,
      },
      popup: {
        titulo: 'Outubro Rosa',
        subtitulo: 'Mês de Prevenção ao Câncer de Mama',
        descricao: 'O diagnóstico precoce salva vidas. Agende sua mamografia no posto de saúde.',
        bullets: [
          'Mulheres de 40 a 69 anos: faça mamografia anual',
          'Autoexame mensal após a menstruação',
          'Atendimento gratuito pelo SUS',
        ],
        ctaLabel: 'Agendar consulta',
        ctaUrl: '/servicos/saude',
        frequencia: 'dia',
        reabrirAposDias: 7,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '10-01',
      endsAt: '10-31',
      prioridade: 300,
    },
    prioridadeSugerida: 300,
    ativo: true,
  },

  {
    key: 'novembro-azul',
    nome: 'Novembro Azul — Saúde do Homem',
    categoria: 'saude',
    descricao: 'Prevenção do câncer de próstata e saúde masculina. Campanha prioritária.',
    icone: '🎗️',
    configDefault: {
      tema: tema('#1565c0'),
      faixa: {
        mensagem: '🎗️ Novembro Azul: homem que se cuida vai ao médico! Faça seu check-up.',
        corBg: '#1565c0',
        corTexto: '#ffffff',
        dismissivel: true,
      },
      popup: {
        titulo: 'Novembro Azul',
        subtitulo: 'Saúde do Homem em Primeiro Lugar',
        descricao: 'O câncer de próstata tem cura quando detectado cedo. Cuide-se, é um ato de amor.',
        bullets: [
          'Homens acima de 50 anos: exame de PSA anualmente',
          'Não ignore os sinais do seu corpo',
          'Atendimento gratuito pelo SUS',
        ],
        ctaLabel: 'Saiba mais',
        ctaUrl: '/servicos/saude',
        frequencia: 'dia',
        reabrirAposDias: 7,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '11-01',
      endsAt: '11-30',
      prioridade: 300,
    },
    prioridadeSugerida: 300,
    ativo: true,
  },

  // ==========================================================================
  // MESES COLORIDOS — tema + faixa (annual)
  // ==========================================================================

  {
    key: 'janeiro-branco',
    nome: 'Janeiro Branco — Saúde Mental',
    categoria: 'saude',
    descricao: 'Reflexão sobre saúde emocional e mental no início do ano.',
    icone: '🤍',
    configDefault: {
      tema: { corPrimaria: '#f0f0f0', corPrimariaFg: '#222222', aplicarEm: 'todo' },
      faixa: {
        mensagem: '🤍 Janeiro Branco: cuide da sua saúde mental. Comece o ano bem por dentro.',
        corBg: '#f0f0f0',
        corTexto: '#222222',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '01-01',
      endsAt: '01-31',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'agosto-lilas',
    nome: 'Agosto Lilás — Lei Maria da Penha',
    categoria: 'saude',
    descricao: 'Enfrentamento à violência doméstica e familiar contra a mulher. Lei Maria da Penha (Lei 11.340/2006), promulgada em 7 de agosto.',
    icone: '💜',
    configDefault: {
      tema: tema('#9c27b0'),
      faixa: {
        mensagem: '💜 Agosto Lilás: violência contra a mulher não tem justificativa. Denuncie: ligue 180.',
        corBg: '#9c27b0',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '08-01',
      endsAt: '08-31',
      prioridade: 200,
    },
    prioridadeSugerida: 200,
    ativo: true,
  },

  {
    key: 'maio-amarelo',
    nome: 'Maio Amarelo — Segurança no Trânsito',
    categoria: 'saude',
    descricao: 'Redução de acidentes de trânsito e conscientização para o comportamento seguro.',
    icone: '🚦',
    configDefault: {
      tema: tema('#fdd835'),
      faixa: {
        mensagem: '🚦 Maio Amarelo: no trânsito, atenção salva vidas. Dirija com cuidado.',
        corBg: '#fdd835',
        corTexto: deriveFg('#fdd835'),
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '05-01',
      endsAt: '05-31',
      prioridade: 150,
    },
    prioridadeSugerida: 150,
    ativo: true,
  },

  // ==========================================================================
  // SAZONAIS / OPERACIONAIS
  // ==========================================================================

  {
    key: 'iptu',
    nome: 'IPTU — Abertura do Exercício Fiscal',
    categoria: 'fiscal',
    descricao: 'Informativo sobre abertura de carnês, prazo para pagamento à vista com desconto e datas de vencimento das parcelas.',
    icone: '🏠',
    configDefault: {
      faixa: {
        mensagem: '🏠 IPTU disponível! Pague à vista com desconto. Consulte seu carnê no portal.',
        corBg: '#1a237e',
        corTexto: '#ffffff',
        dismissivel: true,
      },
      pagina: {
        slug: 'iptu',
        autoDespublica: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '01-02',
      endsAt: '03-31',
      prioridade: 250,
    },
    prioridadeSugerida: 250,
    ativo: true,
  },

  {
    key: 'campanha-agasalho',
    nome: 'Campanha do Agasalho',
    categoria: 'saude',
    descricao: 'Arrecadação de roupas, cobertores e calçados para famílias em situação de vulnerabilidade no inverno.',
    icone: '🧥',
    configDefault: {
      banner: {
        imagemUrl: '/uploads/placeholder-agasalho.jpg',
        alt: 'Campanha do Agasalho — doe roupas e cobertores',
        posicao: 'home_topo',
      },
      popup: {
        titulo: 'Campanha do Agasalho',
        descricao: 'Doe roupas, cobertores e calçados usados em bom estado. Juntos vencemos o frio!',
        bullets: [
          'Pontos de coleta em todas as secretarias',
          'Roupas adultas e infantis',
          'Cobertores, sapatos e acessórios',
        ],
        ctaLabel: 'Ver pontos de coleta',
        ctaUrl: '/servicos/assistencia-social',
        frequencia: 'dia',
        reabrirAposDias: 7,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'seasonal', inicio: '05-01', fim: '08-31' },
      prioridade: 150,
    },
    prioridadeSugerida: 150,
    ativo: true,
  },

  {
    key: 'estiagem-queimadas',
    nome: 'Estiagem e Queimadas — Prevenção',
    categoria: 'ambiental',
    descricao: 'Alerta para o período de seca e risco de incêndios. Especialmente relevante no Mato Grosso (junho–setembro). Defesa Civil.',
    icone: '🔥',
    configDefault: {
      faixa: {
        mensagem: '🔥 Alerta Estiagem: proibido queimadas! Denuncie incêndios ao bombeiro: 193.',
        corBg: '#e65100',
        corTexto: '#ffffff',
        dismissivel: true,
      },
      popup: {
        titulo: 'Período de Seca e Queimadas',
        descricao: 'Estamos no período de maior risco de incêndios. Proteja o meio ambiente e a sua saúde.',
        bullets: [
          'Proibido queimadas neste período',
          'Não jogue bituca de cigarro em vegetação seca',
          'Em caso de incêndio: ligue 193 (Bombeiros)',
          'Ar ruim? Fique em ambientes fechados e use máscara',
        ],
        ctaLabel: 'Saiba mais sobre a estiagem',
        ctaUrl: '/noticias',
        frequencia: 'dia',
        reabrirAposDias: 7,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'seasonal', inicio: '06-01', fim: '09-30' },
      prioridade: 180,
    },
    prioridadeSugerida: 180,
    ativo: true,
  },

  {
    key: 'vacinacao',
    nome: 'Campanha de Vacinação',
    categoria: 'saude',
    descricao: 'Campanhas de vacinação (gripe, multivacinação, sarampo, pólio etc.). Datas configuradas manualmente conforme calendário do Ministério da Saúde a cada ano.',
    icone: '💉',
    configDefault: {
      banner: {
        imagemUrl: '/uploads/placeholder-vacinacao.jpg',
        alt: 'Campanha de Vacinação — imunize-se!',
        posicao: 'home_topo',
      },
      popup: {
        titulo: 'Campanha de Vacinação',
        descricao: 'A vacinação protege você e toda a comunidade. Não perca o prazo!',
        bullets: [
          'Leve a carteirinha de vacinação',
          'Atendimento gratuito em todos os postos de saúde',
          'Crianças, idosos e gestantes têm prioridade',
        ],
        ctaLabel: 'Ver postos de vacinação',
        ctaUrl: '/servicos/saude',
        frequencia: 'dia',
        reabrirAposDias: 3,
      },
      pagina: {
        slug: 'vacinacao',
        autoDespublica: true,
      },
    },
    sugestao: {
      // Datas manuais a cada ano — recorrência annual mas sem autonomous
      recorrencia: { tipo: 'annual' },
      prioridade: 220,
    },
    prioridadeSugerida: 220,
    ativo: true,
  },

  {
    key: 'aniversario-cidade',
    nome: 'Aniversário da Cidade',
    categoria: 'civico',
    descricao: 'Comemoração do aniversário do município. Configure a data correta para o seu município.',
    icone: '🎂',
    configDefault: {
      banner: {
        imagemUrl: '/uploads/placeholder-aniversario.jpg',
        alt: 'Aniversário da cidade — parabéns!',
        posicao: 'home_topo',
      },
      faixa: {
        mensagem: '🎂 Aniversário da nossa cidade! Parabéns a todos os moradores!',
        corBg: '#7b1fa2',
        corTexto: '#ffffff',
        dismissivel: true,
      },
      selo: {
        texto: '🎂 Aniversário',
        cor: '#7b1fa2',
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  // ==========================================================================
  // DEMAIS MESES COLORIDOS — tema + faixa (annual)
  // ==========================================================================

  {
    key: 'fevereiro-roxo',
    nome: 'Fevereiro Roxo — Lúpus, Alzheimer e Fibromialgia',
    categoria: 'saude',
    descricao: 'Conscientização sobre lúpus, Alzheimer e fibromialgia.',
    icone: '💜',
    configDefault: {
      tema: tema('#6a1b9a'),
      faixa: {
        mensagem: '💜 Fevereiro Roxo: conscientização sobre lúpus, Alzheimer e fibromialgia.',
        corBg: '#6a1b9a',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '02-01',
      endsAt: '02-28',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'marco-lilas',
    nome: 'Março Lilás — Câncer de Colo do Útero',
    categoria: 'saude',
    descricao: 'Prevenção e diagnóstico precoce do câncer de colo do útero.',
    icone: '💜',
    configDefault: {
      tema: tema('#ab47bc'),
      faixa: {
        mensagem: '💜 Março Lilás: previna o câncer de colo do útero. Faça o exame preventivo.',
        corBg: '#ab47bc',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '03-01',
      endsAt: '03-31',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'abril-azul',
    nome: 'Abril Azul — Autismo',
    categoria: 'saude',
    descricao: 'Conscientização sobre o Transtorno do Espectro Autista (TEA). Dia 2 de abril — Dia Mundial do Autismo.',
    icone: '💙',
    configDefault: {
      tema: tema('#0288d1'),
      faixa: {
        mensagem: '💙 Abril Azul: conscientize-se sobre o autismo. Inclusão é respeito.',
        corBg: '#0288d1',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '04-01',
      endsAt: '04-30',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'junho-vermelho',
    nome: 'Junho Vermelho — Doação de Sangue',
    categoria: 'saude',
    descricao: 'Incentivo à doação voluntária de sangue. Dia 14 de junho — Dia Mundial do Doador de Sangue.',
    icone: '❤️',
    configDefault: {
      tema: tema('#c62828'),
      faixa: {
        mensagem: '❤️ Junho Vermelho: doe sangue, doe vida! Hemocentros precisam de você.',
        corBg: '#c62828',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '06-01',
      endsAt: '06-30',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'junho-violeta',
    nome: 'Junho Violeta — Violência contra Idosos',
    categoria: 'saude',
    descricao: 'Combate à violência contra a pessoa idosa. Dia 15 de junho — Dia Mundial de Conscientização da Violência contra Idosos.',
    icone: '🟣',
    configDefault: {
      tema: tema('#7b1fa2'),
      faixa: {
        mensagem: '🟣 Junho Violeta: proteja os idosos da violência. Denuncie: ligue 180.',
        corBg: '#7b1fa2',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '06-01',
      endsAt: '06-30',
      prioridade: 90,
    },
    prioridadeSugerida: 90,
    ativo: true,
  },

  {
    key: 'julho-amarelo',
    nome: 'Julho Amarelo — Hepatites Virais',
    categoria: 'saude',
    descricao: 'Prevenção e diagnóstico das hepatites virais. Dia 28 de julho — Dia Mundial das Hepatites.',
    icone: '💛',
    configDefault: {
      tema: tema('#f9a825'),
      faixa: {
        mensagem: '💛 Julho Amarelo: teste para hepatite é gratuito nos postos de saúde.',
        corBg: '#f9a825',
        corTexto: deriveFg('#f9a825'),
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '07-01',
      endsAt: '07-31',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'agosto-dourado',
    nome: 'Agosto Dourado — Aleitamento Materno',
    categoria: 'saude',
    descricao: 'Promoção, proteção e apoio ao aleitamento materno.',
    icone: '🤱',
    configDefault: {
      tema: tema('#f57f17'),
      faixa: {
        mensagem: '🤱 Agosto Dourado: amamentar é um ato de amor. Apoie as mães!',
        corBg: '#f57f17',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '08-01',
      endsAt: '08-31',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'dezembro-vermelho',
    nome: 'Dezembro Vermelho — Luta contra a AIDS',
    categoria: 'saude',
    descricao: 'Prevenção e combate ao HIV/AIDS. Dia 1º de dezembro — Dia Mundial de Luta contra a AIDS.',
    icone: '❤️',
    configDefault: {
      tema: tema('#b71c1c'),
      faixa: {
        mensagem: '❤️ Dezembro Vermelho: prevenção salva vidas. Faça o teste anti-HIV. É gratuito.',
        corBg: '#b71c1c',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '12-01',
      endsAt: '12-31',
      prioridade: 100,
    },
    prioridadeSugerida: 100,
    ativo: true,
  },

  {
    key: 'maio-laranja',
    nome: 'Maio Laranja — Enfrentamento ao Abuso Sexual Infantil',
    categoria: 'saude',
    descricao: 'Combate ao abuso e exploração sexual de crianças e adolescentes. Dia 18 de maio.',
    icone: '🟠',
    configDefault: {
      tema: tema('#e65100'),
      faixa: {
        mensagem: '🟠 Maio Laranja: proteja as crianças. Denuncie o abuso: ligue 100.',
        corBg: '#e65100',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '05-01',
      endsAt: '05-31',
      prioridade: 180,
    },
    prioridadeSugerida: 180,
    ativo: true,
  },

  {
    key: 'novembro-roxo',
    nome: 'Novembro Roxo — Prematuridade',
    categoria: 'saude',
    descricao: 'Conscientização sobre a prematuridade e os cuidados com bebês prematuros. Dia 17 de novembro.',
    icone: '💜',
    configDefault: {
      tema: tema('#6a1b9a'),
      faixa: {
        mensagem: '💜 Novembro Roxo: o cuidado com o bebê prematuro começa antes do nascimento.',
        corBg: '#6a1b9a',
        corTexto: '#ffffff',
        dismissivel: true,
      },
    },
    sugestao: {
      recorrencia: { tipo: 'annual' },
      startsAt: '11-01',
      endsAt: '11-30',
      prioridade: 80,
    },
    prioridadeSugerida: 80,
    ativo: true,
  },
];
