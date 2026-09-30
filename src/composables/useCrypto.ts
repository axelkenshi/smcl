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

export async function encryptData(data: object, key: CryptoKey, aad?: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = enc.encode(aad);
  const ct = await crypto.subtle.encrypt(params, key, enc.encode(JSON.stringify(data)));
  return { ciphertext: toB64(ct), iv: toB64(iv) };
}

export async function decryptData<T = any>(
  p: { ciphertext: string; iv: string },
  key: CryptoKey,
  aad?: string,
): Promise<T> {
  const params: AesGcmParams = { name: 'AES-GCM', iv: fromB64(p.iv) };
  if (aad) params.additionalData = enc.encode(aad);
  const pt = await crypto.subtle.decrypt(params, key, fromB64(p.ciphertext));
  return JSON.parse(dec.decode(pt));
}

// E2EE Conversation
const ECDH = { name: 'ECDH', namedCurve: 'P-256' } as const;

// Buat pasangan kunci; kunci privat langsung dibungkus (dienkripsi) dengan kunci brankas
export async function generateIdentity(vaultKey: CryptoKey) {
  const pair = await crypto.subtle.generateKey(ECDH, true, ['deriveBits']);
  const publicKey = toB64(await crypto.subtle.exportKey('spki', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return { publicKey, wrappedPrivateKey: await encryptData(jwk, vaultKey) };
}

// Buka bungkusan; hasilnya tidak bisa diekspor lagi dari memori
export async function importPrivateKey(wrapped: { ciphertext: string; iv: string }, vaultKey: CryptoKey) {
  const jwk = await decryptData<JsonWebKey>(wrapped, vaultKey);
  return crypto.subtle.importKey('jwk', jwk, ECDH, false, ['deriveBits']);
}

// Kunci AES untuk satu percakapan: ECDH lalu HKDF (terikat ke ID percakapan)
export async function deriveConvKey(myPrivate: CryptoKey, theirPublicB64: string, convId: string) {
  const theirPublic = await crypto.subtle.importKey('spki', fromB64(theirPublicB64), ECDH, false, []);
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: theirPublic }, myPrivate, 256);
  const base = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: enc.encode(`smcl-chat-v1:${convId}`) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// Kode keamanan: sama persis di kedua sisi kalau kunci publik tidak ditukar server
export async function safetyCode(pubA: string, pubB: string) {
  const [a, b] = [pubA, pubB].sort();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(`${a}|${b}`));
  const hex = Array.from(new Uint8Array(hash).slice(0, 15), (x) => x.toString(16).padStart(2, '0')).join('');
  return hex.match(/.{1,5}/g)!.join(' ');
}
