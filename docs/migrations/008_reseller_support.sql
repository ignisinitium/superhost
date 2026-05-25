-- Migration: Add White-Label & Reseller Support

-- Resellers table (A reseller is a special type of administrator)
CREATE TABLE IF NOT EXISTS resellers (
    id SERIAL PRIMARY KEY,
    admin_id INTEGER REFERENCES admins(id) ON DELETE CASCADE UNIQUE,
    company_name VARCHAR(255),
    plan_tier VARCHAR(50) DEFAULT 'standard', -- 'standard', 'pro', 'unlimited'
    max_users INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Link users to resellers
ALTER TABLE users ADD COLUMN IF NOT EXISTS reseller_id INTEGER REFERENCES resellers(id) ON DELETE SET NULL;

-- White-label Branding settings
CREATE TABLE IF NOT EXISTS white_label_settings (
    id SERIAL PRIMARY KEY,
    reseller_id INTEGER REFERENCES resellers(id) ON DELETE CASCADE UNIQUE, -- NULL means global system branding
    panel_name VARCHAR(100) DEFAULT 'Superhost',
    logo_url TEXT,
    primary_color VARCHAR(20) DEFAULT '#4f46e5', -- Indigo-600
    support_email VARCHAR(255),
    custom_domain VARCHAR(255), -- For white-labeled access URL
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- API Keys for programmatic access
CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL, -- references admins(id)
    key_prefix VARCHAR(10) NOT NULL,
    key_hash TEXT NOT NULL,
    label VARCHAR(100),
    permissions JSONB DEFAULT '[]', -- e.g. ["create_user", "read_metrics"]
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert global system branding
INSERT INTO white_label_settings (id, reseller_id, panel_name) VALUES (1, NULL, 'Superhost Elite') ON CONFLICT DO NOTHING;
