import type { Request, Response, NextFunction } from 'express';
import { query } from '../db.js';

// ---------------------------------------------------------------------------
// Settings cache — avoids a DB round-trip on every login attempt.
// Refreshed at most once every 5 minutes.
// ---------------------------------------------------------------------------
interface BruteForceSettings {
  failThreshold: number;   // consecutive failures before ban
  windowMinutes: number;   // look-back window for counting failures
  banMinutes: number;      // 0 = permanent
}

let _cache: BruteForceSettings | null = null;
let _cacheAt = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getSettings(): Promise<BruteForceSettings> {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL) return _cache;

  try {
    const res = await query(
      `SELECT key, value FROM server_settings
       WHERE key IN ('brute_force_fail_threshold','brute_force_window_minutes','brute_force_ban_minutes')`
    );
    const map: Record<string, string> = {};
    for (const row of res.rows as { key: string; value: string }[]) map[row.key] = row.value;

    _cache = {
      failThreshold: parseInt(map['brute_force_fail_threshold'] ?? '5', 10),
      windowMinutes: parseInt(map['brute_force_window_minutes'] ?? '15', 10),
      banMinutes:    parseInt(map['brute_force_ban_minutes']    ?? '1440', 10),
    };
    _cacheAt = now;
    return _cache;
  } catch {
    // Fallback so a DB hiccup never breaks logins
    return { failThreshold: 5, windowMinutes: 15, banMinutes: 1440 };
  }
}

/** Call after saving new settings so the next request picks them up immediately. */
export const invalidateBruteForceSettingsCache = () => { _cacheAt = 0; };

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export const checkIpBlock = async (req: Request, res: Response, next: NextFunction) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  try {
    const result = await query(
      'SELECT reason FROM blocked_ips WHERE ip_address = $1 AND (expires_at IS NULL OR expires_at > NOW())',
      [ip]
    );
    if (result.rows.length > 0) {
      return res.status(403).json({
        message: 'Your IP address has been blocked due to multiple failed login attempts.',
        reason: (result.rows[0] as { reason: string }).reason,
      });
    }
    next();
  } catch (err) {
    console.error('Error checking IP block:', err);
    next();
  }
};

export const logLoginAttempt = async (ip: string, username: string, success: boolean) => {
  try {
    const { failThreshold, windowMinutes, banMinutes } = await getSettings();

    // 1. Log the attempt
    await query(
      'INSERT INTO login_attempts (ip_address, username, success) VALUES ($1, $2, $3)',
      [ip, username, success]
    );

    if (success) return;

    // 2. Count recent failures within the rolling window
    const countRes = await query(
      `SELECT count(*) FROM login_attempts
       WHERE ip_address = $1 AND success = false
         AND created_at > NOW() - ($2 * INTERVAL '1 minute')`,
      [ip, windowMinutes]
    );
    const failCount = parseInt((countRes.rows[0] as { count: string }).count, 10);

    if (failCount >= failThreshold) {
      console.warn(`Blocking IP ${ip} after ${failCount} failed attempts (threshold ${failThreshold}).`);

      // 3. Insert/update the block — 0 banMinutes → permanent (NULL expires_at)
      await query(
        `INSERT INTO blocked_ips (ip_address, reason, expires_at)
         VALUES (
           $1, $2,
           CASE WHEN $3::int = 0 THEN NULL
                ELSE NOW() + ($3::int * INTERVAL '1 minute')
           END
         )
         ON CONFLICT (ip_address) DO UPDATE
           SET reason     = EXCLUDED.reason,
               expires_at = EXCLUDED.expires_at,
               created_at = NOW()`,
        [ip, 'Automatic block: multiple failed login attempts', banMinutes]
      );

      // 4. Queue system-level UFW block
      await query(
        'INSERT INTO tasks (command, payload) VALUES ($1, $2)',
        ['FIREWALL_BLOCK_IP', { ipAddress: ip }]
      );
    }
  } catch (err) {
    console.error('Error logging login attempt:', err);
  }
};
