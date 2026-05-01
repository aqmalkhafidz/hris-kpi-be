import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import bcrypt from 'bcryptjs';
import { eq, inArray, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { db } from './db/client.js';
import {
  appraisals,
  auditEntries,
  cycles,
  departments,
  divisions,
  employees,
  jobTitles,
  squads,
  kras,
  kraTemplateItems,
  kraTemplates,
  positions,
  users,
} from './db/schema.js';
import {
  advanceStatusFor,
  isAppraisalStatus,
  requiredRoleForApproval,
  returnTargetFor,
} from './domain/appraisal.js';
import {
  authMiddleware,
  signToken,
  toAuthUser,
  type AuthUser,
} from './http/auth.js';
import { fail, jsonError } from './http/error.js';
import {
  loadAppraisal,
  replaceKras,
  requireAppraisal,
  serializeAppraisalRow,
  templatesWithItems,
} from './repositories.js';
import { initialsOf } from './serializers.js';
import type { AppraisalStatus } from './types.js';

const uploadDir = process.env.UPLOAD_DIR ?? 'uploads';
const uploadRoot = path.resolve(process.cwd(), uploadDir);

type AppEnv = { Variables: { authUser: AuthUser } };

const app = new Hono<AppEnv>();

function numberParam(value: string, label = 'id') {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(400, `Invalid ${label}`);
  return parsed;
}

app.onError((error, c) => jsonError(c, error));

app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN?.split(',') ?? ['http://localhost:5173'],
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  })
);

app.get('/health', (c) => c.json({ ok: true }));
app.get('/uploads/*', serveStatic({ root: './' }));

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

app.get('/auth/demo-users', async (c) => {
  const rows = await db.select().from(users);
  const empRows = await db.select().from(employees);
  return c.json(
    rows.map((u) => {
      const emp = empRows.find((e) => e.email === u.email);
      return toAuthUser(u, emp?.orgRole ?? 'staff');
    })
  );
});

app.post('/auth/login', async (c) => {
  const body = loginSchema.parse(await c.req.json());
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, body.email));
  if (!user) fail(401, 'Invalid email or password');
  const ok = await bcrypt.compare(body.password, user.passwordHash);
  if (!ok) fail(401, 'Invalid email or password');
  const [emp] = await db
    .select()
    .from(employees)
    .where(eq(employees.email, body.email));
  const authUser = toAuthUser(user, emp?.orgRole ?? 'staff');
  return c.json({ token: await signToken(authUser), user: authUser });
});

app.post('/auth/change-password', authMiddleware, async (c) => {
  const authUser = c.get('authUser');
  const body = (await c.req.json()) as Record<string, unknown>;
  const current = String(body.currentPassword ?? '');
  const next = String(body.newPassword ?? '');
  if (!next || next.length < 6)
    fail(400, 'New password must be at least 6 characters');
  const [user] = await db.select().from(users).where(eq(users.id, authUser.id));
  if (!user) fail(404, 'User not found');
  const ok = await bcrypt.compare(current, user.passwordHash);
  if (!ok) fail(401, 'Current password is incorrect');
  const newHash = await bcrypt.hash(next, 10);
  await db
    .update(users)
    .set({ passwordHash: newHash, updatedAt: new Date() })
    .where(eq(users.id, authUser.id));
  return c.json({ ok: true });
});

app.post('/auth/logout', (c) => c.json({ ok: true }));
app.get('/auth/me', authMiddleware, (c) => c.json({ user: c.get('authUser') }));

app.use('/appraisals/*', authMiddleware);
app.use('/reviews/*', authMiddleware);
app.use('/org/*', authMiddleware);
app.use('/cycles/*', authMiddleware);
app.use('/kra-templates*', authMiddleware);
app.use('/reports/*', authMiddleware);
app.use('/dashboard/*', authMiddleware);
app.use('/uploads', authMiddleware);

app.get('/appraisals/user/:userId', async (c) => {
  const authUser = c.get('authUser');
  const userId = numberParam(c.req.param('userId'), 'userId');
  if (authUser.role !== 'hr' && authUser.id !== userId) fail(403, 'Forbidden');
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
  return c.json(await Promise.all(rows.map(serializeAppraisalRow)));
});

app.get('/appraisals/history', async (c) => {
  const ids = (c.req.query('userIds') ?? '')
    .split(',')
    .map((id) => Number(id.trim()))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return c.json([]);
  const rows = await db
    .select()
    .from(appraisals)
    .where(inArray(appraisals.userId, ids));
  const completed = rows
    .filter((row) => row.status === 'completed')
    .sort((a, b) =>
      (b.acknowledgedAt ?? '').localeCompare(a.acknowledgedAt ?? '')
    );
  return c.json(await Promise.all(completed.map(serializeAppraisalRow)));
});

