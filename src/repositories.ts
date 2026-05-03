import { and, asc, desc, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  appraisals,
  auditEntries,
  cycles,
  employees,
  evidence,
  kras,
  kraTemplateItems,
  kraTemplates,
} from './db/schema.js';
import { fail } from './http/error.js';
import { initialsOf, serializeAppraisal } from './serializers.js';

async function loadCycleByName(name: string) {
  const [row] = await db.select().from(cycles).where(eq(cycles.name, name));
  return row ?? null;
}

async function loadOwnerByEmployeeId(userId: number) {
  const [employee] = await db
    .select({
      id: employees.id,
      name: employees.name,
      initials: employees.initials,
    })
    .from(employees)
    .where(eq(employees.id, userId));
  if (!employee) {
    return {
      userId,
      name: `Employee #${userId}`,
      initials: initialsOf(`Employee ${userId}`),
    };
  }
  return {
    userId: employee.id,
    name: employee.name,
    initials: employee.initials,
  };
}

export async function loadAppraisal(id: number) {
  const [row] = await db.select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) return null;
  const [kraList, auditList, cycle, owner] = await Promise.all([
    loadKras(row.id),
    loadAudit(row.id),
    loadCycleByName(row.cycleName),
    loadOwnerByEmployeeId(row.userId),
  ]);
  return serializeAppraisal(row, kraList, auditList, cycle, owner);
}

export async function requireAppraisal(id: number) {
  const [row] = await db.select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) fail(404, 'Appraisal not found');
  return row;
}

export async function loadKras(appraisalId: number) {
  const kraRows = await db
    .select()
    .from(kras)
    .where(eq(kras.appraisalId, appraisalId))
    .orderBy(asc(kras.sortOrder), asc(kras.id));
  const evidenceRows = kraRows.length
    ? await db
        .select()
        .from(evidence)
        .where(
          inArray(
            evidence.kraId,
            kraRows.map((kra) => kra.id)
          )
        )
    : [];
  return kraRows.map((kra) => ({
    ...kra,
    evidence: evidenceRows.filter((item) => item.kraId === kra.id),
  }));
}

export async function loadAudit(appraisalId: number) {
  return db
    .select()
    .from(auditEntries)
    .where(eq(auditEntries.appraisalId, appraisalId))
    .orderBy(asc(auditEntries.timestamp), asc(auditEntries.id));
}

export async function serializeAppraisalRow(
  row: typeof appraisals.$inferSelect
) {
  const [kraList, auditList, cycle, owner] = await Promise.all([
    loadKras(row.id),
    loadAudit(row.id),
    loadCycleByName(row.cycleName),
    loadOwnerByEmployeeId(row.userId),
  ]);
  return serializeAppraisal(row, kraList, auditList, cycle, owner);
}

export async function serializeAppraisalRows(
  rows: Array<typeof appraisals.$inferSelect>
) {
  if (!rows.length) return [];

  const appraisalIds = rows.map((row) => row.id);
  const cycleNames = [...new Set(rows.map((row) => row.cycleName))];
  const [kraRows, auditRows, cycleRows] = await Promise.all([
    db
      .select()
      .from(kras)
      .where(inArray(kras.appraisalId, appraisalIds))
      .orderBy(asc(kras.sortOrder), asc(kras.id)),
    db
      .select()
      .from(auditEntries)
      .where(inArray(auditEntries.appraisalId, appraisalIds))
      .orderBy(asc(auditEntries.timestamp), asc(auditEntries.id)),
    db.select().from(cycles).where(inArray(cycles.name, cycleNames)),
  ]);
  const ownerRows = await db
    .select({
      id: employees.id,
      name: employees.name,
      initials: employees.initials,
    })
    .from(employees)
    .where(inArray(employees.id, [...new Set(rows.map((row) => row.userId))]));
  const evidenceRows = kraRows.length
    ? await db
        .select()
        .from(evidence)
        .where(
          inArray(
            evidence.kraId,
            kraRows.map((kra) => kra.id)
          )
        )
    : [];

  const evidenceByKra = new Map<number, (typeof evidence.$inferSelect)[]>();
  for (const item of evidenceRows) {
    const items = evidenceByKra.get(item.kraId);
    if (items) items.push(item);
    else evidenceByKra.set(item.kraId, [item]);
  }

  const krasByAppraisal = new Map<
    number,
    Array<
      typeof kras.$inferSelect & {
        evidence: (typeof evidence.$inferSelect)[];
      }
    >
  >();
  for (const kra of kraRows) {
    const items = krasByAppraisal.get(kra.appraisalId);
    const nextKra = {
      ...kra,
      evidence: evidenceByKra.get(kra.id) ?? [],
    };
    if (items) items.push(nextKra);
    else krasByAppraisal.set(kra.appraisalId, [nextKra]);
  }

  const auditByAppraisal = new Map<
    number,
    (typeof auditEntries.$inferSelect)[]
  >();
  for (const entry of auditRows) {
    const items = auditByAppraisal.get(entry.appraisalId);
    if (items) items.push(entry);
    else auditByAppraisal.set(entry.appraisalId, [entry]);
  }

  const cycleByName = new Map(cycleRows.map((cycle) => [cycle.name, cycle]));
  const ownerById = new Map(
    ownerRows.map((owner) => [
      owner.id,
      {
        userId: owner.id,
        name: owner.name,
        initials: owner.initials,
      },
    ])
  );

  return rows.map((row) =>
    serializeAppraisal(
      row,
      krasByAppraisal.get(row.id) ?? [],
      auditByAppraisal.get(row.id) ?? [],
      cycleByName.get(row.cycleName) ?? null,
      ownerById.get(row.userId) ?? {
        userId: row.userId,
        name: `Employee #${row.userId}`,
        initials: initialsOf(`Employee ${row.userId}`),
      }
    )
  );
}

