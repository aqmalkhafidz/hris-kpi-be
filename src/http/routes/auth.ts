import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { AVATAR_MAX_BYTES, BCRYPT_ROUNDS, IS_PROD } from '../../config.js';
import { db } from '../../db/client.js';
import {
  departments,
  divisions,
  employees,
  positions,
  squads,
  users,
} from '../../db/schema.js';
import { initialsOf } from '../../serializers.js';
import {
  checkLoginRate,
  clearLoginFailures,
  loginRateKey,
  recordLoginFailure,
} from '../../util/login-rate.js';
import { validatePassword } from '../../util/password.js';
import { AVATAR_MIME_EXT, sniffSignature } from '../../util/upload.js';
import {
  authMiddleware,
  clearAuthCookies,
  issueCsrfToken,
  setAuthCookie,
  signToken,
  toAuthUser,
} from '../auth.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export function registerAuthRoutes(app: AppHono, uploadRoot: string) {
  app.get('/auth/csrf', (c) => c.json({ csrfToken: issueCsrfToken(c) }));

  app.get('/auth/demo-users', async (c) => {
    // Demo-only login picker. Disabled in production to avoid leaking the
    // employee roster (emails + roles) to unauthenticated callers.
    if (IS_PROD) fail(404, 'Not found');
    const rows = await db.select().from(users);
    const empRows = await db.select().from(employees);
    return c.json(
      rows.map((u) => {
        const emp = empRows.find((e) => e.email === u.email);
        return toAuthUser(u, emp?.orgRole ?? 'staff');
      })
    );
  });

  app.post('/auth/login', async (c) => {
    const body = loginSchema.parse(await c.req.json());
    const rateKey = loginRateKey(c, body.email);
    checkLoginRate(rateKey);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, body.email));
    if (!user) {
      recordLoginFailure(rateKey);
      fail(401, 'Invalid email or password');
    }
    const ok = await bcrypt.compare(body.password, user.passwordHash);
    if (!ok) {
      recordLoginFailure(rateKey);
      fail(401, 'Invalid email or password');
    }
    clearLoginFailures(rateKey);
    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.email, body.email));
    const authUser = toAuthUser(user, emp?.orgRole ?? 'staff');
    setAuthCookie(c, await signToken(authUser, user.tokenVersion));
    return c.json({
      user: authUser,
    });
  });

  app.post('/auth/avatar', authMiddleware, async (c) => {
    const auth = c.get('authUser');
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) fail(400, 'file is required');
    if (file.size > AVATAR_MAX_BYTES) fail(400, 'Avatar exceeds size limit');
    const buf = Buffer.from(await file.arrayBuffer());
    const sniffed = await sniffSignature(buf);
    if (!sniffed || !AVATAR_MIME_EXT[sniffed])
      fail(400, 'Avatar must be PNG, JPG, or GIF');
    if (file.type !== sniffed)
      fail(400, 'Declared content type does not match file');
    await mkdir(uploadRoot, { recursive: true });
    const ext = AVATAR_MIME_EXT[sniffed];
    const filename = `avatar-${auth.id}-${nanoid(6)}${ext}`;
    await writeFile(path.join(uploadRoot, filename), buf);
    const avatarUrl = `/uploads/${filename}`;
    await db
      .update(users)
      .set({ avatarUrl, updatedAt: new Date() })
      .where(eq(users.id, auth.id));
    return c.json({ avatarUrl });
  });

  app.patch('/auth/me/contact', authMiddleware, async (c) => {
    const auth = c.get('authUser');
    const body = z
      .object({
        phone: z.string().max(40).nullable().optional(),
        emergencyName: z.string().max(120).nullable().optional(),
        emergencyPhone: z.string().max(40).nullable().optional(),
      })
      .parse(await c.req.json());
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if ('phone' in body) updates.phone = body.phone ?? null;
    if ('emergencyName' in body)
      updates.emergencyName = body.emergencyName ?? null;
    if ('emergencyPhone' in body)
      updates.emergencyPhone = body.emergencyPhone ?? null;
    await db.update(users).set(updates).where(eq(users.id, auth.id));
    const [row] = await db.select().from(users).where(eq(users.id, auth.id));
    return c.json({
      phone: row?.phone ?? null,
      emergencyName: row?.emergencyName ?? null,
      emergencyPhone: row?.emergencyPhone ?? null,
    });
  });

  app.post('/auth/change-password', authMiddleware, async (c) => {
    const authUser = c.get('authUser');
    const body = changePasswordSchema.parse(await c.req.json());
    const current = body.currentPassword;
    const next = body.newPassword;
    validatePassword(next);
    if (next === current) fail(400, 'New password must differ from current');
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, authUser.id));
    if (!user) fail(404, 'User not found');
    const ok = await bcrypt.compare(current, user.passwordHash);
    if (!ok) fail(401, 'Current password is incorrect');
    const newHash = await bcrypt.hash(next, BCRYPT_ROUNDS);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        tokenVersion: user.tokenVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(users.id, authUser.id));
    return c.json({ ok: true });
  });

  app.post('/auth/logout', (c) => {
    clearAuthCookies(c);
    return c.json({ ok: true });
  });

  app.get('/auth/me', authMiddleware, async (c) => {
    const auth = c.get('authUser');
    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, auth.id));
    const [emp] = await db
      .select()
      .from(employees)
      .where(eq(employees.email, auth.email));
    let dept: string | null = null;
    let div: string | null = null;
    let squad: string | null = null;
    let position: string | null = null;
    if (emp) {
      const [deptRow] = emp.deptId
        ? await db
            .select()
            .from(departments)
            .where(eq(departments.id, emp.deptId))
        : [];
      const [divRow] = emp.divId
        ? await db.select().from(divisions).where(eq(divisions.id, emp.divId))
        : [];
      const [squadRow] = emp.squadId
        ? await db.select().from(squads).where(eq(squads.id, emp.squadId))
        : [];
      const [posRow] = emp.posId
        ? await db.select().from(positions).where(eq(positions.id, emp.posId))
        : [];
      dept = deptRow?.name ?? null;
      div = divRow?.name ?? null;
      squad = squadRow?.name ?? null;
      position = posRow?.title ?? null;
    }
    return c.json({
      user: {
        ...auth,
        initials: emp?.initials ?? initialsOf(auth.name),
        nip: emp?.nip ?? null,
        position,
        dept,
        div,
        squad,
        avatarUrl: userRow?.avatarUrl ?? null,
        phone: userRow?.phone ?? null,
        emergencyName: userRow?.emergencyName ?? null,
        emergencyPhone: userRow?.emergencyPhone ?? null,
      },
    });
  });
}
