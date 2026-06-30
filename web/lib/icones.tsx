/**
 * Catálogo unificado de ícones do portal (lucide-react).
 *
 * - `CATALOGO`: lista curada usada pelo seletor e pela galeria (nome amigável
 *   pt-BR → componente lucide), com categoria e termos de busca.
 * - `<Icone nome>`: renderiza pelo nome. Resolve também os nomes ANTIGOS
 *   (menus e Acesso Rápido) via ALIASES, para que o que já está cadastrado
 *   continue aparecendo.
 */
import {
  Home, Landmark, Building2, Building, Users, User, UserRound, Eye, Database, Megaphone, Flag, BadgeCheck, Scale, Gavel,
  LayoutGrid, AppWindow, Search, Info, HelpCircle, Link as LinkIcon, ExternalLink, Settings, Star, Heart, CheckCircle2, AlertTriangle, Bell,
  FileText, Folder, FolderOpen, Download, Upload, Printer, Newspaper, ScrollText, BookOpen, Mail, Phone, MessageCircle, MessageSquare, MessagesSquare, FileSearch,
  HeartPulse, Stethoscope, Ambulance, Pill, Syringe, Cross,
  GraduationCap, School, Library, Palette, Music, Drama,
  Dumbbell, Trophy, Medal,
  Leaf, TreePine, Droplet, Sun, Recycle, Wheat, Tractor, PawPrint,
  HardHat, Construction, Wrench, Route, Bus, Car, Bike, Truck, TrafficCone, Zap, Lightbulb,
  Banknote, Coins, Receipt, CreditCard, BarChart3, TrendingUp, Wallet, Briefcase, Factory, Store,
  Shield, ShieldCheck, ShieldAlert, Flame, Handshake, Baby, Accessibility, Hand,
  Calendar, Clock, Map, MapPin, Compass, Image as ImageIcon, Camera, Video, Images,
  Monitor, Smartphone, Wifi, Cloud, Key, Lock, Bot, Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface ItemIcone { nome: string; Comp: LucideIcon; cat: string; termos: string }

/** Catálogo curado (nome amigável → ícone). */
export const CATALOGO: ItemIcone[] = [
  // Governo & Cidadão
  { nome: 'inicio', Comp: Home, cat: 'Governo', termos: 'casa home principal início' },
  { nome: 'prefeitura', Comp: Landmark, cat: 'Governo', termos: 'prefeitura sede governo público landmark' },
  { nome: 'predio', Comp: Building2, cat: 'Governo', termos: 'prédio edifício secretaria órgão' },
  { nome: 'orgaos', Comp: Building, cat: 'Governo', termos: 'órgão repartição estrutura' },
  { nome: 'pessoas', Comp: Users, cat: 'Governo', termos: 'pessoas cidadãos população grupo' },
  { nome: 'usuario', Comp: User, cat: 'Governo', termos: 'usuário pessoa perfil' },
  { nome: 'autoridade', Comp: UserRound, cat: 'Governo', termos: 'prefeito autoridade gestor' },
  { nome: 'transparencia', Comp: Eye, cat: 'Governo', termos: 'transparência olho ver acesso' },
  { nome: 'dados-abertos', Comp: Database, cat: 'Governo', termos: 'dados abertos base banco' },
  { nome: 'megafone', Comp: Megaphone, cat: 'Governo', termos: 'megafone aviso comunicado campanha' },
  { nome: 'bandeira', Comp: Flag, cat: 'Governo', termos: 'bandeira marco' },
  { nome: 'selo', Comp: BadgeCheck, cat: 'Governo', termos: 'selo verificado certificado' },
  { nome: 'justica', Comp: Scale, cat: 'Governo', termos: 'justiça balança lei legislação' },
  { nome: 'martelo', Comp: Gavel, cat: 'Governo', termos: 'martelo licitação leilão jurídico' },

  // Serviços & Interface
  { nome: 'servicos', Comp: LayoutGrid, cat: 'Serviços', termos: 'serviços grade aplicativos' },
  { nome: 'aplicativo', Comp: AppWindow, cat: 'Serviços', termos: 'app aplicativo janela' },
  { nome: 'busca', Comp: Search, cat: 'Serviços', termos: 'busca pesquisa lupa procurar' },
  { nome: 'informacao', Comp: Info, cat: 'Serviços', termos: 'informação info ajuda' },
  { nome: 'ajuda', Comp: HelpCircle, cat: 'Serviços', termos: 'ajuda dúvida faq pergunta' },
  { nome: 'link', Comp: LinkIcon, cat: 'Serviços', termos: 'link atalho url' },
  { nome: 'link-externo', Comp: ExternalLink, cat: 'Serviços', termos: 'link externo abrir site' },
  { nome: 'configuracoes', Comp: Settings, cat: 'Serviços', termos: 'configurações ajustes engrenagem' },
  { nome: 'estrela', Comp: Star, cat: 'Serviços', termos: 'estrela favorito destaque' },
  { nome: 'coracao', Comp: Heart, cat: 'Serviços', termos: 'coração curtir amor' },
  { nome: 'confirmado', Comp: CheckCircle2, cat: 'Serviços', termos: 'confirmado check ok aprovado' },
  { nome: 'alerta', Comp: AlertTriangle, cat: 'Serviços', termos: 'alerta aviso atenção' },
  { nome: 'notificacao', Comp: Bell, cat: 'Serviços', termos: 'notificação sino aviso' },

  // Documentos & Comunicação
  { nome: 'documento', Comp: FileText, cat: 'Documentos', termos: 'documento arquivo texto pdf' },
  { nome: 'pasta', Comp: Folder, cat: 'Documentos', termos: 'pasta diretório arquivos' },
  { nome: 'pasta-aberta', Comp: FolderOpen, cat: 'Documentos', termos: 'pasta aberta' },
  { nome: 'baixar', Comp: Download, cat: 'Documentos', termos: 'baixar download' },
  { nome: 'enviar', Comp: Upload, cat: 'Documentos', termos: 'enviar upload subir' },
  { nome: 'imprimir', Comp: Printer, cat: 'Documentos', termos: 'imprimir impressora' },
  { nome: 'jornal', Comp: Newspaper, cat: 'Documentos', termos: 'jornal notícias imprensa' },
  { nome: 'diario', Comp: ScrollText, cat: 'Documentos', termos: 'diário oficial publicação' },
  { nome: 'livro', Comp: BookOpen, cat: 'Documentos', termos: 'livro leitura manual' },
  { nome: 'email', Comp: Mail, cat: 'Comunicação', termos: 'email correio mensagem' },
  { nome: 'telefone', Comp: Phone, cat: 'Comunicação', termos: 'telefone fone contato ligar' },
  { nome: 'whatsapp', Comp: MessageCircle, cat: 'Comunicação', termos: 'whatsapp mensagem chat' },
  { nome: 'chat', Comp: MessageSquare, cat: 'Comunicação', termos: 'chat conversa atendimento' },
  { nome: 'ouvidoria', Comp: MessagesSquare, cat: 'Comunicação', termos: 'ouvidoria manifestação mensagens' },
  { nome: 'esic', Comp: FileSearch, cat: 'Comunicação', termos: 'esic acesso informação pedido' },

  // Saúde
  { nome: 'saude', Comp: HeartPulse, cat: 'Saúde', termos: 'saúde coração pulso' },
  { nome: 'medico', Comp: Stethoscope, cat: 'Saúde', termos: 'médico estetoscópio consulta' },
  { nome: 'ambulancia', Comp: Ambulance, cat: 'Saúde', termos: 'ambulância emergência samu' },
  { nome: 'remedio', Comp: Pill, cat: 'Saúde', termos: 'remédio farmácia medicamento' },
  { nome: 'vacina', Comp: Syringe, cat: 'Saúde', termos: 'vacina seringa vacinação' },
  { nome: 'cruz-saude', Comp: Cross, cat: 'Saúde', termos: 'cruz hospital posto' },

  // Educação & Cultura
  { nome: 'educacao', Comp: GraduationCap, cat: 'Educação', termos: 'educação formatura ensino' },
  { nome: 'escola', Comp: School, cat: 'Educação', termos: 'escola creche colégio' },
  { nome: 'biblioteca', Comp: Library, cat: 'Educação', termos: 'biblioteca livros' },
  { nome: 'cultura', Comp: Palette, cat: 'Cultura', termos: 'cultura arte pintura' },
  { nome: 'musica', Comp: Music, cat: 'Cultura', termos: 'música som show' },
  { nome: 'teatro', Comp: Drama, cat: 'Cultura', termos: 'teatro máscara arte' },

  // Esporte
  { nome: 'esporte', Comp: Dumbbell, cat: 'Esporte', termos: 'esporte academia exercício' },
  { nome: 'trofeu', Comp: Trophy, cat: 'Esporte', termos: 'troféu prêmio campeão' },
  { nome: 'medalha', Comp: Medal, cat: 'Esporte', termos: 'medalha conquista' },

  // Meio ambiente & Agricultura
  { nome: 'meio-ambiente', Comp: Leaf, cat: 'Ambiente', termos: 'meio ambiente folha verde' },
  { nome: 'arvore', Comp: TreePine, cat: 'Ambiente', termos: 'árvore mata floresta' },
  { nome: 'agua', Comp: Droplet, cat: 'Ambiente', termos: 'água gota saneamento' },
  { nome: 'sol', Comp: Sun, cat: 'Ambiente', termos: 'sol clima tempo energia solar' },
  { nome: 'reciclagem', Comp: Recycle, cat: 'Ambiente', termos: 'reciclagem lixo coleta' },
  { nome: 'agricultura', Comp: Wheat, cat: 'Agricultura', termos: 'agricultura trigo plantação' },
  { nome: 'trator', Comp: Tractor, cat: 'Agricultura', termos: 'trator rural fazenda' },
  { nome: 'animais', Comp: PawPrint, cat: 'Agricultura', termos: 'animais pata pet zoonoses' },

  // Obras, Infra & Transporte
  { nome: 'obras', Comp: HardHat, cat: 'Obras', termos: 'obras capacete construção' },
  { nome: 'construcao', Comp: Construction, cat: 'Obras', termos: 'construção obra reforma' },
  { nome: 'ferramentas', Comp: Wrench, cat: 'Obras', termos: 'ferramentas manutenção reparo' },
  { nome: 'estrada', Comp: Route, cat: 'Transporte', termos: 'estrada via rota trânsito' },
  { nome: 'onibus', Comp: Bus, cat: 'Transporte', termos: 'ônibus transporte coletivo' },
  { nome: 'carro', Comp: Car, cat: 'Transporte', termos: 'carro veículo' },
  { nome: 'bicicleta', Comp: Bike, cat: 'Transporte', termos: 'bicicleta ciclovia' },
  { nome: 'caminhao', Comp: Truck, cat: 'Transporte', termos: 'caminhão carga frota' },
  { nome: 'transito', Comp: TrafficCone, cat: 'Transporte', termos: 'trânsito cone sinalização' },
  { nome: 'energia', Comp: Zap, cat: 'Infraestrutura', termos: 'energia luz elétrica raio' },
  { nome: 'iluminacao', Comp: Lightbulb, cat: 'Infraestrutura', termos: 'iluminação lâmpada ideia' },

  // Finanças & Trabalho
  { nome: 'dinheiro', Comp: Banknote, cat: 'Finanças', termos: 'dinheiro nota cédula pagamento' },
  { nome: 'moedas', Comp: Coins, cat: 'Finanças', termos: 'moedas valor receita' },
  { nome: 'imposto', Comp: Receipt, cat: 'Finanças', termos: 'imposto iptu nota tributo' },
  { nome: 'cartao', Comp: CreditCard, cat: 'Finanças', termos: 'cartão pagamento' },
  { nome: 'grafico', Comp: BarChart3, cat: 'Finanças', termos: 'gráfico dados estatística' },
  { nome: 'crescimento', Comp: TrendingUp, cat: 'Finanças', termos: 'crescimento alta indicador' },
  { nome: 'carteira', Comp: Wallet, cat: 'Finanças', termos: 'carteira orçamento' },
  { nome: 'trabalho', Comp: Briefcase, cat: 'Trabalho', termos: 'trabalho emprego maleta' },
  { nome: 'industria', Comp: Factory, cat: 'Trabalho', termos: 'indústria fábrica' },
  { nome: 'comercio', Comp: Store, cat: 'Trabalho', termos: 'comércio loja empreendedor' },

  // Segurança & Social
  { nome: 'seguranca', Comp: Shield, cat: 'Segurança', termos: 'segurança escudo proteção' },
  { nome: 'seguranca-ok', Comp: ShieldCheck, cat: 'Segurança', termos: 'segurança protegido' },
  { nome: 'policia', Comp: ShieldAlert, cat: 'Segurança', termos: 'polícia guarda defesa' },
  { nome: 'bombeiro', Comp: Flame, cat: 'Segurança', termos: 'bombeiro fogo chama incêndio' },
  { nome: 'assistencia', Comp: Handshake, cat: 'Social', termos: 'assistência social acordo aperto de mão' },
  { nome: 'crianca', Comp: Baby, cat: 'Social', termos: 'criança bebê infância' },
  { nome: 'acessibilidade', Comp: Accessibility, cat: 'Social', termos: 'acessibilidade inclusão pcd' },
  { nome: 'mao', Comp: Hand, cat: 'Social', termos: 'mão libras ajuda' },

  // Tempo, Local & Mídia
  { nome: 'calendario', Comp: Calendar, cat: 'Agenda', termos: 'calendário data agenda evento' },
  { nome: 'relogio', Comp: Clock, cat: 'Agenda', termos: 'relógio horário hora' },
  { nome: 'mapa', Comp: Map, cat: 'Local', termos: 'mapa localização' },
  { nome: 'local', Comp: MapPin, cat: 'Local', termos: 'local endereço ponto pin' },
  { nome: 'bussola', Comp: Compass, cat: 'Local', termos: 'bússola direção' },
  { nome: 'foto', Comp: ImageIcon, cat: 'Mídia', termos: 'foto imagem' },
  { nome: 'galeria', Comp: Images, cat: 'Mídia', termos: 'galeria fotos imagens' },
  { nome: 'camera', Comp: Camera, cat: 'Mídia', termos: 'câmera foto' },
  { nome: 'video', Comp: Video, cat: 'Mídia', termos: 'vídeo filme' },

  // Tecnologia
  { nome: 'computador', Comp: Monitor, cat: 'Tecnologia', termos: 'computador monitor pc' },
  { nome: 'celular', Comp: Smartphone, cat: 'Tecnologia', termos: 'celular smartphone app' },
  { nome: 'wifi', Comp: Wifi, cat: 'Tecnologia', termos: 'wifi internet conexão' },
  { nome: 'nuvem', Comp: Cloud, cat: 'Tecnologia', termos: 'nuvem cloud' },
  { nome: 'chave', Comp: Key, cat: 'Tecnologia', termos: 'chave senha acesso' },
  { nome: 'cadeado', Comp: Lock, cat: 'Tecnologia', termos: 'cadeado seguro privacidade lgpd' },
  { nome: 'assistente', Comp: Bot, cat: 'Tecnologia', termos: 'assistente robô ia chatbot' },
  { nome: 'ia', Comp: Sparkles, cat: 'Tecnologia', termos: 'ia inteligência artificial brilho' },
];

/** Mapa nome canônico → componente. */
const MAPA: Record<string, LucideIcon> = Object.fromEntries(CATALOGO.map((i) => [i.nome, i.Comp]));

/** Aliases dos nomes ANTIGOS (menus e Acesso Rápido) → componente, p/ compatibilidade. */
const ALIASES: Record<string, LucideIcon> = {
  // MenuIcon legado
  home: Home, building: Building, file: FileText, news: Newspaper, scale: Scale, phone: Phone,
  search: Search, info: Info, doc: FileText, users: Users, megaphone: Megaphone, map: Map, link: LinkIcon,
  // AtalhoIcone legado
  servicos: LayoutGrid, esic: FileSearch, ouvidoria: MessagesSquare, diario: ScrollText, dados: Database,
  saude: HeartPulse, educacao: GraduationCap, obras: HardHat, dinheiro: Banknote, telefone: Phone,
  mapa: Map, documento: FileText, calendario: Calendar, usuario: User, transparencia: Eye,
  // nomes usados em seeds de menu recentes
  user: User, pages: FileText, photo: ImageIcon, building2: Building2,
  // outros nomes em inglês que podem estar cadastrados
  gavel: Gavel, calendar: Calendar, mail: Mail, newspaper: Newspaper, image: ImageIcon,
  folder: Folder, settings: Settings, star: Star, heart: Heart, bell: Bell, shield: Shield,
};

/** Resolve um nome (canônico ou legado) para o componente do ícone. */
export function resolverIcone(nome?: string | null): LucideIcon | null {
  if (!nome) return null;
  const k = nome.trim().toLowerCase();
  return MAPA[k] ?? ALIASES[k] ?? null;
}

/** Renderiza um ícone do catálogo pelo nome (aceita nomes legados). */
export function Icone({ nome, size = 18, className, strokeWidth = 2 }: { nome?: string | null; size?: number; className?: string; strokeWidth?: number }) {
  const Comp = resolverIcone(nome);
  if (!Comp) return null;
  return <Comp size={size} className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** Categorias na ordem de exibição da galeria/seletor. */
export const CATEGORIAS_ICONE = [
  'Governo', 'Serviços', 'Documentos', 'Comunicação', 'Saúde', 'Educação', 'Cultura',
  'Esporte', 'Ambiente', 'Agricultura', 'Obras', 'Transporte', 'Infraestrutura',
  'Finanças', 'Trabalho', 'Segurança', 'Social', 'Agenda', 'Local', 'Mídia', 'Tecnologia',
];
