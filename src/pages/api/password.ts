import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { hashPassword, randomSalt, safeEqual } from '../../lib/auth';
import { clearFailures, lockedSeconds, recordFailure, tooMany, type Key } from '../../lib/throttle';

export const PUT: APIRoute = async ({ locals, request, cookies }) => {
  const { currentPassword, newPassword } = await request.json().catch(() => ({}));
  if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return Response.json({ error: 'Data tidak lengkap.' }, { status: 400 });
  }
  if (newPassword.length < 8 || newPassword.length > 128) {
    return Response.json({ error: 'Password baru 8-128 karakter.' }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return Response.json({ error: 'Password baru harus berbeda dari yang lama.' }, { status: 400 });
  }
  if (currentPassword.length > 128) {
    return Response.json({ error: 'Password saat ini salah.' }, { status: 403 });
  }

  // Batasi tebakan password lama: 5 salah gratis, setelah itu penguncian bertahap
  const keys: Key[] = [{ id: `pwchange:user:${locals.userId}`, free: 5 }];
  const wait = await lockedSeconds(keys);
  if (wait) return tooMany(wait);

  const db = env.DB;
  const user = await db
    .prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(locals.userId)
    .first<{ password_hash: string; password_salt: string }>();
  if (!user) return new Response('Not found', { status: 404 });

  const ok = safeEqual(await hashPassword(currentPassword, user.password_salt), user.password_hash);
  if (!ok) {
    await recordFailure(keys);
    return Response.json({ error: 'Password saat ini salah.' }, { status: 403 });
  }

  const salt = randomSalt();
  const hash = await hashPassword(newPassword, salt);
  const currentSid = cookies.get('sid')?.value ?? '';

  // Satu transaksi: ganti hash dan keluarkan semua sesi lain
  await db.batch([
    db.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(hash, salt, locals.userId),
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').bind(locals.userId, currentSid),
  ]);

  await clearFailures(keys);
  return Response.json({ ok: true });
};
