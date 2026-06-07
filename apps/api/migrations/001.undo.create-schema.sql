-- 001.undo.create-schema.sql
-- Drops all tables created in 001.do.create-schema.sql
-- in reverse dependency order

BEGIN;

DROP TABLE IF EXISTS notification_thresholds CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS wipe_log CASCADE;
DROP TABLE IF EXISTS deadline_state CASCADE;
DROP TABLE IF EXISTS entries CASCADE;
DROP TABLE IF EXISTS server_shards CASCADE;
DROP TABLE IF EXISTS key_wraps CASCADE;
DROP TABLE IF EXISTS webauthn_credentials CASCADE;
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS users CASCADE;

COMMIT;