app.get('/appraisals/:id', async (c) =>
  c.json(await loadAppraisal(numberParam(c.req.param('id'))))
);

app.patch('/appraisals/:id', async (c) => {
  const id = numberParam(c.req.param('id'));
  const current = await requireAppraisal(id);
  const body = (await c.req.json()) as Record<string, unknown>;
  const updates: Partial<typeof appraisals.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (typeof body.reflection === 'string') updates.reflection = body.reflection;
  if (typeof body.status === 'string' && isAppraisalStatus(body.status))
    updates.status = body.status;
  if (typeof body.submittedAt === 'string')
    updates.submittedAt = body.submittedAt;
  if (typeof body.acknowledged_at === 'string')
    updates.acknowledgedAt = body.acknowledged_at;
  await db.update(appraisals).set(updates).where(eq(appraisals.id, id));
  if (Array.isArray(body.kras))
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
    .set({ status: 'completed', acknowledgedAt: now, updatedAt: new Date() })
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
  const reviewerUserId = Number(c.req.query('reviewerUserId'));
  const role = c.req.query('role');
  if (!Number.isInteger(reviewerUserId) || !role)
    fail(400, 'Missing reviewerUserId or role');
  const rows = await db.select().from(appraisals);
  const filtered = rows.filter((row) => {
    if (role === 'sl')
      return (
        row.reviewerSlUserId === reviewerUserId && row.status === 'sl_review'
      );
    if (role === 'hod')
      return (
        row.reviewerHodUserId === reviewerUserId && row.status === 'hod_review'
      );
    if (role === 'hodiv')
      return (
        row.reviewerHodivUserId === reviewerUserId &&
        row.status === 'hodiv_review'
      );
    return false;
  });
  return c.json(await Promise.all(filtered.map(serializeAppraisalRow)));
});

function crud(
  base: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any,
  defaults: (
    body: Record<string, unknown>,
    id?: number
  ) => Record<string, unknown>,
  softDelete = false
) {
  app.get(base, async (c) => {
    const query = db.select().from(table);
    const rows = softDelete
      ? await query.where(isNull(table.deletedAt))
      : await query;
    return c.json(rows);
  });
  app.post(base, async (c) => {
    const body = (await c.req.json()) as Record<string, unknown>;
    const row = defaults(body);
    const [created] = await db.insert(table).values(row).returning();
    return c.json(created, 201);
  });
  app.put(`${base}/:id`, async (c) => {
    const id = numberParam(c.req.param('id'));
    const row = defaults((await c.req.json()) as Record<string, unknown>, id);
    const [updated] = await db
      .update(table)
      .set(row)
      .where(eq(table.id, id))
      .returning();
    return c.json(updated);
  });
  app.delete(`${base}/:id`, async (c) => {
    const id = numberParam(c.req.param('id'));
    if (softDelete) {
      await db
        .update(table)
        .set({ deletedAt: new Date() })
        .where(eq(table.id, id));
    } else {
      await db.delete(table).where(eq(table.id, id));
    }
    return c.json({ ok: true });
  });
}

crud(
  '/org/divisions',
  divisions,
  (body, id) => ({
    ...(id ? { id } : {}),
    code: String(body.code ?? ''),
    name: String(body.name ?? ''),
  }),
  true
);

crud(
  '/org/departments',
  departments,
  (body, id) => ({
    ...(id ? { id } : {}),
    name: String(body.name ?? ''),
    divId: Number(body.divId ?? 0),
  }),
  true
);

crud(
  '/org/positions',
  positions,
  (body, id) => ({
    ...(id ? { id } : {}),
    code: String(body.code ?? ''),
    title: String(body.title ?? ''),
    divId: Number(body.divId ?? 0),
    deptId: Number(body.deptId ?? 0),
  }),
  true
);

app.get('/org/employees', authMiddleware, async (c) => {
  const rows = await db
    .select()
    .from(employees)
    .where(isNull(employees.deletedAt));
  const posRows = await db.select().from(positions);
  return c.json(
    rows.map((e) => ({
      ...e,
      position: posRows.find((p) => p.id === e.posId)?.title ?? '',
    }))
  );
});

