import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CloudflareService } from './cloudflare.service';

/**
 * Integração com a Cloudflare (Custom Hostnames / Cloudflare for SaaS).
 * Exporta o CloudflareService para ser injetado no provisionamento de tenants.
 */
@Module({
  imports: [
    HttpModule.register({
      timeout: 15_000, // a Cloudflare costuma responder rápido; falha cedo
      maxRedirects: 0,
    }),
  ],
  providers: [CloudflareService],
  exports: [CloudflareService],
})
export class CloudflareModule {}
