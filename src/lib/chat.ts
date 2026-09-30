import type { D1Database } from '@cloudflare/workers-types';

export const MESSAGE_TTL_MS = 3 * 86_400_000; // 3 hari

export const convId = (a: string, b: string) => [a, b].sort().join(':');

export async function purgeExpired(db: D1Database) {
  await db.prepare('DELETE FROM messages WHERE created_at < ?').bind(Date.now() - MESSAGE_TTL_MS).run();
}