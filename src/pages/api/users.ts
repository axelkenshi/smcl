import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { purgeExpired } from '../../lib/chat';

export const GET: APIRoute = async ({ locals }) => {
  await purgeExpired(env.DB);
  const { results } = await env.DB
    .prepare('SELECT id, username, public_key FROM users WHERE id != ? ORDER BY username COLLATE NOCASE')
    .bind(locals.userId)
    .all();
  return Response.json(results);
};
