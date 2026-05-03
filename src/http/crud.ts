import { eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { numberParam } from '../util/params.js';
import { auditLabel, writeSystemAudit } from './audit.js';
import { requireRole } from './auth.js';
import type { AppHono } from './env.js';

// Zod-validated CRUD factory. Each resource supplies a schema; bodies are
// parsed before reaching the DB. `table` is structurally typed because
// drizzle's generated table types don't compose with a generic — runtime
// safety comes from Zod, not the TS bound.
export function crud<S extends z.ZodTypeAny>(
  app: AppHono,
  base: string,
  table: unknown,
  schema: S,
  options: { softDelete?: boolean } = {}
) {
  const { softDelete = false } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t = table as any;
  const entityType = base.replace(/^\//, '').replaceAll('/', '.');

  app.get(base, async (c) => {
    const query = db.select().from(t);
    const rows = softDelete
      ? await query.where(isNull(t.deletedAt))
      : await query;
    return c.json(rows);
  });
  app.post(base, async (c) => {
    const actor = c.get('authUser');
    requireRole(actor, 'hr');
    const body = schema.parse(await c.req.json());
    const [created] = await db.transaction(async (tx) => {
      const [row] = await tx.insert(t).values(body).returning();
      await writeSystemAudit(tx, {
        actor,
        action: 'create',
        entityType,
        entityId: row?.id,
        entityLabel: auditLabel(row),
      });
      return [row];
    });
    return c.json(created, 201);
  });
  app.put(`${base}/:id`, async (c) => {
    const actor = c.get('authUser');
    requireRole(actor, 'hr');
    const id = numberParam(c.req.param('id'));
    const body = schema.parse(await c.req.json());
    const [updated] = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(t)
        .set(body)
        .where(eq(t.id, id))
        .returning();
      await writeSystemAudit(tx, {
        actor,
        action: 'update',
        entityType,
        entityId: id,
        entityLabel: auditLabel(row),
      });
      return [row];
    });
    return c.json(updated);
  });
  app.delete(`${base}/:id`, async (c) => {
    const actor = c.get('authUser');
    requireRole(actor, 'hr');
    const id = numberParam(c.req.param('id'));
    await db.transaction(async (tx) => {
      const [current] = await tx.select().from(t).where(eq(t.id, id));
      if (softDelete) {
        await tx.update(t).set({ deletedAt: new Date() }).where(eq(t.id, id));
      } else {
        await tx.delete(t).where(eq(t.id, id));
      }
      await writeSystemAudit(tx, {
        actor,
        action: softDelete ? 'soft_delete' : 'delete',
        entityType,
        entityId: id,
        entityLabel: auditLabel(current),
      });
    });
    return c.json({ ok: true });
  });
}

export const nullableId = z
  .union([z.number().int().positive(), z.null(), z.literal('')])
  .transform((v) => (typeof v === 'number' ? v : null));
