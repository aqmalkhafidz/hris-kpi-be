import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  appraisals,
  auditEntries,
  employees,
  positions,
  users,
} from '../../db/schema.js';
import {
  advanceStatusFor,
  requiredRoleForApproval,
  returnTargetFor,
} from '../../domain/appraisal.js';
import {
  loadAppraisal,
  replaceKras,
  requireAppraisal,
  serializeAppraisalRow,
  serializeAppraisalRows,
} from '../../repositories.js';
import { initialsOf } from '../../serializers.js';
import type { AppraisalStatus } from '../../types.js';
import { numberParam } from '../../util/params.js';
import { authMiddleware, requireAppraisalAccess } from '../auth.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

const reviewQueueQuerySchema = z.object({
  role: z.enum(['sl', 'hod', 'hodiv']),
  reviewerUserId: z.coerce.number().int().positive().optional(),
});

const evidencePatchSchema = z.object({
  kind: z.enum(['url', 'file']),
  name: z.string().min(1).max(255),
  date: z.string().min(1).max(40),
  description: z.string().max(2000).nullable().optional(),
  url: z.string().max(2000).nullable().optional(),
});

const kraPatchSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(4000),
  target: z.string().max(4000),
  weight: z.number().int().nonnegative(),
  self_score: z.number().int().min(0).max(5),
  self_comment: z.string().max(4000),
  evidence: z.array(evidencePatchSchema).default([]),
  sl_score: z.number().int().min(0).max(5).nullable().optional(),
  sl_comment: z.string().max(4000).nullable().optional(),
  hod_score: z.number().int().min(0).max(5).nullable().optional(),
  hod_comment: z.string().max(4000).nullable().optional(),
  hodiv_score: z.number().int().min(0).max(5).nullable().optional(),
  hodiv_comment: z.string().max(4000).nullable().optional(),
});

const appraisalPatchSchema = z.object({
  reflection: z.string().max(4000).optional(),
  kras: z.array(kraPatchSchema).optional(),
});

