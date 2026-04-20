# Frontend-Dockerfile für Railway.
# rootDirectory ist apps/frontend → wir laufen in diesem Kontext.
# Astro SSR-Build mit standalone Node-Adapter.

FROM node:22-slim AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund --legacy-peer-deps

COPY . .
# Cache-Bust-Arg + Verifier — verhindert dass Railway den build-layer cached
# aus einer failed-build-layer (ohne dist/server/entry.mjs) ableitet.
# Der timestamp macht jede invocation unique → npm run build läuft immer frisch.
ARG BUILD_TIMESTAMP=20260420-130000
RUN echo "Build cache bust: $BUILD_TIMESTAMP" \
 && npm run build \
 && echo "=== dist/ tree after build ===" \
 && find dist -maxdepth 3 -type f \( -name "*.mjs" -o -name "*.js" \) | head -30 \
 && echo "=== searching for entry ===" \
 && find dist -name "entry*" -o -name "server.mjs" -o -name "index.mjs" 2>/dev/null | head -10

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
