-- Migration: per-RBL (DNS blocklist) catalog with individual enable/disable.
--
-- Replaces the single free-text `mail_rbls` server_settings string with a
-- structured catalog so each blocklist can be toggled independently (like
-- rspamd's RBL module). The master `rbl_enabled` switch still gates all of them
-- at once; the worker applies reject_rbl_client for every enabled row.

CREATE TABLE IF NOT EXISTS mail_rbls (
    id          SERIAL PRIMARY KEY,
    zone        TEXT UNIQUE NOT NULL,          -- DNS zone queried, e.g. zen.spamhaus.org
    name        TEXT NOT NULL,                 -- display name
    description TEXT,
    enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    is_custom   BOOLEAN NOT NULL DEFAULT FALSE,-- admin-added vs seeded catalog
    sort_order  INTEGER NOT NULL DEFAULT 100,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Curated catalog of reputable, currently-operational blocklists. zen.spamhaus
-- and bl.spamcop are pre-enabled to preserve the prior `mail_rbls` selection;
-- the rest ship disabled. (SORBS and standalone CBL are intentionally omitted —
-- both were shut down / folded into other lists.)
INSERT INTO mail_rbls (zone, name, description, enabled, sort_order) VALUES
  ('zen.spamhaus.org',         'Spamhaus ZEN',          'Combined SBL+XBL+PBL — the most widely used blocklist. Best general-purpose choice. Public DNS resolvers are rate-limited; use a local resolver for volume.', TRUE,  10),
  ('bl.spamcop.net',           'SpamCop',               'Community spam-trap based blocklist. Fast to list and de-list; low false positives.', TRUE, 20),
  ('b.barracudacentral.org',   'Barracuda Reputation',  'Barracuda Central reputation list. Requires free registration of your resolver IP at barracudacentral.org to return results.', FALSE, 30),
  ('psbl.surriel.com',         'PSBL',                  'Passive Spam Block List — spam-trap driven, conservative listings.', FALSE, 40),
  ('bl.mailspike.net',         'Mailspike',             'IP reputation and blocklist data from Mailspike.', FALSE, 50),
  ('dnsbl-1.uceprotect.net',   'UCEPROTECT Level 1',    'Single-IP spam-source listings. Effective but more aggressive — review before enabling.', FALSE, 60),
  ('dnsbl.dronebl.org',        'DroneBL',               'Tracks botnet / compromised-host (drone) IP addresses.', FALSE, 70)
ON CONFLICT (zone) DO NOTHING;
