import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createSession, hashPassword, randomSalt, safeEqual } from '../../../lib/auth';
import { lockedSeconds, recordFailure, registerKeys, tooMany } from '../../../lib/throttle';

export const POST: APIRoute = async ({ request, cookies }) => {
  const { username, password, invite } = await request.json().catch(() => ({}));

  // 1. Kode organisasi dicek paling awal
  const keys = registerKeys(request);
  const wait = await lockedSeconds(keys);
  if (wait) return tooMany(wait);

  const secret = env.INVITE_CODE;
  // Gagal tertutup: kalau secret belum diset, semua pendaftaran ditolak
  if (!secret || typeof invite !== 'string' || !safeEqual(invite.trim(), secret)) {
    await recordFailure(keys);
    return Response.json({ error: 'Kode organisasi tidak valid.' }, { status: 403 });
  }

  // 2. Validasi input seperti sebelumnya
  if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,32}$/.test(username)) {
    return Response.json({ error: 'Username 3-32 karakter (huruf, angka, underscore).' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return Response.json({ error: 'Password minimal 8 karakter.' }, { status: 400 });
  }

  const db = env.DB;
  const exists = await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
  if (exists) return Response.json({ error: 'Username sudah dipakai.' }, { status: 409 });

  const id = crypto.randomUUID();
  const passwordSalt = randomSalt();
  const hash = await hashPassword(password, passwordSalt);
  await db
    .prepare('INSERT INTO users (id, username, password_hash, password_salt, kdf_salt) VALUES (?, ?, ?, ?, ?)')
    .bind(id, username, hash, passwordSalt, randomSalt())
    .run();

  await createSession(db, id, cookies);
  return Response.json({ ok: true }, { status: 201 });
};
