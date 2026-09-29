import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const POST: APIRoute = async ({ cookies }) => {
  const sid = cookies.get('sid')?.value;
  if (sid) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sid).run();
  cookies.delete('sid', { path: '/' });
  return Response.json({ ok: true });
};
