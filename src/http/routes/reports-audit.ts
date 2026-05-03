import { eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  appraisals,
  auditEntries,
  cycles,
  departments,
  divisions,
  employees,
  kras,
  positions,
  systemAuditEntries,
  users,
} from '../../db/schema.js';
import { numberParam } from '../../util/params.js';
import { authMiddleware, requireRole } from '../auth.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

export async function buildCompletedReport(cycleId: number) {
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

const calibrationSchema = z.object({
  calibratedScore: z.number().min(1).max(5).nullable(),
  finalGrade: z.string().min(1).nullable(),
});

export function registerReportsAndAuditRoutes(app: AppHono) {
  app.use('/reports/*', authMiddleware);
  app.use('/audit', authMiddleware);
  app.use('/audit/*', authMiddleware);

  app.get('/reports/completed', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    const cycleId = numberParam(c.req.query('cycleId') ?? '', 'cycleId');
    return c.json(await buildCompletedReport(cycleId));
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

  app.get('/audit', async (c) => {
    const actor = c.get('authUser');
    const appraisalIdRaw = c.req.query('appraisalId');
    const cycleIdRaw = c.req.query('cycleId');
    const cycleNameRaw = c.req.query('cycleName');

    let targetAppraisals: (typeof appraisals.$inferSelect)[] = [];
    if (appraisalIdRaw) {
      const id = numberParam(appraisalIdRaw, 'appraisalId');
      const [row] = await db
        .select()
        .from(appraisals)
        .where(eq(appraisals.id, id));
      if (row) targetAppraisals = [row];
    } else if (cycleIdRaw || cycleNameRaw) {
      let cycleName = cycleNameRaw ?? null;
      if (!cycleName && cycleIdRaw) {
        const id = numberParam(cycleIdRaw, 'cycleId');
        const [cycleRow] = await db
          .select()
          .from(cycles)
          .where(eq(cycles.id, id));
        cycleName = cycleRow?.name ?? null;
      }
      if (cycleName) {
        targetAppraisals = await db
          .select()
          .from(appraisals)
          .where(eq(appraisals.cycleName, cycleName));
      }
    } else {
      fail(400, 'appraisalId or cycleId/cycleName required');
    }

    const allowed = targetAppraisals.filter((row) => {
      if (actor.role === 'hr') return true;
      if (row.userId === actor.id) return true;
      if (row.reviewerSlUserId === actor.id && actor.role === 'sl') return true;
      if (row.reviewerHodUserId === actor.id && actor.role === 'hodept')
        return true;
      if (row.reviewerHodivUserId === actor.id && actor.role === 'hodiv')
        return true;
      return false;
    });
    if (!allowed.length) return c.json([]);

    const rows = await db
      .select()
      .from(auditEntries)
      .where(
        inArray(
          auditEntries.appraisalId,
          allowed.map((row) => row.id)
        )
      );
    rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return c.json(
      rows.map((entry) => ({
        appraisalId: entry.appraisalId,
        timestamp: entry.timestamp,
        actor_user_id: entry.actorUserId,
        actor_name: entry.actorName,
        actor_role: entry.actorRole,
        action: entry.action,
        from_status: entry.fromStatus ?? undefined,
        to_status: entry.toStatus ?? undefined,
        reason: entry.reason ?? undefined,
        kra_id: entry.kraId ?? undefined,
      }))
    );
  });

  app.get('/audit/system', async (c) => {
    const actor = c.get('authUser');
    requireRole(actor, 'hr');
    const rows = await db.select().from(systemAuditEntries);
    rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    return c.json(
      rows.slice(0, 200).map((entry) => ({
        timestamp: entry.timestamp,
        actor_user_id: entry.actorUserId,
        actor_name: entry.actorName,
        actor_role: entry.actorRole,
        action: entry.action,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        entity_label: entry.entityLabel,
        metadata: entry.metadata ? JSON.parse(entry.metadata) : undefined,
      }))
    );
  });
}