crud(
  '/org/employees',
  employees,
  (body, id) => ({
    ...(id ? { id } : {}),
    name: String(body.name ?? ''),
    initials: String(body.initials ?? initialsOf(String(body.name ?? ''))),
    email: String(body.email ?? ''),
    nip: String(body.nip ?? ''),
    posId:
      body.posId == null || body.posId === ''
        ? null
        : Number(body.posId) || null,
    deptId: Number(body.deptId ?? 0),
    divId: Number(body.divId ?? 0),
    squadId:
      body.squadId == null || body.squadId === ''
        ? null
        : Number(body.squadId) || null,
    jobTitleId:
      body.jobTitleId == null || body.jobTitleId === ''
        ? null
        : Number(body.jobTitleId) || null,
    status: String(body.status ?? 'active'),
    joined: String(body.joined ?? ''),
    orgRole: String(body.orgRole ?? 'STAFF'),
    reviewerSlId:
      body.reviewerSlId == null ? null : Number(body.reviewerSlId) || null,
    reviewerHodId:
      body.reviewerHodId == null ? null : Number(body.reviewerHodId) || null,
    reviewerHodivId:
      body.reviewerHodivId == null
        ? null
        : Number(body.reviewerHodivId) || null,
  }),
  true
);

crud(
  '/org/job-titles',
  jobTitles,
  (body, id) => ({
    ...(id ? { id } : {}),
    code: String(body.code ?? ''),
    name: String(body.name ?? ''),
    description: String(body.description ?? ''),
  }),
  true
);

crud(
  '/org/squads',
  squads,
  (body, id) => ({
    ...(id ? { id } : {}),
    code: String(body.code ?? ''),
    name: String(body.name ?? ''),
    divId: Number(body.divId ?? 0),
    deptId: Number(body.deptId ?? 0),
    description: String(body.description ?? ''),
  }),
  true
);

crud('/cycles', cycles, (body, id) => ({
  ...(id ? { id } : {}),
  name: String(body.name ?? ''),
  startDate: String(body.startDate ?? ''),
  endDate: String(body.endDate ?? ''),
  selfDeadline:
    body.selfDeadline == null || body.selfDeadline === ''
      ? null
      : String(body.selfDeadline),
  status: String(body.status ?? 'draft'),
  description: String(body.description ?? ''),
  distributedAt: body.distributedAt == null ? null : String(body.distributedAt),
  totalAppraisals: Number(body.totalAppraisals ?? 0),
  completed: Number(body.completed ?? 0),
  inReview: Number(body.inReview ?? 0),
  draft: Number(body.draft ?? 0),
}));

async function distributionRows(cycleId: number) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle) fail(404, 'Cycle not found');
  const employeeRows = await db.select().from(employees);
  const templateRows = await db.select().from(kraTemplates);
  const appraisalRows = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.cycleName, cycle.name));
  const userRows = await db.select().from(users);
  const divisionRows = await db.select().from(divisions);
  const positionRows = await db.select().from(positions);

  return employeeRows.map((employee) => {
    const already = appraisalRows.some(
      (appraisal) => appraisal.userId === employee.id
    );
    const posTitle =
      positionRows.find((p) => p.id === employee.posId)?.title ?? '';
    const template =
      templateRows.find(
        (item) =>
          item.deptId === employee.deptId &&
          posTitle.toLowerCase().includes(item.name.toLowerCase())
      ) ?? null;
    const sl = employee.reviewerSlId
      ? (userRows.find((user) => user.id === employee.reviewerSlId) ?? null)
      : null;
    const hod = employee.reviewerHodId
      ? (userRows.find((user) => user.id === employee.reviewerHodId) ?? null)
      : null;
    const hodiv = employee.reviewerHodivId
      ? (userRows.find((user) => user.id === employee.reviewerHodivId) ?? null)
      : null;
    const division = divisionRows.find((item) => item.id === employee.divId);
    const divisionName = division?.name ?? 'Unknown';

    if (already)
      return {
        employee,
        status: 'skipped_already',
        template: null,
        reason: `Sudah punya appraisal di ${cycle.name}`,
      };
    if (!template)
      return {
        employee,
        status: 'skipped_no_template',
        template: null,
        reason: `Belum ada template untuk ${divisionName} · ${posTitle}`,
      };
    if (!hod || !hodiv)
      return {
        employee,
        status: 'skipped_no_reviewer',
        template,
        reason: 'Tidak ada reviewer valid (HoD/HoDiv kosong)',
      };
    return {
      employee: {
        ...employee,
        sl: sl?.name ?? null,
        hod: hod.name,
        hodiv: hodiv.name,
      },
      status: 'matched',
      template,
      reason: null,
    };
  });
}

