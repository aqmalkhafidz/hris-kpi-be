import type {
  AppraisalRow,
  AuditEntryRow,
  CycleRow,
  EvidenceRow,
  KraRow,
} from './db/schema.js';

export function serializeAppraisal(
  row: AppraisalRow,
  kras: Array<KraRow & { evidence: EvidenceRow[] }>,
  auditLog: AuditEntryRow[],
  cycle: CycleRow | null = null
) {
  return {
    id: row.id,
    userId: row.userId,
    cycleName: row.cycleName,
    cycleShort: row.cycleShort,
    cycleStartDate: cycle?.startDate ?? null,
    cycleEndDate: cycle?.endDate ?? null,
    cycleSelfDeadline: cycle?.selfDeadline ?? null,
    status: row.status,
    reflection: row.reflection,
    reviewers: {
      sl: {
        userId: row.reviewerSlUserId,
        name: row.reviewerSlName,
        initials: row.reviewerSlInitials,
      },
      hod: {
        userId: row.reviewerHodUserId,
        name: row.reviewerHodName,
        initials: row.reviewerHodInitials,
      },
      hodiv: {
        userId: row.reviewerHodivUserId,
        name: row.reviewerHodivName,
        initials: row.reviewerHodivInitials,
      },
    },
    kras: kras.map((kra) => ({
      id: kra.id,
      title: kra.title,
      description: kra.description,
      target: kra.target,
      weight: kra.weight,
      self_score: kra.selfScore,
      self_comment: kra.selfComment,
      evidence: kra.evidence.map((item) => ({
        kind: item.kind,
        name: item.name,
        date: item.date,
        description: item.description ?? undefined,
        url: item.url ?? undefined,
      })),
      sl_score: kra.slScore ?? undefined,
      sl_comment: kra.slComment ?? undefined,
      hod_score: kra.hodScore ?? undefined,
      hod_comment: kra.hodComment ?? undefined,
      hodiv_score: kra.hodivScore ?? undefined,
      hodiv_comment: kra.hodivComment ?? undefined,
    })),
    audit_log: auditLog.map((entry) => ({
      timestamp: entry.timestamp,
      actor_user_id: entry.actorUserId,
      actor_name: entry.actorName,
      actor_role: entry.actorRole,
      action: entry.action,
      from_status: entry.fromStatus ?? undefined,
      to_status: entry.toStatus ?? undefined,
      reason: entry.reason ?? undefined,
      kra_id: entry.kraId ?? undefined,
    })),
    submittedAt: row.submittedAt ?? undefined,
    acknowledged_at: row.acknowledgedAt ?? undefined,
    calibrated_score:
      row.calibratedScore == null ? null : Number(row.calibratedScore),
    final_grade: row.finalGrade ?? null,
    calibrated_at: row.calibratedAt ?? null,
  };
}

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
