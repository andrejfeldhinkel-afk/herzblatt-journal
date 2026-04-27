# Payment-Provider-Management im Admin — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Migrate hardcoded Payment-Credentials (Whop, Micropayment) aus Railway-Env-Vars in eine verschlüsselte DB-Tabelle, gesteuert über eine neue Admin-Page `/herzraum/payments`. Pro-Methode-Toggle, Test-Connection-Button, Live-Update auf `/ebook`.

**Architecture:** Drizzle-Table `payment_methods` (3 Initial-Rows) mit AES-256-GCM-encrypted Secrets. Backend-Routes laden Config aus DB statt env. Erstmaliger Backend-Start seedet Tabelle aus existierenden Env-Vars. Frontend `/herzraum/payments` Astro-Page mit 3 Cards (Toggle, Edit, Test).

**Tech Stack:** Hono (Backend), Drizzle ORM, PostgreSQL, Astro 5 (Frontend), Node Crypto (AES-GCM), TypeScript, Vitest (Backend-Tests), pnpm Monorepo

**Repo:** `andrejfeldhinkel-afk/herzblatt-journal` (NICHT das lokale flat-repo — siehe Memory `project_repo_structure.md`)

**Design-Referenz:** [`docs/plans/2026-04-27-payments-admin-design.md`](2026-04-27-payments-admin-design.md)

**Verified file conventions** (geprüft am 2026-04-27 gegen origin/main):
- DB-Client export: `apps/backend/src/db/index.ts` → `export const db`
- Migrations-Boot: `apps/backend/src/db/migrate.ts` → `runStartupMigrations()`
- Auth-Middleware: `apps/backend/src/lib/auth-middleware.ts` → `export const requireSession`
- Audit-Log: `apps/backend/src/lib/audit.ts`
- Existing Checkout-Route: `apps/backend/src/routes/micropayment-checkout.ts` (NICHT `checkout-micropayment.ts`)
- Existing Webhooks: `apps/backend/src/routes/whop-webhook.ts`, `apps/backend/src/routes/micropayment-webhook.ts`

---

## Setup (vor allen Tasks)

```bash
# Fresh Clone (Memory: project_repo_structure.md)
git clone git@github.com:andrejfeldhinkel-afk/herzblatt-journal.git /tmp/herzblatt-payments-admin
cd /tmp/herzblatt-payments-admin
git checkout -b feat/payments-admin
pnpm install

# Local-Dev-DB starten (oder DB_URL aus Railway-Staging)
# Backend-Test-Run
pnpm --filter backend test
```

---

## Phase 1 — Foundation (DB + Crypto)

### Task 1: Drizzle-Schema für `payment_methods`

**Files:**
- Modify: `apps/backend/src/db/schema.ts` (Tabelle hinzufügen)

**Step 1: Tabellen-Definition ergänzen**

```ts
// apps/backend/src/db/schema.ts (am Ende anhängen)
import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const paymentMethods = pgTable('payment_methods', {
  slug: text('slug').primaryKey(),
  provider: text('provider').notNull(),
  displayName: text('display_name').notNull(),
  enabled: boolean('enabled').notNull().default(false),
  testMode: boolean('test_mode').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  publicConfig: jsonb('public_config').notNull().default({}),
  encryptedSecrets: text('encrypted_secrets'),
  lastTestAt: timestamp('last_test_at', { withTimezone: true }),
  lastTestStatus: text('last_test_status'),
  lastTestError: text('last_test_error'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  updatedBy: text('updated_by'),
});

export type PaymentMethod = typeof paymentMethods.$inferSelect;
export type NewPaymentMethod = typeof paymentMethods.$inferInsert;
```

**Step 2: Migration generieren**

```bash
pnpm --filter backend drizzle-kit generate
```

Expected: Neue Migration-Datei in `apps/backend/drizzle/` mit `CREATE TABLE payment_methods`.

**Step 3: Commit**

```bash
git add apps/backend/src/db/schema.ts apps/backend/drizzle/
git commit -m "feat(payments): add payment_methods drizzle schema"
```

---

### Task 2: Encryption-Helper (TDD)

**Files:**
- Create: `apps/backend/src/lib/payments-crypto.ts`
- Test: `apps/backend/src/lib/payments-crypto.test.ts`

**Step 1: Test schreiben (failing)**

```ts
// apps/backend/src/lib/payments-crypto.test.ts
import { describe, expect, it, beforeEach } from 'vitest';
import { encryptSecrets, decryptSecrets, validateMasterKey } from './payments-crypto';

const TEST_KEY = 'a'.repeat(64); // 32 bytes hex

describe('payments-crypto', () => {
  beforeEach(() => {
    process.env.PAYMENTS_MASTER_KEY = TEST_KEY;
  });

  it('roundtrips a secret object', () => {
    const plain = { apiKey: 'apik_secret', webhookSecret: 'whs_xxx' };
    const blob = encryptSecrets(plain);
    expect(blob).toMatch(/^[A-Za-z0-9+/=]+$/); // base64
    expect(blob).not.toContain('apik_secret');

    const decrypted = decryptSecrets(blob);
    expect(decrypted).toEqual(plain);
  });

  it('produces different ciphertext per call (random IV)', () => {
    const plain = { apiKey: 'same' };
    expect(encryptSecrets(plain)).not.toBe(encryptSecrets(plain));
  });

  it('throws on tampered ciphertext', () => {
    const blob = encryptSecrets({ apiKey: 'x' });
    const tampered = blob.slice(0, -4) + 'AAAA';
    expect(() => decryptSecrets(tampered)).toThrow();
  });

  it('throws when master key missing', () => {
    delete process.env.PAYMENTS_MASTER_KEY;
    expect(() => validateMasterKey()).toThrow(/PAYMENTS_MASTER_KEY/);
  });

  it('throws when master key wrong length', () => {
    process.env.PAYMENTS_MASTER_KEY = 'short';
    expect(() => validateMasterKey()).toThrow(/64 hex/);
  });
});
```

**Step 2: Run test, expect fail**