app.get('/cycles/:id/distribution', async (c) =>
  c.json(await distributionRows(numberParam(c.req.param('id'))))
);

app.post('/cycles/:id/distribute', async (c) => {
  const cycleId = numberParam(c.req.param('id'));
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle) fail(404, 'Cycle not found');
  if (cycle.status !== 'active') fail(400, 'Cycle must be active');
  const rows = await distributionRows(cycleId);
  const matched = rows.filter((row) => row.status === 'matched');
  const userRows = await db.select().from(users);
  let created = 0;

  for (const row of matched) {
    const employee = row.employee as typeof employees.$inferSelect & {
      sl: string | null;
      hod: string;
      hodiv: string;
    };
    const template = row.template as typeof kraTemplates.$inferSelect;
    const templateItems = await db
      .select()
      .from(kraTemplateItems)
      .where(eq(kraTemplateItems.templateId, template.id));
    const sl = userRows.find((user) => user.name === employee.sl);
    const hod = userRows.find((user) => user.name === employee.hod);
    const hodiv = userRows.find((user) => user.name === employee.hodiv);
    if (!hod || !hodiv) continue;
    const [createdAppraisal] = await db
      .insert(appraisals)
      .values({
        userId: employee.id,
        cycleName: cycle.name,
        cycleShort: cycle.name.replace(' Appraisal', '').replace('Q', 'Q'),
        status: 'draft',
        reflection: '',
        reviewerSlUserId: sl?.id ?? hod.id,
        reviewerSlName: sl?.name ?? hod.name,
        reviewerSlInitials: initialsOf(sl?.name ?? hod.name),
        reviewerHodUserId: hod.id,
        reviewerHodName: hod.name,
        reviewerHodInitials: initialsOf(hod.name),
        reviewerHodivUserId: hodiv.id,
        reviewerHodivName: hodiv.name,
        reviewerHodivInitials: initialsOf(hodiv.name),
      })
      .returning();
    if (templateItems.length) {
      await db.insert(kras).values(
        templateItems.map((item, index) => ({
          appraisalId: createdAppraisal.id,
          title: item.title,
          description: item.kpi,
          target: item.kpi,
          weight: item.weight,
          selfScore: 0,
          selfComment: '',
          sortOrder: index,
        }))
      );
    }
    created++;
  }

  const allForCycle = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.cycleName, cycle.name));
  await db
    .update(cycles)
    .set({
      totalAppraisals: allForCycle.length,
      completed: allForCycle.filter((row) => row.status === 'completed').length,
      draft: allForCycle.filter((row) => row.status === 'draft').length,
      inReview: allForCycle.filter(
        (row) => row.status !== 'draft' && row.status !== 'completed'
      ).length,
      distributedAt: new Date().toISOString().slice(0, 10),
    })
    .where(eq(cycles.id, cycleId));

  return c.json({
    created,
    skipped: rows.length - created,
    rows: await distributionRows(cycleId),
  });
});

async function buildCompletedReport(cycleId: number) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle) fail(404, 'Cycle not found');
  const appraisalRows = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.cycleName, cycle.name));
  const completed = appraisalRows.filter((row) => row.status === 'completed');
  if (!completed.length) return [];
  const kraRows = await db
    .select()
    .from(kras)
    .where(
      inArray(
        kras.appraisalId,
        completed.map((row) => row.id)
      )
    );
  const userRows = await db
    .select()
    .from(users)
    .where(
      inArray(
        users.id,
        completed.map((row) => row.userId)
      )
    );
  const employeeRows = await db.select().from(employees);
  const divisionRows = await db.select().from(divisions);
  const departmentRows = await db.select().from(departments);
  const positionRows = await db.select().from(positions);

  return completed
    .map((row) => {
      const kraForRow = kraRows.filter((kra) => kra.appraisalId === row.id);
      const totalWeight =
        kraForRow.reduce((sum, kra) => sum + kra.weight, 0) || 1;
      const weighted = kraForRow.reduce((sum, kra) => {
        const score =
          kra.hodivScore ?? kra.hodScore ?? kra.slScore ?? kra.selfScore;
        return sum + score * kra.weight;
      }, 0);
      const finalScore = Number((weighted / totalWeight).toFixed(2));
      const user = userRows.find((item) => item.id === row.userId);
      const employee = user
        ? employeeRows.find((item) => item.email === user.email)
        : undefined;
      const division = employee
        ? divisionRows.find((item) => item.id === employee.divId)
        : undefined;
      const department = employee
        ? departmentRows.find((item) => item.id === employee.deptId)
        : undefined;
      const calibratedScore =
        row.calibratedScore == null ? null : Number(row.calibratedScore);
      return {
        id: row.id,
        cycleId,
        employee: user?.name ?? `User #${row.userId}`,
        nip: employee?.nip ?? '',
        dept: department?.name ?? '',
        division: division?.name ?? '',
        position:
          positionRows.find((p) => p.id === employee?.posId)?.title ?? '',
        finalScore,
        calibratedScore,
        finalGrade: row.finalGrade ?? null,
        isCalibrated: calibratedScore !== null,
        completedAt: row.acknowledgedAt ?? '',
      };
    })
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
}

