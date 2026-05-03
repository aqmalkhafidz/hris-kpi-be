import { and, asc, desc, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  appraisals,
  auditEntries,
  cycles,
  evidence,
  kras,
  kraTemplateItems,
  kraTemplates,
} from './db/schema.js';
import { fail } from './http/error.js';
import { serializeAppraisal } from './serializers.js';

async function loadCycleByName(name: string) {
  const [row] = await db.select().from(cycles).where(eq(cycles.name, name));
  return row ?? null;
}

export async function loadAppraisal(id: number) {
  const [row] = await db.select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) return null;
  const [kraList, auditList, cycle] = await Promise.all([
    loadKras(row.id),
    loadAudit(row.id),
    loadCycleByName(row.cycleName),
  ]);
  return serializeAppraisal(row, kraList, auditList, cycle);
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
  const [kraList, auditList, cycle] = await Promise.all([
    loadKras(row.id),
    loadAudit(row.id),
    loadCycleByName(row.cycleName),
  ]);
  return serializeAppraisal(row, kraList, auditList, cycle);
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

  return rows.map((row) =>
    serializeAppraisal(
      row,
      krasByAppraisal.get(row.id) ?? [],
      auditByAppraisal.get(row.id) ?? [],
      cycleByName.get(row.cycleName) ?? null
    )
  );
}

export async function replaceKras(
  appraisalId: number,
  nextKras: Array<Record<string, unknown>>
) {
  // All-or-nothing: a partial replace would leave the appraisal with KRAs
  // missing or evidence orphaned.
  await db.transaction(async (tx) => {
    await tx.delete(kras).where(eq(kras.appraisalId, appraisalId));
    for (const [index, raw] of nextKras.entries()) {
      const inserted = await tx
        .insert(kras)
        .values({
          appraisalId,
          title: String(raw.title ?? ''),
          description: String(raw.description ?? ''),
          target: String(raw.target ?? ''),
          weight: Number(raw.weight ?? 0),
          selfScore: Number(raw.self_score ?? 0),
          selfComment: String(raw.self_comment ?? ''),
          slScore: raw.sl_score == null ? null : Number(raw.sl_score),
          slComment: raw.sl_comment == null ? null : String(raw.sl_comment),
          hodScore: raw.hod_score == null ? null : Number(raw.hod_score),
          hodComment: raw.hod_comment == null ? null : String(raw.hod_comment),
          hodivScore: raw.hodiv_score == null ? null : Number(raw.hodiv_score),
          hodivComment:
            raw.hodiv_comment == null ? null : String(raw.hodiv_comment),
          sortOrder: index,
        })
        .returning();
      const kraId = inserted[0].id;
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
  });
}

export async function templatesWithItems() {
  const rows = await db
    .select()
    .from(kraTemplates)
    .orderBy(asc(kraTemplates.id));
  const items = rows.length
    ? await db
        .select()
        .from(kraTemplateItems)
        .where(
          inArray(
            kraTemplateItems.templateId,
            rows.map((row) => row.id)
          )
        )
        .orderBy(asc(kraTemplateItems.sortOrder))
    : [];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    divId: row.divId,
    deptId: row.deptId,
    posId: row.posId,
    version: row.version,
    status: row.status,
    updated: row.updated,
    usedBy: row.usedBy,
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