export async function replaceKras(
  appraisalId: number,
  nextKras: Array<Record<string, unknown>>
) {
  await db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(kras)
      .where(eq(kras.appraisalId, appraisalId))
      .orderBy(asc(kras.sortOrder), asc(kras.id));
    const existingById = new Map(existing.map((row) => [row.id, row]));
    const usedIds = new Set<number>();

    const has = (raw: Record<string, unknown>, key: string) =>
      Object.prototype.hasOwnProperty.call(raw, key);

    const nextNumber = (
      raw: Record<string, unknown>,
      key: string,
      fallback: number | null
    ) => {
      if (!has(raw, key)) return fallback;
      const value = raw[key];
      if (value == null) return null;
      return Number(value);
    };

    const nextString = (
      raw: Record<string, unknown>,
      key: string,
      fallback: string | null
    ) => {
      if (!has(raw, key)) return fallback;
      const value = raw[key];
      if (value == null) return null;
      return String(value);
    };

    for (const [index, raw] of nextKras.entries()) {
      const incomingId =
        typeof raw.id === 'number' && Number.isInteger(raw.id) ? raw.id : null;
      const existingRow =
        (incomingId != null ? existingById.get(incomingId) : null) ??
        existing[index] ??
        null;

      const values = {
        appraisalId,
        title: String(raw.title ?? ''),
        description: String(raw.description ?? ''),
        target: String(raw.target ?? ''),
        weight: Number(raw.weight ?? 0),
        selfScore: Number(raw.self_score ?? 0),
        selfComment: String(raw.self_comment ?? ''),
        slScore: nextNumber(raw, 'sl_score', existingRow?.slScore ?? null),
        slComment: nextString(
          raw,
          'sl_comment',
          existingRow?.slComment ?? null
        ),
        hodScore: nextNumber(raw, 'hod_score', existingRow?.hodScore ?? null),
        hodComment: nextString(
          raw,
          'hod_comment',
          existingRow?.hodComment ?? null
        ),
        hodivScore: nextNumber(
          raw,
          'hodiv_score',
          existingRow?.hodivScore ?? null
        ),
        hodivComment: nextString(
          raw,
          'hodiv_comment',
          existingRow?.hodivComment ?? null
        ),
        sortOrder: index,
      };

      const kraId = existingRow
        ? (
            await tx
              .update(kras)
              .set(values)
              .where(eq(kras.id, existingRow.id))
              .returning({ id: kras.id })
          )[0].id
        : (await tx.insert(kras).values(values).returning({ id: kras.id }))[0]
            .id;
      usedIds.add(kraId);

      await tx.delete(evidence).where(eq(evidence.kraId, kraId));
      const evidenceItems = Array.isArray(raw.evidence)
        ? (raw.evidence as Array<Record<string, unknown>>)
        : [];
      if (evidenceItems.length) {
        await tx.insert(evidence).values(
          evidenceItems.map((item) => ({
            kraId,
            kind: String(item.kind ?? 'url'),
            name: String(item.name ?? ''),
            date: String(item.date ?? ''),
            description:
              item.description == null ? null : String(item.description),
            url: item.url == null ? null : String(item.url),
          }))
        );
      }
    }

    const staleIds = existing
      .map((row) => row.id)
      .filter((id) => !usedIds.has(id));
    if (staleIds.length) {
      await tx.delete(kras).where(inArray(kras.id, staleIds));
    }
  });
}

