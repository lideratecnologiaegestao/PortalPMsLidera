import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, RequestMethod } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { JsonLogger } from './common/logging/json-logger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // logs JSON estruturados em produção (Loki/Grafana); pretty em dev
  if (process.env.NODE_ENV === 'production') {
    app.useLogger(new JsonLogger());
  }
  // A rota pública de mídia (/midia/:tipo/:categoria/:arquivo) fica FORA do
  // prefixo /api — o backend serve o stream sem expor o storage_key real.
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'midia/:tipo/:categoria/:arquivo', method: RequestMethod.GET }],
  });
  app.use(helmet()); // headers de segurança (HSTS, X-Content-Type-Options, etc.)
  app.use(cookieParser()); // cookies de sessão gov.br (HttpOnly)

  // CORS com allowlist: cookies de sessão exigem credentials → não refletir
  // qualquer Origin. Multi-tenant: cada prefeitura tem seu próprio subdomínio,
  // então além da lista explícita (ALLOWED_ORIGINS, p/ domínios próprios das
  // prefeituras) liberamos SUFIXOS de domínio da plataforma
  // (ALLOWED_ORIGIN_SUFFIXES, ex.: ".lidera.app.br") — cobre todos os tenants
  // do curinga *.lidera.app.br + o host do gerenciador.
  const isProd = process.env.NODE_ENV === 'production';
  const allowed = (process.env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const suffixes = (process.env.ALLOWED_ORIGIN_SUFFIXES ?? '')
    .split(',')
    .map((s) => s.trim().replace(/^\./, '')) // normaliza ".lidera.app.br" → "lidera.app.br"
    .filter(Boolean);
  const originPermitida = (origin: string): boolean => {
    if (allowed.includes(origin)) return true;
    try {
      const host = new URL(origin).hostname;
      return suffixes.some((suf) => host === suf || host.endsWith(`.${suf}`));
    } catch {
      return false;
    }
  };
  app.enableCors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // app mobile / curl / same-origin
      if (originPermitida(origin)) return cb(null, true);
      if (!isProd) return cb(null, true); // dev: libera para facilitar
      return cb(new Error('Origin não permitida por CORS'));
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(Number(process.env.PORT ?? 3001));
}
bootstrap();
