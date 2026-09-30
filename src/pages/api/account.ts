import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashPassword, safeEqual } from '../../lib/auth';

export const DELETE: APIRoute = async ({ locals, request, cookies }) => {
  const { password } = await request.json().catch(() => ({}));
  if (typeof password !== 'string' || !password) {
    return Response.json({ error: 'Password wajib diisi.' }, { status: 400 });
  }

  const db = env.DB;
  const user = await db
    .prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(locals.userId)
    .first<{ password_hash: string; password_salt: string }>();
  if (!user) return new Response('Not found', { status: 404 });

  const hash = await hashPassword(password, user.password_salt);
  // Pakai 403, bukan 401: helper api() di useVault.ts mengalihkan ke /login untuk 401
  if (!safeEqual(hash, user.password_hash)) {
    return Response.json({ error: 'Password salah.' }, { status: 403 });
  }

  // batch() = satu transaksi; dihapus eksplisit agar tidak bergantung pada ON DELETE CASCADE
  await db.batch([
    db.prepare('DELETE FROM vault_items WHERE user_id = ?').bind(locals.userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(locals.userId),
    db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?').bind(locals.userId, locals.userId),
    db.prepare('DELETE FROM users WHERE id = ?').bind(locals.userId),
  ]);

  cookies.delete('sid', { path: '/' });
  return Response.json({ ok: true });
};
