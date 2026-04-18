/**
 * /herzraum/todos — Todo-Liste für den Admin-Workflow.
 *
 * Session-Cookie-Auth. Simple CRUD.
 *
 * Endpoints:
 *   GET    /herzraum/todos?filter=open|done|all  (default: open)
 *   POST   /herzraum/todos                        Body: { text, priority? }
 *   PATCH  /herzraum/todos/:id                   Body: { text?, done?, priority? }
 *   DELETE /herzraum/todos/:id
 */
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '../../db/index.js';
import { and, eq, desc, asc, sql } from 'drizzle-orm';
import { logAudit } from '../../lib/audit.js';

const app = new Hono();

const VALID_PRIORITIES = ['low', 'normal', 'high'] as const;

const createSchema = z.object({
  text: z.string().min(1).max(500),
  priority: z.enum(VALID_PRIORITIES).default('normal'),
});

const updateSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  done: z.boolean().optional(),
  priority: z.enum(VALID_PRIORITIES).optional(),
});

app.get('/', async (c) => {
  const filter = c.req.query('filter') || 'open';

  const rows = await db
    .select()
    .from(schema.adminTodos)
    .where(
      filter === 'open' ? eq(schema.adminTodos.done, false) :
      filter === 'done' ? eq(schema.adminTodos.done, true) :
      undefined
    )
    .orderBy(
      // High-Priority zuerst, dann neuere
      sql`CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END`,
      desc(schema.adminTodos.createdAt),
    );

  const [{ openCount }] = await db
    .select({ openCount: sql<number>`COUNT(*)::int` })
    .from(schema.adminTodos)
    .where(eq(schema.adminTodos.done, false));

  const [{ doneCount }] = await db
    .select({ doneCount: sql<number>`COUNT(*)::int` })
    .from(schema.adminTodos)
    .where(eq(schema.adminTodos.done, true));

  return c.json({
    ok: true,
    todos: rows,
    openCount: Number(openCount) || 0,
    doneCount: Number(doneCount) || 0,
  });
});

app.post('/', async (c) => {
  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const [created] = await db.insert(schema.adminTodos).values({
    text: parsed.data.text,
    priority: parsed.data.priority,
  }).returning();

  await logAudit(c, { action: 'todo.create', target: String(created.id), meta: { text: parsed.data.text.slice(0, 120) } });

  return c.json({ ok: true, todo: created }, 201);
});

app.patch('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) return c.json({ ok: false, error: 'invalid-id' }, 400);

  let body: any;
  try { body = await c.req.json(); }
  catch { return c.json({ ok: false, error: 'invalid-json' }, 400); }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ ok: false, error: 'validation', issues: parsed.error.flatten() }, 400);
  }

  const patch: Record<string, any> = {};
  if (parsed.data.text !== undefined) patch.text = parsed.data.text;
  if (parsed.data.priority !== undefined) patch.priority = parsed.data.priority;
  if (parsed.data.done !== undefined) {
    patch.done = parsed.data.done;
    patch.completedAt = parsed.data.done ? new Date() : null;
  }

  const [updated] = await db
    .update(schema.adminTodos)
    .set(patch)
    .where(eq(schema.adminTodos.id, id))
    .returning();

  if (!updated) return c.json({ ok: false, error: 'not-found' }, 404);

  await logAudit(c, { action: 'todo.update', target: String(id), meta: { changed: Object.keys(patch) } });

  return c.json({ ok: true, todo: updated });
});

app.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10);
  if (!Number.isInteger(id) || id < 1) return c.json({ ok: false, error: 'invalid-id' }, 400);

  const [deleted] = await db
    .delete(schema.adminTodos)
    .where(eq(schema.adminTodos.id, id))
    .returning();

  if (!deleted) return c.json({ ok: false, error: 'not-found' }, 404);

  await logAudit(c, { action: 'todo.delete', target: String(id), meta: { text: deleted.text.slice(0, 120) } });

  return c.json({ ok: true });
});

export default app;
