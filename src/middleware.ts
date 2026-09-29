import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';

// Hanya path ini yang boleh diakses tanpa login. Selain ini WAJIB login.
const PUBLIC_EXACT = new Set(['/', '/login', '/register', '/favicon.svg', '/favicon.ico']);
const PUBLIC_PREFIX = ['/api/auth/', '/_astro/', '/fonts/'];

function applySecurityHeaders(res: Response) {
  try {
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY'); // cegah halaman dipasang di iframe (clickjacking)
    res.headers.set('Referrer-Policy', 'no-referrer');
    res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    if (!import.meta.env.DEV) res.headers.set('Strict-Transport-Security', 'max-age=31536000');
  } catch {
    // Header respons tertentu bisa read-only; lewati saja
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const sid = ctx.cookies.get('sid')?.value;
  if (sid) {
    const row = await env.DB
      .prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?')
      .bind(sid, Date.now())
      .first<{ user_id: string }>();
    if (row) ctx.locals.userId = row.user_id;
  }

  const raw = ctx.url.pathname;
  const path = raw.replace(/\/+$/, '') || '/';
  const isPublic = PUBLIC_EXACT.has(path) || PUBLIC_PREFIX.some((p) => raw.startsWith(p));

  let res: Response;
  if (!ctx.locals.userId && !isPublic) {
    res = raw.startsWith('/api/')
      ? new Response('Unauthorized', { status: 401 })
      : ctx.redirect('/login');
  } else {
    res = await next();
  }

  applySecurityHeaders(res);
  return res;
});
