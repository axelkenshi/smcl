import { computed, ref, shallowRef } from 'vue';
import { deriveVaultKey, encryptData, decryptData, generateIdentity, importPrivateKey } from './useCrypto';

export interface Entry { title: string; url?: string; body?: string }
export interface VaultItem { id: string; updated_at: string; data: Entry }

const key = shallowRef<CryptoKey | null>(null);

export interface Identity {
  userId: string;
  username: string;
  publicKey: string;
  privateKey: CryptoKey;
  convKeys: Map<string, CryptoKey>; // cache kunci percakapan, hilang bersama identitas
}
export const identity = shallowRef<Identity | null>(null);

async function setupIdentity(me: any, vaultKey: CryptoKey) {
  if (!me.public_key || !me.wrapped_private_key) {
    const created = await generateIdentity(vaultKey);
    const res = await fetch('/api/identity', json('PUT', {
      public_key: created.publicKey,
      wrapped_private_key: created.wrappedPrivateKey,
    }));
    if (res.ok) {
      me = { ...me, public_key: created.publicKey, wrapped_private_key: JSON.stringify(created.wrappedPrivateKey) };
    } else if (res.status === 409) {
      me = await api('/api/me'); // tab lain sudah membuatnya lebih dulu
    } else {
      throw new Error(`Gagal menyimpan kunci chat (${res.status}).`);
    }
  }
  identity.value = {
    userId: me.id,
    username: me.username,
    publicKey: me.public_key,
    privateKey: await importPrivateKey(JSON.parse(me.wrapped_private_key), vaultKey),
    convKeys: new Map(),
  };
}

export const isUnlocked = computed(() => key.value !== null);

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Sesi berakhir.');
  }
  if (!res.ok) throw new Error(`Permintaan gagal (${res.status}).`);
  return res.json();
}

export const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const accountName = ref('');

async function loadAccount() {
  const me = await api('/api/me');
  accountName.value = me?.username ?? '';
  return me;
}

// Brankas dianggap "baru" kalau kode uji passphrase belum pernah dibuat
export async function isVaultNew() {
  const me = await loadAccount();
  return !me?.vault_check;
}

export async function unlock(passphrase: string) {
  const me = await api('/api/me');
  const k = await deriveVaultKey(passphrase, me.kdf_salt);

  if (me.vault_check) {
    try {
      await decryptData(JSON.parse(me.vault_check), k);
    } catch {
      throw new Error('Passphrase salah.');
    }
  } else {
    const vault_check = await encryptData({ ok: true }, k);
    await api('/api/vault-check', json('PUT', { vault_check }));
    me.public_key = null; // server mengosongkan identitas lama pada langkah ini
    me.wrapped_private_key = null;
  }
  key.value = k;
  armIdleLock();
  
  try {
    await setupIdentity(me, k);
  } catch (e) {
    console.error('Gagal menyiapkan kunci chat:', e);
    identity.value = null; // tidak menghalangi fitur link dan catatan
  }
}

export const lock = () => {
  key.value = null;
  identity.value = null;
};

// Sekarang kunci hidup selama tab terbuka (idle), jadi jendela waktu "brankas terbuka" lebih panjang
const IDLE_MS = 60 * 60_000;   // 60 menit, sesuaikan
let idleTimer: number | undefined;

function armIdleLock() {
  clearTimeout(idleTimer);
  if (key.value) idleTimer = window.setTimeout(lock, IDLE_MS);
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'keydown', 'scroll']) {
    window.addEventListener(ev, armIdleLock, { passive: true });
  }
}

export async function listItems(type: 'link' | 'note'): Promise<VaultItem[]> {
  const rows = await api(`/api/vault?type=${type}`);
  return Promise.all(
    rows.map(async (r: any) => ({
      id: r.id,
      updated_at: r.updated_at,
      data: await decryptData<Entry>(JSON.parse(r.encrypted_payload), key.value!),
    })),
  );
}

export async function createItem(type: 'link' | 'note', data: Entry) {
  const encrypted_payload = await encryptData(data, key.value!);
  return api('/api/vault', json('POST', { type, encrypted_payload }));
}

export async function updateItem(id: string, data: Entry) {
  const encrypted_payload = await encryptData(data, key.value!);
  return api(`/api/vault/${id}`, json('PUT', { encrypted_payload }));
}

export const deleteItem = (id: string) => api(`/api/vault/${id}`, { method: 'DELETE' });

export async function logout() {
  lock();
  await fetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login';
}

export async function deleteAccount(password: string) {
  const res = await fetch('/api/account', json('DELETE', { password }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Permintaan gagal (${res.status}).`);
  }
  lock();
  location.href = '/login';
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const res = await fetch('/api/password', json('PUT', { currentPassword, newPassword }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Permintaan gagal (${res.status}).`);
  }
}
