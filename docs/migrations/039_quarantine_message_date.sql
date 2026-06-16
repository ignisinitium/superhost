-- The quarantine list was showing `created_at` (when the scanner swept the file
-- into the DB) as the email date, so every message scanned in the same batch
-- looked like it arrived at the same instant. Store the message's real date
-- (its `Date:` header, falling back to Maildir delivery time) separately and
-- display that. `created_at` is kept for retention/expiry and volume stats.
ALTER TABLE mail_quarantine
    ADD COLUMN IF NOT EXISTS message_date TIMESTAMP WITH TIME ZONE;
