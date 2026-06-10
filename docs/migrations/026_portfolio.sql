-- Migration 026: portfolio of completed websites (shown on the storefront).
-- Data-driven so items can be added/edited without code changes. Thumbnails
-- default to WordPress mShots (free, no key); image_url can be overridden with a
-- self-hosted screenshot later. Apply after 025_web_dev_services.sql.

CREATE TABLE IF NOT EXISTS portfolio_items (
  id          BIGSERIAL    PRIMARY KEY,
  title       VARCHAR(120) NOT NULL,
  url         TEXT         NOT NULL,
  description TEXT,
  category    VARCHAR(60),
  image_url   TEXT,
  sort_order  INTEGER      NOT NULL DEFAULT 0,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO portfolio_items (id, title, url, description, category, image_url, sort_order) VALUES
  (1, 'Institute for Family Justice', 'https://www.i4fj.org',
   'Advocacy site fighting for 50/50 shared parenting rights.', 'Nonprofit',
   '/portfolio/i4fj.webp', 1),
  (2, 'FXKStudios', 'https://fxkstudios.com',
   'Event & nightlife photography portfolio, San Antonio, TX.', 'Photography',
   '/portfolio/fxkstudios.webp', 2),
  (3, 'Peoples Lawyer Association', 'https://www.peopleslawyer.org',
   'Legal services organization providing access to justice for everyone.', 'Legal',
   '/portfolio/peopleslawyer.webp', 3),
  (4, 'G Pro 210', 'https://www.gpro210.com',
   'Local business site — Go Pro with Garcia Pro.', 'Business',
   '/portfolio/gpro210.webp', 4)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, url = EXCLUDED.url, description = EXCLUDED.description,
  category = EXCLUDED.category, image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order;

SELECT setval('portfolio_items_id_seq', (SELECT MAX(id) FROM portfolio_items));
