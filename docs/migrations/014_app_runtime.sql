-- Migration: App runtime, git repos, and client databases
-- These tables were created manually; this migration documents and ensures their schema.

CREATE TABLE IF NOT EXISTS user_apps (
    id             SERIAL PRIMARY KEY,
    user_id        INTEGER REFERENCES users(id) ON DELETE CASCADE,
    domain_id      INTEGER REFERENCES domains(id) ON DELETE CASCADE,
    name           VARCHAR(100) NOT NULL,
    type           VARCHAR(20) NOT NULL,   -- 'node' | 'python'
    port           INTEGER NOT NULL UNIQUE,
    startup_script VARCHAR(255),
    status         VARCHAR(20) DEFAULT 'stopped',
    created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_git_repos (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    domain_id     INTEGER REFERENCES domains(id) ON DELETE CASCADE,
    repo_url      VARCHAR(255) NOT NULL,
    branch        VARCHAR(50) DEFAULT 'main',
    deploy_path   VARCHAR(255),
    webhook_token VARCHAR(64) NOT NULL UNIQUE,
    last_deployed TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS databases (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
    db_name    VARCHAR(64) NOT NULL UNIQUE,
    db_user    VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