```bash
pnpm --filter backend test payments-crypto
```

Expected: FAIL — module not found.

**Step 3: Implementation**

```ts
// apps/backend/src/lib/payments-crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function validateMasterKey(): Buffer {
  const hex = process.env.PAYMENTS_MASTER_KEY;
  if (!hex) {
    throw new Error('PAYMENTS_MASTER_KEY env var is required');
  }
  if (hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('PAYMENTS_MASTER_KEY must be 64 hex chars (32 bytes)');
  }
  return Buffer.from(hex, 'hex');
}

export function encryptSecrets(plain: Record<string, unknown>): string {
  const key = validateMasterKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([
    cipher.update(JSON.stringify(plain), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

export function decryptSecrets(blob: string): Record<string, unknown> {
  const key = validateMasterKey();
  const buf = Buffer.from(blob, 'base64');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  return JSON.parse(pt);
}

export function maskSecret(value: string | undefined): string {
  if (!value) return '';
  if (value.length <= 4) return '****';
  return '****' + value.slice(-4);
}
```

**Step 4: Run test, expect pass**

```bash
pnpm --filter backend test payments-crypto
```

Expected: 5 tests pass.

**Step 5: Commit**

```bash
git add apps/backend/src/lib/payments-crypto.ts apps/backend/src/lib/payments-crypto.test.ts
git commit -m "feat(payments): add AES-256-GCM crypto helpers with tests"
```

---

### Task 3: Seed-Funktion (TDD)

**Files:**
- Create: `apps/backend/src/db/seed-payment-methods.ts`
- Test: `apps/backend/src/db/seed-payment-methods.test.ts`

**Step 1: Failing-Test**

```ts
// apps/backend/src/db/seed-payment-methods.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { seedPaymentMethodsIfEmpty } from './seed-payment-methods';

// Mock db (depends on existing test-utils — check apps/backend/src/db/test-utils.ts)
// If not present, use an in-memory testdb or pg-mem.

describe('seedPaymentMethodsIfEmpty', () => {
  beforeEach(() => {
    process.env.PAYMENTS_MASTER_KEY = 'a'.repeat(64);
    process.env.WHOP_API_KEY = 'apik_test';
    process.env.WHOP_PLAN_ID_EBOOK = 'plan_TEST';
    process.env.WHOP_WEBHOOK_SECRET = 'whs_test';
    process.env.MICROPAYMENT_ACCESS_KEY = 'mp_access';
    process.env.MICROPAYMENT_PROJECT_KEY = '12gq-tnlzh-c57a9764';
  });

  it('inserts 3 rows when table empty', async () => {
    const db = makeTestDb(); // existing helper or pg-mem
    await seedPaymentMethodsIfEmpty(db);
    const rows = await db.select().from(paymentMethods);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => r.slug).sort()).toEqual([
      'micropayment-paysafecard',
      'micropayment-sofort',
      'whop',
    ]);
  });

  it('is idempotent — second call inserts nothing', async () => {
    const db = makeTestDb();
    await seedPaymentMethodsIfEmpty(db);
    await seedPaymentMethodsIfEmpty(db);
    const rows = await db.select().from(paymentMethods);
    expect(rows).toHaveLength(3);
  });

  it('encrypts secrets', async () => {
    const db = makeTestDb();
    await seedPaymentMethodsIfEmpty(db);
    const whop = await db.select().from(paymentMethods).where(eq(paymentMethods.slug, 'whop')).then(r => r[0]);
    expect(whop.encryptedSecrets).toBeTruthy();
    expect(whop.encryptedSecrets).not.toContain('apik_test');
    const decrypted = decryptSecrets(whop.encryptedSecrets!);
    expect(decrypted).toEqual({ apiKey: 'apik_test', webhookSecret: 'whs_test' });
  });
});
```

**Step 2: Run test, expect fail**

```bash
pnpm --filter backend test seed-payment-methods
```

Expected: FAIL — module not found.

**Step 3: Implementation**

```ts
// apps/backend/src/db/seed-payment-methods.ts
import type { DbClient } from './client';
import { paymentMethods } from './schema';
import { encryptSecrets } from '../lib/payments-crypto';

export async function seedPaymentMethodsIfEmpty(db: DbClient) {
  const existing = await db.select({ slug: paymentMethods.slug }).from(paymentMethods).limit(1);
  if (existing.length > 0) return;

  const seeds = [
    {
      slug: 'whop',
      provider: 'whop',
      displayName: 'Kreditkarte',
      enabled: !!process.env.WHOP_API_KEY,
      testMode: false,
      sortOrder: 1,
      publicConfig: {
        planId: process.env.WHOP_PLAN_ID_EBOOK ?? '',
        checkoutUrl: 'https://whop.com/checkout/',
      },
      encryptedSecrets: encryptSecrets({
        apiKey: process.env.WHOP_API_KEY ?? '',
        webhookSecret: process.env.WHOP_WEBHOOK_SECRET ?? '',
      }),
    },
    {
      slug: 'micropayment-sofort',
      provider: 'micropayment',
      displayName: 'Sofort',
      enabled: !!process.env.MICROPAYMENT_ACCESS_KEY,
      testMode: process.env.MICROPAYMENT_TEST_MODE !== '0',
      sortOrder: 2,
      publicConfig: {
        projectKey: process.env.MICROPAYMENT_PROJECT_KEY ?? '',
        priceEuroCent: 8999,
        eventUrl: 'https://sofort.micropayment.de/public/main/event/',
      },
      encryptedSecrets: encryptSecrets({
        accessKey: process.env.MICROPAYMENT_ACCESS_KEY ?? '',
      }),
    },
    {
      slug: 'micropayment-paysafecard',
      provider: 'micropayment',
      displayName: 'paysafecard',
      enabled: !!process.env.MICROPAYMENT_ACCESS_KEY,
      testMode: process.env.MICROPAYMENT_TEST_MODE !== '0',
      sortOrder: 3,
      publicConfig: {
        projectKey: process.env.MICROPAYMENT_PROJECT_KEY ?? '',
        priceEuroCent: 8999,
        eventUrl: 'https://paysafecard.micropayment.de/public/main/event/',
      },
      encryptedSecrets: encryptSecrets({
        accessKey: process.env.MICROPAYMENT_ACCESS_KEY ?? '',
      }),
    },
  ];

  await db.insert(paymentMethods).values(seeds);
}
```

