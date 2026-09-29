import type { AstroCookies } from 'astro';
import type { D1Database } from '@cloudflare/workers-types';

const enc = new TextEncoder();
const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(''));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const randomSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

// Catatan: Cloudflare Workers membatasi PBKDF2 maksimal 100.000 iterasi
export async function hashPassword(password: string, saltB64: string) {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: 100_000, hash: 'SHA-256' },
    base,
    256,
  );
  return toB64(bits);
}

// Perbandingan waktu-konstan agar tidak bocor lewat selisih waktu
export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const SESSION_DAYS = 7;

export async function createSession(db: D1Database, userId: string, cookies: AstroCookies) {
  const id = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  await db.prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(id, userId, expiresAt).run();
  cookies.set('sid', id, {
    httpOnly: true,
    secure: import.meta.env.PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
}