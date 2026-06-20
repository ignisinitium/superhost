-- 042_ssl_certificates.sql
-- Cert-centric inventory of Let's Encrypt certificates installed on the host.
-- Populated by the worker (REFRESH_SSL_CERTS) by inspecting /etc/letsencrypt/live
-- with openssl. One row per certbot lineage; `domains` holds the cert's SANs.

CREATE TABLE IF NOT EXISTS ssl_certificates (
    id              SERIAL PRIMARY KEY,
    cert_name       VARCHAR(255) UNIQUE NOT NULL,        -- certbot lineage (/etc/letsencrypt/live/<cert_name>)
    domains         TEXT[]       NOT NULL DEFAULT '{}',  -- Subject Alternative Names
    issuer          TEXT,                                -- issuer CN, e.g. "R3" / "E5"
    not_before      TIMESTAMPTZ,
    not_after       TIMESTAMPTZ,                         -- expiry
    serial          TEXT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- derived owner (NULL for system certs)
    last_checked_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ssl_certificates_user_id   ON ssl_certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_ssl_certificates_not_after ON ssl_certificates(not_after);
