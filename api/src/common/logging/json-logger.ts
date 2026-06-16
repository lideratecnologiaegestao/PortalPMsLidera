import { ConsoleLogger, LoggerService } from '@nestjs/common';
import { TenantContext } from '../tenant/tenant.context';

/**
 * Logger JSON estruturado (1 linha = 1 evento), pronto para Loki/Grafana.
 * Injeta automaticamente `tenant_id`, `request_id` e `user_id` do contexto da
 * requisição. Mensagens que já são objeto são espalhadas como campos de topo.
 *
 * NUNCA logar dado pessoal em claro (CPF, nome, conteúdo de manifestação,
 * geolocalização) — apenas identificadores opacos. Ver ADR-0001.
 */
export class JsonLogger extends ConsoleLogger implements LoggerService {
  private emit(level: string, message: unknown, context?: string) {
    const ctx = TenantContext.get();
    const base: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      context: context ?? this.context ?? undefined,
      tenant_id: ctx.tenantId ?? null,
      request_id: ctx.requestId ?? null,
      user_id: ctx.userId ?? null,
    };
    const payload =
      message && typeof message === 'object'
        ? { ...base, ...(message as object) }
        : { ...base, message: String(message) };
    process.stdout.write(JSON.stringify(payload) + '\n');
  }

  log(message: unknown, context?: string) { this.emit('info', message, context); }
  error(message: unknown, stack?: string, context?: string) {
    this.emit('error', message, context);
    if (stack) process.stdout.write(JSON.stringify({ level: 'error', stack }) + '\n');
  }
  warn(message: unknown, context?: string) { this.emit('warn', message, context); }
  debug(message: unknown, context?: string) { this.emit('debug', message, context); }
  verbose(message: unknown, context?: string) { this.emit('verbose', message, context); }
}
