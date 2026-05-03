import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  appraisals,
  cycles,
  divisions,
  employees,
  jobTitles,
  kras,
  kraTemplateItems,
  kraTemplates,
  positions,
  users,
} from '../../db/schema.js';
import { initialsOf } from '../../serializers.js';
import { numberParam } from '../../util/params.js';
import { authMiddleware, requireRole } from '../auth.js';
import { crud } from '../crud.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

const cycleSchema = z.object({
  name: z.string().min(1).max(120),
  startDate: z.string().min(1).max(40),
  endDate: z.string().min(1).max(40),
  selfDeadline: z
    .union([z.string(), z.null(), z.literal('')])
    .transform((v) => (typeof v === 'string' && v !== '' ? v : null)),
  status: z.enum(['draft', 'active', 'closed']).default('draft'),
  description: z.string().max(2000).default(''),
  distributedAt: z
    .union([z.string(), z.null()])
    .nullable()
    .transform((v) => (typeof v === 'string' ? v : null)),
  totalAppraisals: z.number().int().nonnegative().default(0),
  completed: z.number().int().nonnegative().default(0),
  inReview: z.number().int().nonnegative().default(0),
  draft: z.number().int().nonnegative().default(0),
});

function templateKey(template: typeof kraTemplates.$inferSelect) {
  return `${template.divId}:${template.deptId}:${template.posId}`;
}

