-- 002.do.shard-schema.sql
-- Move server_shards to dedicated schema excluded from backups (INST-07)
-- IMPORTANT: pg_dump uses --exclude-schema=shards to omit this table.
-- Backing up server shards would defeat the cryptographic wipe guarantee.
BEGIN;
CREATE SCHEMA IF NOT EXISTS shards;
ALTER TABLE public.server_shards SET SCHEMA shards;
COMMIT;
