import { api, json, identity } from './useVault';
import { encryptData, decryptData, deriveConvKey, safetyCode } from './useCrypto';
import { convId } from '../lib/chat';

export interface Peer { id: string; username: string; public_key: string | null }
export interface ChatMessage { id: string; mine: boolean; text: string; at: number; ok: boolean }

export const listUsers = (): Promise<Peer[]> => api('/api/users');

async function convKeyFor(peer: Peer) {
  const me = identity.value;
  if (!me) throw new Error('Brankas terkunci.');
  if (!peer.public_key) throw new Error('Lawan bicara belum mengaktifkan chat.');
  const cacheKey = `${peer.id}:${peer.public_key}`;
  let k = me.convKeys.get(cacheKey);
  if (!k) {
    k = await deriveConvKey(me.privateKey, peer.public_key, convId(me.userId, peer.id));
    me.convKeys.set(cacheKey, k);
  }
  return k;
}

// AAD mengikat ciphertext ke percakapan dan pengirimnya: server tidak bisa memindahkan atau memalsukannya
const aadOf = (cid: string, senderId: string) => `${cid}|${senderId}`;

export interface Conversation { peer: Peer; preview: string; at: number; mine: boolean }

export async function listConversations(): Promise<Conversation[]> {
  const me = identity.value;
  if (!me) throw new Error('Brankas terkunci.');
  const rows = await api('/api/conversations');
  return Promise.all(
    rows.map(async (r: any): Promise<Conversation> => {
      const peer: Peer = { id: r.peer_id, username: r.username, public_key: r.public_key };
      let preview = '[Pesan tidak dapat dibuka]';
      try {
        const key = await convKeyFor(peer);
        const d = await decryptData<{ text: string }>(
          JSON.parse(r.payload),
          key,
          aadOf(convId(me.userId, peer.id), r.sender_id),
        );
        preview = d.text.replace(/\s+/g, ' ').slice(0, 80);
      } catch { /* dibiarkan; preview tetap pesan gagal */ }
      return { peer, preview, at: r.created_at, mine: r.sender_id === me.userId };
    }),
  );
}

export async function sendMessage(peer: Peer, text: string) {
  const me = identity.value!;
  const key = await convKeyFor(peer);
  const payload = await encryptData({ text }, key, aadOf(convId(me.userId, peer.id), me.userId));
  return api('/api/messages', json('POST', { to: peer.id, payload }));
}

export async function fetchMessages(peer: Peer, after: number): Promise<ChatMessage[]> {
  const me = identity.value!;
  const key = await convKeyFor(peer);
  const cid = convId(me.userId, peer.id);
  const rows = await api(`/api/messages?with=${encodeURIComponent(peer.id)}&after=${after}`);
  return Promise.all(
    rows.map(async (r: any): Promise<ChatMessage> => {
      const mine = r.sender_id === me.userId;
      try {
        const d = await decryptData<{ text: string }>(JSON.parse(r.payload), key, aadOf(cid, r.sender_id));
        return { id: r.id, mine, text: d.text, at: r.created_at, ok: true };
      } catch {
        return { id: r.id, mine, text: '[Pesan tidak dapat dibuka]', at: r.created_at, ok: false };
      }
    }),
  );
}

export const getSafetyCode = (peer: Peer) => safetyCode(identity.value!.publicKey, peer.public_key!);
