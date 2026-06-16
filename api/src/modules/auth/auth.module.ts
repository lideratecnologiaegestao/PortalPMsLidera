import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GovbrOidcService } from './govbr-oidc.service';
import { MfaController } from './mfa.controller';
import { MfaService } from './mfa.service';
import { LoginController } from './login.controller';
import { PerfilController } from './perfil.controller';
import { PerfilService } from './perfil.service';
import { CidadaoAuthController } from './cidadao-auth.controller';
import { CidadaoAuthService } from './cidadao-auth.service';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';

/**
 * Autenticação via gov.br (Login Único / OIDC).
 *
 * O JwtAuthGuard é registrado como guard GLOBAL no AppModule (roda antes do
 * RolesGuard de cada rota). A autorização por papel continua no RolesGuard e
 * o isolamento de dados no RLS — três camadas independentes.
 *
 * SessionsService é injetado via @Global() SessionsModule (registrado antes no
 * AppModule) — sem importação explícita para evitar dependência circular.
 */
@Module({
  imports: [NotificacoesModule],
  controllers: [AuthController, MfaController, LoginController, PerfilController, CidadaoAuthController],
  providers: [AuthService, GovbrOidcService, MfaService, PerfilService, CidadaoAuthService],
  exports: [AuthService, MfaService],
})
export class AuthModule {}
