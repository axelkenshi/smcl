import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MESSAGE_TTL_MS, convId } from '../../lib/chat';

const MAX_CIPHERTEXT = 12_000;
const MAX_PER_MINUTE = 30;

export const GET: APIRoute = async ({ locals, url }) => {
  const other = url.searchParams.get('with') ?? '';
  if (!other || other.length > 64) return new Response('Bad request', { status: 400 });

  // Batas bawah = aturan 3 hari; pesan kedaluwarsa tidak pernah dikembalikan
  const floor = Date.now() - MESSAGE_TTL_MS;
  const after = Math.max(Number(url.searchParams.get('after')) || 0, floor);

  const { results } = await env.DB
    .prepare(
      `SELECT * FROM (
         SELECT id, sender_id, payload, created_at FROM messages
         WHERE conv_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 200
       ) ORDER BY created_at ASC`,
    )
    .bind(convId(locals.userId!, other), after)
    .all();
  return Response.json(results);
};

export const POST: APIRoute = async ({ locals, request }) => {
  const me = locals.userId!;
  const { to, payload } = await request.json().catch(() => ({}));
  if (
    typeof to !== 'string' || to === me ||
    typeof payload?.ciphertext !== 'string' || typeof payload?.iv !== 'string' ||
    payload.ciphertext.length > MAX_CIPHERTEXT || payload.iv.length > 32
  ) {
    return new Response('Bad request', { status: 400 });
  }

  const db = env.DB;
  const target = await db
    .prepare('SELECT public_key FROM users WHERE id = ?')
    .bind(to)
    .first<{ public_key: string | null }>();
  if (!target) return new Response('Not found', { status: 404 });
  if (!target.public_key) return new Response('Recipient not ready', { status: 409 });

  const now = Date.now();
  const recent = await db
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND created_at > ?')
    .bind(me, now - 60_000)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= MAX_PER_MINUTE) return new Response('Too many requests', { status: 429 });

  const id = crypto.randomUUID();
  await db.batch([
    db
      .prepare('INSERT INTO messages (id, conv_id, sender_id, recipient_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, convId(me, to), me, to, JSON.stringify({ ciphertext: payload.ciphertext, iv: payload.iv }), now),
    // Pembersihan fisik: pesan lama dihapus setiap ada pesan baru
    db.prepare('DELETE FROM messages WHERE created_at < ?').bind(now - MESSAGE_TTL_MS),
  ]);
  return Response.json({ id, created_at: now }, { status: 201 });
};
