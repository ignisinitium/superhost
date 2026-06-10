-- Migration 037: one-time scrub of secrets left in historical task payloads.
-- The worker redacts secrets when it claims a task, but tasks created before
-- that behaviour existed (and any never-processed pending rows) may still hold
-- plaintext SSH passwords / keys / passwords. Replace any such values with the
-- same '[REDACTED]' sentinel the worker uses. Idempotent.
-- Apply after 036_site_migration_cleanup.sql.

DO $$
DECLARE
  k TEXT;
  keys TEXT[] := ARRAY[
    'password','dbPassword','adminPassword','dbPass','token','secret',
    'apiKey','api_key','webhook_secret','private_key','sshPassword','sshKey','passwordHash'
  ];
BEGIN
  FOREACH k IN ARRAY keys LOOP
    UPDATE tasks
       SET payload = jsonb_set(payload, ARRAY[k], '"[REDACTED]"'::jsonb)
     WHERE payload ? k
       AND payload->>k IS DISTINCT FROM '[REDACTED]';
  END LOOP;
END $$;
