# Backend (Hono + Drizzle + Postgres)

**Status:** Scaffold, noch nicht implementiert.

Details siehe `docs/plans/2026-04-17-backend-split-design.md`.
Implementation startet mit Phase 1 (`docs/plans/2026-04-17-phase-1-backend-scaffold.md`, noch zu schreiben).

## Lokaler Dev-Start (später)

```bash
pnpm --filter @herzblatt/backend dev
```

## Tech-Stack

- Hono auf Node
- Drizzle ORM → Railway Postgres
- Zod für Validation
- CORS-gesicherter Endpoint auf `api.herzblatt-journal.com`