**Step 4: Run test, expect pass**

```bash
pnpm --filter backend test seed-payment-methods
```

Expected: 3 tests pass.

**Step 5: Wire into runStartupMigrations**

Modify `apps/backend/src/db/migrations.ts` (das ist die Datei, die bei
Backend-Start `CREATE TABLE IF NOT EXISTS` ausführt — siehe Memory). Suche
mit `grep -rn "runStartupMigrations" apps/backend/src/`. Am Ende der Funktion:

```ts
import { seedPaymentMethodsIfEmpty } from './seed-payment-methods';

// ... am Ende von runStartupMigrations()
await seedPaymentMethodsIfEmpty(db);
```

**Step 6: Commit**

```bash
git add apps/backend/src/db/seed-payment-methods.ts apps/backend/src/db/seed-payment-methods.test.ts apps/backend/src/db/migrations.ts
git commit -m "feat(payments): seed payment_methods table from env vars on first start"
```

---

## Phase 2 — Admin-API

### Task 4: Helper `loadPaymentMethod(slug)`

**Files:**
- Create: `apps/backend/src/lib/payment-methods-store.ts`
- Test: `apps/backend/src/lib/payment-methods-store.test.ts`

Diese Funktion ist die Single-Source-of-Truth für alle anderen Backend-Code,
der Credentials braucht (Webhooks + Checkout-Route). Caching nicht hier —
kommt in Task 10 als separater Cache-Layer.

**Step 1: Failing-Test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { loadPaymentMethod, listPublicMethods } from './payment-methods-store';

describe('payment-methods-store', () => {
  beforeEach(async () => {
    process.env.PAYMENTS_MASTER_KEY = 'a'.repeat(64);
    // setup test db with one whop row
  });

  it('returns method with decrypted secrets when found', async () => {
    const m = await loadPaymentMethod('whop');
    expect(m).toBeDefined();
    expect(m!.secrets).toEqual({ apiKey: 'apik_test', webhookSecret: 'whs_test' });
    expect(m!.publicConfig.planId).toBe('plan_TEST');
  });

  it('returns null when slug unknown', async () => {
    expect(await loadPaymentMethod('stripe')).toBeNull();
  });

  it('listPublicMethods returns enabled methods sorted by sort_order', async () => {
    const list = await listPublicMethods();
    expect(list.every(m => m.enabled)).toBe(true);
    expect(list.map(m => m.sortOrder)).toEqual([...list.map(m => m.sortOrder)].sort());
    expect(list[0]).not.toHaveProperty('secrets');
    expect(list[0]).not.toHaveProperty('encryptedSecrets');
  });
});
```

**Step 2: Run test, fail**

```bash
pnpm --filter backend test payment-methods-store
```

**Step 3: Implementation**

```ts
// apps/backend/src/lib/payment-methods-store.ts
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { paymentMethods } from '../db/schema';
import { decryptSecrets } from './payments-crypto';

export interface LoadedPaymentMethod {
  slug: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  testMode: boolean;
  sortOrder: number;
  publicConfig: Record<string, unknown>;
  secrets: Record<string, unknown>;
}

export async function loadPaymentMethod(slug: string): Promise<LoadedPaymentMethod | null> {
  const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.slug, slug)).limit(1);
  if (rows.length === 0) return null;
  const row = rows[0];
  const secrets = row.encryptedSecrets ? decryptSecrets(row.encryptedSecrets) : {};
  return {
    slug: row.slug,
    provider: row.provider,
    displayName: row.displayName,
    enabled: row.enabled,
    testMode: row.testMode,
    sortOrder: row.sortOrder,
    publicConfig: row.publicConfig as Record<string, unknown>,
    secrets,
  };
}

export interface PublicPaymentMethod {
  slug: string;
  provider: string;
  displayName: string;
  enabled: boolean;
  testMode: boolean;
  sortOrder: number;
  publicConfig: Record<string, unknown>;
}

