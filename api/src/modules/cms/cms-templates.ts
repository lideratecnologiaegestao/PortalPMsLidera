/**
 * Templates de página prontos para o construtor drag-drop.
 * Cada template define uma estrutura de blocos inicial que é copiada para a
 * página ao criar com `template: <id>`. O backend apenas armazena o `conteudo`
 * como jsonb — qualquer tipo de bloco suportado pelo frontend pode ser usado.
 */
export interface TemplateBloco {
  tipo: string;
  conteudo: Record<string, unknown>;
}

export interface TemplatePagina {
  id: string;
  nome: string;
  descricao: string;
  blocos: TemplateBloco[];
}

export const TEMPLATES: TemplatePagina[] = [
  {
    id: 'institucional',
    nome: 'Página institucional',
    descricao:
      'Estrutura para apresentar a prefeitura, secretaria ou órgão público: banner de destaque, texto de apresentação e lista de serviços.',
    blocos: [
      {
        tipo: 'hero',
        conteudo: {
          titulo: 'Bem-vindo à Prefeitura Municipal',
          subtitulo: 'Servindo o cidadão com transparência e eficiência.',
          imagemUrl: '',
          botao: { label: 'Saiba mais', href: '#conteudo' },
        },
      },
      {
        tipo: 'texto',
        conteudo: {
          html: '<p>Esta página apresenta informações institucionais sobre a Prefeitura Municipal. Edite este bloco com o histórico, missão e visão do órgão.</p>',
        },
      },
      {
        tipo: 'servicos',
        conteudo: {
          titulo: 'Nossos Serviços',
          itens: [
            { icone: 'file-text', label: 'Certidões', href: '/servicos/certidoes' },
            { icone: 'map', label: 'Alvará de localização', href: '/servicos/alvara' },
            { icone: 'message-square', label: 'Ouvidoria', href: '/ouvidoria' },
          ],
        },
      },
    ],
  },
  {
    id: 'servico-programa',
    nome: 'Serviço / Programa',
    descricao:
      'Ideal para detalhar um serviço ou programa municipal: banner, descrição completa, cards de etapas e botão de ação.',
    blocos: [
      {
        tipo: 'hero',
        conteudo: {
          titulo: 'Nome do Serviço ou Programa',
          subtitulo: 'Descrição curta sobre o objetivo do serviço.',
          imagemUrl: '',
        },
      },
      {
        tipo: 'texto',
        conteudo: {
          html: '<p>Descreva aqui o serviço ou programa de forma clara e objetiva. Inclua requisitos, público-alvo e benefícios.</p>',
        },
      },
      {
        tipo: 'cards',
        conteudo: {
          titulo: 'Como solicitar',
          itens: [
            { numero: '1', titulo: 'Reúna os documentos', descricao: 'RG, CPF e comprovante de residência.' },
            { numero: '2', titulo: 'Protocole a solicitação', descricao: 'Presencialmente ou pelo portal online.' },
            { numero: '3', titulo: 'Acompanhe o andamento', descricao: 'Pelo número de protocolo gerado.' },
          ],
        },
      },
      {
        tipo: 'botao',
        conteudo: {
          label: 'Solicitar agora',
          href: '/servicos/solicitacao',
          variante: 'primario',
          alinhamento: 'centro',
        },
      },
    ],
  },
  {
    id: 'noticia-comunicado',
    nome: 'Notícia / Comunicado',
    descricao:
      'Estrutura para publicações de notícias, comunicados e avisos oficiais: texto editorial com suporte a galeria de imagens.',
    blocos: [
      {
        tipo: 'texto',
        conteudo: {
          html: '<h2>Título da Notícia ou Comunicado</h2><p>Insira aqui o corpo do texto da notícia ou comunicado oficial. Inclua data, fonte e informações de contato quando aplicável.</p>',
        },
      },
      {
        tipo: 'galeria',
        conteudo: {
          titulo: 'Galeria de imagens',
          imagens: [],
        },
      },
    ],
  },
  {
    id: 'contato',
    nome: 'Contato',
    descricao:
      'Página de contato com endereço, telefones e canais de atendimento ao cidadão.',
    blocos: [
      {
        tipo: 'texto',
        conteudo: {
          html: '<h2>Entre em contato</h2><p>Utilize os canais abaixo para falar conosco. Nossa equipe está disponível nos horários de atendimento indicados.</p>',
        },
      },
      {
        tipo: 'cards',
        conteudo: {
          titulo: 'Canais de Atendimento',
          itens: [
            {
              icone: 'map-pin',
              titulo: 'Endereço',
              descricao: 'Praça Principal, s/n – Centro – Município/UF – CEP 00000-000',
            },
            {
              icone: 'phone',
              titulo: 'Telefone',
              descricao: '(00) 0000-0000 – Segunda a sexta, das 8h às 17h',
            },
            {
              icone: 'mail',
              titulo: 'E-mail',
              descricao: 'atendimento@prefeitura.gov.br',
            },
            {
              icone: 'message-square',
              titulo: 'Ouvidoria',
              descricao: 'Registre sugestões, reclamações e elogios pelo nosso portal.',
              link: { label: 'Acessar Ouvidoria', href: '/ouvidoria' },
            },
          ],
        },
      },
    ],
  },
];

/** Retorna um template pelo id, ou undefined se não encontrado. */
export function encontrarTemplate(id: string): TemplatePagina | undefined {
  return TEMPLATES.find((t) => t.id === id);
}
