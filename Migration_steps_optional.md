# Migrasi Database: dari Cloudflare D1 ke Turso (Opsional)

Dokumen ini menjelaskan langkah demi langkah cara mengganti database SMCL dari **Cloudflare D1** ke **Turso (libSQL)**,
termasuk refactoring kode yang diperlukan. Hosting aplikasi **tetap** di Cloudflare Workers. Yang berpindah hanya
tempat penyimpanan data.

> **Status dokumen: rancangan yang belum diuji di repositori ini.** Perintah dan API disusun dari dokumentasi
> Cloudflare dan Turso saat dokumen ini ditulis (Oktober 2026), tetapi kode contoh belum dijalankan terhadap proyek ini.
> Perlakukan sebagai titik awal, kerjakan di branch terpisah, dan verifikasi setiap langkah pada data uji sebelum
> menyentuh produksi.
>
> Ingin keluar **sepenuhnya** dari Cloudflare (hosting mandiri dengan SQLite lokal)? Lihat `README.md` bagian 12.
> Dokumen ini hanya membahas penggantian database.

## Daftar Isi

1. [Apakah Anda perlu bermigrasi?](#1-apakah-anda-perlu-bermigrasi)
2. [Peta dampak: apa yang berubah dan tidak](#2-peta-dampak-apa-yang-berubah-dan-tidak)
3. [Prasyarat dan persiapan](#3-prasyarat-dan-persiapan)
4. [Langkah 1: Siapkan Turso dan database pengembangan](#4-langkah-1-siapkan-turso-dan-database-pengembangan)
5. [Langkah 2: Refactoring kode](#5-langkah-2-refactoring-kode)
6. [Langkah 3: Lingkungan lokal dan pengujian](#6-langkah-3-lingkungan-lokal-dan-pengujian)
7. [Langkah 4: Siapkan database produksi dan impor data](#7-langkah-4-siapkan-database-produksi-dan-impor-data)
8. [Langkah 5: Cutover ke produksi](#8-langkah-5-cutover-ke-produksi)
9. [Langkah 6: Rencana rollback](#9-langkah-6-rencana-rollback)
10. [Langkah 7: Pembersihan](#10-langkah-7-pembersihan)
11. [Pemecahan masalah](#11-pemecahan-masalah)
12. [Daftar periksa akhir](#12-daftar-periksa-akhir)
13. [Lampiran: pemetaan API D1 ke libSQL](#13-lampiran-pemetaan-api-d1-ke-libsql)

---

## 1. Apakah Anda perlu bermigrasi?

Migrasi ini **opsional**. D1 sudah bekerja baik untuk aplikasi ini. Pertimbangkan Turso bila:

- Anda ingin lepas dari ketergantungan pada API D1 (`env.DB`) di dalam kode, dan menjaga opsi berpindah hosting ke depannya.
- Kuota harian D1 paket Free (baris dibaca dan ditulis per hari) membatasi Anda, dan Anda lebih nyaman dengan kuota bulanan.
- Anda ingin alat bantu Turso (CLI, shell SQL, branching, pemulihan titik waktu) atau akses ke data yang tidak terikat pada Cloudflare.

**Jangan bermigrasi bila** tujuan utamanya adalah mempercepat aplikasi atau mengurangi beban CPU. Turso **tidak** mengurangi
waktu CPU Worker, dan setiap query berubah dari panggilan binding native menjadi permintaan HTTP keluar. Pada dasarnya
latensi akan setara atau sedikit lebih tinggi, jadi **ukur sebelum dan sesudah**.

### 1.1 Perbandingan

| Aspek | Cloudflare D1 (sekarang) | Turso / libSQL (target) |
| :--- | :--- | :--- |
| Mesin | SQLite | libSQL (fork SQLite) |
| Akses dari Worker | Binding native `env.DB` | Klien HTTP (`@libsql/client/web`) dengan URL dan token |
| Biaya akses per query | Panggilan internal | **Subrequest** `fetch` (batas 50 per permintaan di Workers Free) |
| Kredensial | Binding di `wrangler.jsonc` | Dua secret: URL dan token (**akses penuh** ke database bila bocor) |
| Kuota gratis (indikatif) | 5 juta baris dibaca/hari, 100.000 ditulis/hari, 5 GB | Sekitar 500 juta baris dibaca/bulan, 10 juta ditulis/bulan, 5 GB, 100 database |
| Penagihan | Baris dibaca dan ditulis | Baris dibaca dan ditulis (query tanpa indeks yang memindai banyak baris cepat menghabiskan kuota) |
| Lokasi | Petunjuk saat membuat (`--location`) | Dipilih lewat lokasi/grup Turso (lebih dari 35 lokasi) |
| Cadangan | `wrangler d1 export`, Time Travel | `turso db shell ... .dump`, pemulihan titik waktu, `--from-db` |
| Dependensi tambahan | Tidak ada | Paket `@libsql/client` di sisi server |

> Angka kuota berasal dari dokumentasi dan sumber pihak ketiga dan dapat berubah. **Verifikasi di halaman harga resmi**
> masing-masing sebelum memutuskan.

### 1.2 Trade-off yang perlu disadari

- **Dependensi server baru.** `@libsql/client` berjalan di Worker (server), **bukan** di browser, dan tidak pernah menyentuh
  kunci atau passphrase pengguna. Namun ia menambah rantai pasok di sisi server. Kunci versinya (`npm i -E`).
- **Kredensial baru.** Token Turso setara dengan kunci database. Simpan hanya sebagai secret Worker.
  Data yang disimpan tetap ciphertext, tetapi pemegang token bisa membaca hash password dan metadata.
- **Dua penyedia, dua kuota, dua dasbor.** Hosting tetap di Cloudflare, data di Turso.
- **Klaim keamanan tidak berubah.** Seluruh enkripsi terjadi di browser. Memindahkan data terenkripsi ke tempat lain tidak
  mengubah model ancaman E2EE, selama `kdf_salt`, `vault_check`, `public_key`, dan `wrapped_private_key` ikut terbawa persis.

---

## 2. Peta dampak: apa yang berubah dan tidak

### 2.1 Tidak berubah

- Seluruh kode **browser**: `useCrypto.ts`, `useVault.ts`, `useChat.ts`, `useQr.ts`, komponen Vue, dan halaman `.astro`.
- Format data terenkripsi dan kontrak API (bentuk JSON permintaan/respons endpoint).
- Skema SQL (`schema.sql`). Sintaks yang dipakai adalah SQLite standar dan kompatibel dengan libSQL.
- CSP dan header keamanan. Browser tidak pernah menghubungi Turso; hanya Worker yang melakukannya.
- Logika bisnis: pembatas percobaan, aturan kedaluwarsa pesan, alur sesi.

### 2.2 Berubah

| Komponen | D1 (sekarang) | Turso (target) |
| :--- | :--- | :--- |
| Konfigurasi | `d1_databases` di `wrangler.jsonc` | Hapus; ganti dua secret `TURSO_DATABASE_URL` dan `TURSO_AUTH_TOKEN` |
| Akses data | `env.DB.prepare(sql).bind(...)` | Helper `first`, `all`, `run`, `batch` di `src/lib/db.ts` |
| Hasil `.first()` / `.all()` | `row` / `{ results }` | `rows[0] ?? null` / `rows` |
| Jumlah baris terdampak | `res.meta.changes` | `rs.rowsAffected` |
| Transaksi | `db.batch([...])` | `client.batch([...], 'write')` |
| Tipe | `D1Database` | Antarmuka buatan sendiri |
| Lingkungan lokal | Folder `.wrangler/state` | Server libSQL lokal atau database dev terpisah |
| Cadangan dan operasi | `wrangler d1 ...` | Turso CLI |

### 2.3 Berkas yang perlu disentuh

Akses D1 terpusat pada sekitar 17 berkas:

```text
src/middleware.ts
src/lib/auth.ts            (createSession)
src/lib/throttle.ts
src/lib/chat.ts            (purgeExpired)
src/pages/api/auth/register.ts, login.ts, logout.ts
src/pages/api/me.ts
src/pages/api/vault-check.ts
src/pages/api/identity.ts
src/pages/api/users.ts
src/pages/api/vault/index.ts, [id].ts
src/pages/api/messages.ts
src/pages/api/conversations.ts
src/pages/api/password.ts
src/pages/api/account.ts
```

Ditambah satu berkas baru: `src/lib/db.ts`.

---

## 3. Prasyarat dan persiapan

1. **Instance D1 yang sehat** dan sudah terverifikasi (lihat `Deployment_Steps.md`).
2. **Akun Turso** (paket gratis tersedia) dan Turso CLI. Instalasi (macOS/Linux/WSL):
   ```bash
   curl -sSfL https://get.tur.so/install.sh | bash
   turso auth login
   ```
   Alternatif lain termasuk Homebrew dan opsi untuk Windows ada di dokumentasi Turso CLI. Di Windows, banyak orang memakai WSL.
3. **Branch khusus:** `git checkout -b migrasi-turso`. Jangan mengerjakan di `main`.
4. **Cadangan D1** (disimpan di luar Git):
   ```bash
   npx wrangler d1 export smcl-db --remote --output=backup-d1-sebelum-migrasi.sql
   ```
   Berkas ini berisi hash password dan ciphertext. Jangan dikomit.
5. **Jadwalkan jendela pemeliharaan** untuk cutover (langkah 5). Pilih waktu sepi dan umumkan ke pengguna.
6. Baca `README.md` bagian 11.5 (daftar periksa review keamanan) karena Anda akan mengubah semua kode yang menyentuh data.

---

## 4. Langkah 1: Siapkan Turso dan database pengembangan

Gunakan database **terpisah untuk pengembangan** agar produksi tidak tersentuh selama refactoring.

```bash
turso db create smcl-dev
turso db show smcl-dev --url          # catat URL (libsql://...)
turso db tokens create smcl-dev       # catat token
```

- Periksa masa berlaku token yang dibuat (opsi `--expiration` dan `--read-only` tersedia; lihat `turso db tokens create --help`).
  Simpan token di pengelola password, bukan di berkas yang terlacak Git.
- Turso otomatis memilih lokasi terdekat dari tempat Anda menjalankan perintah. Untuk lokasi tertentu, periksa
  `turso db locations` dan `turso group create --help`, lalu buat database dengan `--group`.
- Terapkan skema ke database dev:
  ```bash
  turso db shell smcl-dev < schema.sql
  turso db shell smcl-dev "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  ```
  Alternatif: buat database langsung dari berkas skema dengan `turso db create smcl-dev --from-dump ./schema.sql`.

**Titik periksa:** lima tabel (`auth_attempts`, `messages`, `sessions`, `users`, `vault_items`) muncul.

> **Soal paket klien.** Turso kini memiliki dua mesin dan beberapa SDK. Untuk Turso Cloud dengan libSQL, paket yang
> dipakai ekosistem (termasuk panduan Astro dan Cloudflare) adalah **`@libsql/client`**. Dokumen ini memakainya.
> SDK untuk "Turso Database" (penulisan ulang) berbeda dan tidak dibahas di sini.

---

## 5. Langkah 2: Refactoring kode

### 5.1 Pasang paket

```bash
npm i -E @libsql/client
```

Di lingkungan Cloudflare Workers, klien **wajib diimpor dari `@libsql/client/web`**. Impor biasa tidak berjalan di runtime Workers.
Varian `/web` juga tidak mendukung URL berkas lokal (`file:`), dan ini memengaruhi pengembangan lokal (langkah 3).

### 5.2 Buat `src/lib/db.ts`

Satu lapisan tipis yang menyembunyikan libSQL dari seluruh endpoint. Kalau suatu hari Anda berpindah lagi, hanya berkas ini
yang berubah (lihat juga `README.md` bagian 12.2).

```ts
import { createClient, type Client, type InValue } from '@libsql/client/web';
import { env } from 'cloudflare:workers';

let client: Client | undefined;

// Klien dibuat sekali per isolate, dan baru saat permintaan pertama (env tersedia setelah ada permintaan)
function getClient(): Client {
  if (!client) {
    const url = env.TURSO_DATABASE_URL?.trim();
    if (!url) throw new Error('TURSO_DATABASE_URL belum diatur');
    client = createClient({ url, authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined });
  }
  return client;
}

// Salin ke objek biasa agar aman diserialisasi dan tidak membawa perilaku array-like milik driver
const plain = <T>(row: unknown) => ({ ...(row as object) }) as T;

export async function first<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T | null> {
  const rs = await getClient().execute({ sql, args });
  return rs.rows[0] ? plain<T>(rs.rows[0]) : null;
}

export async function all<T = Record<string, unknown>>(sql: string, args: InValue[] = []): Promise<T[]> {
  const rs = await getClient().execute({ sql, args });
  return rs.rows.map((r) => plain<T>(r));
}

export async function run(sql: string, args: InValue[] = []) {
  const rs = await getClient().execute({ sql, args });
  return { changes: rs.rowsAffected };
}

// Satu transaksi: semuanya berhasil atau semuanya dibatalkan (setara db.batch di D1)
export async function batch(stmts: { sql: string; args?: InValue[] }[]) {
  await getClient().batch(stmts.map((s) => ({ sql: s.sql, args: s.args ?? [] })), 'write');
}
```

Aturan yang perlu diingat:

- **Argumen tidak boleh `undefined`.** `locals.userId` dan `params.id` bertipe `string | undefined`. Pakai `locals.userId!` atau `?? ''`,
  atau Anda akan mendapat error saat query. Tipe `InValue` menolak `undefined` pada saat kompilasi.
- **Integer dikembalikan sebagai `number`.** Aman untuk timestamp milidetik yang kita pakai (di bawah 2^53).
- **Placeholder tetap `?`** dan urutan argumen mengikuti urutan tanda tanya, sama seperti `.bind(...)` di D1.

### 5.3 Pola konversi

| D1 | Turso (`db.ts`) |
| :--- | :--- |
| `db.prepare(sql).bind(a, b).first<T>()` | `await first<T>(sql, [a, b])` |
| `db.prepare(sql).bind(a).all<T>()` → `{ results }` | `await all<T>(sql, [a])` (langsung array) |
| `db.prepare(sql).bind(a).run()` | `await run(sql, [a])` |
| `res.meta.changes` | `res.changes` |
| `db.batch([stmt1, stmt2])` | `await batch([{ sql, args }, { sql, args }])` |

### 5.4 Konversi berkas demi berkas

Hapus `import { env } from 'cloudflare:workers'` di berkas yang tidak lagi memakainya, dan ganti dengan impor dari `lib/db`.

**`src/lib/auth.ts`.** Fungsi `createSession` tidak lagi menerima parameter `db`:

```ts
import { run } from './db';

export async function createSession(userId: string, cookies: AstroCookies) {
  const id = crypto.randomUUID() + crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_DAYS * 86_400_000;
  await run('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)', [id, userId, expiresAt]);
  cookies.set('sid', id, { /* opsi cookie tetap sama */ });
}
```

Hapus juga impor tipe `D1Database` di berkas ini. Semua pemanggil berubah dari `createSession(db, id, cookies)` menjadi
`createSession(id, cookies)`.

**`src/middleware.ts`:**

```ts
import { first } from './lib/db';

const row = await first<{ user_id: string }>(
  'SELECT user_id FROM sessions WHERE id = ? AND expires_at > ?',
  [sid, Date.now()],
);
```

**`src/pages/api/auth/register.ts`:**

```ts
const exists = await first('SELECT 1 FROM users WHERE username = ?', [username]);
if (exists) return Response.json({ error: 'Username sudah dipakai.' }, { status: 409 });
// ...
await run(
  'INSERT INTO users (id, username, password_hash, password_salt, kdf_salt) VALUES (?, ?, ?, ?, ?)',
  [id, username, hash, passwordSalt, randomSalt()],
);
await createSession(id, cookies);
```

**`src/pages/api/auth/login.ts`:**

```ts
const user = await first<{ id: string; password_hash: string; password_salt: string }>(
  'SELECT id, password_hash, password_salt FROM users WHERE username = ?',
  [username],
);
// ...
await createSession(user.id, cookies);
```

**`src/pages/api/auth/logout.ts`:** `await run('DELETE FROM sessions WHERE id = ?', [sid]);`

**`src/pages/api/me.ts`:**

```ts
const user = await first(
  'SELECT id, username, kdf_salt, vault_check, public_key, wrapped_private_key FROM users WHERE id = ?',
  [locals.userId!],
);
return Response.json(user);
```

**`src/pages/api/vault/index.ts`:**

```ts
const cols = 'id, type, encrypted_payload, updated_at';
const rows =
  type === 'link' || type === 'note'
    ? await all(`SELECT ${cols} FROM vault_items WHERE user_id = ? AND type = ? ORDER BY updated_at DESC`, [locals.userId!, type])
    : await all(`SELECT ${cols} FROM vault_items WHERE user_id = ? ORDER BY updated_at DESC`, [locals.userId!]);
return Response.json(rows);
```

POST: `await run('INSERT INTO vault_items (id, user_id, type, encrypted_payload) VALUES (?, ?, ?, ?)', [id, locals.userId!, type, JSON.stringify(encrypted_payload)]);`

**`src/pages/api/vault/[id].ts`:**

```ts
const res = await run(
  'UPDATE vault_items SET encrypted_payload = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?',
  [JSON.stringify(encrypted_payload), params.id!, locals.userId!],
);
return res.changes ? Response.json({ ok: true }) : new Response('Not found', { status: 404 });
```

DELETE: `await run('DELETE FROM vault_items WHERE id = ? AND user_id = ?', [params.id!, locals.userId!])`, lalu periksa `res.changes`.

**`src/pages/api/vault-check.ts`:**

```ts
const res = await run(
  'UPDATE users SET vault_check = ?, public_key = NULL, wrapped_private_key = NULL WHERE id = ? AND vault_check IS NULL',
  [JSON.stringify(vault_check), locals.userId!],
);
return res.changes ? Response.json({ ok: true }) : new Response('Already set', { status: 409 });
```

**`src/pages/api/identity.ts`:**

```ts
const res = await run(
  'UPDATE users SET public_key = ?, wrapped_private_key = ? WHERE id = ? AND public_key IS NULL',
  [public_key, JSON.stringify({ ciphertext: w.ciphertext, iv: w.iv }), locals.userId!],
);
```

**`src/lib/chat.ts`:** tanpa parameter.

```ts
import { run } from './db';
export async function purgeExpired() {
  await run('DELETE FROM messages WHERE created_at < ?', [Date.now() - MESSAGE_TTL_MS]);
}
```

**`src/pages/api/users.ts`:**

```ts
await purgeExpired();
const rows = await all(
  'SELECT id, username, public_key FROM users WHERE id != ? ORDER BY username COLLATE NOCASE',
  [locals.userId!],
);
return Response.json(rows);
```

**`src/pages/api/messages.ts`.** GET dan POST:

```ts
// GET
const rows = await all(
  `SELECT * FROM (
     SELECT id, sender_id, payload, created_at FROM messages
     WHERE conv_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT 200
   ) ORDER BY created_at ASC`,
  [convId(locals.userId!, other), after],
);

// POST
const target = await first<{ public_key: string | null }>('SELECT public_key FROM users WHERE id = ?', [to]);
// ...
const recent = await first<{ n: number }>(
  'SELECT COUNT(*) AS n FROM messages WHERE sender_id = ? AND created_at > ?',
  [me, now - 60_000],
);
// ...
await batch([
  {
    sql: 'INSERT INTO messages (id, conv_id, sender_id, recipient_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    args: [id, convId(me, to), me, to, JSON.stringify({ ciphertext: payload.ciphertext, iv: payload.iv }), now],
  },
  { sql: 'DELETE FROM messages WHERE created_at < ?', args: [now - MESSAGE_TTL_MS] },
]);
```

**`src/pages/api/conversations.ts`:** SQL tetap sama persis; hanya pemanggilannya.

```ts
const rows = await all(`...SQL jendela ROW_NUMBER() yang sama...`, [me, me, me, Date.now() - MESSAGE_TTL_MS]);
return Response.json(rows);
```

**`src/pages/api/password.ts`:**

```ts
const user = await first<{ password_hash: string; password_salt: string }>(
  'SELECT password_hash, password_salt FROM users WHERE id = ?', [locals.userId!]);
// ...
await batch([
  { sql: 'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?', args: [hash, salt, locals.userId!] },
  { sql: 'DELETE FROM sessions WHERE user_id = ? AND id != ?', args: [locals.userId!, currentSid] },
]);
```

**`src/pages/api/account.ts`:**

```ts
const uid = locals.userId!;
await batch([
  { sql: 'DELETE FROM vault_items WHERE user_id = ?', args: [uid] },
  { sql: 'DELETE FROM sessions WHERE user_id = ?', args: [uid] },
  { sql: 'DELETE FROM messages WHERE sender_id = ? OR recipient_id = ?', args: [uid, uid] },
  { sql: 'DELETE FROM users WHERE id = ?', args: [uid] },
]);
```

### 5.5 Tulis ulang `src/lib/throttle.ts`

Berkas ini paling banyak berubah. Dua penyesuaian penting: query `IN (...)` dinamis memakai argumen terpisah, dan **upsert
tidak lagi memakai placeholder bernomor (`?1`, `?2`)** melainkan `excluded.*`, yang lebih portabel.

```ts
import { all, first, run } from './db';

export type Key = { id: string; free: number };

const BASE_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;
const WINDOW_MS = 60 * 60_000;

const ipOf = (request: Request) => request.headers.get('CF-Connecting-IP') ?? 'local';

export const loginKeys = (request: Request, username: string): Key[] => [
  { id: `login:ip:${ipOf(request)}`, free: 20 },
  { id: `login:user:${username.toLowerCase().slice(0, 64)}`, free: 5 },
];

export const registerKeys = (request: Request): Key[] => [
  { id: `register:ip:${ipOf(request)}`, free: 5 },
];

// Mengembalikan sisa detik penguncian (0 = tidak terkunci)
export async function lockedSeconds(keys: Key[]) {
  const marks = keys.map(() => '?').join(',');   // hanya tanda tanya, bukan input pengguna
  const rows = await all<{ locked_until: number }>(
    `SELECT locked_until FROM auth_attempts WHERE key IN (${marks})`,
    keys.map((k) => k.id),
  );
  const until = Math.max(0, ...rows.map((r) => r.locked_until));
  return until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}

export async function recordFailure(keys: Key[]) {
  const now = Date.now();
  for (const k of keys) {
    const row = await first<{ fails: number; last_fail: number }>(
      'SELECT fails, last_fail FROM auth_attempts WHERE key = ?',
      [k.id],
    );
    const fails = row && now - row.last_fail < WINDOW_MS ? row.fails + 1 : 1;
    const over = fails - k.free;
    const lock = over >= 0 ? Math.min(BASE_LOCK_MS * 2 ** over, MAX_LOCK_MS) : 0;
    await run(
      `INSERT INTO auth_attempts (key, fails, locked_until, last_fail) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         fails = excluded.fails, locked_until = excluded.locked_until, last_fail = excluded.last_fail`,
      [k.id, fails, lock ? now + lock : 0, now],
    );
  }
  // Bersihkan catatan lama agar tabel tidak menumpuk
  await run('DELETE FROM auth_attempts WHERE last_fail < ?', [now - 86_400_000]);
}

export async function clearFailures(keys: Key[]) {
  for (const k of keys) await run('DELETE FROM auth_attempts WHERE key = ?', [k.id]);
}

export function tooMany(seconds: number) {
  const wait = seconds >= 60 ? `${Math.ceil(seconds / 60)} menit` : `${seconds} detik`;
  return Response.json(
    { error: `Terlalu banyak percobaan. Coba lagi dalam ${wait}.` },
    { status: 429, headers: { 'Retry-After': String(seconds) } },
  );
}
```

Optimasi opsional (bukan keharusan): `recordFailure` melakukan beberapa panggilan berurutan. Pada D1 itu murah, pada Turso
setiap panggilan adalah permintaan jaringan. Jika Anda mengukur latensi login terasa lambat, gabungkan beberapa
pernyataan dalam satu `batch`.

### 5.6 Konfigurasi dan rahasia

1. Hapus blok `d1_databases` dari `wrangler.jsonc` **hanya setelah** langkah pengujian lolos (agar rollback mudah).
2. Tambahkan dua variabel ke `.dev.vars` (nilai dari langkah 1, database **dev**):
   ```text
   INVITE_CODE=...
   TURSO_DATABASE_URL=libsql://smcl-dev-<organisasi>.turso.io
   TURSO_AUTH_TOKEN=...
   ```
3. Jalankan `npx wrangler types` agar `env.TURSO_DATABASE_URL` dan `env.TURSO_AUTH_TOKEN` dikenali TypeScript, dan agar
   `D1Database` tidak lagi dipakai.
4. **Jangan pernah** memberi awalan `PUBLIC_` pada variabel ini, jangan meneruskannya ke kode browser, dan jangan
   mencetaknya ke log. Token hanya dibaca di sisi server.

---

## 6. Langkah 3: Lingkungan lokal dan pengujian

### 6.1 Pilihan lingkungan lokal

Runtime Workers lokal tidak bisa membuka berkas SQLite, dan klien `/web` tidak mendukung URL `file:`. Ada dua pilihan:

| Opsi | Cara | Catatan |
| :--- | :--- | :--- |
| **A. Database dev di Turso** (paling sederhana, semua OS) | Pakai `smcl-dev` dari langkah 1 di `.dev.vars` | Memakai kuota Turso (kecil); butuh internet |
| **B. Server libSQL lokal** | `turso dev --db-file local.db` lalu isi `TURSO_DATABASE_URL` dengan alamat HTTP yang dicetak (biasanya `http://127.0.0.1:8080`). Token tidak diperlukan | Butuh Turso CLI (di Windows lewat WSL); data persisten di `local.db` |

Untuk opsi B, terapkan skema ke server lokal: `turso db shell http://127.0.0.1:8080 < schema.sql` (atau buat `local.db`
dengan `sqlite3 local.db < schema.sql` sebelum `turso dev --db-file local.db`).

### 6.2 Uji fungsional

Jalankan `npm run dev` dan lakukan seluruh uji pada tabel `README.md` bagian 9.3. Tambahkan uji khusus migrasi:

| # | Uji | Hasil yang benar |
| :--- | :--- | :--- |
| 1 | Daftar, login, logout | Berfungsi; tabel `sessions` terisi/terhapus |
| 2 | CRUD link dan catatan, lalu cek database | Hanya ciphertext tersimpan |
| 3 | Chat dua arah dengan dua akun | Pesan terkirim, preview percakapan tampil (menguji query `ROW_NUMBER()`) |
| 4 | Gagal login 5 kali | Penguncian bertahap muncul (menguji upsert `excluded.*`) |
| 5 | Ganti password, lalu cek sesi lain | Perangkat lain dikeluarkan (menguji `batch`) |
| 6 | Hapus akun yang punya item dan pesan | Baris `users`, `vault_items`, `sessions`, `messages` terkait hilang (menguji `batch` empat pernyataan) |
| 7 | Mundurkan pesan 4 hari lalu kirim pesan baru | Pesan lama terhapus fisik |
| 8 | Periksa Console dan tab Network browser | Tidak ada permintaan ke domain Turso (hanya server yang menghubunginya), tidak ada pelanggaran CSP |

Periksa juga integritas referensial. Turso mungkin tidak memberlakukan foreign key secara bawaan pada koneksi HTTP tanpa status:

```bash
turso db shell smcl-dev "PRAGMA foreign_keys;"
```

Kode saat ini **tidak bergantung** pada `ON DELETE CASCADE` karena hapus akun menghapus semua tabel secara eksplisit di dalam satu
transaksi. Tetap catat hasil pemeriksaan ini di laporan: pada D1 database menegakkan relasi, di Turso integritas bisa
sepenuhnya bergantung pada kode aplikasi.

### 6.3 Ukur performa dan subrequest

- Jalankan `npx wrangler tail` sambil memakai aplikasi, dan bandingkan waktu respons endpoint utama (login, `/api/vault`,
  `/api/conversations`) dengan catatan Anda pada D1.
- Hitung jumlah query per permintaan. Di Workers Free, batas subrequest adalah **50 per permintaan** dan setiap panggilan ke
  Turso dihitung. Alur terpanjang saat ini (login gagal dengan beberapa kunci pembatas) memakai kira-kira 8 panggilan, jadi
  masih aman, tetapi jangan menambah query dalam perulangan tanpa `batch`.
- Middleware menjalankan satu query sesi pada **setiap** permintaan terautentikasi, jadi biaya latensinya berlipat. Jika
  hasil ukur mengecewakan, pertimbangkan memilih lokasi Turso yang lebih dekat ke pengguna Anda.

---

## 7. Langkah 4: Siapkan database produksi dan impor data

Lakukan **setelah** pengujian lokal lolos. Jangan mengubah D1 sama sekali. D1 tetap menjadi sumber kebenaran dan titik
rollback sampai cutover selesai.

### 7.1 Buat database Turso produksi

```bash
turso db create smcl
turso db show smcl --url
turso db tokens create smcl
```

### 7.2 Ekspor dari D1

```bash
npx wrangler d1 export smcl-db --remote --output=d1-export.sql
```

Berkas ini berisi hash password, `vault_check`, kunci terbungkus, dan ciphertext. Perlakukan sebagai data sensitif, jangan
dikomit, dan hapus setelah migrasi selesai (tambahkan ke `.gitignore`).

### 7.3 Bersihkan berkas ekspor

Buka `d1-export.sql` di editor, lalu:

1. **Hapus** semua baris yang menyangkut tabel internal Cloudflare berawalan `_cf_` (jika ada).
2. **Hapus** baris `PRAGMA ...` khusus D1 (misalnya `PRAGMA defer_foreign_keys=TRUE;`), karena tidak berlaku di Turso.
3. Pastikan ada `CREATE TABLE` untuk kelima tabel dan perintah `INSERT` untuk datanya.
4. Hapus `INSERT` untuk tabel `sessions` dan `auth_attempts` (sesi lama tidak perlu dibawa, pengguna cukup login ulang).
   Atau biarkan, lalu kosongkan setelah impor (langkah 7.5).

### 7.4 Impor ke Turso

**Jalur A (disarankan): buat database dari dump.**

```bash
turso db create smcl --from-dump ./d1-export.sql
```

Jika Anda sudah membuat `smcl` di langkah 7.1, hapus dulu atau gunakan nama lain, karena opsi ini berlaku saat pembuatan.

**Jalur B (cadangan bila Jalur A gagal, misalnya karena urutan tabel dan foreign key):** terapkan skema lebih dulu, lalu impor
data **per tabel dengan urutan induk sebelum anak**:

```bash
turso db shell smcl < schema.sql

npx wrangler d1 export smcl-db --remote --no-schema --table=users       --output=users.sql
npx wrangler d1 export smcl-db --remote --no-schema --table=vault_items --output=vault_items.sql
npx wrangler d1 export smcl-db --remote --no-schema --table=messages    --output=messages.sql

turso db shell smcl < users.sql
turso db shell smcl < vault_items.sql
turso db shell smcl < messages.sql
```

Periksa opsi yang tersedia di versi Wrangler Anda dengan `npx wrangler d1 export --help` (`--table`, `--no-schema`, `--no-data`).
**Peringatan:** ekspor data saja dapat memakai `INSERT` tanpa daftar nama kolom, sehingga urutan kolom di tabel tujuan harus sama
dengan di D1. Karena kita membuatnya dari `schema.sql` yang sama, urutannya cocok. Bila basis data D1 Anda dulu dibuat dengan
`ALTER TABLE ADD COLUMN`, urutan kolom bisa berbeda dan Jalur A (ekspor skema dan data dari sumber yang sama) lebih aman.

### 7.5 Kosongkan sesi dan penghitung

```bash
turso db shell smcl "DELETE FROM sessions"
turso db shell smcl "DELETE FROM auth_attempts"
```

### 7.6 Verifikasi data

Jalankan kueri yang sama di kedua database dan bandingkan hasilnya **persis sama**:

```bash
# D1
npx wrangler d1 execute smcl-db --remote --command "SELECT COUNT(*) AS n FROM users"
npx wrangler d1 execute smcl-db --remote --command "SELECT COUNT(*) AS n, COALESCE(SUM(length(encrypted_payload)),0) AS bytes FROM vault_items"
npx wrangler d1 execute smcl-db --remote --command "SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)),0) AS bytes FROM messages"
npx wrangler d1 execute smcl-db --remote --command "SELECT username, length(kdf_salt) AS salt, length(vault_check) AS vc, length(public_key) AS pk, length(wrapped_private_key) AS wk FROM users ORDER BY username"

# Turso
turso db shell smcl "SELECT COUNT(*) AS n FROM users"
turso db shell smcl "SELECT COUNT(*) AS n, COALESCE(SUM(length(encrypted_payload)),0) AS bytes FROM vault_items"
turso db shell smcl "SELECT COUNT(*) AS n, COALESCE(SUM(length(payload)),0) AS bytes FROM messages"
turso db shell smcl "SELECT username, length(kdf_salt) AS salt, length(vault_check) AS vc, length(public_key) AS pk, length(wrapped_private_key) AS wk FROM users ORDER BY username"
```

Panjang kolom `kdf_salt`, `vault_check`, `public_key`, dan `wrapped_private_key` yang cocok per pengguna menunjukkan bahan
kunci terbawa utuh. **Bukti sesungguhnya** adalah uji fungsional di langkah 8.6: membuka brankas dengan passphrase lama.

---

## 8. Langkah 5: Cutover ke produksi

Urutan ini penting. Rahasia harus ada **sebelum** kode baru berjalan.

### 8.1 Umumkan jendela pemeliharaan

Beri tahu pengguna bahwa aplikasi akan tidak tersedia singkat dan mereka perlu login ulang setelahnya.

### 8.2 (Opsional) Mode pemeliharaan untuk membekukan penulisan

Tanpa pembekuan, data yang ditulis ke D1 setelah ekspor tidak ikut terbawa. Untuk komunitas kecil, cukup pilih jam sepi.
Jika ingin pembekuan resmi, tambahkan di awal `onRequest` pada `middleware.ts`:

```ts
import { env } from 'cloudflare:workers';
// ...
if (env.MAINTENANCE === '1' && !ctx.url.pathname.startsWith('/_astro/')) {
  return new Response('Sedang dalam pemeliharaan. Coba lagi sebentar lagi.', {
    status: 503, headers: { 'Retry-After': '900' },
  });
}
```

Aktifkan dengan `npx wrangler secret put MAINTENANCE` (isi `1`), dan hapus saat selesai (`npx wrangler secret delete MAINTENANCE`).
Pemeliharaan ini harus sudah ter-deploy **sebelum** jendela cutover, dengan kode D1 yang lama.

### 8.3 Ekspor akhir

Setelah pembekuan, ulangi ekspor dan impor (langkah 7.2 sampai 7.6) agar data terbaru terbawa.

### 8.4 Isi rahasia Turso di Worker produksi

```bash
npx wrangler secret put TURSO_DATABASE_URL     # URL database produksi (smcl)
npx wrangler secret put TURSO_AUTH_TOKEN       # token database produksi
```

Pastikan **bukan** URL/token database `smcl-dev`.

### 8.5 Deploy kode baru

Gabungkan branch `migrasi-turso` ke `main` (deploy otomatis), atau jalankan `npx astro build && npx wrangler deploy`.
Setelah build berhasil dan terverifikasi, hapus blok `d1_databases` dari `wrangler.jsonc` jika belum.

### 8.6 Uji asap (smoke test)

1. Login dengan akun lama, lalu buka brankas dengan **passphrase lama**. Link, catatan, dan chat yang belum kedaluwarsa harus terbaca.
   Ini bukti bahwa seluruh bahan kunci terbawa utuh.
2. Tambah, ubah, dan hapus satu item. Kirim satu pesan chat dua arah.
3. Daftar akun baru dengan kode organisasi, dan uji pembatas login.
4. Cek `npx wrangler tail` untuk error, dan periksa waktu respons.
5. Konfirmasi data tulis baru masuk ke Turso (bukan D1):
   ```bash
   turso db shell smcl "SELECT COUNT(*) FROM users"
   ```
6. Nonaktifkan mode pemeliharaan bila diaktifkan.

---

## 9. Langkah 6: Rencana rollback

Jangan menghapus atau mengubah D1 sampai Anda yakin. Selama periode stabilisasi (saran: 1 sampai 2 minggu), D1 adalah jaring pengaman.

| Situasi | Tindakan |
| :--- | :--- |
| Masalah serius segera setelah cutover | Rollback ke versi sebelumnya lewat **Deployments** di dashboard, atau `git revert` penggabungan lalu deploy. Versi lama masih memakai binding D1, dan D1 masih memegang data sampai saat ekspor akhir |
| Data sudah ditulis ke Turso setelah cutover | Data itu **tidak ada di D1**. Pilihannya: terima kehilangannya, atau ekspor dari Turso dan impor balik ke D1 (`turso db shell smcl .dump`, lalu `wrangler d1 execute ... --file`). Makin cepat Anda memutuskan rollback, makin kecil selisihnya |
| Secret Turso salah | `wrangler secret put` ulang. Tidak perlu deploy kode baru |

Karena rollback ke D1 membutuhkan binding di `wrangler.jsonc` versi lama, pastikan commit penghapusan blok `d1_databases`
dilakukan **terpisah** dan baru setelah masa stabilisasi.

---

## 10. Langkah 7: Pembersihan

Setelah periode stabilisasi berlalu tanpa masalah:

1. Ekspor D1 terakhir dan simpan cadangan terenkripsi di tempat aman: `npx wrangler d1 export smcl-db --remote --output=arsip-d1.sql`.
2. Hapus D1 bila tidak lagi diperlukan: `npx wrangler d1 delete smcl-db`.
3. Hapus berkas ekspor sementara (`d1-export.sql`, `users.sql`, dan lainnya) dari komputer Anda.
4. Hapus database `smcl-dev` di Turso bila tidak dipakai, atau pertahankan sebagai lingkungan uji.
5. Putar (rotate) token Turso bila pernah tertempel di tempat yang tidak aman: buat token baru dan perbarui secret.
6. Perbarui dokumentasi:
   - `README.md`: tech stack (bagian 4), arsitektur (bagian 3), struktur folder (bagian 5, tambahkan `lib/db.ts`),
     setup lokal (bagian 8), uji enkripsi (bagian 9, perintah memakai `turso db shell`), deployment (bagian 10), dan batasan (13.6).
   - `Deployment_Steps.md`: ganti langkah pembuatan D1 dengan langkah Turso dan dua secret.
7. Catat di `CHANGELOG.md`, dan beri tag versi.

---

## 11. Pemecahan masalah

| Gejala | Kemungkinan penyebab | Solusi |
| :--- | :--- | :--- |
| `LibsqlError: URL_INVALID` | `TURSO_DATABASE_URL` kosong, ada spasi, atau dibaca sebelum ada permintaan | Pakai `env` dari `cloudflare:workers` di dalam fungsi (seperti `getClient`), `trim()`, dan periksa isi secret |
| Permintaan menggantung atau gagal terhubung | Skema `libsql://` bermasalah di lingkungan tertentu | Coba bentuk `https://<nama>-<organisasi>.turso.io` untuk URL |
| `401` / `UNAUTHORIZED` dari Turso | Token salah, kedaluwarsa, atau milik database lain | `turso db tokens create <db>` baru; perbarui secret |
| `TURSO_DATABASE_URL belum diatur` | Secret belum diisi, atau `wrangler types` belum dijalankan | Isi secret; periksa `.dev.vars` (UTF-8) dan restart |
| `Too many subrequests` | Lebih dari 50 panggilan DB per permintaan (Workers Free) | Gabungkan dengan `batch`, hindari query dalam perulangan |
| Error saat `--from-dump` (misalnya constraint foreign key) | Urutan tabel dalam dump | Pakai Jalur B (skema dulu, data per tabel berurutan) |
| Jumlah baris berbeda antara D1 dan Turso | Ekspor tidak lengkap atau ada penulisan di tengah | Bekukan penulisan dan ulangi ekspor dan impor |
| Login berhasil tetapi brankas tidak bisa dibuka | `kdf_salt`, `vault_check`, atau kunci terbungkus tidak terbawa persis | Bandingkan panjang kolom (7.6); impor ulang tabel `users` |
| Data lama aneh setelah impor | Urutan kolom tidak sama pada Jalur B | Pakai Jalur A, atau tambahkan daftar kolom pada `INSERT` |
| Query terasa lambat | Setiap query adalah permintaan HTTP; lokasi database jauh; query pada setiap permintaan | Ukur; pindahkan database ke lokasi lebih dekat; gabungkan dengan `batch`; pertimbangkan kembali D1 |
| Kuota baris dibaca Turso cepat habis | Query tanpa indeks memindai banyak baris | Tambah indeks; periksa query dengan `EXPLAIN QUERY PLAN` |
| `RangeError` pada angka besar | Integer di atas 2^53 | Tidak terjadi pada skema ini; bila muncul, gunakan opsi `intMode` klien |
| Preview/dev lokal memakai database produksi | `.dev.vars` berisi kredensial produksi | Pastikan `.dev.vars` hanya berisi kredensial database dev |

---

## 12. Daftar periksa akhir

- [ ] Branch `migrasi-turso` terpisah dari `main`
- [ ] Cadangan D1 (`backup-d1-sebelum-migrasi.sql`) tersimpan di luar Git
- [ ] Database `smcl-dev` dibuat; skema diterapkan; token disimpan aman
- [ ] `@libsql/client` terpasang dengan versi terkunci (`-E`) dan diimpor dari `@libsql/client/web`
- [ ] `src/lib/db.ts` dibuat; seluruh 17 berkas yang menyentuh D1 sudah dikonversi
- [ ] `throttle.ts` memakai `excluded.*` (tanpa `?1`, `?2`)
- [ ] `createSession` tanpa parameter `db`; semua pemanggil diperbarui
- [ ] Tidak ada lagi referensi `env.DB`, `D1Database`, atau `.prepare(` di `src/` (cek dengan `grep -rn "env.DB\|D1Database\|\.prepare(" src/`)
- [ ] Token tidak pernah masuk kode browser, log, atau Git
- [ ] Tabel uji `README.md` 9.3 dan uji khusus migrasi (6.2) lolos
- [ ] Latensi dan jumlah subrequest diukur dan dapat diterima
- [ ] Impor produksi diverifikasi (jumlah baris, panjang kolom bahan kunci)
- [ ] Rahasia Turso produksi diisi **sebelum** kode baru di-deploy
- [ ] Uji asap: login akun lama, buka brankas dengan passphrase lama, data terbaca
- [ ] Masa stabilisasi berjalan; D1 belum dihapus
- [ ] Dokumentasi diperbarui setelah migrasi stabil

---

## 13. Lampiran: pemetaan API D1 ke libSQL

| Konsep | Cloudflare D1 | libSQL (`@libsql/client/web`) |
| :--- | :--- | :--- |
| Mendapat koneksi | `env.DB` (binding) | `createClient({ url, authToken })` |
| Satu baris | `stmt.first()` | `rs.rows[0]` |
| Banyak baris | `(await stmt.all()).results` | `rs.rows` |
| Eksekusi tulis | `stmt.run()` | `client.execute(...)` |
| Baris terdampak | `meta.changes` | `rs.rowsAffected` |
| Transaksi banyak pernyataan | `db.batch([...])` | `client.batch([...], 'write')` |
| Transaksi interaktif | (tidak ada; gunakan `batch`) | `client.transaction('write')`, lalu `commit()` / `rollback()` |
| Parameter | `.bind(a, b)` | `args: [a, b]` |
| Nilai kosong | `null` | `null` (**bukan** `undefined`) |
| Ekspor | `wrangler d1 export` | `turso db shell <db> .dump` |
| Membuat dari dump | (tidak ada) | `turso db create <db> --from-dump <berkas>` |
| Pemulihan | `d1 time-travel restore` | Pemulihan titik waktu / `turso db create --from-db <db> --timestamp ...` |
| Eksekusi SQL manual | `wrangler d1 execute` | `turso db shell <db> "<sql>"` |

### Alternatif yang tidak dibahas di sini

- **Hosting mandiri dengan SQLite lokal** (keluar total dari Cloudflare): `README.md` bagian 12.
- **ORM seperti Drizzle**: mendukung libSQL/Turso dan bisa menggantikan `db.ts`, tetapi menambah dependensi dan abstraksi.
  Untuk lima tabel dan query pendek, SQL terparameter langsung lebih mudah diaudit.
- **Replika tertanam (embedded replica) libSQL**: bergantung pada berkas lokal sehingga tidak cocok dengan runtime Workers.
