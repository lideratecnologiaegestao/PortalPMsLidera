import { Global, Module } from '@nestjs/common';
import { RedisCacheService } from './redis-cache.service';

/** Cache Redis compartilhado, global (disponível a todos os módulos). */
@Global()
@Module({
  providers: [RedisCacheService],
  exports: [RedisCacheService],
})
export class CacheModule {}
