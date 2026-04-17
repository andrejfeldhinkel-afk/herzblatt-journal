# Phase 0: Monorepo-Umbau Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bestehenden Astro-Monolithen in eine pnpm-Workspace-Struktur überführen (`apps/frontend` + leere `apps/backend` + `packages/shared`), ohne die Live-Site zu zerbrechen.

**Architecture:** Alle bestehenden Astro-Files wandern nach `apps/frontend/`. Root behält ein Workspace-Config + ein Shim-`package.json` mit `build`-Script, das `pnpm --filter frontend build` ausführt — so bleibt Railway's Auto-Detection funktionsfähig, auch bevor der `rootDirectory` im Railway-Dashboard umgestellt wird. Nach der manuellen Dashboard-Umstellung wird das Shim entfernt.

**Tech Stack:** pnpm-Workspaces, Astro (unverändert), Railway (unverändert).

**Reference:** Design-Doc `docs/plans/2026-04-17-backend-split-design.md`, Abschnitt „Phase 0".

**Besondere Hinweise:**
- **Arbeitsverzeichnis:** Fresh Clone in `/tmp/herzblatt-deploy` (CLAUDE.md — nicht im Workspace arbeiten, da `.git/index.lock` stuck sein kann).
- **CI/Build-Test lokal:** Der vollständige Astro-Build dauert ~7 min. Wir machen **dennoch** einen lokalen Build-Test vor dem Push, um Regressionen zu fangen.
- **Railway-Zwang:** Kein Schritt bricht Railway, weil das Shim-Script greift, solange der User den `rootDirectory` nicht umgestellt hat.

---

## Task 1: Fresh Clone + Git-Sauberkeit prüfen

**Files:** Keine Änderung — nur Checkout.

**Step 1: In /tmp ein frisches Clone holen**

```bash
cd /tmp && rm -rf herzblatt-deploy
# Token: siehe CLAUDE.md Section 'GitHub-Credentials (PERMANENT)'
GH_TOKEN="<token aus CLAUDE.md>"
git clone "https://andrejfeldhinkel-afk:${GH_TOKEN}@github.com/andrejfeldhinkel-afk/herzblatt-journal.git" herzblatt-deploy
cd /tmp/herzblatt-deploy
git config user.email "andrej@leadpartner.net"
git config user.name "Andrej Feldhinkel"
```

Expected: Clone erfolgreich, kein Fehler.

**Step 2: Sauberen Git-State verifizieren**

```bash
git status
git log --oneline -1
```

Expected:
- `nothing to commit, working tree clean`
- Letzter Commit ist der Design-Doc (`e8654d9 docs(plans): Backend-Split-Design ...`) oder neuer.

**Step 3: Verifizieren, dass pnpm verfügbar ist**

```bash
pnpm --version
```

Expected: Versions-String (z. B. `9.x.x` oder `10.x.x`). Falls nicht installiert: `npm install -g pnpm` vorweg.

---

## Task 2: Ursprüngliche package.json sichern

**Files:**
- Create: `/tmp/herzblatt-deploy/package.json.original` (temporäre Kopie)

**Step 1: Backup-Kopie anlegen**

```bash
cp package.json package.json.original
```

Expected: Datei existiert, identisch zu `package.json`.

**Step 2: Verifizieren**

```bash
diff package.json package.json.original
```

Expected: Keine Ausgabe (identisch).

_Diese Backup-Datei wird am Ende von Task 14 wieder gelöscht — sie ist nur ein Safety-Net._

---

## Task 3: pnpm-workspace.yaml anlegen

**Files:**
- Create: `/tmp/herzblatt-deploy/pnpm-workspace.yaml`

**Step 1: Datei schreiben**

Inhalt:

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Step 2: Verifizieren**

```bash
cat pnpm-workspace.yaml
```

Expected: Drei Zeilen, wie oben.

---

## Task 4: apps/frontend-Zielstruktur anlegen und Code verschieben

**Files:** Move-Operationen — kein neuer Content, nur Pfad-Änderungen.

**Step 1: Zielordner erstellen**

```bash
mkdir -p apps/frontend
```

**Step 2: Astro-relevante Files und Ordner verschieben**