export async function templatesWithItems() {
  const rows = await db
    .select()
    .from(kraTemplates)
    .orderBy(asc(kraTemplates.id));
  const templateIds = rows.map((row) => row.id);
  const items = rows.length
    ? await db
        .select()
        .from(kraTemplateItems)
        .where(
          inArray(
            kraTemplateItems.templateId,
            templateIds
          )
        )
        .orderBy(asc(kraTemplateItems.sortOrder))
    : [];
  const usageRows = templateIds.length
    ? await db
        .select({
          templateId: appraisals.templateId,
          cycleName: appraisals.cycleName,
        })
        .from(appraisals)
        .where(inArray(appraisals.templateId, templateIds))
    : [];
  const cycleNames = [...new Set(usageRows.map((row) => row.cycleName))];
  const cycleRows = cycleNames.length
    ? await db.select().from(cycles).where(inArray(cycles.name, cycleNames))
    : [];
  const cycleByName = new Map(cycleRows.map((row) => [row.name, row]));
  const usageByTemplate = new Map<
    number,
    { totalEmployees: number; cycleCounts: Map<string, number> }
  >();
  for (const row of usageRows) {
    if (row.templateId == null) continue;
    const current = usageByTemplate.get(row.templateId) ?? {
      totalEmployees: 0,
      cycleCounts: new Map<string, number>(),
    };
    current.totalEmployees += 1;
    current.cycleCounts.set(
      row.cycleName,
      (current.cycleCounts.get(row.cycleName) ?? 0) + 1
    );
    usageByTemplate.set(row.templateId, current);
  }

  return rows.map((row) => ({
    ...(function usageStats() {
      const usage = usageByTemplate.get(row.id);
      if (!usage) {
        return {
          usedBy: 0,
          usage: {
            usedInCycles: 0,
            totalEmployees: 0,
            lastUsedCycle: null,
            lastUsedEmployeeCount: 0,
          },
        };
      }
      let lastCycleName: string | null = null;
      let lastCycleEndAt = Number.NEGATIVE_INFINITY;
      let lastCycleId = -1;
      for (const cycleName of usage.cycleCounts.keys()) {
        const cycle = cycleByName.get(cycleName);
        const endAt = cycle?.endDate ? Date.parse(cycle.endDate) : NaN;
        const ts = Number.isNaN(endAt) ? Number.NEGATIVE_INFINITY : endAt;
        const cycleId = cycle?.id ?? -1;
        if (ts > lastCycleEndAt || (ts === lastCycleEndAt && cycleId > lastCycleId)) {
          lastCycleName = cycleName;
          lastCycleEndAt = ts;
          lastCycleId = cycleId;
        }
      }
      const lastUsedEmployeeCount = lastCycleName
        ? (usage.cycleCounts.get(lastCycleName) ?? 0)
        : 0;
      return {
        usedBy: usage.totalEmployees,
        usage: {
          usedInCycles: usage.cycleCounts.size,
          totalEmployees: usage.totalEmployees,
          lastUsedCycle: lastCycleName,
          lastUsedEmployeeCount,
        },
      };
    })(),
    id: row.id,
    name: row.name,
    divId: row.divId,
    deptId: row.deptId,
    posId: row.posId,
    version: row.version,
    status: row.status,
    updated: row.updated,
    summary: row.summary,
    items: items
      .filter((item) => item.templateId === row.id)
      .map((item) => ({
        code: item.code,
        title: item.title,
        weight: item.weight,
        kpi: item.kpi,
      })),
  }));
}

export async function recalculateCycleStats() {
  const rows = await db
    .select({
      cycleName: appraisals.cycleName,
      total: drizzleSql<number>`count(*)::int`,
      completed: drizzleSql<number>`count(*) filter (where ${appraisals.status} = 'completed')::int`,
      draft: drizzleSql<number>`count(*) filter (where ${appraisals.status} = 'draft')::int`,
      inReview: drizzleSql<number>`count(*) filter (where ${appraisals.status} not in ('draft', 'completed'))::int`,
    })
    .from(appraisals)
    .groupBy(appraisals.cycleName);

  return rows;
}

export function completedSort() {
  return desc(appraisals.acknowledgedAt);
}

export { and, asc, desc, eq, inArray };
