import { systemAuditEntries } from '../db/schema.js';
import type { AuthUser } from './auth.js';

type AuditDb = {
  insert: (table: typeof systemAuditEntries) => {
    values: (value: typeof systemAuditEntries.$inferInsert) => unknown;
  };
};

export function auditLabel(row: unknown): string | null {
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const value =
    record.name ??
    record.title ??
    record.code ??
    record.email ??
    (typeof record.id === 'number' ? `#${record.id}` : null);
  return typeof value === 'string' ? value : null;
}

export async function writeSystemAudit(
  tx: AuditDb,
  input: {
    actor: AuthUser;
    action: string;
    entityType: string;
    entityId?: number | null;
    entityLabel?: string | null;
    metadata?: Record<string, unknown> | null;
  }
) {
  await tx.insert(systemAuditEntries).values({
    timestamp: new Date().toISOString(),
    actorUserId: input.actor.id,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    entityLabel: input.entityLabel ?? null,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}
