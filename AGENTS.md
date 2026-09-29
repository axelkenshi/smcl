```plain text
smcl/
├── public/
│   └── fonts/
│       └── Lato.woff2
├── src/
│   ├── components/
│   │   ├── PassphraseModal.vue
│   │   └── VaultManager.vue
│   ├── composables/           # Logic Reusabel Frontend
│   │   ├── useCrypto.ts       # Web Crypto API Helper (E2EE)
│   │   └── useVault.ts
│   ├── layouts/
│   │   └── Layout.astro       # Master HTML Layout + Font Local Lato
│   ├── lib/
│   │   └── auth.ts
│   ├── pages/                 # File-Based Routing Astro
│   │   ├── index.astro        # Landing Page / Login Redirect (belum dikembangkan UI)
│   │   ├── login.astro        # Halaman Login
│   │   ├── register.astro     # Halaman Register
│   │   └── api/               # Serverless API Endpoints (D1 Integration)
│   │       ├── me.ts
│   │       ├── auth/          # Login & Register Handlers
│   │       │     ├── login.ts
│   │       │     ├── logout.ts
│   │       │     └── register.ts
│   │       └── vault/         # CRUD Payload Terenkripsi
│   │             ├── [id].ts
│   │             └── index.ts
│   ├── styles/
│   │   └── global.css         # Tailwind v4 Directives & @theme Config
│   ├── env.d.ts
│   └── middleware.ts
├── schema.sql                 # D1 Database Migration Schema
├── wrangler.jsonc             # Cloudflare D1 & Pages Configuration
├── astro.config.mjs           # Astro Configuration + Cloudflare Adapter
└── package.json
```

```bash
npx wrangler d1 execute smcl-db --local --command "SELECT username, vault_check FROM users"
```

openssl rand -base64 12

Produksi, nanti di Fase 5, setelah deploy pertama:
npx wrangler secret put INVITE_CODE
