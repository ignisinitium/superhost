-- Migration 027: additional portfolio sites. Apply after 026_portfolio.sql.

INSERT INTO portfolio_items (id, title, url, description, category, image_url, sort_order) VALUES
  (5, 'Ignis Initium', 'https://www.ignisinitium.com',
   'DJ & fire performer — event entertainment and bookings.', 'Entertainment',
   '/portfolio/ignisinitium.webp', 5),
  (6, 'Jonathan Deak', 'https://www.jonathandeak.com',
   'Personal portfolio site.', 'Personal',
   '/portfolio/jonathandeak.webp', 6)
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title, url = EXCLUDED.url, description = EXCLUDED.description,
  category = EXCLUDED.category, image_url = EXCLUDED.image_url, sort_order = EXCLUDED.sort_order;

SELECT setval('portfolio_items_id_seq', (SELECT MAX(id) FROM portfolio_items));
