export type UserRole = 'staff' | 'sl' | 'hodept' | 'hodiv' | 'hr';
export type ReviewerKey = 'sl' | 'hod' | 'hodiv';
export type AppraisalStatus =
  | 'draft'
  | 'sl_review'
  | 'hod_review'
  | 'hodiv_review'
  | 'acknowledge'
  | 'completed';
export type AuditAction = 'submit' | 'approve' | 'return' | 'acknowledge';

export interface ActorInfo {
  userId: number;
  name: string;
  role: UserRole;
}
