import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { MESSAGE_TTL_MS } from '../../lib/chat';

export const GET: APIRoute = async ({ locals }) => {
  const me = locals.userId!;
  // Urutan bind mengikuti tanda ? dari atas ke bawah: me, me, me, batas waktu
  const { results } = await env.DB
    .prepare(
      `SELECT id, sender_id, payload, created_at, peer_id, username, public_key FROM (
         SELECT m.id, m.sender_id, m.payload, m.created_at,
                u.id AS peer_id, u.username, u.public_key,
                ROW_NUMBER() OVER (PARTITION BY m.conv_id ORDER BY m.created_at DESC, m.id DESC) AS rn
         FROM messages m
         JOIN users u ON u.id = CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END
         WHERE (m.sender_id = ? OR m.recipient_id = ?) AND m.created_at >= ?
       ) WHERE rn = 1 ORDER BY created_at DESC`,
    )
    .bind(me, me, me, Date.now() - MESSAGE_TTL_MS)
    .all();
  return Response.json(results);
};
