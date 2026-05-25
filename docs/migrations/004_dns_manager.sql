-- Migration: Add DNS Zones and Records tables

CREATE TABLE IF NOT EXISTS dns_zones (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    ttl INTEGER DEFAULT 3600,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dns_records (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER REFERENCES dns_zones(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL, -- e.g. '@', 'www', 'mail'
    type VARCHAR(10) NOT NULL, -- e.g. 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'NS'
    content TEXT NOT NULL,
    priority INTEGER, -- For MX and SRV
    ttl INTEGER, -- If NULL, use zone TTL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster record lookups
CREATE INDEX IF NOT EXISTS idx_dns_records_zone_id ON dns_records(zone_id);
CREATE INDEX IF NOT EXISTS idx_dns_zones_user_id ON dns_zones(user_id);
