import { eq, inArray } from 'drizzle-orm';
import { STUCK_REVIEW_MS } from '../../config.js';
import { db } from '../../db/client.js';
import {
  appraisals,
  auditEntries,
  cycles,
  divisions,
  employees,
  kras,
  users,
} from '../../db/schema.js';
import { initialsOf } from '../../serializers.js';
import { relTime } from '../../util/dates.js';
import { numberParam } from '../../util/params.js';
import { authMiddleware } from '../auth.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

function finalScoreOf(kraRows: Array<typeof kras.$inferSelect>) {
  const totalWeight = kraRows.reduce((sum, kra) => sum + kra.weight, 0) || 1;
  const weighted = kraRows.reduce((sum, kra) => {
    const score =
      kra.hodivScore ?? kra.hodScore ?? kra.slScore ?? kra.selfScore;
    return sum + score * kra.weight;
  }, 0);
  return weighted / totalWeight;
}

export function registerDashboardRoutes(app: AppHono) {
  app.use('/dashboard/*', authMiddleware);

  app.get('/dashboard/hr', async (c) => {
    const cycleRows = await db.select().from(cycles);
    const cycle =
      cycleRows.find((row) => row.status === 'active') ??
      [...cycleRows].sort((a, b) =>
        b.startDate.localeCompare(a.startDate)
      )[0] ??
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
        stats: {
          activeEmployees: 0,
          selfDone: 0,
          awaitingReview: 0,
          overdue: 0,
        },
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

    const bucketLabels = [
      '1.0–1.9',
      '2.0–2.9',
      '3.0–3.9',
      '4.0–4.4',
      '4.5–5.0',
    ];
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
          to:
            stageLabel[entry.toStatus ?? ''] ?? entry.toStatus ?? entry.action,
          when: relTime(entry.timestamp),
          initials: initialsOf(owner?.name ?? ''),
        };
      });

    const today = new Date().toISOString().slice(0, 10);
    const overdueDraft =
      cycle.selfDeadline && cycle.selfDeadline < today
        ? appraisalRows.filter((row) => row.status === 'draft')
        : [];
    const stuckThreshold = Date.now() - STUCK_REVIEW_MS;
    const lastTransitionTs = new Map<number, number>();
    for (const entry of auditRows) {
      if (!['submit', 'approve', 'return'].includes(entry.action)) continue;
      const ts = new Date(entry.timestamp).getTime();
      if (Number.isNaN(ts)) continue;
      const prev = lastTransitionTs.get(entry.appraisalId) ?? 0;
      if (ts > prev) lastTransitionTs.set(entry.appraisalId, ts);
    }
    const stuck = appraisalRows.filter((row) => {
      if (!['sl_review', 'hod_review', 'hodiv_review'].includes(row.status))
        return false;
      const ts = lastTransitionTs.get(row.id) ?? row.updatedAt.getTime();
      return ts < stuckThreshold;
    });
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
            (sum, kra, idx) =>
              sum + (reviewerScores[idx] as number) * kra.weight,
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
    // Cheap authz first: self or HR is always allowed without DB touch.
    // Only run the reviewer-relationship probe when neither holds.
    if (actor.role !== 'hr' && actor.id !== userId) {
      const targetAppraisals = await db
        .select({
          reviewerSlUserId: appraisals.reviewerSlUserId,
          reviewerHodUserId: appraisals.reviewerHodUserId,
          reviewerHodivUserId: appraisals.reviewerHodivUserId,
        })
        .from(appraisals)
        .where(eq(appraisals.userId, userId));
      const isReviewer = targetAppraisals.some((row) => {
        if (actor.role === 'sl') return row.reviewerSlUserId === actor.id;
        if (actor.role === 'hodept') return row.reviewerHodUserId === actor.id;
        if (actor.role === 'hodiv') return row.reviewerHodivUserId === actor.id;
        return false;
      });
      if (!isReviewer) fail(403, 'Forbidden');
    }
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
    };
    const verbMap: Record<string, string> = {
      submit: 'submitted',
      approve: 'approved',
      return: 'returned',
      acknowledge: 'acknowledged',
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
}
