import {
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  role: text('role').notNull(),
  dept: text('dept').notNull(),
  div: text('div'),
  squad: text('squad'),
  position: text('position').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const divisions = pgTable('divisions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().default(''),
  name: text('name').notNull(),
  head: text('head').notNull(),
  headId: integer('head_id').notNull(),
  headcount: integer('headcount').notNull().default(0),
  departments: jsonb('departments').$type<string[]>().notNull().default([]),
});

export const departments = pgTable('departments', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  division: text('division').notNull(),
  divId: integer('div_id').notNull(),
  headId: integer('head_id').notNull(),
  hod: text('hod').notNull(),
  positions: integer('positions').notNull().default(0),
  headcount: integer('headcount').notNull().default(0),
});

export const positions = pgTable('positions', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  title: text('title').notNull(),
  level: text('level').notNull(),
  dept: text('dept').notNull(),
  template: text('template').notNull(),
  headcount: integer('headcount').notNull().default(0),
});

export const employees = pgTable('employees', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  email: text('email').notNull().unique(),
  nip: text('nip').notNull(),
  position: text('position').notNull(),
  dept: text('dept').notNull(),
  div: text('div').notNull(),
  division: text('division').notNull(),
  manager: text('manager').notNull(),
  squad: text('squad'),
  grade: text('grade').notNull(),
  status: text('status').notNull(),
  joined: text('joined').notNull(),
  orgRole: text('org_role').notNull().default('staff'),
  reviewerSl: text('reviewer_sl'),
  reviewerHod: text('reviewer_hod'),
  reviewerHodiv: text('reviewer_hodiv'),
});

export const cycles = pgTable('cycles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  selfDeadline: text('self_deadline'),
  status: text('status').notNull(),
  description: text('description').notNull(),
  distributedAt: text('distributed_at'),
  totalAppraisals: integer('total_appraisals').notNull().default(0),
  completed: integer('completed').notNull().default(0),
  inReview: integer('in_review').notNull().default(0),
  draft: integer('draft').notNull().default(0),
});

export const kraTemplates = pgTable('kra_templates', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  dept: text('dept').notNull(),
  level: text('level').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull(),
  updated: text('updated').notNull(),
  usedBy: integer('used_by').notNull().default(0),
  summary: text('summary').notNull(),
});

export const kraTemplateItems = pgTable('kra_template_items', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id')
    .notNull()
    .references(() => kraTemplates.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  title: text('title').notNull(),
  weight: integer('weight').notNull(),
  kpi: text('kpi').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const appraisals = pgTable('appraisals', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull(),
  cycleName: text('cycle_name').notNull(),
  cycleShort: text('cycle_short').notNull(),
  status: text('status').notNull(),
  reflection: text('reflection').notNull(),
  reviewerSlUserId: integer('reviewer_sl_user_id').notNull(),
  reviewerSlName: text('reviewer_sl_name').notNull(),
  reviewerSlInitials: text('reviewer_sl_initials').notNull(),
  reviewerHodUserId: integer('reviewer_hod_user_id').notNull(),
  reviewerHodName: text('reviewer_hod_name').notNull(),
  reviewerHodInitials: text('reviewer_hod_initials').notNull(),
  reviewerHodivUserId: integer('reviewer_hodiv_user_id').notNull(),
  reviewerHodivName: text('reviewer_hodiv_name').notNull(),
  reviewerHodivInitials: text('reviewer_hodiv_initials').notNull(),
  submittedAt: text('submitted_at'),
  acknowledgedAt: text('acknowledged_at'),
  calibratedScore: numeric('calibrated_score', { precision: 4, scale: 2 }),
  finalGrade: text('final_grade'),
  calibratedAt: text('calibrated_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const kras = pgTable('kras', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id')
    .notNull()
    .references(() => appraisals.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull(),
  target: text('target').notNull(),
  weight: integer('weight').notNull(),
  selfScore: integer('self_score').notNull(),
  selfComment: text('self_comment').notNull(),
  slScore: integer('sl_score'),
  slComment: text('sl_comment'),
  hodScore: integer('hod_score'),
  hodComment: text('hod_comment'),
  hodivScore: integer('hodiv_score'),
  hodivComment: text('hodiv_comment'),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const evidence = pgTable('evidence', {
  id: serial('id').primaryKey(),
  kraId: integer('kra_id')
    .notNull()
    .references(() => kras.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  name: text('name').notNull(),
  date: text('date').notNull(),
  description: text('description'),
  url: text('url'),
});

export const auditEntries = pgTable('audit_entries', {
  id: serial('id').primaryKey(),
  appraisalId: integer('appraisal_id')
    .notNull()
    .references(() => appraisals.id, { onDelete: 'cascade' }),
  timestamp: text('timestamp').notNull(),
  actorUserId: integer('actor_user_id').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  action: text('action').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status'),
  reason: text('reason'),
  kraId: integer('kra_id'),
});

export const jobTitles = pgTable('job_titles', {
  id: serial('id').primaryKey(),
  code: text('code').notNull(),
  name: text('name').notNull(),
  level: text('level').notNull(),
  department: text('department').notNull(),
  description: text('description').notNull().default(''),
  headcount: integer('headcount').notNull().default(0),
});

export const squads = pgTable('squads', {
  id: serial('id').primaryKey(),
  code: text('code').notNull().default(''),
  name: text('name').notNull(),
  division: text('division').notNull().default(''),
  divId: integer('div_id').notNull().default(0),
  department: text('department').notNull().default(''),
  deptId: integer('dept_id').notNull().default(0),
  description: text('description').notNull().default(''),
});

export type User = typeof users.$inferSelect;
export type AppraisalRow = typeof appraisals.$inferSelect;
export type KraRow = typeof kras.$inferSelect;
export type EvidenceRow = typeof evidence.$inferSelect;
export type AuditEntryRow = typeof auditEntries.$inferSelect;