```bash
# Source
git mv src apps/frontend/src
git mv public apps/frontend/public

# Config-Files auf Root-Ebene
git mv astro.config.mjs apps/frontend/astro.config.mjs
git mv tsconfig.json apps/frontend/tsconfig.json
git mv package.json apps/frontend/package.json
git mv package-lock.json apps/frontend/package-lock.json 2>/dev/null || true
```

Expected: Alle `git mv` laufen erfolgreich durch.

**Step 3: Nicht-Astro-Dateien im Root belassen**

Verifizieren dass im Root bleiben:
- `docs/`
- `scripts/`
- `data/`
- `.gitignore`
- `README.md` (falls vorhanden)
- `pnpm-workspace.yaml`
- `package.json.original` (Backup aus Task 2)

```bash
ls -la
```

Expected: Kein `src/`, `public/`, `astro.config.mjs`, `tsconfig.json` im Root.

---

## Task 5: apps/frontend/package.json anpassen (Name ändern)

**Files:**
- Modify: `apps/frontend/package.json`

**Step 1: Aktuellen Inhalt anschauen**

```bash
cat apps/frontend/package.json
```

**Step 2: `name` auf `@herzblatt/frontend` ändern**

Das Feld `"name": "blog"` durch `"name": "@herzblatt/frontend"` ersetzen. Alle anderen Felder (Scripts, Dependencies) unverändert lassen.

Erwartetes Ergebnis (relevanter Auszug):

```json
{
  "name": "@herzblatt/frontend",
  "type": "module",
  "version": "0.0.1",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    ...
  }
}
```

**Step 3: Verifizieren, dass JSON valid bleibt**

```bash
node -e "console.log(require('./apps/frontend/package.json').name)"
```

Expected: `@herzblatt/frontend`.

---

## Task 6: Root-package.json als Workspace-Shim neu schreiben

**Files:**
- Create: `/tmp/herzblatt-deploy/package.json` (neu, Workspace-Root)

**Step 1: Neue Root-package.json schreiben**

Inhalt (vollständig):

```json
{
  "name": "herzblatt-journal-workspace",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "build": "pnpm --filter @herzblatt/frontend build",
    "start": "pnpm --filter @herzblatt/frontend start",
    "dev": "pnpm --filter @herzblatt/frontend dev",
    "frontend:build": "pnpm --filter @herzblatt/frontend build",
    "frontend:dev": "pnpm --filter @herzblatt/frontend dev",
    "backend:build": "pnpm --filter @herzblatt/backend build",
    "backend:dev": "pnpm --filter @herzblatt/backend dev"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

**Zweck:**
- `build` / `start` / `dev` ganz oben sind das **Shim**: sie rufen das Frontend-Build auf. Railway's Auto-Detect findet diese und führt weiter den richtigen Frontend-Build aus, auch wenn `rootDirectory` noch auf `/` steht.
- Die `frontend:*` / `backend:*` Scripts sind für explizite Service-Arbeit ab Phase 1.

**Step 2: JSON-Validität prüfen**

```bash
node -e "console.log('Name:', require('./package.json').name); console.log('Build script:', require('./package.json').scripts.build)"
```

Expected:
```
Name: herzblatt-journal-workspace
Build script: pnpm --filter @herzblatt/frontend build
```

---

## Task 7: apps/backend-Scaffold (leer)

**Files:**
- Create: `apps/backend/package.json`
- Create: `apps/backend/src/.gitkeep`
- Create: `apps/backend/README.md`

**Step 1: Struktur anlegen**

```bash
mkdir -p apps/backend/src
```

**Step 2: apps/backend/package.json schreiben**

Inhalt:

```json
{
  "name": "@herzblatt/backend",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "echo 'Backend noch nicht implementiert (Phase 1 in Plan)'",
    "build": "echo 'Backend noch nicht implementiert (Phase 1 in Plan)'"
  }
}
```

**Step 3: Placeholder-Files**

```bash
touch apps/backend/src/.gitkeep
```

Und `apps/backend/README.md`:

```markdown
# Backend (Hono + Drizzle + Postgres)

