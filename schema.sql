CREATE TABLE IF NOT EXISTS auth_attempts (
    key TEXT PRIMARY KEY,               -- contoh: 'login:ip:1.2.3.4', 'login:user:tes'
    fails INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_fail INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    kdf_salt TEXT NOT NULL,            -- salt untuk kunci brankas (E2EE)
    vault_check TEXT,
    public_key TEXT,                   -- kunci publik ECDH (base64, boleh dilihat server)
    wrapped_private_key TEXT,          -- kunci privat ECDH, terenkripsi kunci brankas
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conv_id TEXT NOT NULL,             -- dua user_id terurut, dihitung server
    sender_id TEXT NOT NULL,
    recipient_id TEXT NOT NULL,
    payload TEXT NOT NULL,             -- { ciphertext, iv }
    created_at INTEGER NOT NULL,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, created_at);
CREATE INDEX IF NOT EXISTS idx_msg_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vault_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('link','note')),
    encrypted_payload TEXT NOT NULL,   -- { ciphertext, iv } berisi judul + isi
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_vault_user ON vault_items(user_id);