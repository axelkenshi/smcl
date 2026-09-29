# Product Requirement Document (PRD)

## SMCL: Sistem Manajemen Catatan dan Link (Client-Side E2EE)

* **Versi Dokumen:** 2.0.0 (Astro + Cloudflare D1 Stack)
* **Status Proyek:** Magang RPL / Internal Instansi
* **Pengembang:** Frontend Developer / Siswa SMK RPL
* **Target Stack:** Astro (SSR Mode), Cloudflare Pages, Cloudflare D1 (SQLite), Vue 3 Islands, Tailwind CSS v4, Web Crypto API

---

## 1. Ringkasan Eksekutif & Tujuan Proyek

### 1.1 Masalah Real-World
Di lingkungan kerja instansi, pegawai/staf IT sering kali mengelola banyak tautan internal (dashboard, server admin, drive) serta catatan instruksi kerja harian secara acak. Metode konvensional menyita waktu dan berisiko dari segi keamanan jika perangkat diakses pihak lain.

### 1.2 Solusi Proyek (SMCL)
Aplikasi web internal pribadi yang menggabungkan **Brankas Link** dan **Catatan / Kanvas Notes** dalam satu akun pribadi. Mengusung konsep **Zero-Knowledge Architecture** dengan enkripsi *end-to-end* (E2EE) di sisi klien (*browser*) sebelum data dikirim dan disimpan di database *edge* Cloudflare D1.

### 1.3 Tujuan Utama
1. **Keamanan Maksimal:** Server Cloudflare D1 hanya menyimpan *ciphertext* (string acak terenkripsi).
2. **Performa Tinggi:** Memanfaatkan *Edge Runtime* Cloudflare Pages yang sangat cepat dan dekat dengan lokasi pengguna.
3. **Zero Maintenance:** Tanpa pengelolaan server fisik; gratis dan mudah di-deploy/di-handover via antarmuka Cloudflare.

---

## 2. Arsitektur Kriptografi Sisi Klien (E2EE)

```
[ Input Teks + Password Brankas ]
              │
              ▼
    (Web Crypto API Browser)
  ├─ PBKDF2  --> Derivasi Kunci AES-256
  └─ AES-GCM --> Enkripsi Teks Mentah
              │
              ▼
   [ Ciphertext + Salt + IV ]
              │
              ▼  (HTTP POST via Astro API Endpoint)
     [ Cloudflare D1 DB ]  <-- Hanya menyimpan data acak
```

* **Derivasi Kunci (PBKDF2):** Password brankas diubah menjadi kunci simetris 256-bit menggunakan 100.000 iterasi PBKDF2 dan Salt acak.
* **Enkripsi Simetris (AES-GCM):** Data mentah dienkripsi di RAM browser via `window.crypto.subtle`.
* **Zero-Knowledge Storage:** Database Cloudflare D1 hanya menyimpan payload JSON terenkripsi: `{ "ciphertext": "...", "iv": "...", "salt": "..." }`.

---

## 3. Tech Stack & Ekosistem

| Layer | Teknologi | Peran & Deskripsi |
| :--- | :--- | :--- |
| **Framework Main** | Astro 4.x / 5.x (SSR Mode) | File-based routing, HTML rendering, & API Endpoints |
| **Adapter Hosting** | `@astrojs/cloudflare` | Menghubungkan Astro dengan Cloudflare Pages Functions |
| **Database Engine** | Cloudflare D1 | Serverless SQLite database di jaringan edge Cloudflare |
| **Interactive UI** | Vue 3 (Astro Islands) | Komponen interaktif untuk form E2EE, link vault, & canvas notes |
| **Styling & Theme** | Tailwind CSS v4 + `@theme` | Styling modern Corporate Clean dengan font Lato lokal (.woff2) |
| **Crypto Engine** | Web Crypto API (Native) | Operasi PBKDF2 & AES-GCM bawaan peramban |
| **Icons** | Lucide Icons (`lucide-vue-next`) | Pustaka ikon vektor modern |

---

## 4. Desain Antarmuka (Corporate Clean Style)