**Status:** Scaffold, noch nicht implementiert.

Details siehe `docs/plans/2026-04-17-backend-split-design.md`.
Implementation startet mit Phase 1.
```

**Step 4: Verifizieren**

```bash
tree apps/backend
```

Expected:
```
apps/backend
├── README.md
├── package.json
└── src
    └── .gitkeep
```

---

## Task 8: packages/shared-Scaffold

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/tsconfig.json`

**Step 1: Ordner**

```bash
mkdir -p packages/shared/src
```

**Step 2: packages/shared/package.json**

Inhalt:

```json
{
  "name": "@herzblatt/shared",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

**Step 3: packages/shared/src/index.ts — Shared Types placeholder**

Inhalt:

```ts
/**
 * Shared types zwischen Frontend und Backend.
 * Wird in Phase 1 befüllt — aktuell nur Placeholder.
 */

export interface PageviewEvent {
  ts: string;
  path: string;
  referrer: string;
  ua?: string;
}

export interface ClickEvent {
  ts: string;
  target: string;
  source: string;
  type?: string;
}

export interface RegistrationEvent {
  ts: string;
  email: string;
  source: string;
}

export interface SubscriberEntry {
  email: string;
  createdAt: string;
  source: string;
}
```

**Step 4: packages/shared/tsconfig.json**

Inhalt:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*"]
}
```

---

## Task 9: .gitignore aktualisieren

**Files:**
- Modify: `/tmp/herzblatt-deploy/.gitignore`

**Step 1: Bestehenden Inhalt anschauen**

```bash
cat .gitignore
```

**Step 2: pnpm- und Workspace-spezifische Entries ergänzen**

Zwischen den bestehenden `node_modules/` und `# environment variables` Blöcken **eine neue Zeile** einfügen:

```
# pnpm / workspace
apps/*/node_modules/
packages/*/node_modules/
.pnpm-store/

# build output
apps/*/dist/
apps/*/.astro/
packages/*/dist/
```

Falls `dist/` und `.astro/` schon im Root-ignore sind, die spezifischeren Workspace-Pfade zusätzlich einfügen.

**Step 3: Verifizieren**

```bash
grep -E 'apps/|packages/|\.pnpm-store' .gitignore
```

Expected: Neue Zeilen sind da.

---

## Task 10: package.json.original entfernen (war nur Safety-Net)

**Files:**
- Delete: `/tmp/herzblatt-deploy/package.json.original`

**Step 1: Löschen**

```bash
rm package.json.original
```

**Step 2: Verifizieren**

```bash
ls package.json*
```

Expected: Nur noch `package.json` (das neue Workspace-Shim).

---

## Task 11: pnpm install lokaler Test

**Files:** Keine Änderung — nur Verifikation.

**Step 1: Install ausführen**

```bash
cd /tmp/herzblatt-deploy && pnpm install
```

Expected:
- Kein Fehler
- `node_modules/` wird in Root angelegt (pnpm hard-linkt von store)
- `apps/frontend/node_modules/` existiert (als Symlinks)
- `apps/backend/node_modules/` existiert (leer oder minimal)
- `packages/shared/node_modules/` existiert (leer oder minimal)

**Step 2: Workspace-Liste prüfen**

```bash
pnpm list -r --depth -1
```

Expected-Output-Snippet (gekürzt):
```
@herzblatt/frontend
@herzblatt/backend
@herzblatt/shared
```

**Fehler-Debug:**
- Wenn `ERR_PNPM_LOCKFILE_BREAKING_CHANGE`: `rm package-lock.json` (falls übrig) und erneut versuchen.
- Wenn `ERESOLVE` — Dependencies aus dem alten package-lock.json-Stand konflikte: `rm -rf node_modules && pnpm install --no-frozen-lockfile`.

---

## Task 12: Lokaler Build-Test (nur Frontend)

**Files:** Keine Änderung — nur Verifikation.

**Step 1: Build via Workspace-Shim**

```bash
cd /tmp/herzblatt-deploy && pnpm build 2>&1 | tail -15
```

Expected:
- Build läuft ~5–7 min
- Ende-Output enthält `[build] Complete!`
- `apps/frontend/dist/` wird erzeugt
- Kein TypeScript-Fehler

