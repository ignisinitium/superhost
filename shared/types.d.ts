export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed';
export interface User {
    id: number;
    username: string;
    email: string;
    home_dir: string;
    ssh_enabled: boolean;
    created_at: string;
}
export interface Domain {
    id: number;
    user_id: number;
    domain_name: string;
    document_root: string;
    is_ssl: boolean;
    php_version: string;
    created_at: string;
    username?: string;
}
export interface Task {
    id: number;
    command: string;
    payload: any;
    status: TaskStatus;
    error_message?: string;
    created_at: string;
    updated_at: string;
}
export interface UserPort {
    id: number;
    user_id: number;
    port: number;
    service_name: string;
    domain_id: number;
    created_at: string;
}
export interface CronJob {
    id: number;
    user_id: number;
    minute: string;
    hour: string;
    day: string;
    month: string;
    weekday: string;
    command: string;
    description?: string;
    created_at: string;
}
export interface FtpAccount {
    id: number;
    user_id: number;
    ftp_username: string;
    homedir: string;
    created_at: string;
    owner_username?: string;
}
export interface DnsZone {
    id: number;
    user_id: number | null;
    domain_name: string;
    ttl: number;
    created_at: string;
    username?: string;
}
export interface DnsRecord {
    id: number;
    zone_id: number;
    name: string;
    type: string;
    content: string;
    priority: number | null;
    ttl: number | null;
    created_at: string;
}
export interface Database {
    id: number;
    user_id: number;
    db_name: string;
    db_user: string;
    created_at: string;
    owner_name?: string;
}
export interface MailUser {
    id: number;
    domain_id: number;
    email: string;
    quota: number;
    spam_filter_enabled: boolean;
    spam_digest_enabled: boolean;
    spam_score_threshold: number;
    spam_action: 'quarantine' | 'tag' | 'deliver';
    is_catchall: boolean;
    created_at: string;
    domain_name?: string;
}
export interface MailForwarder {
    id: number;
    domain_id: number;
    source: string;
    destination: string;
    created_at: string;
    domain_name?: string;
}
export interface MailAutoresponder {
    id: number;
    mail_user_id: number;
    message: string;
    enabled: boolean;
    created_at: string;
}
export interface MailQuarantine {
    id: number;
    mail_user_id: number;
    sender: string;
    subject: string;
    spam_score: number;
    file_path: string;
    created_at: string;
    released_at: string | null;
    expires_at: string;
}
export interface QuarantineMessage {
    from: string;
    to: string;
    subject: string;
    date: string | null;
    headers: string[];
    text: string;
    html: string;
    attachments: {
        filename: string;
        contentType: string;
        size: number;
    }[];
    raw: string;
    truncated: boolean;
    size: number;
}
export interface MailGlobalRule {
    id: number;
    sender_pattern: string;
    access_type: 'allow' | 'block';
    note: string | null;
    created_at: string;
}
export interface MailAccessControl {
    id: number;
    mail_user_id: number;
    sender_pattern: string;
    access_type: 'allow' | 'block';
    created_at: string;
}
export interface HostingPackage {
    id: number;
    name: string;
    description: string;
    price_cents: number;
    annual_price_cents: number;
    onetime_price_cents: number;
    is_custom: boolean;
    setup_fee_cents: number;
    billing_cycle: 'monthly' | 'quarterly' | 'annually' | 'onetime';
    type: 'hosting' | 'addon' | 'domain' | 'vps' | 'reseller' | 'service';
    is_active: boolean;
    sort_order: number;
    disk_quota_mb: number;
    bandwidth_gb: number;
    inodes_limit: number;
    domains_allowed: number;
    subdomains_allowed: number;
    addon_domains: number;
    parked_domains: number;
    email_accounts: number;
    email_quota_mb: number;
    email_forwarders: number;
    email_autoresponders: number;
    mailing_lists: number;
    spam_filter: boolean;
    catchall_email: boolean;
    databases_allowed: number;
    database_users: number;
    ftp_accounts: number;
    ssh_access: boolean;
    sftp_access: boolean;
    ssl_included: boolean;
    cron_jobs: number;
    php_versions: string;
    nodejs_support: boolean;
    python_support: boolean;
    ruby_support: boolean;
    opcache_enabled: boolean;
    redis_access: boolean;
    memcached_access: boolean;
    daily_backups: boolean;
    backup_retention_days: number;
    reseller_enabled: boolean;
    reseller_accounts: number;
    static_ip: boolean;
    stripe_price_id?: string;
    created_at: string;
    updated_at: string;
}
export interface UserAddon {
    id: number;
    user_id: number;
    product_id: number;
    quantity: number;
    notes: string | null;
    created_at: string;
    name: string;
    description: string;
    price_cents: number;
    billing_cycle: string;
    static_ip: boolean;
    disk_quota_mb: number;
    bandwidth_gb: number;
    email_accounts: number;
    databases_allowed: number;
    domains_allowed: number;
    ssh_access: boolean;
    daily_backups: boolean;
    redis_access: boolean;
    memcached_access: boolean;
}
export interface Invoice {
    id: number;
    user_id: number;
    product_id: number | null;
    stripe_invoice_id: string | null;
    amount_cents: number;
    status: 'open' | 'paid' | 'failed' | 'void' | 'draft';
    due_date: string | null;
    paid_at: string | null;
    notes: string | null;
    created_at: string;
}
export type CwpMigrationStatus = 'pending' | 'discovering' | 'ready' | 'migrating' | 'completed' | 'failed';
export interface CwpDiscoveredDnsRecord {
    name: string;
    type: string;
    content: string;
    ttl: number;
    priority?: number;
}
export interface CwpDiscoveredDomain {
    domain: string;
    document_root: string;
    php_version: string;
    has_ssl: boolean;
    disk_mb: number;
    dns_records: CwpDiscoveredDnsRecord[];
}
export interface CwpDiscoveredDatabase {
    db_name: string;
    db_user: string;
    size_mb: number;
}
export interface CwpDiscoveredEmail {
    email: string;
    domain: string;
    quota_mb: number;
}
export interface CwpDiscoveredUser {
    username: string;
    email: string;
    home_dir: string;
    disk_usage_mb: number;
    domains: CwpDiscoveredDomain[];
    databases: CwpDiscoveredDatabase[];
    email_accounts: CwpDiscoveredEmail[];
}
export interface CwpDiscoveryData {
    users: CwpDiscoveredUser[];
    discovered_at: string;
    remote_host: string;
}
export interface CwpMigrationProgress {
    users_total: number;
    users_done: number;
    current_user?: string;
    current_step?: string;
}
export interface CwpMigration {
    id: number;
    remote_host: string;
    remote_port: number;
    remote_user: string;
    status: CwpMigrationStatus;
    discovery_data: CwpDiscoveryData | null;
    selected_users: string[] | null;
    progress: CwpMigrationProgress;
    logs: string[];
    error_message: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}
//# sourceMappingURL=types.d.ts.map