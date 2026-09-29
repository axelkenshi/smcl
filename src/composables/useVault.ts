import { computed, shallowRef } from 'vue';
import { deriveVaultKey, encryptData, decryptData } from './useCrypto';

export interface Entry { title: string; url?: string; body?: string }
export interface VaultItem { id: string; updated_at: string; data: Entry }

const key = shallowRef<CryptoKey | null>(null);
export const isUnlocked = computed(() => key.value !== null);

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  if (res.status === 401) {
    location.href = '/login';
    throw new Error('Sesi berakhir.');
  }
  if (!res.ok) throw new Error(`Permintaan gagal (${res.status}).`);
  return res.json();
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// Brankas dianggap "baru" kalau kode uji passphrase belum pernah dibuat
export async function isVaultNew() {
  const me = await api('/api/me');
  return !me.vault_check;
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
    // Pertama kali: simpan kode uji
    const vault_check = await encryptData({ ok: true }, k);
    await api('/api/vault-check', json('PUT', { vault_check }));
  }
  key.value = k;
}

export const lock = () => { key.value = null; };

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
