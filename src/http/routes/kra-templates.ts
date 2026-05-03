import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../../db/client.js';
import { kraTemplateItems, kraTemplates } from '../../db/schema.js';
import { templatesWithItems } from '../../repositories.js';
import { todayLabel } from '../../util/dates.js';
import { numberParam } from '../../util/params.js';
import { authMiddleware, requireRole } from '../auth.js';
import type { AppHono } from '../env.js';

const kraTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  divId: z.number().int().nonnegative(),
  deptId: z.number().int().nonnegative(),
  posId: z.number().int().nonnegative(),
  version: z.string().max(40).default('v1'),
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
  updated: z.string().max(40).optional(),
  usedBy: z.number().int().nonnegative().default(0),
  summary: z.string().max(2000).default(''),
});

const kraItemSchema = z.array(
  z.object({
    code: z.string(),
    title: z.string(),
    weight: z.number(),
    kpi: z.string(),
  })
);

export function registerKraTemplateRoutes(app: AppHono) {
  app.use('/kra-templates*', authMiddleware);

  app.get('/kra-templates', async (c) => c.json(await templatesWithItems()));

  app.post('/kra-templates', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    const body = kraTemplateSchema.parse(await c.req.json());
    const [created] = await db
      .insert(kraTemplates)
      .values({
        name: body.name,
        divId: body.divId,
        deptId: body.deptId,
        posId: body.posId,
        version: body.version,
        status: body.status,
        updated: body.updated ?? todayLabel(),
        usedBy: body.usedBy,
        summary: body.summary,
      })
      .returning();
    return c.json(
      (await templatesWithItems()).find((t) => t.id === created.id),
      201
    );
  });

  app.put('/kra-templates/:id', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    const id = numberParam(c.req.param('id'));
    const body = kraTemplateSchema.parse(await c.req.json());
    await db
      .update(kraTemplates)
      .set({
        name: body.name,
        divId: body.divId,
        deptId: body.deptId,
        posId: body.posId,
        version: body.version,
        status: body.status,
        updated: body.updated ?? todayLabel(),
        usedBy: body.usedBy,
        summary: body.summary,
      })
      .where(eq(kraTemplates.id, id));
    return c.json((await templatesWithItems()).find((t) => t.id === id));
  });

  app.delete('/kra-templates/:id', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    await db
      .delete(kraTemplates)
      .where(eq(kraTemplates.id, numberParam(c.req.param('id'))));
    return c.json({ ok: true });
  });

  app.put('/kra-templates/:id/items', async (c) => {
    requireRole(c.get('authUser'), 'hr');
    const templateId = numberParam(c.req.param('id'));
    const items = kraItemSchema.parse(await c.req.json());
    await db
      .delete(kraTemplateItems)
      .where(eq(kraTemplateItems.templateId, templateId));
    if (items.length) {
      await db.insert(kraTemplateItems).values(
        items.map((item, index) => ({
          templateId,
          ...item,
          sortOrder: index,
        }))
      );
    }
    return c.json(
      (await templatesWithItems()).find((t) => t.id === templateId)
    );
  });
}
