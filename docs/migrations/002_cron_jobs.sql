-- Migration: Add Cron Jobs table

CREATE TABLE IF NOT EXISTS user_cron_jobs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, -- NULL means system/root job
    minute VARCHAR(20) DEFAULT '*',
    hour VARCHAR(20) DEFAULT '*',
    day VARCHAR(20) DEFAULT '*',
    month VARCHAR(20) DEFAULT '*',
    weekday VARCHAR(20) DEFAULT '*',
    command TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups by user
CREATE INDEX IF NOT EXISTS idx_user_cron_jobs_user_id ON user_cron_jobs(user_id);