export async function listPublicMethods(): Promise<PublicPaymentMethod[]> {
  const rows = await db.select().from(paymentMethods).where(eq(paymentMethods.enabled, true));
  return rows
    .map(r => ({
      slug: r.slug,
      provider: r.provider,
      displayName: r.displayName,
      enabled: r.enabled,
      testMode: r.testMode,
      sortOrder: r.sortOrder,
      publicConfig: r.publicConfig as Record<string, unknown>,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
```

**Step 4: Run test, pass**

**Step 5: Commit**

```bash
git commit -am "feat(payments): payment-methods-store with secret decryption"
```

---

### Task 5: GET `/herzraum/payments` Route

**Files:**
- Create: `apps/backend/src/routes/herzraum/payments.ts`
- Test: `apps/backend/src/routes/herzraum/payments.test.ts`
- Modify: `apps/backend/src/index.ts` oder router-mount-Datei (mount neuen Router)

**Step 1: Failing-Test**

```ts
import { describe, it, expect } from 'vitest';
import { app } from '../../app'; // Hono test app

describe('GET /herzraum/payments', () => {
  it('requires session auth', async () => {
    const res = await app.request('/herzraum/payments');
    expect(res.status).toBe(401);
  });

  it('returns all 3 methods with masked secrets', async () => {
    const res = await app.request('/herzraum/payments', {
      headers: { Cookie: validSessionCookie() },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.methods).toHaveLength(3);
    const whop = body.methods.find((m: any) => m.slug === 'whop');
    expect(whop.secretsPreview.apiKey).toMatch(/^\*+\w{4}$/);
    expect(whop.secretsPreview).not.toHaveProperty('webhookSecret_plain');
    expect(whop).not.toHaveProperty('encryptedSecrets');
  });
});
```

**Step 2: Run, fail**

**Step 3: Implementation**

```ts
// apps/backend/src/routes/herzraum/payments.ts
import { Hono } from 'hono';
import { db } from '../../db/client';
import { paymentMethods } from '../../db/schema';
import { decryptSecrets, maskSecret } from '../../lib/payments-crypto';
import { requireSession } from '../../middleware/session';

export const paymentsRouter = new Hono();

paymentsRouter.use('*', requireSession);

paymentsRouter.get('/', async (c) => {
  const rows = await db.select().from(paymentMethods);
  const methods = rows
    .map(r => {
      let secretsPreview: Record<string, string> = {};
      let decryptError: string | null = null;
      if (r.encryptedSecrets) {
        try {
          const plain = decryptSecrets(r.encryptedSecrets);
          for (const [k, v] of Object.entries(plain)) {
            secretsPreview[k] = maskSecret(typeof v === 'string' ? v : '');
          }
        } catch (e) {
          decryptError = (e as Error).message;
        }
      }
      return {
        slug: r.slug,
        provider: r.provider,
        displayName: r.displayName,
        enabled: r.enabled,
        testMode: r.testMode,
        sortOrder: r.sortOrder,
        publicConfig: r.publicConfig,
        secretsPreview,
        decryptError,
        lastTestAt: r.lastTestAt,
        lastTestStatus: r.lastTestStatus,
        lastTestError: r.lastTestError,
        updatedAt: r.updatedAt,
        updatedBy: r.updatedBy,
      };
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return c.json({ methods });
});
```

**Step 4: Mount the router**

Suche existing herzraum-Router-Mount: `grep -rn "herzraum/products" apps/backend/src/`. In gleicher Datei:

```ts
import { paymentsRouter } from './routes/herzraum/payments';
herzraum.route('/payments', paymentsRouter);
```

**Step 5: Run, pass**

**Step 6: Commit**

```bash
git commit -am "feat(payments): GET /herzraum/payments with masked secrets"
```

---

### Task 6: PATCH `/herzraum/payments/:slug` Route

**Files:**
- Modify: `apps/backend/src/routes/herzraum/payments.ts`
- Modify: `apps/backend/src/routes/herzraum/payments.test.ts`

**Step 1: Failing-Test**

```ts
describe('PATCH /herzraum/payments/:slug', () => {
  it('updates enabled flag', async () => {
    await app.request('/herzraum/payments/whop', {
      method: 'PATCH',
      headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    });
    const m = await loadPaymentMethod('whop');
    expect(m!.enabled).toBe(true);
  });

  it('updates secrets and re-encrypts', async () => {
    await app.request('/herzraum/payments/whop', {
      method: 'PATCH',
      headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { apiKey: 'apik_NEW', webhookSecret: 'whs_NEW' } }),
    });
    const m = await loadPaymentMethod('whop');
    expect(m!.secrets).toEqual({ apiKey: 'apik_NEW', webhookSecret: 'whs_NEW' });
  });

  it('does NOT touch secrets if not in body', async () => {
    const before = await loadPaymentMethod('whop');
    await app.request('/herzraum/payments/whop', {
      method: 'PATCH',
      headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    const after = await loadPaymentMethod('whop');
    expect(after!.secrets).toEqual(before!.secrets);
  });

  it('writes audit-log entry with masked diff', async () => {
    // call patch, then check audit_log table
    await app.request('/herzraum/payments/whop', {
      method: 'PATCH',
      headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ secrets: { apiKey: 'apik_NEW' } }),
    });
    const log = await fetchLatestAuditLog();
    expect(log.action).toBe('payment_method.update');
    expect(log.target).toBe('whop');
    expect(JSON.stringify(log.diff)).not.toContain('apik_NEW');
  });

  it('rejects unknown slug', async () => {
    const res = await app.request('/herzraum/payments/unknown', {
      method: 'PATCH',
      headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(404);
  });
});
```

**Step 2: Run, fail**

**Step 3: Implementation**

```ts
// apps/backend/src/routes/herzraum/payments.ts (extend)
import { eq } from 'drizzle-orm';
import { encryptSecrets, decryptSecrets, maskSecret } from '../../lib/payments-crypto';
import { writeAuditLog } from '../../lib/audit';
import { invalidatePublicMethodsCache } from '../../lib/payment-methods-store';

paymentsRouter.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const session = c.get('session') as { username: string };

  const existingRows = await db.select().from(paymentMethods).where(eq(paymentMethods.slug, slug)).limit(1);
  if (existingRows.length === 0) {
    return c.json({ error: 'unknown method' }, 404);
  }
  const before = existingRows[0];

  const updates: Partial<typeof paymentMethods.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: session.username,
  };

  if (typeof body.enabled === 'boolean') updates.enabled = body.enabled;
  if (typeof body.testMode === 'boolean') updates.testMode = body.testMode;
  if (typeof body.sortOrder === 'number') updates.sortOrder = body.sortOrder;
  if (body.publicConfig && typeof body.publicConfig === 'object') {
    updates.publicConfig = { ...(before.publicConfig as object), ...body.publicConfig };
  }

  const diff: Record<string, [unknown, unknown]> = {};
  for (const k of ['enabled', 'testMode', 'sortOrder'] as const) {
    if (k in updates && updates[k] !== before[k]) diff[k] = [before[k], updates[k]];
  }

  if (body.secrets && typeof body.secrets === 'object') {
    const beforeSecrets = before.encryptedSecrets ? decryptSecrets(before.encryptedSecrets) : {};
    const newSecrets = { ...beforeSecrets, ...body.secrets };
    updates.encryptedSecrets = encryptSecrets(newSecrets);
    for (const [k, v] of Object.entries(body.secrets) as [string, string][]) {
      diff[`secrets.${k}`] = [maskSecret(beforeSecrets[k] as string), maskSecret(v)];
    }
  }

  await db.update(paymentMethods).set(updates).where(eq(paymentMethods.slug, slug));

  if (Object.keys(diff).length > 0) {
    await writeAuditLog({
      actor: session.username,
      action: 'payment_method.update',
      target: slug,
      diff,
    });
  }

  invalidatePublicMethodsCache();

  return c.json({ ok: true });
});
```

**Step 4: Run, pass**

**Step 5: Commit**

```bash
git commit -am "feat(payments): PATCH /herzraum/payments/:slug with audit-log + masked diff"
```

---

### Task 7: POST `/herzraum/payments/:slug/test` (Provider-Verifikation)

**Files:**
- Modify: `apps/backend/src/routes/herzraum/payments.ts`
- Create: `apps/backend/src/lib/payment-providers/whop-test.ts`
- Create: `apps/backend/src/lib/payment-providers/micropayment-test.ts`
- Test: `apps/backend/src/routes/herzraum/payments.test.ts` (extend)

**Step 1: Failing-Test**

```ts
describe('POST /herzraum/payments/:slug/test', () => {
  it('returns ok=true when whop API responds 200', async () => {
    mockFetch('https://api.whop.com/api/v5/me', { status: 200, body: { id: 'biz_x' } });
    const res = await app.request('/herzraum/payments/whop/test', {
      method: 'POST',
      headers: { Cookie: validSessionCookie() },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it('returns ok=false when whop API responds 401', async () => {
    mockFetch('https://api.whop.com/api/v5/me', { status: 401, body: { error: 'invalid_token' } });
    const res = await app.request('/herzraum/payments/whop/test', {
      method: 'POST',
      headers: { Cookie: validSessionCookie() },
    });
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/401/);
  });

  it('persists last_test_* in DB', async () => {
    mockFetch('https://api.whop.com/api/v5/me', { status: 200 });
    await app.request('/herzraum/payments/whop/test', { method: 'POST', headers: { Cookie: validSessionCookie() } });
    const m = await loadPaymentMethod('whop');
    // re-query DB row to inspect lastTestAt etc.
  });

  it('micropayment-sofort returns ok if accessKey + projectKey present', async () => {
    const res = await app.request('/herzraum/payments/micropayment-sofort/test', {
      method: 'POST', headers: { Cookie: validSessionCookie() },
    });
    expect((await res.json()).ok).toBe(true);
  });

  it('micropayment fails if accessKey empty', async () => {
    await db.update(paymentMethods)
      .set({ encryptedSecrets: encryptSecrets({ accessKey: '' }) })
      .where(eq(paymentMethods.slug, 'micropayment-sofort'));
    const res = await app.request('/herzraum/payments/micropayment-sofort/test', {
      method: 'POST', headers: { Cookie: validSessionCookie() },
    });
    expect((await res.json()).ok).toBe(false);
  });
});
```

**Step 2: Run, fail**

**Step 3: Provider-Test-Module**

```ts
// apps/backend/src/lib/payment-providers/whop-test.ts
export async function testWhop(secrets: { apiKey: string }): Promise<{ ok: boolean; error?: string }> {
  if (!secrets.apiKey) return { ok: false, error: 'apiKey missing' };
  try {
    const res = await fetch('https://api.whop.com/api/v5/me', {
      headers: { Authorization: `Bearer ${secrets.apiKey}` },
    });
    if (res.status === 200) return { ok: true };
    return { ok: false, error: `HTTP ${res.status}: ${await res.text().catch(() => '')}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
```

```ts
// apps/backend/src/lib/payment-providers/micropayment-test.ts
import { createHash } from 'node:crypto';

export async function testMicropayment(
  publicConfig: { projectKey?: string; priceEuroCent?: number; eventUrl?: string },
  secrets: { accessKey?: string }
): Promise<{ ok: boolean; error?: string }> {
  if (!secrets.accessKey) return { ok: false, error: 'accessKey missing' };
  if (!publicConfig.projectKey) return { ok: false, error: 'projectKey missing' };
  // Validate signature can be computed deterministically
  const sig = createHash('md5')
    .update(`project=${publicConfig.projectKey}&amount=1&accessKey=${secrets.accessKey}`)
    .digest('hex');
  if (!/^[0-9a-f]{32}$/.test(sig)) return { ok: false, error: 'signature generation failed' };
  return { ok: true };
}
```

**Step 4: Route**

```ts
// apps/backend/src/routes/herzraum/payments.ts (extend)
import { testWhop } from '../../lib/payment-providers/whop-test';
import { testMicropayment } from '../../lib/payment-providers/micropayment-test';

paymentsRouter.post('/:slug/test', async (c) => {
  const slug = c.req.param('slug');
  const m = await loadPaymentMethod(slug);
  if (!m) return c.json({ error: 'unknown method' }, 404);

  let result: { ok: boolean; error?: string };
  if (m.provider === 'whop') {
    result = await testWhop(m.secrets as any);
  } else if (m.provider === 'micropayment') {
    result = await testMicropayment(m.publicConfig as any, m.secrets as any);
  } else {
    result = { ok: false, error: `unknown provider: ${m.provider}` };
  }

  await db.update(paymentMethods).set({
    lastTestAt: new Date(),
    lastTestStatus: result.ok ? 'ok' : 'fail',
    lastTestError: result.error ?? null,
  }).where(eq(paymentMethods.slug, slug));

  return c.json(result);
});
```

**Step 5: Run, pass**

**Step 6: Commit**

```bash
git commit -am "feat(payments): POST /herzraum/payments/:slug/test for credential verification"
```

---

## Phase 3 — Refactor existing webhook + checkout handlers

### Task 8: Refactor `micropayment-checkout.ts` to use DB

**Files:**
- Modify: `apps/backend/src/routes/micropayment-checkout.ts`

**Step 1: Locate file**

```bash
grep -rn "MICROPAYMENT_ACCESS_KEY" apps/backend/src/
```

**Step 2: Find current implementation, identify all `process.env.MICROPAYMENT_*` reads**

**Step 3: Replace with `loadPaymentMethod(slug)` calls**

```ts
// Before
const accessKey = process.env.MICROPAYMENT_ACCESS_KEY;
const projectKey = process.env.MICROPAYMENT_PROJECT_KEY;

// After
import { loadPaymentMethod } from '../lib/payment-methods-store';

const slug = body.method === 'sofort' ? 'micropayment-sofort' : 'micropayment-paysafecard';
const m = await loadPaymentMethod(slug);
if (!m || !m.enabled) {
  return c.json({ error: 'method not available' }, 400);
}
const accessKey = m.secrets.accessKey as string;
const projectKey = (m.publicConfig as any).projectKey as string;
const eventUrl = (m.publicConfig as any).eventUrl as string;
const priceEuroCent = (m.publicConfig as any).priceEuroCent as number;
```

**Step 4: Run existing tests for this route**

```bash
pnpm --filter backend test checkout-micropayment
```

Expected: tests pass with DB-loaded credentials.

**Step 5: Commit**

```bash
git commit -am "refactor(payments): checkout-micropayment reads from payment_methods table"
```

---

### Task 9: Refactor `whop-webhook.ts` and `micropayment-webhook.ts`

**Files:**
- Modify: `apps/backend/src/routes/whop-webhook.ts`
- Modify: `apps/backend/src/routes/micropayment-webhook.ts`

**Step 1: Whop-Webhook**

```ts
// Before
const secret = process.env.WHOP_WEBHOOK_SECRET;

// After
import { loadPaymentMethod } from '../lib/payment-methods-store';

const m = await loadPaymentMethod('whop');
if (!m) return c.json({ error: 'whop not configured' }, 503);
const secret = m.secrets.webhookSecret as string;
if (!secret) return c.json({ error: 'webhook secret missing' }, 503);
```

**Step 2: Micropayment-Webhook**

Bestimme Methode aus Webhook-Payload (sofort vs paysafe). Lade entsprechende Methode (oder beide, falls accessKey shared ist — meistens shared aber besser separat lookup für consistency).

**Step 3: Run tests**

```bash
pnpm --filter backend test whop-webhook
pnpm --filter backend test micropayment-webhook
```

**Step 4: Commit**

```bash
git commit -am "refactor(payments): webhooks read secrets from payment_methods"
```

---

## Phase 4 — Public API + Frontend `/ebook`

### Task 10: GET `/api/payments/public` (cached)

**Files:**
- Create: `apps/backend/src/routes/payments-public.ts`
- Modify: `apps/backend/src/lib/payment-methods-store.ts` (add cache)
- Test: `apps/backend/src/routes/payments-public.test.ts`

**Step 1: Failing-Test**

```ts
describe('GET /api/payments/public', () => {
  it('returns only enabled methods, no secrets', async () => {
    const res = await app.request('/api/payments/public');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.methods.every((m: any) => m.enabled)).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/apiKey|accessKey|webhookSecret/);
  });

  it('respects sortOrder', async () => {
    const body = await (await app.request('/api/payments/public')).json();
    const orders = body.methods.map((m: any) => m.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it('cache invalidates after PATCH', async () => {
    // 1. fetch initial
    const res1 = await (await app.request('/api/payments/public')).json();
    // 2. PATCH to disable whop
    await app.request('/herzraum/payments/whop', {
      method: 'PATCH', headers: { Cookie: validSessionCookie(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    // 3. re-fetch
    const res2 = await (await app.request('/api/payments/public')).json();
    expect(res2.methods.find((m: any) => m.slug === 'whop')).toBeUndefined();
  });
});
```

**Step 2: Run, fail**

**Step 3: Cache layer**

```ts
// apps/backend/src/lib/payment-methods-store.ts (extend)
let publicCache: { ts: number; data: PublicPaymentMethod[] } | null = null;
const TTL_MS = 60_000;

export function invalidatePublicMethodsCache() {
  publicCache = null;
}

export async function listPublicMethodsCached(): Promise<PublicPaymentMethod[]> {
  if (publicCache && Date.now() - publicCache.ts < TTL_MS) {
    return publicCache.data;
  }
  const data = await listPublicMethods();
  publicCache = { ts: Date.now(), data };
  return data;
}
```

**Step 4: Route**

```ts
// apps/backend/src/routes/payments-public.ts
import { Hono } from 'hono';
import { listPublicMethodsCached } from '../lib/payment-methods-store';

export const paymentsPublicRouter = new Hono();

paymentsPublicRouter.get('/', async (c) => {
  const methods = await listPublicMethodsCached();
  return c.json({ methods });
});
```

Mount under `/api/payments/public` in app entry.

**Step 5: Run, pass**

**Step 6: Commit**

```bash
git commit -am "feat(payments): public payments API with 60s cache"
```

---

### Task 11: Refactor `apps/frontend/src/pages/ebook.astro`

**Files:**
- Modify: `apps/frontend/src/pages/ebook.astro`

**Step 1: Locate the 3-card payment grid**

```bash
grep -n "paysafecard\|Sofort\|Kreditkarte" apps/frontend/src/pages/ebook.astro
```

**Step 2: Replace hardcoded grid with fetch**

```astro
---
// apps/frontend/src/pages/ebook.astro (top frontmatter)
const backendUrl = import.meta.env.PUBLIC_BACKEND_URL ?? 'http://localhost:9991';
const res = await fetch(`${backendUrl}/api/payments/public`).catch(() => null);
const methods = res?.ok ? (await res.json()).methods : [];
---

<div class="payment-grid">
  {methods.map((m) => (
    <div class={`payment-card ${m.slug}`} data-method={m.slug}>
      {m.slug === 'whop' && <img src="/icons/visa-mastercard.svg" alt="Visa & Mastercard" />}
      {m.slug === 'micropayment-sofort' && <span class="sofort-badge">SOFORT.</span>}
      {m.slug === 'micropayment-paysafecard' && <span class="paysafecard-badge">paysafecard</span>}
      <p>{m.displayName}</p>
    </div>
  ))}
</div>

<script>
// Existing checkout-trigger-logic — keep as is, but read data-method from clicked card
</script>
```

Fallback wenn fetch fehlschlägt: Leeres Array → keine Karten → User kann nicht kaufen. Zeige Error-Banner: "Zahlungssystem temporär nicht verfügbar".

**Step 3: Build frontend, smoke-test locally**

```bash
pnpm --filter frontend build
pnpm --filter frontend dev
# Open http://localhost:4321/ebook in browser, verify 3 cards render
```

**Step 4: Commit**

```bash
git commit -am "feat(payments): /ebook fetches enabled methods dynamically"
```

---

## Phase 5 — Admin-UI

### Task 12: Astro-Page `/herzraum/payments` Skeleton

**Files:**
- Create: `apps/frontend/src/pages/herzraum/payments.astro`

**Step 1: Page skeleton**

```astro
---
// apps/frontend/src/pages/herzraum/payments.astro
import HerzraumLayout from '../../layouts/HerzraumLayout.astro';

const session = Astro.locals.session;
if (!session) return Astro.redirect('/herzraum/login');

const backendUrl = import.meta.env.BACKEND_URL ?? 'http://localhost:9991';
const res = await fetch(`${backendUrl}/herzraum/payments`, {
  headers: { Cookie: Astro.request.headers.get('Cookie') ?? '' },
});
const { methods } = await res.json();
---

<HerzraumLayout title="Zahlungsmethoden">
  <h1>Zahlungsmethoden</h1>

  {!Astro.locals.paymentsMasterKeyOk && (
    <div class="warning-banner">
      <strong>PAYMENTS_MASTER_KEY fehlt oder ungültig.</strong>
      Secrets können nicht entschlüsselt werden — Admin-Edits funktionieren nicht bis Master-Key gesetzt ist.
    </div>
  )}

  <div class="payment-method-grid">
    {methods.map((m) => (
      <article class="payment-method-card" data-slug={m.slug}>
        <header>
          <h2>{m.displayName}</h2>
          <span class={`status-badge status-${m.enabled ? (m.testMode ? 'test' : 'live') : 'off'}`}>
            {m.enabled ? (m.testMode ? 'Test-Modus' : 'Live') : 'Aus'}
          </span>
        </header>
        <!-- forms, toggles — see Task 13 -->
      </article>
    ))}
  </div>

  <script src="/scripts/herzraum-payments.js" type="module"></script>
</HerzraumLayout>
```

**Step 2: Smoke-test render**

```bash
pnpm --filter frontend dev
# Browser: http://localhost:4321/herzraum/payments — 3 leere Karten sichtbar
```

**Step 3: Commit**

```bash
git commit -am "feat(payments): herzraum/payments admin page skeleton"
```

---

### Task 13: Card-Form mit Toggle, Edit, Save

**Files:**
- Modify: `apps/frontend/src/pages/herzraum/payments.astro`
- Create: `apps/frontend/public/scripts/herzraum-payments.js`

**Step 1: Card-Inhalt**

```astro
<article class="payment-method-card" data-slug={m.slug}>
  <header>...</header>

  <form data-form="config">
    <label>
      <input type="checkbox" data-field="enabled" checked={m.enabled} />
      Aktiv
    </label>
    <label>
      <input type="checkbox" data-field="testMode" checked={m.testMode} />
      Test-Modus
    </label>
    <label>
      Sortierung
      <input type="number" data-field="sortOrder" value={m.sortOrder} min="0" />
    </label>
  </form>

  <form data-form="public-config">
    {m.provider === 'whop' && (
      <label>
        Whop Plan-ID
        <input type="text" data-field="planId" value={m.publicConfig.planId} />
      </label>
    )}
    {m.provider === 'micropayment' && (
      <>
        <label>
          Project-Key
          <input type="text" data-field="projectKey" value={m.publicConfig.projectKey} />
        </label>
        <label>
          Preis (Eurocent)
          <input type="number" data-field="priceEuroCent" value={m.publicConfig.priceEuroCent} />
        </label>
      </>
    )}
  </form>

  <form data-form="secrets">
    {Object.entries(m.secretsPreview).map(([k, masked]) => (
      <label>
        {k}
        <span class="masked">{masked}</span>
        <input type="password" data-field={k} placeholder="Neuer Wert (leer = unverändert)" />
      </label>
    ))}
  </form>

  <footer>
    <button data-action="test">Verbindung testen</button>
    <span data-test-result></span>
    <button data-action="save" type="submit">Speichern</button>
    <small>Zuletzt geändert: {m.updatedAt} {m.updatedBy && `von ${m.updatedBy}`}</small>
  </footer>
</article>
```

**Step 2: JS für Save + Test**

```js
// apps/frontend/public/scripts/herzraum-payments.js
document.querySelectorAll('.payment-method-card').forEach(card => {
  const slug = card.dataset.slug;

  card.querySelector('[data-action="save"]').addEventListener('click', async (e) => {
    e.preventDefault();
    const body = {};

    const cfg = card.querySelector('[data-form="config"]');
    body.enabled = cfg.querySelector('[data-field="enabled"]').checked;
    body.testMode = cfg.querySelector('[data-field="testMode"]').checked;
    body.sortOrder = Number(cfg.querySelector('[data-field="sortOrder"]').value);

    const pub = card.querySelector('[data-form="public-config"]');
    body.publicConfig = {};
    pub.querySelectorAll('[data-field]').forEach(inp => {
      body.publicConfig[inp.dataset.field] = inp.type === 'number' ? Number(inp.value) : inp.value;
    });

    const sec = card.querySelector('[data-form="secrets"]');
    const secrets = {};
    sec.querySelectorAll('input[data-field]').forEach(inp => {
      if (inp.value) secrets[inp.dataset.field] = inp.value;
    });
    if (Object.keys(secrets).length > 0) body.secrets = secrets;

    const res = await fetch(`/herzraum/payments/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      location.reload();
    } else {
      alert('Fehler: ' + await res.text());
    }
  });

  card.querySelector('[data-action="test"]').addEventListener('click', async (e) => {
    e.preventDefault();
    const result = card.querySelector('[data-test-result]');
    result.textContent = 'Teste...';
    const res = await fetch(`/herzraum/payments/${slug}/test`, { method: 'POST' });
    const body = await res.json();
    result.textContent = body.ok ? '✓ OK' : `✗ ${body.error}`;
    result.className = body.ok ? 'ok' : 'fail';
  });
});
```

**Step 3: Manueller Smoke-Test**

```bash
pnpm dev
# Browser: /herzraum/payments → 3 Cards. Toggle → Save → Reload → Toggle bleibt
# "Verbindung testen" → ✓ OK Badge
```

**Step 4: Commit**

```bash
git commit -am "feat(payments): admin card UI with toggle, edit, test, save"
```

---

### Task 14: Master-Key-Status-Banner

**Files:**
- Modify: `apps/frontend/src/pages/herzraum/payments.astro`
- Modify: backend GET-Response

**Step 1: Backend GET liefert masterKeyOk**

In `paymentsRouter.get('/')`:

```ts
import { validateMasterKey } from '../../lib/payments-crypto';

let masterKeyOk = true;
try { validateMasterKey(); } catch { masterKeyOk = false; }
return c.json({ methods, masterKeyOk });
```

**Step 2: Astro page liest masterKeyOk**

```astro
const { methods, masterKeyOk } = await res.json();
---
{!masterKeyOk && <div class="warning-banner">PAYMENTS_MASTER_KEY fehlt — Secrets können nicht entschlüsselt werden.</div>}
```

**Step 3: Commit**

```bash
git commit -am "feat(payments): master-key status banner in admin UI"
```

---

## Phase 6 — Wrap-up

### Task 15: `/admin/metrics` ergänzen

**Files:**
- Modify: `apps/backend/src/routes/admin-metrics.ts` (or wherever)

**Step 1: Add count**

```ts
const paymentMethodsCount = await db.select({ count: count() }).from(paymentMethods);
const enabledMethods = await db.select({ count: count() }).from(paymentMethods).where(eq(paymentMethods.enabled, true));
return c.json({
  // ... existing,
  payment_methods: paymentMethodsCount[0].count,
  payment_methods_enabled: enabledMethods[0].count,
});
```

**Step 2: Commit**

```bash
git commit -am "feat(payments): /admin/metrics includes payment_methods counts"
```

---

### Task 16: README-Notiz für Master-Key

**Files:**
- Modify: `README.md` oder `apps/backend/README.md`

```md
## Payment-Provider-Konfiguration

Aktuell sind Payment-Credentials in der DB-Tabelle `payment_methods` gespeichert
(verschlüsselt mit AES-256-GCM). Für Live-Setup:

1. `PAYMENTS_MASTER_KEY` in Railway setzen — 64 Hex-Zeichen (32 Bytes):
   ```bash
   openssl rand -hex 32
   ```
2. Beim ersten Backend-Start werden existing Env-Vars (`WHOP_API_KEY` etc.) als
   Initial-Werte in die Tabelle migriert.
3. Anschließend Credentials-Verwaltung über `/herzraum/payments`.
4. Nach erfolgreichem Test: alte Env-Vars (`WHOP_API_KEY`, `MICROPAYMENT_ACCESS_KEY`,
   etc.) aus Railway entfernen — DB ist Source-of-Truth.
```

```bash
git commit -am "docs(payments): document PAYMENTS_MASTER_KEY setup"
```

---

### Task 17: Manueller End-to-End-Test (Staging)

**Step 1: Deploy auf Railway-Staging**

```bash
git push origin feat/payments-admin
# PR erstellen, Railway-Auto-Deploy auf Preview-Env
```

**Step 2: PAYMENTS_MASTER_KEY setzen**

```bash
openssl rand -hex 32  # → kopieren
# Railway Dashboard → backend service → Variables → PAYMENTS_MASTER_KEY=<hex>
```

**Step 3: Backend redeploy, Logs prüfen**

```
✓ runStartupMigrations: payment_methods seeded with 3 rows
```

**Step 4: Browser-Test**

1. `https://herzblatt-journal-staging.up.railway.app/herzraum/payments` → 3 Cards
2. Whop "Verbindung testen" → ✓ OK
3. Whop deaktivieren → speichern → `https://herzblatt-journal-staging.up.railway.app/ebook` zeigt nur 2 Methoden
4. Whop reaktivieren → speichern → 60s warten oder Cache-Invalidate-Confirmation
5. Test-Käufe (Whop-Test-Kreditkarte, Micropayment-Test-Sofort) → /herzraum/verkaeufe zeigt purchases

**Step 5: Production-Deploy nach erfolgreichem Test**

PR mergen → Railway-Auto-Deploy → Schritt 2-4 in Production wiederholen → alte
Env-Vars aus Railway-Production entfernen.

---

## Test-Strategie Zusammenfassung

- **Unit-Tests:** payments-crypto, seed-payment-methods, payment-methods-store, provider-test-modules
- **Route-Tests:** GET/PATCH/POST `/herzraum/payments`, GET `/api/payments/public`
- **Integration:** Webhook-Handler mit DB-Secrets (existing tests sollten weiter laufen)
- **E2E (manuell):** Staging-Browser-Test in Task 17

---

## Rollback-Plan

Falls in Production etwas bricht:

1. `enabled=false` für betroffene Methode via DB direkt setzen (fallback wenn UI broken):
   ```sql
   UPDATE payment_methods SET enabled=false WHERE slug='whop';
   ```
2. Notfalls: Code-Rollback via Railway-Deployment-Rollback. Old env-vars sind noch
   gesetzt (siehe Task 17 Schritt 5 — bewusst erst nach Erfolg entfernen).
3. Master-Key-Verlust: alle 3 Methoden via UI neu eingeben (Plain-Inputs reichen).

---

## Out-of-scope für diesen Plan

- Stripe / direct PayPal als neuer Provider
- Refund-/Chargeback-Aktionen aus dem Admin
- Master-Key-Rotation (manueller Re-Encrypt-Script bei Bedarf)
- A/B-Testing Checkout-Flows