app.get('/reports/completed', async (c) => {
  const cycleId = numberParam(c.req.query('cycleId') ?? '', 'cycleId');
  return c.json(await buildCompletedReport(cycleId));
});

const calibrationSchema = z.object({
  calibratedScore: z.number().min(1).max(5).nullable(),
  finalGrade: z.string().min(1).nullable(),
});

app.patch('/reports/calibration/:id', async (c) => {
  const actor = c.get('authUser');
  if (actor.role !== 'hr') fail(403, 'Only HR can calibrate');
  const id = numberParam(c.req.param('id'));
  const body = calibrationSchema.parse(await c.req.json());
  const [current] = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.id, id));
  if (!current) fail(404, 'Appraisal not found');
  if (current.status !== 'completed')
    fail(400, 'Appraisal must be completed before calibration');
  await db
    .update(appraisals)
    .set({
      calibratedScore:
        body.calibratedScore == null ? null : body.calibratedScore.toFixed(2),
      finalGrade: body.calibratedScore == null ? null : body.finalGrade,
      calibratedAt:
        body.calibratedScore == null
          ? null
          : new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(appraisals.id, id));
  const cycleRow = await db
    .select()
    .from(cycles)
    .where(eq(cycles.name, current.cycleName));
  const cycleId = cycleRow[0]?.id;
  if (!cycleId) fail(404, 'Cycle not found for appraisal');
  const rows = await buildCompletedReport(cycleId);
  return c.json(rows.find((row) => row.id === id) ?? null);
});

