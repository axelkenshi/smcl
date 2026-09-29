import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ locals, url }) => {
  const type = url.searchParams.get('type');
  const db = env.DB;
  const stmt = type === 'link' || type === 'note'
    ? db.prepare('SELECT id, type, encrypted_payload, updated_at FROM vault_items WHERE user_id = ? AND type = ? ORDER BY updated_at DESC').bind(locals.userId, type)
    : db.prepare('SELECT id, type, encrypted_payload, updated_at FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC').bind(locals.userId);
  const { results } = await stmt.all();
  return Response.json(results);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const { type, encrypted_payload } = await request.json().catch(() => ({}));
  if (!['link', 'note'].includes(type) || !encrypted_payload?.ciphertext || !encrypted_payload?.iv) {
    return new Response('Bad request', { status: 400 });
  }
  const id = crypto.randomUUID();
  await env.DB
    .prepare('INSERT INTO vault_items (id, user_id, type, encrypted_payload) VALUES (?, ?, ?, ?)')
    .bind(id, locals.userId, type, JSON.stringify(encrypted_payload))
    .run();
  return Response.json({ id }, { status: 201 });
};
