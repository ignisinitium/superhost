-- Migration: Server Settings (nameservers, master domain, IP)

CREATE TABLE IF NOT EXISTS server_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default nameserver values
INSERT INTO server_settings (key, value) VALUES
    ('ns1',           'ns3.qc.fyi'),
    ('ns2',           'ns4.qc.fyi'),
    ('master_domain', 'web02.qc.fyi'),
    ('server_ip',     '15.235.73.176')
ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE ON server_settings TO superhost;
