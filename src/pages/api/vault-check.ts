import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const PUT: APIRoute = async ({ locals, request }) => {
  const { vault_check } = await request.json().catch(() => ({}));
  if (!vault_check?.ciphertext || !vault_check?.iv) {
    return new Response('Bad request', { status: 400 });
  }
  // Hanya boleh diisi sekali; tidak bisa ditimpa
  const res = await env.DB
    .prepare('UPDATE users SET vault_check = ? WHERE id = ? AND vault_check IS NULL')
    .bind(JSON.stringify(vault_check), locals.userId)
    .run();
  return res.meta.changes ? Response.json({ ok: true }) : new Response('Already set', { status: 409 });
};
