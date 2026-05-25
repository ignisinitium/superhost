-- Migration: Add Email Advanced Features (Forwarders, Auto-responders, SpamAssassin)

-- Base tables if they are missing
CREATE TABLE IF NOT EXISTS mail_domains (
    id SERIAL PRIMARY KEY,
    domain_name VARCHAR(255) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mail_users (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER REFERENCES mail_domains(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    quota INTEGER DEFAULT 1024, -- MB
    spam_filter_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Forwarders table
CREATE TABLE IF NOT EXISTS mail_forwarders (
    id SERIAL PRIMARY KEY,
    domain_id INTEGER REFERENCES mail_domains(id) ON DELETE CASCADE,
    source VARCHAR(255) NOT NULL, -- e.g. 'sales@example.com'
    destination TEXT NOT NULL, -- e.g. 'my@personal.com, another@email.com'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source, destination)
);

-- Auto-responders table
CREATE TABLE IF NOT EXISTS mail_autoresponders (
    id SERIAL PRIMARY KEY,
    mail_user_id INTEGER REFERENCES mail_users(id) ON DELETE CASCADE UNIQUE,
    message TEXT NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add spam_filter_enabled to mail_users if it doesn't exist (in case the table was created previously)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='mail_users' AND column_name='spam_filter_enabled') THEN
        ALTER TABLE mail_users ADD COLUMN spam_filter_enabled BOOLEAN DEFAULT TRUE;
    END IF;
END $$;
