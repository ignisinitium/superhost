-- Brute-force protection tuning knobs stored in server_settings
INSERT INTO server_settings (key, value) VALUES
  ('brute_force_fail_threshold', '5'),
  ('brute_force_window_minutes', '15'),
  ('brute_force_ban_minutes',    '1440')   -- 1440 = 24 hours; 0 = permanent
ON CONFLICT (key) DO NOTHING;
