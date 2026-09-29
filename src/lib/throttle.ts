import { env } from 'cloudflare:workers';

export type Key = { id: string; free: number };

const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const WINDOW_MS = 60 * 60_000;

const ipOf = (request: Request) => request.headers.get('CF-Connecting-IP') ?? 'local';

export const loginKeys = (request: Request, username: string): Key[] => [
  { id: `login:ip:${ipOf(request)}`, free: 20 },
  { id: `login:user:${username.toLowerCase().slice(0, 64)}`, free: 5 },
];

export const registerKeys = (request: Request): Key[] => [
  { id: `register:ip:${ipOf(request)}`, free: 5 },
];

// Mengembalikan sisa detik penguncian (0 = tidak terkunci)
export async function lockedSeconds(keys: Key[]) {
  const marks = keys.map(() => '?').join(',');
  const { results } = await env.DB
    .prepare(`SELECT locked_until FROM auth_attempts WHERE key IN (${marks})`)
    .bind(...keys.map((k) => k.id))
    .all<{ locked_until: number }>();
  const until = Math.max(0, ...results.map((r) => r.locked_until));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export async function recordFailure(keys: Key[]) {
  const db = env.DB;
  const now = Date.now();
  for (const k of keys) {
    const row = await db
      .prepare('SELECT fails, last_fail FROM auth_attempts WHERE key = ?')
      .bind(k.id)
      .first<{ fails: number; last_fail: number }>();
    const fails = row && now - row.last_fail < WINDOW_MS ? row.fails + 1 : 1;
    const over = fails - k.free;
    const lock = over >= 0 ? Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS) : 0;
    await db
      .prepare(
        `INSERT INTO auth_attempts (key, fails, locked_until, last_fail) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(key) DO UPDATE SET fails = ?2, locked_until = ?3, last_fail = ?4`,
      )
      .bind(k.id, fails, lock ? now + lock : 0, now)
      .run();
  }
  // Bersihkan catatan lama agar tabel tidak menumpuk
  await db.prepare('DELETE FROM auth_attempts WHERE last_fail < ?').bind(now - 86_400_000).run();
}

export async function clearFailures(keys: Key[]) {
  for (const k of keys) {
    await env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(k.id).run();
  }
}

export function tooMany(seconds: number) {
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} menit` : `${seconds} detik`;
  return Response.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${wait}.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  );
}