function relTime(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function finalScoreOf(kraRows: Array<typeof kras.$inferSelect>) {
  const totalWeight = kraRows.reduce((sum, kra) => sum + kra.weight, 0) || 1;
  const weighted = kraRows.reduce((sum, kra) => {
    const score =
      kra.hodivScore ?? kra.hodScore ?? kra.slScore ?? kra.selfScore;
    return sum + score * kra.weight;
  }, 0);
  return weighted / totalWeight;
}

app.get('/dashboard/hr', async (c) => {
  const cycleRows = await db.select().from(cycles);
  const cycle =
    cycleRows.find((row) => row.status === 'active') ??
    [...cycleRows].sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ??
    null;
  if (!cycle) {
    return c.json({
      cycle: null,
      pipeline: {
        invited: 0,
        draftStarted: 0,
        selfSubmitted: 0,
        slApproved: 0,
        hodApproved: 0,
        hodivApproved: 0,
        completed: 0,
      },
      divisions: [],
      scoreBuckets: [],
      recentSubmissions: [],
      attention: [],
      stats: { activeEmployees: 0, selfDone: 0, awaitingReview: 0, overdue: 0 },
    });
  }

  const appraisalRows = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.cycleName, cycle.name));
  const userRows = await db.select().from(users);
  const employeeRows = await db.select().from(employees);
  const divisionRows = await db.select().from(divisions);
  const employeeMap = new Map(employeeRows.map((e) => [e.id, e]));
  const divisionMap = new Map(divisionRows.map((d) => [d.id, d]));
  const kraRows = appraisalRows.length
    ? await db
        .select()
        .from(kras)
        .where(
          inArray(
            kras.appraisalId,
            appraisalRows.map((row) => row.id)
          )
        )
    : [];
  const auditRows = appraisalRows.length
    ? await db
        .select()
        .from(auditEntries)
        .where(
          inArray(
            auditEntries.appraisalId,
            appraisalRows.map((row) => row.id)
          )
        )
    : [];

  const isPastSelfDraft = (row: typeof appraisals.$inferSelect) =>
    row.status !== 'draft';
  const slApproved = appraisalRows.filter((row) =>
    ['hod_review', 'hodiv_review', 'acknowledge', 'completed'].includes(
      row.status
    )
  );
  const hodApproved = appraisalRows.filter((row) =>
    ['hodiv_review', 'acknowledge', 'completed'].includes(row.status)
  );
  const hodivApproved = appraisalRows.filter((row) =>
    ['acknowledge', 'completed'].includes(row.status)
  );
  const completed = appraisalRows.filter((row) => row.status === 'completed');
  const draftStarted = appraisalRows.filter((row) => {
    if (row.reflection.length) return true;
    if (isPastSelfDraft(row)) return true;
    return kraRows.some(
      (kra) => kra.appraisalId === row.id && kra.selfScore > 0
    );
  });

  const pipeline = {
    invited: appraisalRows.length,
    draftStarted: draftStarted.length,
    selfSubmitted: appraisalRows.filter((row) => row.submittedAt).length,
    slApproved: slApproved.length,
    hodApproved: hodApproved.length,
    hodivApproved: hodivApproved.length,
    completed: completed.length,
  };

  const userMap = new Map(userRows.map((row) => [row.id, row]));
  const divisionGroups = new Map<string, typeof appraisalRows>();
  for (const row of appraisalRows) {
    const user = userMap.get(row.userId);
    const emp = employeeMap.get(row.userId);
    const divName = emp
      ? (divisionMap.get(emp.divId)?.name ?? 'Unassigned')
      : 'Unassigned';
    const list = divisionGroups.get(divName) ?? [];
    list.push(row);
    divisionGroups.set(divName, list);
  }

  const divisionStats = Array.from(divisionGroups.entries())
    .map(([name, rows]) => {
      const completedRows = rows.filter((row) => row.status === 'completed');
      const inReviewRows = rows.filter((row) =>
        ['sl_review', 'hod_review', 'hodiv_review', 'acknowledge'].includes(
          row.status
        )
      );
      const draftRows = rows.filter(
        (row) =>
          row.status === 'draft' &&
          (row.reflection.length ||
            kraRows.some(
              (kra) => kra.appraisalId === row.id && kra.selfScore > 0
            ))
      );
      const notStartedRows = rows.filter(
        (row) =>
          row.status === 'draft' &&
          !row.reflection.length &&
          !kraRows.some(
            (kra) => kra.appraisalId === row.id && kra.selfScore > 0
          )
      );
      const scores = completedRows.map((row) => {
        const calibrated =
          row.calibratedScore == null ? null : Number(row.calibratedScore);
        if (calibrated !== null) return calibrated;
        return finalScoreOf(
          kraRows.filter((kra) => kra.appraisalId === row.id)
        );
      });
      const avg = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : 0;
      return {
        name,
        total: rows.length,
        completed: completedRows.length,
        inReview: inReviewRows.length,
        draft: draftRows.length,
        notStarted: notStartedRows.length,
        avg: Number(avg.toFixed(2)),
      };
    })
    .sort((a, b) => b.total - a.total);

  const bucketLabels = ['1.0–1.9', '2.0–2.9', '3.0–3.9', '4.0–4.4', '4.5–5.0'];
  const scoreBuckets = bucketLabels.map((label) => ({ label, count: 0 }));
  for (const row of completed) {
    const calibrated =
      row.calibratedScore == null ? null : Number(row.calibratedScore);
    const score =
      calibrated ??
      finalScoreOf(kraRows.filter((kra) => kra.appraisalId === row.id));
    if (score < 2) scoreBuckets[0].count++;
    else if (score < 3) scoreBuckets[1].count++;
    else if (score < 4) scoreBuckets[2].count++;
    else if (score < 4.5) scoreBuckets[3].count++;
    else scoreBuckets[4].count++;
  }

  const recentSubmissions = [...auditRows]
    .filter((entry) =>
      ['submit', 'approve', 'acknowledge'].includes(entry.action)
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 6)
    .map((entry) => {
      const appraisal = appraisalRows.find(
        (row) => row.id === entry.appraisalId
      );
      const owner = appraisal ? userMap.get(appraisal.userId) : undefined;
      const stageLabel: Record<string, string> = {
        sl_review: 'Squad Leader review',
        hod_review: 'HoD review',
        hodiv_review: 'HoDiv review',
        acknowledge: 'Acknowledge',
        completed: 'Completed',
      };
      return {
        who: owner?.name ?? `User #${appraisal?.userId ?? '?'}`,
        team: owner
          ? (divisionMap.get(
              employeeMap.get(appraisal?.userId ?? 0)?.divId ?? 0
            )?.name ?? '')
          : '',
        to: stageLabel[entry.toStatus ?? ''] ?? entry.toStatus ?? entry.action,
        when: relTime(entry.timestamp),
        initials: initialsOf(owner?.name ?? ''),
      };
    });

  const today = new Date().toISOString().slice(0, 10);
  const overdueDraft =
    cycle.selfDeadline && cycle.selfDeadline < today
      ? appraisalRows.filter((row) => row.status === 'draft')
      : [];
  const stuckThreshold = Date.now() - 5 * 24 * 60 * 60 * 1000;
  const stuck = appraisalRows.filter(
    (row) =>
      ['sl_review', 'hod_review', 'hodiv_review'].includes(row.status) &&
      row.updatedAt.getTime() < stuckThreshold
  );
  const attention: Array<{
    title: string;
    subtitle: string;
    tone: 'error' | 'warning' | 'brand';
  }> = [];
  if (overdueDraft.length) {
    attention.push({
      title: `${overdueDraft.length} employee(s) missed self-appraisal deadline`,
      subtitle: `Deadline ${cycle.selfDeadline}`,
      tone: 'error',
    });
  }
  if (stuck.length) {
    attention.push({
      title: `${stuck.length} review(s) stuck > 5 days`,
      subtitle: 'Across SL/HoD/HoDiv stages',
      tone: 'warning',
    });
  }

  const stats = {
    activeEmployees: appraisalRows.length,
    selfDone: appraisalRows.filter((row) => row.submittedAt).length,
    awaitingReview: appraisalRows.filter((row) =>
      ['sl_review', 'hod_review', 'hodiv_review'].includes(row.status)
    ).length,
    overdue: overdueDraft.length,
  };

  return c.json({
    cycle: {
      id: cycle.id,
      name: cycle.name,
      startDate: cycle.startDate,
      endDate: cycle.endDate,
      selfDeadline: cycle.selfDeadline,
    },
    pipeline,
    divisions: divisionStats,
    scoreBuckets,
    recentSubmissions,
    attention,
    stats,
  });
});

