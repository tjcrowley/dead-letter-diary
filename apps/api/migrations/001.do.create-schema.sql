-- 001.do.create-schema.sql
-- Comprehensive schema for Dead Letter Diary v1
-- All tables for all 7 phases -- scaffold in Phase 1 (locked decision)
-- Every table includes user_id for multi-user readiness (locked decision)

BEGIN;

CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passphrase_hash TEXT NOT NULL,           -- Argon2id hash
  hkdf_salt       BYTEA NOT NULL,          -- 32-byte random, per-user (CRYPT-09)
  epitaph         TEXT,                    -- Optional immutable diary epitaph (WIPE-04)
  timezone        TEXT NOT NULL DEFAULT 'UTC',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE webauthn_credentials (
  id          TEXT PRIMARY KEY,            -- credential ID from authenticator
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key  BYTEA NOT NULL,
  counter     BIGINT NOT NULL DEFAULT 0,
  transports  TEXT[],
  device_name TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE key_wraps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT REFERENCES webauthn_credentials(id) ON DELETE CASCADE,
  wrapped_dmk   BYTEA NOT NULL,            -- AES-GCM encrypted DMK
  wrap_iv       BYTEA NOT NULL,            -- 12-byte IV for the wrap
  wrap_type     TEXT NOT NULL,             -- 'webauthn_prf' | 'passphrase'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE server_shards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shard      BYTEA NOT NULL,              -- Server-side key shard (CRYPT-04)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ciphertext BYTEA NOT NULL,             -- AES-GCM encrypted content
  iv         BYTEA NOT NULL,             -- 12-byte IV (CRYPT-06)
  aad        BYTEA,                      -- Associated authenticated data (CRYPT-07)
  word_count INT NOT NULL,               -- Plaintext word count for verification
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deadline_state (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  window_hours         INT NOT NULL DEFAULT 24,         -- Check-in window (DMS-01)
  word_minimum         INT NOT NULL DEFAULT 50,         -- Word minimum (DMS-02)
  deadline_at          TIMESTAMPTZ,                     -- Next deadline (absolute UTC)
  state                TEXT NOT NULL DEFAULT 'active',  -- active | pending_wipe | wiped
  grace_used_at        TIMESTAMPTZ,                     -- Last grace day used
  grace_budget         INT NOT NULL DEFAULT 1,          -- Resets weekly (DMS-09)
  pending_window_hours INT,                             -- Akrasia: pending weakening (DMS-10)
  pending_word_minimum INT,
  pending_effective_at TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wipe_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason       TEXT NOT NULL,             -- 'deadline' | 'panic'
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,              -- Set after settle window (DMS-06)
  shard_deleted BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,           -- Web Push subscription object
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_thresholds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  threshold_minutes INT NOT NULL,        -- Minutes before deadline
  tone              TEXT NOT NULL,       -- 'gentle' | 'urgent' | 'final'
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common query patterns
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_entries_user_id_created ON entries(user_id, created_at DESC);
CREATE INDEX idx_deadline_state_deadline ON deadline_state(deadline_at) WHERE state = 'active';
CREATE INDEX idx_wipe_log_user_id ON wipe_log(user_id);
CREATE INDEX idx_webauthn_credentials_user ON webauthn_credentials(user_id);
CREATE INDEX idx_key_wraps_user ON key_wraps(user_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);

COMMIT;
