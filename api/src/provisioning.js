import { query } from './db.js';
export async function provisionSignupByToken(token, stripe) {
    const res = await query('SELECT * FROM pending_signups WHERE session_token = $1', [token]);
    const signup = res.rows[0];
    if (!signup || signup.status === 'provisioned')
        return; // unknown or already done
    await provisionSignup(signup, stripe);
}
export async function provisionSignupById(id) {
    const res = await query('SELECT * FROM pending_signups WHERE id = $1', [id]);
    const signup = res.rows[0];
    if (!signup || signup.status === 'provisioned')
        return;
    await provisionSignup(signup);
}
async function provisionSignup(s, stripe) {
    if (s.signup_type === 'filter') {
        await provisionFilterSignup(s, stripe);
        return;
    }
    const username = s.username;
    const homeDir = `/home/${username}`;
    const prod = (await query('SELECT * FROM products WHERE id = $1', [s.product_id])).rows[0];
    const diskLimit = prod?.disk_quota_mb ?? 5120;
    const bwLimit = prod ? (prod.bandwidth_gb === -1 ? -1 : prod.bandwidth_gb * 1024) : 5120;
    // 1. Create the panel user (idempotent) and assign the purchased package +
    //    Stripe references so we can manage the subscription later.
    const userRes = await query(`INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb,
                        package_id, stripe_customer_id, stripe_subscription_id, subscription_status, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active')
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email, package_id = EXCLUDED.package_id,
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, users.stripe_subscription_id),
       subscription_status = EXCLUDED.subscription_status, status = 'active'
     RETURNING id`, [username, s.email, homeDir, s.password_hash, diskLimit, bwLimit, s.product_id,
        stripe?.customerId ?? null, stripe?.subscriptionId ?? null,
        stripe?.subscriptionId ? 'active' : null]);
    const userId = userRes.rows[0].id;
    // System account: Linux user, home, public_html, default DB, staging subdomain.
    await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_USER', { username, email: s.email }]);
    // 2. Primary domain → website vhost + DNS zone + mail domain (so they can host
    //    the site and create mailboxes on it immediately).
    if (s.primary_domain) {
        const domainName = s.primary_domain;
        const docRoot = `${homeDir}/public_html/${domainName}`;
        const domRes = await query(`INSERT INTO domains (user_id, domain_name, document_root, php_version)
       VALUES ($1, $2, $3, '8.3') ON CONFLICT (domain_name) DO NOTHING RETURNING id`, [userId, domainName, docRoot]);
        const domainId = domRes.rows[0]?.id;
        if (domainId) {
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CREATE_DOMAIN', { domainId, domainName, username, phpVersion: '8.3', docRoot }]);
            await query('INSERT INTO dns_zones (user_id, domain_name) VALUES ($1, $2) ON CONFLICT (domain_name) DO NOTHING', [userId, domainName]);
            await query(`INSERT INTO mail_domains (domain_name, user_id) VALUES ($1, $2)
         ON CONFLICT (domain_name) DO UPDATE SET user_id = EXCLUDED.user_id`, [domainName, userId]);
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['GENERATE_EMAIL_DNS', { domainId, domainName }]);
            await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_SERVER', {}]);
        }
    }
    // 3. Record the paid invoice.
    await query(`INSERT INTO invoices (user_id, product_id, stripe_invoice_id, amount_cents, status, paid_at)
     VALUES ($1, $2, $3, $4, 'paid', NOW())`, [userId, s.product_id, `signup_${String(s.session_token).slice(0, 24)}`, s.amount_cents]);
    // 4. Mark the signup provisioned.
    await query(`UPDATE pending_signups SET status = 'provisioned', provisioned_user_id = $1, provisioned_at = NOW() WHERE id = $2`, [userId, s.id]);
    console.log(`Provisioned signup for ${username} (user ${userId}), package ${s.product_id}`);
}
// Provision a spam-filter (relay) signup: a panel-login account WITHOUT a
// hosting/Linux account, plus the relay domain + protected addresses. The
// customer manages everything from the Mail Filtering page.
async function provisionFilterSignup(s, stripe) {
    const username = s.username;
    const userRes = await query(`INSERT INTO users (username, email, home_dir, password_hash, disk_limit_mb, bandwidth_limit_mb,
                        package_id, stripe_customer_id, stripe_subscription_id, subscription_status, status)
     VALUES ($1, $2, $3, $4, 0, 0, $5, $6, $7, $8, 'active')
     ON CONFLICT (username) DO UPDATE SET
       email = EXCLUDED.email, package_id = EXCLUDED.package_id,
       stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, users.stripe_customer_id),
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, users.stripe_subscription_id),
       subscription_status = EXCLUDED.subscription_status, status = 'active'
     RETURNING id`, [username, s.email, `/home/${username}`, s.password_hash, s.product_id,
        stripe?.customerId ?? null, stripe?.subscriptionId ?? null, 'active']);
    const userId = userRes.rows[0].id;
    // Relay domain + protected addresses.
    if (s.primary_domain && s.destination_host) {
        const relRes = await query(`INSERT INTO mail_relay_domains (user_id, domain_name, destination_host, destination_port)
       VALUES ($1, $2, $3, $4) ON CONFLICT (domain_name) DO UPDATE
         SET user_id = EXCLUDED.user_id, destination_host = EXCLUDED.destination_host, destination_port = EXCLUDED.destination_port
       RETURNING id`, [userId, s.primary_domain, s.destination_host, s.destination_port ?? 25]);
        const relayId = relRes.rows[0].id;
        for (const addr of String(s.mailbox_addresses ?? '').split(',').map((a) => a.trim().toLowerCase()).filter(Boolean)) {
            await query(`INSERT INTO mail_relay_recipients (relay_domain_id, address) VALUES ($1, $2)
         ON CONFLICT (relay_domain_id, address) DO NOTHING`, [relayId, addr]);
        }
        await query('INSERT INTO tasks (command, payload) VALUES ($1, $2)', ['CONFIGURE_MAIL_RELAY', {}]);
    }
    await query(`INSERT INTO invoices (user_id, product_id, stripe_invoice_id, amount_cents, status, paid_at)
     VALUES ($1, $2, $3, $4, 'paid', NOW())`, [userId, s.product_id, `signup_${String(s.session_token).slice(0, 24)}`, s.amount_cents]);
    await query(`UPDATE pending_signups SET status = 'provisioned', provisioned_user_id = $1, provisioned_at = NOW() WHERE id = $2`, [userId, s.id]);
    console.log(`Provisioned FILTER signup for ${username} (user ${userId}), ${s.quantity} mailbox(es)`);
}
//# sourceMappingURL=provisioning.js.map