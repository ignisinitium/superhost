-- Migration: Add Enterprise Monitoring (Alerts & Traffic Analytics)

-- Notification Settings
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    slack_webhook_url TEXT,
    telegram_bot_token TEXT,
    telegram_chat_id TEXT,
    cpu_threshold INTEGER DEFAULT 90, -- %
    ram_threshold INTEGER DEFAULT 90, -- %
    disk_threshold INTEGER DEFAULT 90, -- %
    is_enabled BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initial default settings
INSERT INTO notification_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Alert Log
CREATE TABLE IF NOT EXISTS alert_log (
    id SERIAL PRIMARY KEY,
    level VARCHAR(20) NOT NULL, -- 'info', 'warning', 'critical'
    service VARCHAR(50) NOT NULL, -- 'cpu', 'ram', 'disk', 'nginx', etc.
    message TEXT NOT NULL,
    is_resolved BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Domain Traffic Stats (per-domain bandwidth)
CREATE TABLE IF NOT EXISTS domain_traffic_stats (
    id SERIAL PRIMARY KEY,
    domain_name VARCHAR(255) NOT NULL,
    bytes_sent BIGINT DEFAULT 0,
    bytes_received BIGINT DEFAULT 0,
    recorded_date DATE DEFAULT CURRENT_DATE,
    UNIQUE(domain_name, recorded_date)
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_domain_traffic_date ON domain_traffic_stats(recorded_date);
CREATE INDEX IF NOT EXISTS idx_alert_log_created ON alert_log(created_at);
