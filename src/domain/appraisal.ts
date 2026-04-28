import type { AppraisalStatus, UserRole } from '../types.js';

const forwardOrder: AppraisalStatus[] = [
  'draft',
  'sl_review',
  'hod_review',
  'hodiv_review',
  'acknowledge',
  'completed',
];

export function advanceStatusFor(
  status: AppraisalStatus,
  actorRole: UserRole
): AppraisalStatus {
  if (actorRole === 'sl' && status === 'draft') return 'hod_review';
  const index = forwardOrder.indexOf(status);
  return forwardOrder[Math.min(index + 1, forwardOrder.length - 1)];
}

export function returnTargetFor(actorRole: UserRole): AppraisalStatus | null {
  if (actorRole === 'sl') return 'draft';
  if (actorRole === 'hodept') return 'sl_review';
  if (actorRole === 'hodiv') return 'hod_review';
  return null;
}

export function requiredRoleForApproval(
  status: AppraisalStatus
): UserRole | null {
  if (status === 'draft') return null;
  if (status === 'sl_review') return 'sl';
  if (status === 'hod_review') return 'hodept';
  if (status === 'hodiv_review') return 'hodiv';
  return null;
}

export function reviewerKeyToUserRole(key: string): UserRole | null {
  if (key === 'sl') return 'sl';
  if (key === 'hod') return 'hodept';
  if (key === 'hodiv') return 'hodiv';
  return null;
}

export function isAppraisalStatus(value: string): value is AppraisalStatus {
  return forwardOrder.includes(value as AppraisalStatus);
}
