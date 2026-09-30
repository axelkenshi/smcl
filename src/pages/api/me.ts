// dipakai Vue untuk mengambil kdf_salt di Fase 4
import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const GET: APIRoute = async ({ locals }) => {
  const user = await env.DB
    .prepare('SELECT id, username, kdf_salt, vault_check, public_key, wrapped_private_key FROM users WHERE id = ?')
    .bind(locals.userId)
    .first();
  return Response.json(user);
};