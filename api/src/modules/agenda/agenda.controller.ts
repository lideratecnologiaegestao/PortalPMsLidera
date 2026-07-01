import { Body, Controller, Delete, Get, Header, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/rbac/roles.decorator';
import { Role } from '../../common/rbac/roles.enum';
import { RolesGuard } from '../../common/rbac/roles.guard';
import { AgendaService, FonteAgenda } from './agenda.service';
import { AtualizarAgendaItemDto, CriarAgendaItemDto } from './agenda.dto';

/** Intervalo padrão (mês corrente) quando de/ate não vierem. */
function intervaloPadrao(de?: string, ate?: string): { de: string; ate: string } {
  if (de && ate) return { de, ate };
  const hoje = new Date();
  const ini = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), 1));
  const fim = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() + 1, 0, 23, 59, 59));
  return { de: de ?? ini.toISOString(), ate: ate ?? fim.toISOString() };
}

function parseFontes(f?: string): FonteAgenda[] | undefined {
  if (!f) return undefined;
  const set = f.split(',').map((s) => s.trim()).filter((s) => ['agenda', 'evento'].includes(s));
  return set.length ? (set as FonteAgenda[]) : undefined;
}
function parseTipos(t?: string): string[] | undefined {
  if (!t) return undefined;
  const arr = t.split(',').map((s) => s.trim()).filter(Boolean);
  return arr.length ? arr : undefined;
}

/** Agenda pública — calendário read-only (sem auth). Prefixo global 'api'. */
@Controller('agenda')
export class AgendaPublicController {
  constructor(private readonly service: AgendaService) {}

  /** Itens do intervalo (default: mês corrente). Só públicos + overlays. */
  @Get()
  listar(@Query('de') de?: string, @Query('ate') ate?: string, @Query('tipos') tipos?: string, @Query('fontes') fontes?: string) {
    const iv = intervaloPadrao(de, ate);
    return this.service.listar(iv.de, iv.ate, { admin: false, tipos: parseTipos(tipos), fontes: parseFontes(fontes) });
  }

  @Get('proximos')
  proximos(@Query('limite') limite?: string) {
    return this.service.proximos(limite ? Number(limite) : 5, { admin: false });
  }

  /** Feed iCalendar (para "assinar" no Google/Apple/Outlook). */
  @Get('ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Content-Disposition', 'inline; filename="agenda.ics"')
  ics(@Query('de') de?: string, @Query('ate') ate?: string) {
    const iv = intervaloPadrao(de, ate);
    return this.service.ics(iv.de, iv.ate);
  }
}

/** Administração da Agenda. RBAC: admin/gestor. RLS por tenant. */
@Controller('admin/agenda')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN_PREFEITURA, Role.GESTOR)
export class AgendaAdminController {
  constructor(private readonly service: AgendaService) {}

  /** Calendário do admin (inclui itens privados + overlays). */
  @Get()
  listar(@Query('de') de?: string, @Query('ate') ate?: string, @Query('tipos') tipos?: string) {
    const iv = intervaloPadrao(de, ate);
    return this.service.listarAdmin(iv.de, iv.ate, parseTipos(tipos));
  }

  /** Lista de gestão (itens próprios brutos, sem overlay/expansão). */
  @Get('itens')
  itens() {
    return this.service.listarItens();
  }

  @Post('itens')
  criar(@Body() dto: CriarAgendaItemDto) {
    return this.service.criar(dto);
  }

  @Put('itens/:id')
  atualizar(@Param('id') id: string, @Body() dto: AtualizarAgendaItemDto) {
    return this.service.atualizar(id, dto);
  }

  @Delete('itens/:id')
  excluir(@Param('id') id: string) {
    return this.service.excluir(id);
  }
}
