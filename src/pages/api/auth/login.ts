import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createSession, hashPassword, safeEqual } from '../../../lib/auth';
import { clearFailures, loginKeys, lockedSeconds, recordFailure, tooMany } from '../../../lib/throttle';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { username, password } = await request.json().catch(() => ({}));
  const fail = () => Response.json({ error: 'Username atau password salah.' }, { status: 401 });
  if (typeof username !== 'string' || typeof password !== 'string') return fail();

  // Cek penguncian SEBELUM hashing password
  const keys = loginKeys(request, username);
  const wait = await lockedSeconds(keys);
  if (wait) return tooMany(wait);

  const db = env.DB;
  const user = await db
    .prepare('SELECT id, password_hash, password_salt FROM users WHERE username = ?')
    .bind(username)
    .first<{ id: string; password_hash: string; password_salt: string }>();

  if (!user) {
    await recordFailure(keys);
    return fail();
  }

  const hash = await hashPassword(password, user.password_salt);
  if (!safeEqual(hash, user.password_hash)) {
    await recordFailure(keys);
    return fail();
  }

  // Sukses: reset hanya penghitung username, penghitung IP dibiarkan meluruh sendiri
  await clearFailures(keys.filter((k) => k.id.startsWith('login:user:')));
  await createSession(db, user.id, cookies);
  return Response.json({ ok: true });
};