**Step 2: Build-Output verifizieren**

```bash
ls apps/frontend/dist/client/index.html
ls apps/frontend/dist/server/entry.mjs
```

Expected: Beide Files existieren.

**Step 3: Negativ-Fall dokumentieren**

Falls der Build fehlschlägt:
- Fehler in `tail -50` analysieren
- Häufigste Ursache: Pfad-Probleme in `astro.config.mjs` (relative Pfade)
- **NICHT pushen** — Task 13 nur bei grünem Build ausführen

---

## Task 13: Commit + Push (Monorepo-Struktur + Shim)

**Files:** Alle geänderten/neuen Files stagen.

**Step 1: Stage prüfen**

```bash
cd /tmp/herzblatt-deploy && git status --short
```

Expected:
- Neue Files: `pnpm-workspace.yaml`, `apps/backend/*`, `packages/shared/*`, `package.json` (neu)
- Verschobene Files: `apps/frontend/src/...`, `apps/frontend/public/...`, `apps/frontend/astro.config.mjs`, `apps/frontend/tsconfig.json`, `apps/frontend/package.json`
- Modified: `.gitignore`

**Step 2: Alles stagen (außer `node_modules`, `dist`, `.astro`)**

```bash
git add pnpm-workspace.yaml package.json .gitignore
git add apps/ packages/
```

**Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(monorepo): Phase 0 — Frontend nach apps/frontend, Scaffolds für Backend + Shared

Umbau auf pnpm-Workspaces als Grundlage für Backend-Split (siehe
docs/plans/2026-04-17-backend-split-design.md).

## Struktur
- apps/frontend/              — bisheriger Astro-Code, unverändert
- apps/backend/               — leeres Scaffold, Implementation in Phase 1
- packages/shared/            — Shared Types zwischen Services (initial)
- pnpm-workspace.yaml         — workspace config
- package.json (root)         — Shim: build/start rufen --filter frontend auf

## Railway-Kompatibilität
Root-package.json behält 'build'/'start'-Scripts, die an den Frontend-Workspace
delegieren. Railway-Auto-Detect findet sie weiterhin, auch wenn rootDirectory
noch nicht auf apps/frontend umgestellt ist. Umstellung in Task 14.

## Nicht geändert
- astro.config.mjs (nur verschoben)
- alle bestehenden Routen, APIs, Content
- scripts/, data/, docs/ bleiben im Root

## Build-Verifikation
Lokaler 'pnpm build' erfolgreich durchgelaufen (apps/frontend/dist/ erzeugt).
EOF
)"
```

Expected: Commit erstellt, Ausgabe listet alle verschobenen + neuen Files.

**Step 4: Push**

```bash
git push origin main 2>&1 | tail -3
```

Expected: `main -> main` mit dem neuen Commit-Hash.

---

## Task 14: Manuelle Railway-Einstellung (USER-SCHRITT)

**Files:** Keine — Railway-Dashboard-Aktion.

**⚠ Dieser Task ist manuell — Claude kann ihn nicht automatisieren.**

**Step 1: Warten bis Railway mit dem Shim durchdeployed**

Nach `git push origin main` triggert Railway einen Deploy. Der Shim sollte greifen — Railway findet `pnpm build` in der Root-package.json, pnpm liest `pnpm-workspace.yaml`, findet `apps/frontend/`, baut dort.

Warten: ~7–10 Minuten (Build + Deploy).

**Step 2: Verifikation dass die Site weiter läuft (Shim funktioniert)**

```bash
curl -sI https://herzblatt-journal.com/ | grep -iE 'HTTP|last-modified'
```

Expected: `HTTP/2 200` mit aktuellem Last-Modified.

**Stop-Fall:** Wenn der Build auf Railway fehlschlägt:
- Railway Dashboard → frontend-Service → Deployments → letzter Deploy → Logs
- Typisches Problem: Railway nutzt npm statt pnpm → nixpacks.toml nachschieben (siehe Step 5 unten)

**Step 3: rootDirectory im Railway-Dashboard umstellen**

Railway Dashboard → Projekt **Herzblatt-Journal** → Service **herzblatt-journal** → **Settings** → **Source** → **Root Directory** → `apps/frontend` eintragen → **Save**.

Railway re-deployed automatisch. Diesmal ohne Shim-Umweg, direkter Frontend-Build.

**Step 4: Post-Deploy-Verifikation**

```bash
curl -sI https://herzblatt-journal.com/ | grep -iE 'HTTP|last-modified'
curl -s https://herzblatt-journal.com/blog/love-languages | grep -c 'Die 5 Love Languages'
```

Expected:
- HTTP 200, neues Last-Modified (jüngster Deploy-Zeit)
- 5+ Treffer für `Die 5 Love Languages`

**Step 5 (nur wenn nötig): nixpacks.toml hinzufügen**

Falls Railway pnpm nicht erkennt, im Root-Repo `nixpacks.toml` committen:

```toml
[phases.setup]
nixPkgs = ["nodejs_22", "pnpm"]

