import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRelatorioService } from './users-relatorio.service';
import { ThemeModule } from '../theme/theme.module';

/** Gestão de usuários do tenant (ADMIN_PREFEITURA/SUPER_ADMIN). LGPD: sem hashes. */
@Module({
  imports: [ThemeModule], // ThemeService para logo nos relatórios PDF
  controllers: [UsersController],
  providers: [UsersService, UsersRelatorioService],
  exports: [UsersService, UsersRelatorioService],
})
export class UsersModule {}
