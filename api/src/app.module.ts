import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { TenantMiddleware } from './common/tenant/tenant.middleware';
import { CacheModule } from './common/cache/cache.module';
import { PrismaModule } from './prisma/prisma.module';
import { RbacModule } from './common/rbac/rbac.module';
import { EscopoModule } from './common/escopo/escopo.module';
import { GruposModule } from './modules/grupos/grupos.module';
import { QueueModule } from './modules/queue/queue.module';
import { ThemeModule } from './modules/theme/theme.module';
import { ManifestacoesModule } from './modules/manifestacoes/manifestacoes.module';
import { TransparenciaModule } from './modules/transparencia/transparencia.module';
import { CmsModule } from './modules/cms/cms.module';
import { ChamadosModule } from './modules/chamados/chamados.module';
import { DiarioModule } from './modules/diario/diario.module';
import { IaModule } from './modules/ia/ia.module';
import { AplicModule } from './modules/aplic/aplic.module';
import { HealthModule } from './modules/health/health.module';
import { PntpModule } from './modules/pntp/pntp.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';
import { ServicosModule } from './modules/servicos/servicos.module';
import { UsersModule } from './modules/users/users.module';
import { MediaModule } from './modules/media/media.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PlatformSettingsModule } from './modules/platform-settings/platform-settings.module';
import { BackupModule } from './modules/backup/backup.module';
import { BannersModule } from './modules/banners/banners.module';
import { NoticiasModule } from './modules/noticias/noticias.module';
import { SecretariasModule } from './modules/secretarias/secretarias.module';
import { PrefeitoModule } from './modules/prefeito/prefeito.module';
import { GaleriaModule } from './modules/galeria/galeria.module';
import { HomeModule } from './modules/home/home.module';
import { EnquetesModule } from './modules/enquetes/enquetes.module';
import { PopupsModule } from './modules/popups/popups.module';
import { MenusModule } from './modules/menus/menus.module';
import { NotificacoesModule } from './modules/notificacoes/notificacoes.module';
import { ChatModule } from './modules/chat/chat.module';
import { PainelModule } from './modules/painel/painel.module';
import { DocumentosModule } from './modules/documentos/documentos.module';
import { LicitacoesModule } from './modules/licitacoes/licitacoes.module';
import { ConselhosModule } from './modules/conselhos/conselhos.module';
import { ConcursosModule } from './modules/concursos/concursos.module';
import { ContratosModule } from './modules/contratos/contratos.module';
import { ConveniosModule } from './modules/convenios/convenios.module';
import { SessionsModule } from './modules/sessions/sessions.module';
import { LgpdModule } from './modules/lgpd/lgpd.module';
import { FormulariosModule } from './modules/formularios/formularios.module';
import { AtendimentoModule } from './modules/atendimento/atendimento.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { RedirectsModule } from './modules/redirects/redirects.module';
import { EsicModule } from './modules/esic/esic.module';
import { BuscaModule } from './modules/busca/busca.module';
import { ElevationRequestsModule } from './modules/elevation-requests/elevation-requests.module';
import { EulaModule } from './modules/eula/eula.module';
import { TurnstileModule } from './modules/turnstile/turnstile.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { PwaModule } from './modules/pwa/pwa.module';
import { CampanhasModule } from './modules/campanhas/campanhas.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // rate limiting global (anti brute-force/DoS, ex.: callback OIDC)
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule, // global
    RbacModule,   // global (PermissionsService + PermissionsGuard)
    EscopoModule, // global (EscopoSecretariaService — escopo de conteúdo por secretaria, ADR-0005 Fase 4)
    CacheModule, // global (cache Redis compartilhado)
    QueueModule, // global (Redis + filas)
    SessionsModule, // global (sessoes stateful — deve vir ANTES do AuthModule)
    EulaModule,    // global (EulaService disponível em AuthModule e guards de ouvidoria)
    TurnstileModule, // global (TurnstileService para validação em login/cadastro/comentários)
    AuthModule, // gov.br OIDC
    ThemeModule,
    ManifestacoesModule,
    TransparenciaModule, // transparência ativa + dados abertos (LC 131)
    CmsModule, // páginas dinâmicas por blocos
    ChamadosModule, // app do cidadão (denúncias georreferenciadas)
    PainelModule, // painéis de parede (TV) — BI ouvidor/prefeito
    DocumentosModule, // motor único de cadastro de documentos (Leis, Decretos…)
    LicitacoesModule, // cadastro de licitações (modalidade+critério+docs por fase)
    ConselhosModule, // cadastro de conselhos municipais (tipo+membros+documentos)
    ConcursosModule, // cadastro de concursos/seletivos (certame+docs por fase)
    ContratosModule, // cadastro de contratos e aditivos (dimensão PNTP)
    ConveniosModule, // cadastro de convênios e transferências (dimensão PNTP)
    DiarioModule, // Diário Oficial (ICP-Brasil, imutável)
    IaModule, // triagem, RAG/busca e chatbot (API Anthropic)
    AplicModule, // importação da carga contábil APLIC (TCE-MT) — módulo CT
    HealthModule, // liveness/readiness + métricas Prometheus
    PntpModule, // painel de conformidade PNTP/Atricon
    ServicosModule, // catálogo de serviços municipais
    UsersModule, // gestão de usuários do tenant (admin)
    GruposModule, // grupos de acesso granular (permissões por tenant)
    MediaModule, // biblioteca de mídia (upload, galeria, rota pública mascarada)
    PlatformModule, // gerenciador da plataforma (super_admin: CRUD de tenants)
    PlatformSettingsModule, // config global da plataforma (branding Lidera, SMTP global, backups)
    BackupModule, // backups automáticos (pg_dump + storage) → MinIO portal-backups
    BannersModule, // banners/carrossel da home
    NoticiasModule, // notícias/imprensa da home
    SecretariasModule, // secretarias municipais
    PrefeitoModule,    // cadastro do Prefeito(a)/Vice + galeria de ex-prefeitos
    GaleriaModule,     // galeria de fotos e vídeos compartilhada (mp4 + YouTube)
    HomeModule,        // layout configurável da home (Acesso Rápido + slider)
    EnquetesModule,    // enquetes (poll) — voto anônimo + shortcode no slider
    PopupsModule,      // popups do portal (imagem/vídeo/YouTube/HTML por página)
    MenusModule,       // menus dinâmicos por tenant (cabeçalho/rodapé)
    NotificacoesModule, // notificações multicanal (WhatsApp/e-mail) + contatos verificados
    ChatModule, // chat interno (funcionários) + WebSocket + integração e-SIC
    LgpdModule, // self-service do titular (art. 18) + incidentes de segurança (art. 48)
    FormulariosModule, // construtor de formulários (drag-drop, captcha, export)
    AtendimentoModule, // chatbot + atendimento humano omnichannel (widget + WhatsApp)
    WhatsappModule, // adapter multi-provider (Z-API / Evolution / Meta Cloud stub)
    RedirectsModule, // redirects 301 administráveis por tenant (migração Joomla → slugs)
    EsicModule, // relatório público de transparência ativa do e-SIC (LAI)
    BuscaModule, // buscador unificado cross-módulo (ADR-0004, índice search_index)
    ElevationRequestsModule, // ADR-0005 Fase 2: solicitações de elevação de papel
    AppConfigModule,         // ADR-0006 Fase 1: config white-label do App do Cidadão
    DashboardModule,         // Painel BI administrativo (agregado multi-módulo)
    PwaModule,               // ícone PWA por tenant (GET /api/pwa/icon)
    CampanhasModule,         // campanhas institucionais (tema/faixa/banner/popup/efeito)
  ],
  providers: [
    // ordem importa: rate limit → autenticação (popula req.user) → RolesGuard das rotas
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // resolve o tenant pelo Host em TODAS as rotas e abre o contexto RLS
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
