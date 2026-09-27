# syntax=docker/dockerfile:1
# Image du service communautaire. Contexte de build = dossier community/
# (espace de travail npm : api + shared) ; contexte additionnel `app_public` = le
# dossier public/ de l'app (logos des marques, drapeaux, données) — cf. compose.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY api/package.json api/
RUN npm ci
COPY shared/src shared/src
COPY api/tsconfig.json api/
COPY api/src api/src
RUN npm run build -w api && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api/dist ./api/dist
COPY package.json ./
COPY api/package.json ./api/
# Site public + visuels de l'app (mêmes images et mêmes règles que l'app).
COPY site /app/site
COPY --from=app_public logos /app/app-public/logos
COPY --from=app_public flags /app/app-public/flags
COPY --from=app_public data/cars.json data/circuits.json /app/app-public/data/
ENV SITE_DIR=/app/site APP_PUBLIC_DIR=/app/app-public
WORKDIR /app/api
# Jamais root dans le conteneur.
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD wget -qO- http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1
CMD ["node", "dist/api/src/index.js"]
