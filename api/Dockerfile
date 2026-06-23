# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app
# prisma precisa de openssl para gerar o engine
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-alpine AS runtime
WORKDIR /app
# postgresql16-client → pg_dump para os backups automáticos (PG16 server)
# tesseract-ocr + tesseract-ocr-data-por → OCR de PDFs escaneados (idioma pt)
# poppler-utils → pdftoppm (rasteriza páginas do PDF para PNG)
# git → exigido pelo eas-cli para empacotar o projeto do app (ADR-0006 Fase 2)
RUN apk add --no-cache openssl fontconfig postgresql16-client \
    tesseract-ocr tesseract-ocr-data-por poppler-utils git
# eas-cli → o worker de build do App do Cidadão dispara o EAS Build na nuvem.
RUN npm i -g eas-cli@latest && eas --version
ENV NODE_ENV=production
ENV MOBILE_SRC_DIR=/mobile-src
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
USER node
EXPOSE 3001
CMD ["node", "dist/main.js"]
