# Backend-Dockerfile für Railway.
# Railway respektiert Dockerfile > Railpack/Nixpacks.
# rootDirectory ist apps/backend → wir laufen in diesem Kontext.

FROM node:22-slim AS builder

WORKDIR /app

# Dependencies installieren (npm install, nicht ci — kein package-lock.json im Monorepo)
COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

# Source + Build
COPY . .
RUN npm run build

# --- Runtime-Stage ---
FROM node:22-slim

WORKDIR /app

# Nur prod-deps für das Runtime-Image
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund --legacy-peer-deps

# Built-dist rüberkopieren
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/index.js"]