function versionRank(version: string) {
  const match = version.match(/\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function chooseReusableTemplates(
  rows: Array<typeof kraTemplates.$inferSelect>
) {
  const map = new Map<string, typeof kraTemplates.$inferSelect>();
  for (const row of rows) {
    if (row.status !== 'published') continue;
    const key = templateKey(row);
    const current = map.get(key);
    if (!current) {
      map.set(key, row);
      continue;
    }
    const currentRank = versionRank(current.version);
    const nextRank = versionRank(row.version);
    if (nextRank > currentRank || (nextRank === currentRank && row.id > current.id)) {
      map.set(key, row);
    }
  }
  return map;
}

async function distributionRows(cycleId: number) {
  const [cycle] = await db.select().from(cycles).where(eq(cycles.id, cycleId));
  if (!cycle) fail(404, 'Cycle not found');
  const employeeRows = await db.select().from(employees);
  const templateRows = await db.select().from(kraTemplates);
  const reusableTemplateMap = chooseReusableTemplates(templateRows);
  const appraisalRows = await db
    .select()
    .from(appraisals)
    .where(eq(appraisals.cycleName, cycle.name));
  const userRows = await db.select().from(users);
  const divisionRows = await db.select().from(divisions);
  const positionRows = await db.select().from(positions);
  const jobTitleRows = await db.select().from(jobTitles);

  return employeeRows.map((employee) => {
    const already = appraisalRows.some(
      (appraisal) => appraisal.userId === employee.id
    );
    const posTitle =
      positionRows.find((p) => p.id === employee.posId)?.title ?? '';
    const template =
      reusableTemplateMap.get(
        `${employee.divId}:${employee.deptId}:${employee.posId}`
      ) ?? null;
    const slEmp = employee.reviewerSlId
      ? employeeRows.find((e) => e.id === employee.reviewerSlId)
      : null;
    const sl = slEmp
      ? (userRows.find(
          (u) =>
            u.email.toLowerCase().trim() === slEmp.email.toLowerCase().trim()
        ) ?? null)
      : null;

    const hodEmp = employee.reviewerHodId
      ? employeeRows.find((e) => e.id === employee.reviewerHodId)
      : null;
    const hod = hodEmp
      ? (userRows.find(
          (u) =>
            u.email.toLowerCase().trim() === hodEmp.email.toLowerCase().trim()
        ) ?? null)
      : null;

    const hodivEmp = employee.reviewerHodivId
      ? employeeRows.find((e) => e.id === employee.reviewerHodivId)
      : null;
    const hodiv = hodivEmp
      ? (userRows.find(
          (u) =>
            u.email.toLowerCase().trim() === hodivEmp.email.toLowerCase().trim()
        ) ?? null)
      : null;

    const division = divisionRows.find((item) => item.id === employee.divId);
    const divisionName = division?.name ?? 'Unknown';

    const jobTitle = jobTitleRows.find((jt) => jt.id === employee.jobTitleId);
    const isStaffRole = (employee.orgRole ?? '').toLowerCase() === 'staff';
    const isStaffJobTitle = (jobTitle?.name ?? '')
      .toLowerCase()
      .includes('staff');

    if (already)
      return {
        employee,
        status: 'skipped_already',
        template: null,
        reason: `Sudah punya appraisal di ${cycle.name}`,
      };

    if (!isStaffRole && !isStaffJobTitle) {
      return {
        employee,
        status: 'skipped_not_staff',
        template: null,
        reason: 'Hanya role atau job title Staff yang mendapatkan distribusi',
      };
    }

    if (!template)
      return {
        employee,
        status: 'skipped_no_template',
        template: null,
        reason: `Belum ada template untuk ${divisionName} · ${posTitle}`,
      };

    if (!hod || !hodiv) {
      const missing = [];
      if (!hod) {
        const detail = hodEmp
          ? `User dgn email ${hodEmp.email} tidak ditemukan`
          : `Karyawan ID ${employee.reviewerHodId} tidak ditemukan`;
        missing.push(`HoD [${detail}]`);
      }
      if (!hodiv) {
        const detail = hodivEmp
          ? `User dgn email ${hodivEmp.email} tidak ditemukan`
          : `Karyawan ID ${employee.reviewerHodivId} tidak ditemukan`;
        missing.push(`HoDiv [${detail}]`);
      }
      return {
        employee,
        status: 'skipped_no_reviewer',
        template,
        reason: `Reviewer bermasalah: ${missing.join(' & ')}`,
      };
    }
    return {
      employee: {
        ...employee,
        sl: sl?.name ?? null,
        hod: hod.name,
        hodiv: hodiv.name,
        slUserId: sl?.id ?? null,
        hodUserId: hod.id,
        hodivUserId: hodiv.id,
      },
      status: 'matched',
      template,
      reason: null,
    };
  });
}

export function registerCycleRoutes(app: AppHono) {
  app.use('/cycles/*', authMiddleware);

  crud(app, '/cycles', cycles, cycleSchema);

  app.get('/cycles/:id/distribution', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    return c.json(await distributionRows(numberParam(c.req.param('id'))));
  });

  app.post('/cycles/:id/distribute', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    const cycleId = numberParam(c.req.param('id'));
    const [cycle] = await db
      .select()
      .from(cycles)
      .where(eq(cycles.id, cycleId));
    if (!cycle) fail(404, 'Cycle not found');
    if (cycle.status !== 'active') fail(400, 'Cycle must be active');
    const rows = await distributionRows(cycleId);
    const matched = rows.filter((row) => row.status === 'matched');
    const userRows = await db.select().from(users);
    const userMap = new Map(userRows.map((user) => [user.id, user]));
    const templateIds = [
      ...new Set(
        matched.map(
          (row) => (row.template as typeof kraTemplates.$inferSelect).id
        )
      ),
    ];
    const templateItems = templateIds.length
      ? await db
          .select()
          .from(kraTemplateItems)
          .where(inArray(kraTemplateItems.templateId, templateIds))
          .orderBy(asc(kraTemplateItems.sortOrder), asc(kraTemplateItems.id))
      : [];
    const templateItemsByTemplateId = new Map<
      number,
      Array<typeof kraTemplateItems.$inferSelect>
    >();
    for (const item of templateItems) {
      const items = templateItemsByTemplateId.get(item.templateId);
      if (items) items.push(item);
      else templateItemsByTemplateId.set(item.templateId, [item]);
    }
    let created = 0;

    await db.transaction(async (tx) => {
      for (const row of matched) {
        const employee = row.employee as typeof employees.$inferSelect & {
          sl: string | null;
          hod: string;
          hodiv: string;
          slUserId: number | null;
          hodUserId: number;
          hodivUserId: number;
        };
        const template = row.template as typeof kraTemplates.$inferSelect;
        const sl =
          employee.slUserId == null
            ? undefined
            : userMap.get(employee.slUserId);
        const hod = userMap.get(employee.hodUserId);
        const hodiv = userMap.get(employee.hodivUserId);
        if (!hod || !hodiv) continue;
        const [createdAppraisal] = await tx
          .insert(appraisals)
          .values({
            userId: employee.id,
            cycleName: cycle.name,
            cycleShort: cycle.name.replace(' Appraisal', ''),
            templateId: template.id,
            templateVersion: template.version,
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
        const currentTemplateItems =
          templateItemsByTemplateId.get(template.id) ?? [];
        if (currentTemplateItems.length) {
          await tx.insert(kras).values(
            currentTemplateItems.map((item, index) => ({
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

      const allForCycle = await tx
        .select()
        .from(appraisals)
        .where(eq(appraisals.cycleName, cycle.name));
      await tx
        .update(cycles)
        .set({
          totalAppraisals: allForCycle.length,
          completed: allForCycle.filter((row) => row.status === 'completed')
            .length,
          draft: allForCycle.filter((row) => row.status === 'draft').length,
          inReview: allForCycle.filter(
            (row) => row.status !== 'draft' && row.status !== 'completed'
          ).length,
          distributedAt: new Date().toISOString().slice(0, 10),
        })
        .where(eq(cycles.id, cycleId));
    });

    return c.json({
      created,
      skipped: rows.length - created,
      rows: await distributionRows(cycleId),
    });
  });
}
