import { Injectable } from '@nestjs/common';
import { redisConnection } from '../../modules/queue/redis.config';

/**
 * Cache compartilhado em Redis (JSON + TTL). Reusa a conexão única do BullMQ,
 * num namespace próprio para não colidir com as chaves de fila.
 *
 * Substitui caches em memória (que quebram em multi-instância): com Redis, o
 * cache é compartilhado por todas as réplicas da API e invalidável de forma
 * coerente. Ver ADR-0001 (camadas de cache).
 */
@Injectable()
export class RedisCacheService {
  private readonly ns = `${process.env.BULLMQ_PREFIX ?? 'portal'}:cache:`;

  async get<T>(key: string): Promise<T | null> {
    const raw = await redisConnection.get(this.ns + key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redisConnection.set(this.ns + key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await redisConnection.del(this.ns + key);
  }
}
