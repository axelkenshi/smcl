import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const PUT: APIRoute = async ({ locals, params, request }) => {
  const { encrypted_payload } = await request.json().catch(() => ({}));
  if (!encrypted_payload?.ciphertext || !encrypted_payload?.iv) {
    return new Response('Bad request', { status: 400 });
  }
  const res = await env.DB
    .prepare('UPDATE vault_items SET encrypted_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .bind(JSON.stringify(encrypted_payload), params.id, locals.userId)
    .run();
  return res.meta.changes ? Response.json({ ok: true }) : new Response('Not found', { status: 404 });
};

export const DELETE: APIRoute = async ({ locals, params }) => {
  const res = await env.DB
    .prepare('DELETE FROM vault_items WHERE id = ? AND user_id = ?')
    .bind(params.id, locals.userId)
    .run();
  return res.meta.changes ? Response.json({ ok: true }) : new Response('Not found', { status: 404 });
};