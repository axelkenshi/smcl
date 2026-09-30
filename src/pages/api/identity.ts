// menyimpan kunci sekali saja dan tidak bisa ditimpa
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

const B64 = /^[A-Za-z0-9+/=]+$/;

export const PUT: APIRoute = async ({ locals, request }) => {
  const { public_key, wrapped_private_key: w } = await request.json().catch(() => ({}));
  const ok =
    typeof public_key === 'string' && public_key.length <= 200 && B64.test(public_key) &&
    typeof w?.ciphertext === 'string' && typeof w?.iv === 'string' &&
    w.ciphertext.length + w.iv.length < 2000;
  if (!ok) return new Response('Bad request', { status: 400 });

  const res = await env.DB
    .prepare('UPDATE users SET public_key = ?, wrapped_private_key = ? WHERE id = ? AND public_key IS NULL')
    .bind(public_key, JSON.stringify({ ciphertext: w.ciphertext, iv: w.iv }), locals.userId)
    .run();
  return res.meta.changes ? Response.json({ ok: true }) : new Response('Already set', { status: 409 });
};