export function registerAppraisalRoutes(app: AppHono) {
  app.use('/appraisals/*', authMiddleware);
  app.use('/reviews/*', authMiddleware);

  app.get('/appraisals/user/:userId', async (c) => {
    const authUser = c.get('authUser');
    const userId = numberParam(c.req.param('userId'), 'userId');
    if (authUser.role !== 'hr' && authUser.id !== userId)
      fail(403, 'Forbidden');
    const rows = await db
      .select()
      .from(appraisals)
      .where(eq(appraisals.userId, userId));
    rows.sort((a, b) => {
      const done =
        Number(a.status === 'completed') - Number(b.status === 'completed');
      if (done !== 0) return done;
      return (b.acknowledgedAt ?? '').localeCompare(a.acknowledgedAt ?? '');
    });
    return c.json(await serializeAppraisalRows(rows));
  });

  app.get('/appraisals/history', async (c) => {
    const actor = c.get('authUser');
    const scopeFilter = (() => {
      switch (actor.role) {
        case 'hr':
          return undefined;
        case 'sl':
          return eq(appraisals.reviewerSlUserId, actor.id);
        case 'hodept':
          return eq(appraisals.reviewerHodUserId, actor.id);
        case 'hodiv':
          return eq(appraisals.reviewerHodivUserId, actor.id);
        case 'staff':
        default:
          return eq(appraisals.userId, actor.id);
      }
    })();
    const baseQuery = db.select().from(appraisals);
    const rows = scopeFilter
      ? await baseQuery.where(scopeFilter)
      : await baseQuery;
    const completed = rows
      .filter((row) => row.status === 'completed')
      .sort((a, b) =>
        (b.acknowledgedAt ?? '').localeCompare(a.acknowledgedAt ?? '')
      );
    const items = await serializeAppraisalRows(completed);
    const userRows = await db.select().from(users);
    const empRows = await db.select().from(employees);
    const userMap = new Map(userRows.map((u) => [u.id, u]));
    const empMap = new Map(empRows.map((e) => [e.id, e]));
    const posRows = await db.select().from(positions);
    const posMap = new Map(posRows.map((p) => [p.id, p]));
    const ownerLookup: Record<
      number,
      { id: number; name: string; initials: string; position?: string }
    > = {};
    for (const row of completed) {
      if (ownerLookup[row.userId]) continue;
      const u = userMap.get(row.userId);
      const emp = empMap.get(row.userId);
      const pos = emp?.posId != null ? posMap.get(emp.posId) : undefined;
      ownerLookup[row.userId] = {
        id: row.userId,
        name: u?.name ?? emp?.name ?? `User #${row.userId}`,
        initials: emp?.initials ?? initialsOf(u?.name ?? ''),
        position: pos?.title,
      };
    }
    const scopeLabel = (() => {
      switch (actor.role) {
        case 'hr':
          return 'All employees · HR view';
        case 'sl':
          return 'Squad members you review';
        case 'hodept':
          return 'Department members you review';
        case 'hodiv':
          return 'Division members you review';
        default:
          return 'Your appraisal history';
      }
    })();
    return c.json({ items, owners: ownerLookup, scopeLabel });
  });

  app.get('/appraisals/:id', async (c) => {
    const actor = c.get('authUser');
    const id = numberParam(c.req.param('id'));
    const row = await requireAppraisal(id);
    requireAppraisalAccess(actor, row);
    return c.json(await loadAppraisal(id));
  });

  app.patch('/appraisals/:id', async (c) => {
    const actor = c.get('authUser');
    const id = numberParam(c.req.param('id'));
    const current = await requireAppraisal(id);
    requireAppraisalAccess(actor, current);
    const body = appraisalPatchSchema.parse(await c.req.json());
    const updates: Partial<typeof appraisals.$inferInsert> = {
      updatedAt: new Date(),
    };
    // Reflection: only owner can edit, only while still in draft.
    if (typeof body.reflection === 'string') {
      if (actor.id !== current.userId)
        fail(403, 'Only appraisal owner can edit reflection');
      if (current.status !== 'draft')
        fail(400, 'Reflection is locked after submission');
      updates.reflection = body.reflection;
    }
    // Status / submittedAt / acknowledgedAt are intentionally NOT settable here.
    // Use POST /advance, /return, /acknowledge to enforce the state machine + audit.
    await db.update(appraisals).set(updates).where(eq(appraisals.id, id));
    if (body.kras)
      await replaceKras(id, body.kras as Array<Record<string, unknown>>);
    const [updated] = await db
      .select()
      .from(appraisals)
      .where(eq(appraisals.id, current.id));
    return c.json(await serializeAppraisalRow(updated));
  });

  app.post('/appraisals/:id/advance', async (c) => {
    const actor = c.get('authUser');
    const current = await requireAppraisal(numberParam(c.req.param('id')));
    const status = current.status as AppraisalStatus;
    const requiredRole = requiredRoleForApproval(status);
    if (status === 'draft') {
      if (actor.id !== current.userId)
        fail(403, 'Only appraisal owner can submit');
    } else if (actor.role !== requiredRole) {
      fail(403, 'Actor role cannot approve this status');
    }
    const toStatus = advanceStatusFor(status, actor.role);
    const action = status === 'draft' ? 'submit' : 'approve';
    const now = new Date().toISOString();
    await db
      .update(appraisals)
      .set({
        status: toStatus,
        submittedAt: status === 'draft' ? now : current.submittedAt,
        updatedAt: new Date(),
      })
      .where(eq(appraisals.id, current.id));
    await db.insert(auditEntries).values({
      appraisalId: current.id,
      timestamp: now,
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action,
      fromStatus: status,
      toStatus,
    });
    return c.json(await loadAppraisal(current.id));
  });

  app.post('/appraisals/:id/return', async (c) => {
    const actor = c.get('authUser');
    const body = z
      .object({ reason: z.string().min(1) })
      .parse(await c.req.json());
    const current = await requireAppraisal(numberParam(c.req.param('id')));
    const target = returnTargetFor(actor.role);
    if (!target) fail(403, 'Role cannot return appraisal');
    const fromStatus = current.status as AppraisalStatus;
    const requiredRole = requiredRoleForApproval(fromStatus);
    if (actor.role !== requiredRole)
      fail(403, 'Actor role cannot return this status');
    const now = new Date().toISOString();
    await db
      .update(appraisals)
      .set({ status: target, updatedAt: new Date() })
      .where(eq(appraisals.id, current.id));
    await db.insert(auditEntries).values({
      appraisalId: current.id,
      timestamp: now,
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'return',
      fromStatus,
      toStatus: target,
      reason: body.reason,
    });
    return c.json(await loadAppraisal(current.id));
  });

  app.post('/appraisals/:id/acknowledge', async (c) => {
    const actor = c.get('authUser');
    const current = await requireAppraisal(numberParam(c.req.param('id')));
    if (current.status !== 'acknowledge') fail(400, 'Not pending acknowledge');
    if (actor.id !== current.userId)
      fail(403, 'Only appraisal owner can acknowledge');
    const now = new Date().toISOString();
    await db
      .update(appraisals)
      .set({
        status: 'completed',
        acknowledgedAt: now,
        updatedAt: new Date(),
      })
      .where(eq(appraisals.id, current.id));
    await db.insert(auditEntries).values({
      appraisalId: current.id,
      timestamp: now,
      actorUserId: actor.id,
      actorName: actor.name,
      actorRole: actor.role,
      action: 'acknowledge',
      fromStatus: 'acknowledge',
      toStatus: 'completed',
    });
    return c.json(await loadAppraisal(current.id));
  });

  app.get('/reviews/queue', async (c) => {
    const actor = c.get('authUser');
    const { role, reviewerUserId: queryId } = reviewQueueQuerySchema.parse({
      role: c.req.query('role'),
      reviewerUserId: c.req.query('reviewerUserId'),
    });
    // Authorize: only the matching reviewer role (or HR) may query that queue.
    // reviewerUserId is derived from authUser, never trusted from query.
    let reviewerUserId: number;
    if (actor.role === 'hr') {
      if (queryId == null) fail(400, 'reviewerUserId required for HR');
      reviewerUserId = queryId;
    } else {
      if (
        (role === 'sl' && actor.role !== 'sl') ||
        (role === 'hod' && actor.role !== 'hodept') ||
        (role === 'hodiv' && actor.role !== 'hodiv')
      ) {
        fail(403, 'Role mismatch');
      }
      reviewerUserId = actor.id;
    }
    const filtered = await db
      .select()
      .from(appraisals)
      .where(
        role === 'sl'
          ? and(
              eq(appraisals.reviewerSlUserId, reviewerUserId),
              eq(appraisals.status, 'sl_review')
            )
          : role === 'hod'
            ? and(
                eq(appraisals.reviewerHodUserId, reviewerUserId),
                eq(appraisals.status, 'hod_review')
              )
            : and(
                eq(appraisals.reviewerHodivUserId, reviewerUserId),
                eq(appraisals.status, 'hodiv_review')
              )
      );
    return c.json(await serializeAppraisalRows(filtered));
  });
}