[phases.install]
cmds = ["pnpm install --frozen-lockfile=false"]

[phases.build]
cmds = ["pnpm --filter @herzblatt/frontend build"]

[start]
cmd = "pnpm --filter @herzblatt/frontend start"
```

Dann commit + push, erneut in Railway-Dashboard schauen.

---

## Task 15: Shim aus Root-package.json entfernen (optional, cleanup)

**⚠ NUR ausführen, wenn Task 14 Step 3 erfolgreich war (rootDirectory=`apps/frontend` läuft stabil).**

**Files:**
- Modify: `/tmp/herzblatt-deploy/package.json`

**Step 1: Die `build`/`start`/`dev`-Scripts ohne Workspace-Filter-Alias lassen**

Ersetze das Shim durch saubere Dev-Scripts:

```json
{
  "name": "herzblatt-journal-workspace",
  "version": "0.0.1",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "scripts": {
    "frontend:build": "pnpm --filter @herzblatt/frontend build",
    "frontend:dev":   "pnpm --filter @herzblatt/frontend dev",
    "frontend:start": "pnpm --filter @herzblatt/frontend start",
    "backend:build":  "pnpm --filter @herzblatt/backend build",
    "backend:dev":    "pnpm --filter @herzblatt/backend dev"
  },
  "engines": {
    "node": ">=22.0.0"
  }
}
```

Die Top-Level `build`/`start`/`dev` Scripts entfernen — Railway braucht sie nicht mehr, weil `rootDirectory=apps/frontend` direkt dort baut.

**Step 2: Commit + Push**

```bash
git add package.json
git commit -m "chore(monorepo): remove root build shim — Railway nutzt jetzt apps/frontend direkt"
git push origin main 2>&1 | tail -3
```

**Step 3: Railway-Deploy abwarten + verifizieren**

```bash
sleep 300 && curl -sI https://herzblatt-journal.com/ | grep -iE 'HTTP|last-modified'
```

Expected: HTTP 200, Last-Modified nach dem letzten Commit.

---

## Phase 0 abgeschlossen — was jetzt funktioniert

- ✅ pnpm-Workspace-Struktur steht
- ✅ `apps/frontend/` enthält den bestehenden Astro-Code unverändert
- ✅ `apps/backend/` ist als leeres Scaffold bereit für Phase 1
- ✅ `packages/shared/` hat initiale Event-Types
- ✅ Live-Site läuft weiter (weder Funktionalität noch Performance geändert)
- ✅ Railway baut nur noch `apps/frontend/` (weniger Kontext für Build — ggf. marginal schneller, aber Hauptgewinn kommt erst mit Phase 1)

**Nächster Schritt:** Phase 1 — Backend aufbauen. Eigener Plan: `docs/plans/2026-04-17-phase-1-backend-scaffold.md` (noch zu schreiben).

## Rollback-Notfall

Falls Phase 0 Railway bricht und der Shim (Task 14 Step 2) nicht greift:

```bash
cd /tmp/herzblatt-deploy
git revert HEAD --no-edit    # Revert des Monorepo-Commits
git push origin main
```

Railway deployed in ~7 min den vorherigen Monolith-Stand — Site ist wieder online.