app.get('/dashboard/me/perf-history', async (c) => {
  const actor = c.get('authUser');
  const userId = numberParam(c.req.query('userId') ?? '', 'userId');
  if (actor.role !== 'hr' && actor.id !== userId) fail(403, 'Forbidden');
  const rows = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.userId, userId));
  const completed = rows
    .filter((row) => row.status === 'completed')
    .sort((a, b) =>
      (a.acknowledgedAt ?? '').localeCompare(b.acknowledgedAt ?? '')
    )
    .slice(-4);
  if (!completed.length) {
    return c.json({ quarters: [], self: [], reviewer: [], calibrated: [] });
  }
  const kraRows = await db
    .select()
    .from(kras)
    .where(
      inArray(
        kras.appraisalId,
        completed.map((row) => row.id)
      )
    );
  const series = completed.map((row) => {
    const kraForRow = kraRows.filter((kra) => kra.appraisalId === row.id);
    const totalWeight =
      kraForRow.reduce((sum, kra) => sum + kra.weight, 0) || 1;
    const weightedSelf =
      kraForRow.reduce((sum, kra) => sum + kra.selfScore * kra.weight, 0) /
      totalWeight;
    const reviewerScores = kraForRow.map(
      (kra) => kra.hodivScore ?? kra.hodScore ?? kra.slScore ?? null
    );
    const hasReviewer = reviewerScores.every((score) => score !== null);
    const reviewer = hasReviewer
      ? kraForRow.reduce(
          (sum, kra, idx) => sum + (reviewerScores[idx] as number) * kra.weight,
          0
        ) / totalWeight
      : null;
    const calibrated =
      row.calibratedScore == null ? null : Number(row.calibratedScore);
    return {
      quarter: row.cycleShort,
      self: Number(weightedSelf.toFixed(2)),
      reviewer: reviewer == null ? null : Number(reviewer.toFixed(2)),
      calibrated: calibrated == null ? null : Number(calibrated.toFixed(2)),
    };
  });
  return c.json({
    quarters: series.map((item) => item.quarter),
    self: series.map((item) => item.self),
    reviewer: series.map((item) => item.reviewer),
    calibrated: series.map((item) => item.calibrated),
  });
});

