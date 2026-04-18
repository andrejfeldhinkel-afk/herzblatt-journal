# Frontend-Dockerfile für Railway.
# rootDirectory ist apps/frontend → wir laufen in diesem Kontext.
# Astro SSR-Build mit standalone Node-Adapter.

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
RUN npm run build

# --- Runtime-Stage ---
FROM node:22-slim

WORKDIR /app

# Nur prod-deps installieren (spart viele MB)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

# Built-dist + public statische Assets
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["node", "dist/server/entry.mjs"]