* **Font Family:** Lato (Lokal `.woff2` dimuat dari folder `/public/fonts/`).
* **Sudut Elemen:** Serba `rounded-md` (`0.375rem`).
* **Design Tokens Tailwind v4 (`resources/css/app.css` / `src/styles/global.css`):**
  * `--color-corporate-dark`: `#0f172a` (Slate 900 - Teks Utama)
  * `--color-corporate-primary`: `#1e3a8a` (Blue 900 - Header / Button Utama)
  * `--color-corporate-accent`: `#0284c7` (Sky 600 - Active State / Highlight)
  * `--color-corporate-light`: `#e0f2fe` (Sky 100 - Surface Soft)
  * `--color-corporate-surface`: `#ffffff` (Putih Bersih Card/Modal)
  * `--color-corporate-bg`: `#f8fafc` (Background Utama)
  * `--color-corporate-border`: `#e2e8f0` (Garis Batas Halus)

---

## 5. Struktur Folder Proyek Astro

```text
smcl/
├── public/
│   └── fonts/
│       └── Lato.woff2
├── src/
│   ├── components/            # Komponen Vue & Astro (Card, Modal, Navbar)
│   │   ├── VaultCard.vue
│   │   └── PassphraseModal.vue
│   ├── composables/           # Logic Reusabel Frontend
│   │   └── useCrypto.ts       # Web Crypto API Helper (E2EE)
│   ├── layouts/
│   │   └── Layout.astro       # Master HTML Layout + Font Local Lato
│   ├── pages/                 # File-Based Routing Astro
│   │   ├── index.astro        # Landing Page / Login Redirect
│   │   ├── login.astro        # Halaman Login
│   │   ├── register.astro     # Halaman Register
│   │   ├── links.astro        # Halaman Brankas Tautan (Protected)
│   │   ├── notes.astro        # Halaman Catatan / Kanvas (Protected)
│   │   └── api/               # Serverless API Endpoints (D1 Integration)
│   │       ├── auth/          # Login & Register Handlers
│   │       └── vault/         # CRUD Payload Terenkripsi
│   └── styles/
│       └── global.css         # Tailwind v4 Directives & @theme Config
├── schema.sql                 # D1 Database Migration Schema
├── wrangler.json              # Cloudflare D1 & Pages Configuration
├── astro.config.mjs           # Astro Configuration + Cloudflare Adapter
└── package.json
```

---

## 6. Skema Basis Data Cloudflare D1 (`schema.sql`)

```sql
-- Tabel Pengguna (Users)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabel Brankas Terenkripsi (Vault Items: Links & Notes)
CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,                -- Judul (opsional: terenkripsi atau polos)
    type TEXT NOT NULL,                 -- 'link' atau 'note'
    encrypted_payload TEXT NOT NULL,    -- JSON String: { ciphertext, iv, salt }
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

---

## 7. Rencana Eksekusi (Roadmap Implementation)

### Fase 1: Setup Environment & Styling Base
* Inisialisasi Astro project dengan TypeScript & Vue Integration (`npx astro add vue`).
* Setup Tailwind v4 & `@astrojs/cloudflare` adapter.
* Konfigurasi font Lato lokal di `public/fonts/`.

### Fase 2: Database D1 Setup & API Endpoints
* Buat database Cloudflare D1 lokal via CLI `wrangler d1 create smcl-db`.
* Jalankan file `schema.sql` untuk migrasi tabel lokal.
* Buat REST API endpoints di Astro (`src/pages/api/vault/index.ts`) untuk query data dari D1 (`context.locals.runtime.env.DB`).

### Fase 3: Modul Kriptografi Frontend (`useCrypto.ts`)
* Tulis fungsi JavaScript native berbasis Web Crypto API (`PBKDF2` + `AES-GCM`).
* Uji coba fungsi `encryptData()` dan `decryptData()` menggunakan *unit test* sederhana / console log.

### Fase 4: Pengembangan Antarmuka Vue (Islands)
* Buat halaman `links.astro` dan `notes.astro`.
* Integrasikan modal pemicu masukan kata sandi brankas sebelum dekripsi dilakukan.

### Fase 5: Testing & Deployment
* Uji coba *local preview* menggunakan `wrangler pages dev`.
* Deploy ke Cloudflare Pages dengan satu perintah `npx wrangler pages deploy`.