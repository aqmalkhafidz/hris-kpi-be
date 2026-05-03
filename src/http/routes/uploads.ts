import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { nanoid } from 'nanoid';
import { UPLOAD_MAX_BYTES } from '../../config.js';
import { sniffSignature, UPLOAD_MIME_EXT } from '../../util/upload.js';
import { authMiddleware } from '../auth.js';
import type { AppHono } from '../env.js';
import { fail } from '../error.js';

export function registerUploadRoutes(app: AppHono, uploadRoot: string) {
  // GET /uploads/* — authed download. Force attachment + nosniff to prevent
  // inline rendering (XSS via uploaded HTML/SVG).
  app.use('/uploads/*', authMiddleware);
  app.get(
    '/uploads/*',
    async (c, next) => {
      await next();
      c.res.headers.set('X-Content-Type-Options', 'nosniff');
      c.res.headers.set('Content-Disposition', 'attachment');
    },
    serveStatic({ root: './' })
  );

  // POST /uploads — authed evidence upload.
  app.use('/uploads', authMiddleware);
  app.post('/uploads', async (c) => {
    const form = await c.req.formData();
    const file = form.get('file');
    if (!(file instanceof File)) fail(400, 'file is required');
    if (!UPLOAD_MIME_EXT[file.type]) fail(400, 'Unsupported file type');
    if (file.size > UPLOAD_MAX_BYTES) fail(400, 'File exceeds size limit');
    const buf = Buffer.from(await file.arrayBuffer());
    if (file.type === 'application/pdf' || file.type.startsWith('image/')) {
      const sniffed = await sniffSignature(buf);
      if (sniffed !== file.type)
        fail(400, 'Declared content type does not match file');
    } else if (file.type === 'text/plain' || file.type === 'text/markdown') {
      // Reject obvious binary in a "text" file (control bytes outside tab/newline/escape).
      for (let i = 0; i < Math.min(buf.length, 4096); i++) {
        const b = buf[i];
        if (b === 0 || b < 9 || (b > 13 && b < 32 && b !== 27))
          fail(400, 'Text file contains binary data');
      }
    }
    await mkdir(uploadRoot, { recursive: true });
    const ext = UPLOAD_MIME_EXT[file.type];
    const filename = `${nanoid()}${ext}`;
    await writeFile(path.join(uploadRoot, filename), buf);
    const safeName = (file.name || `file${ext}`)
      .replace(/[^A-Za-z0-9._-]+/g, '_')
      .slice(0, 120);
    return c.json({
      kind: 'file',
      name: safeName,
      date: new Date().toISOString().slice(0, 10),
      url: `/uploads/${filename}`,
    });
  });
}
