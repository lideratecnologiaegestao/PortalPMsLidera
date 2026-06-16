# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# saída standalone do Next (next.config.mjs: output: 'standalone')
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# cache de ISR/fetch precisa ser gravável pelo usuário 'node'
RUN mkdir -p .next/cache && chown -R node:node .next
USER node
EXPOSE 3000
CMD ["node", "server.js"]
