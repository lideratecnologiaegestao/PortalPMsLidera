import IORedis from 'ioredis';

/**
 * Conexão Redis única, compartilhada por todas as filas (singleton).
 * Flags obrigatórias para BullMQ / Windows Server (suas convenções).
 *
 * O Redis é COMPARTILHADO com o Evolution API (que usa o DB 6). O portal usa um
 * DB dedicado (REDIS_DB) + key prefix (BULLMQ_PREFIX) para não colidir. Ver
 * docs/12-infraestrutura.md.
 */
export const redisConnection = new IORedis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT ?? 6379),
  password: process.env.REDIS_PASSWORD,
  db: Number(process.env.REDIS_DB ?? 1),
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null, // obrigatório BullMQ
  enableReadyCheck: false, // obrigatório Windows Server
  retryStrategy: (times) => Math.min(times * 1000, 30000),
});

/** Prefixo de chaves das filas BullMQ (isola do Evolution no Redis compartilhado). */
export const bullPrefix = process.env.BULLMQ_PREFIX ?? 'portal';

/**
 * Conexão Redis DEDICADA para comandos avulsos (sessões/presença online).
 * Separada da `redisConnection` para não disputar o pipe com os comandos
 * BLOQUEANTES dos workers BullMQ (BRPOPLPUSH) — crítico no hot path do auth.
 * Mesmas opções via `.duplicate()`.
 */
export const redisCommands = redisConnection.duplicate();
