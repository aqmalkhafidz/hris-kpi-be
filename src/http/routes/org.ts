import { isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import {
  departments,
  divisions,
  employees,
  jobTitles,
  positions,
  squads,
} from '../../db/schema.js';
import { initialsOf } from '../../serializers.js';
import { authMiddleware } from '../auth.js';
import { crud, nullableId } from '../crud.js';
import type { AppHono } from '../env.js';

const divisionSchema = z.object({
  code: z.string().max(40).default(''),
  name: z.string().min(1).max(120),
});

const departmentSchema = z.object({
  name: z.string().min(1).max(120),
  divId: z.number().int().nonnegative(),
});

const positionSchema = z.object({
  code: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  divId: z.number().int().nonnegative(),
  deptId: z.number().int().nonnegative(),
});

const employeeSchema = z
  .object({
    name: z.string().min(1).max(120),
    initials: z.string().max(8).optional(),
    email: z.string().email().max(160),
    nip: z.string().max(40).default(''),
    posId: nullableId,
    deptId: z.number().int().nonnegative(),
    divId: z.number().int().nonnegative(),
    squadId: nullableId,
    jobTitleId: nullableId,
    status: z
      .enum(['active', 'inactive', 'probation', 'onboarding'])
      .default('active'),
    joined: z.string().max(40).default(''),
    orgRole: z.enum(['staff', 'sl', 'hodept', 'hodiv', 'hr']).default('staff'),
    reviewerSlId: nullableId,
    reviewerHodId: nullableId,
    reviewerHodivId: nullableId,
  })
  .transform((input) => ({
    ...input,
    initials: input.initials || initialsOf(input.name),
  }));

const jobTitleSchema = z.object({
  code: z.string().max(40).default(''),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).default(''),
});

const squadSchema = z.object({
  code: z.string().max(40).default(''),
  name: z.string().min(1).max(120),
  divId: z.number().int().nonnegative(),
  deptId: z.number().int().nonnegative(),
  description: z.string().max(2000).default(''),
});

export function registerOrgRoutes(app: AppHono) {
  app.use('/org/*', authMiddleware);

  // Custom GET /org/employees with role-based field redaction. Must be
  // registered BEFORE the crud() call to take precedence on the same path.
  app.get('/org/employees', authMiddleware, async (c) => {
    const actor = c.get('authUser');
    const rows = await db
      .select()
      .from(employees)
      .where(isNull(employees.deletedAt));
    const posRows = await db.select().from(positions);
    if (actor.role === 'hr') {
      return c.json(
        rows.map((e) => ({
          ...e,
          position: posRows.find((p) => p.id === e.posId)?.title ?? '',
        }))
      );
    }
    return c.json(
      rows.map((e) => ({
        id: e.id,
        name: e.name,
        initials: e.initials,
        deptId: e.deptId,
        divId: e.divId,
        squadId: e.squadId,
        jobTitleId: e.jobTitleId,
        posId: e.posId,
        orgRole: e.orgRole,
        status: e.status,
        position: posRows.find((p) => p.id === e.posId)?.title ?? '',
      }))
    );
  });

  crud(app, '/org/divisions', divisions, divisionSchema, { softDelete: true });
  crud(app, '/org/departments', departments, departmentSchema, {
    softDelete: true,
  });
  crud(app, '/org/positions', positions, positionSchema, { softDelete: true });
  crud(app, '/org/employees', employees, employeeSchema, { softDelete: true });
  crud(app, '/org/job-titles', jobTitles, jobTitleSchema, { softDelete: true });
  crud(app, '/org/squads', squads, squadSchema, { softDelete: true });
}
