import { and, asc, desc, eq, inArray, sql as drizzleSql } from 'drizzle-orm';
import { db } from './db/client.js';
import {
  appraisals,
  auditEntries,
  evidence,
  kras,
  kraTemplateItems,
  kraTemplates,
} from './db/schema.js';
import { fail } from './http/error.js';
import { serializeAppraisal } from './serializers.js';

export async function loadAppraisal(id: number) {
  const [row] = await db.select().from(appraisals).where(eq(appraisals.id, id));
  if (!row) return null;
  return serializeAppraisal(
    row,
    await loadKras(row.id),
    await loadAudit(row.id)
  );
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
  return serializeAppraisal(
    row,
    await loadKras(row.id),
    await loadAudit(row.id)
  );
}

export async function replaceKras(
  appraisalId: number,
  nextKras: Array<Record<string, unknown>>
) {
  await db.delete(kras).where(eq(kras.appraisalId, appraisalId));
  for (const [index, raw] of nextKras.entries()) {
    const inserted = await db
      .insert(kras)
      .values({
        id: typeof raw.id === 'number' ? raw.id : undefined,
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
      await db.insert(evidence).values(
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
    code: row.code,
    name: row.name,
    dept: row.dept,
    level: row.level,
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