app.get('/dashboard/me/activity', async (c) => {
  const actor = c.get('authUser');
  const userId = numberParam(c.req.query('userId') ?? '', 'userId');
  if (actor.role !== 'hr' && actor.id !== userId) fail(403, 'Forbidden');
  const userAppraisals = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.userId, userId));
  if (!userAppraisals.length) return c.json([]);
  const auditRows = await db
    .select()
    .from(auditEntries)
    .where(
      inArray(
        auditEntries.appraisalId,
        userAppraisals.map((row) => row.id)
      )
    );
  const userRows = await db.select().from(users);
  const userMap = new Map(userRows.map((row) => [row.id, row]));
  const sorted = [...auditRows]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 8);
  const toneMap: Record<string, 'success' | 'brand' | 'warning' | 'gray'> = {
    submit: 'brand',
    approve: 'success',
    return: 'warning',
    acknowledge: 'success',
    score_change: 'gray',
    comment: 'gray',
  };
  const verbMap: Record<string, string> = {
    submit: 'submitted',
    approve: 'approved',
    return: 'returned',
    acknowledge: 'acknowledged',
    score_change: 'updated score on',
    comment: 'commented on',
  };
  return c.json(
    sorted.map((entry) => {
      const actorUser = userMap.get(entry.actorUserId);
      const isOwner = entry.actorUserId === userId;
      const appraisal = userAppraisals.find(
        (row) => row.id === entry.appraisalId
      );
      return {
        avatar: initialsOf(actorUser?.name ?? ''),
        who: isOwner
          ? 'You'
          : (actorUser?.name ?? `User #${entry.actorUserId}`),
        what: verbMap[entry.action] ?? entry.action,
        target: appraisal?.cycleShort ?? `appraisal #${entry.appraisalId}`,
        when: relTime(entry.timestamp),
        tone: toneMap[entry.action] ?? 'gray',
      };
    })
  );
});

app.get('/kra-templates', async (c) => c.json(await templatesWithItems()));

app.post('/kra-templates', async (c) => {
  const body = (await c.req.json()) as Record<string, unknown>;
  const [created] = await db
    .insert(kraTemplates)
    .values({
      code: String(body.code ?? ''),
      name: String(body.name ?? ''),
      dept: String(body.dept ?? ''),
      level: String(body.level ?? ''),
      version: String(body.version ?? 'v1'),
      status: String(body.status ?? 'draft'),
      updated: String(
        body.updated ??
          new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
      ),
      usedBy: Number(body.usedBy ?? 0),
      summary: String(body.summary ?? ''),
    })
    .returning();
  return c.json(
    (await templatesWithItems()).find((t) => t.id === created.id),
    201
  );
});

app.put('/kra-templates/:id', async (c) => {
  const id = numberParam(c.req.param('id'));
  const body = (await c.req.json()) as Record<string, unknown>;
  await db
    .update(kraTemplates)
    .set({
      code: String(body.code ?? ''),
      name: String(body.name ?? ''),
      dept: String(body.dept ?? ''),
      level: String(body.level ?? ''),
      version: String(body.version ?? 'v1'),
      status: String(body.status ?? 'draft'),
      updated: String(
        body.updated ??
          new Date().toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
      ),
      usedBy: Number(body.usedBy ?? 0),
      summary: String(body.summary ?? ''),
    })
    .where(eq(kraTemplates.id, id));
  return c.json((await templatesWithItems()).find((t) => t.id === id));
});

app.delete('/kra-templates/:id', async (c) => {
  await db
    .delete(kraTemplates)
    .where(eq(kraTemplates.id, numberParam(c.req.param('id'))));
  return c.json({ ok: true });
});

app.put('/kra-templates/:id/items', async (c) => {
  const templateId = numberParam(c.req.param('id'));
  const items = z
    .array(
      z.object({
        code: z.string(),
        title: z.string(),
        weight: z.number(),
        kpi: z.string(),
      })
    )
    .parse(await c.req.json());
  await db
    .delete(kraTemplateItems)
    .where(eq(kraTemplateItems.templateId, templateId));
  if (items.length) {
    await db.insert(kraTemplateItems).values(
      items.map((item, index) => ({
        templateId,
        ...item,
        sortOrder: index,
      }))
    );
  }
  return c.json((await templatesWithItems()).find((t) => t.id === templateId));
});

app.post('/uploads', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) fail(400, 'file is required');
  const allowed = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'text/plain',
    'text/markdown',
  ]);
  if (!allowed.has(file.type)) fail(400, 'Unsupported file type');
  if (file.size > 10 * 1024 * 1024) fail(400, 'File exceeds 10 MB');
  await mkdir(uploadRoot, { recursive: true });
  const ext = path.extname(file.name);
  const filename = `${nanoid()}${ext}`;
  await writeFile(
    path.join(uploadRoot, filename),
    Buffer.from(await file.arrayBuffer())
  );
  return c.json({
    kind: 'file',
    name: file.name,
    date: new Date().toISOString().slice(0, 10),
    url: `/uploads/${filename}`,
  });
});

export default app;
