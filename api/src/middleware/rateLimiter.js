import { query } from '../db.js';
const FAIL_THRESHOLD = 5;
const WINDOW_MINUTES = 15;
export const checkIpBlock = async (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    try {
        const result = await query('SELECT * FROM blocked_ips WHERE ip_address = $1 AND (expires_at IS NULL OR expires_at > NOW())', [ip]);
        if (result.rows.length > 0) {
            return res.status(403).json({
                message: 'Your IP address has been blocked due to multiple failed login attempts.',
                reason: result.rows[0].reason
            });
        }
        next();
    }
    catch (err) {
        console.error('Error checking IP block:', err);
        next();
    }
};
export const logLoginAttempt = async (ip, username, success) => {
    try {
        // 1. Log the attempt
        await query('INSERT INTO login_attempts (ip_address, username, success) VALUES ($1, $2, $3)', [ip, username, success]);
        if (!success) {
            // 2. Check for recent failures
            const result = await query(`SELECT count(*) FROM login_attempts 
         WHERE ip_address = $1 AND success = false 
         AND created_at > NOW() - INTERVAL '$2 minutes'`, [ip, WINDOW_MINUTES]);
            const failCount = parseInt(result.rows[0].count);
            if (failCount >= FAIL_THRESHOLD) {
                // 3. Block the IP
                console.warn(`Blocking IP ${ip} after ${failCount} failed attempts.`);
                await query('INSERT INTO blocked_ips (ip_address, reason, expires_at) VALUES ($1, $2, NOW() + INTERVAL \'24 hours\') ON CONFLICT DO NOTHING', [ip, 'Automatic block: Multiple failed login attempts']);
                // 4. Trigger system-level block via worker
                await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['FIREWALL_BLOCK_IP', { ipAddress: ip }]);
            }
        }
    }
    catch (err) {
        console.error('Error logging login attempt:', err);
    }
};
//# sourceMappingURL=rateLimiter.js.map