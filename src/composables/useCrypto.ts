const enc = new TextEncoder();
const dec = new TextDecoder();

const toB64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(Array.from(new Uint8Array(buf), (b) => String.fromCharCode(b)).join(''));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export const generateSalt = () => toB64(crypto.getRandomValues(new Uint8Array(16)));

// Dipanggil SEKALI setelah user memasukkan passphrase brankas
export async function deriveVaultKey(passphrase: string, saltB64: string): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: fromB64(saltB64), iterations: 600_000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptData(data: object, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // IV baru tiap enkripsi
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
  return { ciphertext: toB64(ct), iv: toB64(iv) };
}

export async function decryptData<T = any>(p: { ciphertext: string; iv: string }, key: CryptoKey): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(p.iv) }, key, fromB64(p.ciphertext));
  return JSON.parse(dec.decode(pt));
}