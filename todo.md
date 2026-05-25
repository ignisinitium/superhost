# Superhost Project Todo & Master Roadmap

This document tracks the implementation of the "Functional Specification: Modular Web Hosting & Billing Control Panel" and the "Superhost Elite" feature set.

## Phase 1-3: Core, System & Migrations (Completed)
- [x] **API & Worker Architecture**: Headless API and privileged system daemon.
- [x] **Authentication**: JWT, Admin TOTP 2FA, and Client Login.
- [x] **Web Server & SSL**: NGINX server block generation, PHP version selector, Certbot Let's Encrypt integration.
- [x] **System Management**: Basic Firewall (UFW wrapper) and Process Monitoring.
- [x] **Importers**: cPanel and CWP migration parsers, automated file sync.
- [x] **Client Dashboard Data**: Routing and domain mapping for clients.

## Phase 4-6: Advanced Management, DB & Email (Completed)
- [x] **Resource Limits & Quotas**: Track and enforce maximum disk space, databases, email accounts, and domains per user.
- [x] **Bandwidth & Throughput**: Real-time monitoring and NGINX traffic shaping.
- [x] **Advanced Auth**: FIDO2 / WebAuthn passwordless/two-factor auth for administrative accounts.
- [x] **Advanced Process Manager**: Filter by user and safely issue signals to user-owned processes.
- [x] **Log Viewer**: Live streaming and historical viewer for system and service logs.
- [x] **Virtual Networking**: Dynamically add virtual ethernet adapters and assign public IPs.
- [x] **Service Management**: Control system daemons and autostart settings.
- [x] **Server Updates**: Monitor and install system updates (APT), and configure automated patching.
- [x] **Database Engine**: Manage MySQL/MariaDB databases and users.
- [x] **phpMyAdmin Integration**: Secure SSO routing into isolated instances.
- [x] **App Installer**: 1-Click WordPress installer.
- [x] **Mail Stack**: Postfix/Dovecot configuration with virtual mailboxes.
- [x] **Webmail**: Roundcube deployment.
- [x] **DNS & Email Security**: Automated SPF, DKIM, and DMARC generation.
- [x] **Anti-Malware**: ClamAV scanning and quarantine dashboard.

## Phase 7: Billing & Storefront (Completed)
- [x] **Stripe Integration**: Payment gateway for hosting subscriptions.
- [x] **Billing Interface**: Client front-end for invoices and payments.
- [x] **Service Ordering Storefront**: Funnel to order standalone email, webspace, or IPs.
- [x] **Global Database Manager**: Master view of all server databases for admins.

## Phase 8: Backups, HA, & UI (Completed)
- [x] **Backup Engine**: Full account snapshots (files + DB dumps).
- [x] **Restore Engine**: Granular restoration from snapshots.
- [x] **Performance Dashboards**: Visual graphs for historical server metrics.
- [x] **Theme Engine**: Dynamic UI layer with customizable CSS variables.
- [x] **High Availability & Cluster**: Multi-server sync and health monitoring.

## Phase 9: Superhost Elite (Active)
- [x] **Web-Based File Manager**: Sleek React-based explorer to manage, zip, and edit files in the browser.
- [ ] **Advanced App Runtimes**: Manager for Node.js, Python, and Ruby applications.
- [ ] **Git Auto-Deployment**: Webhook-based updates from GitHub/GitLab repositories.
- [ ] **Cron Job Manager**: Visual interface to schedule recurring system and user tasks.
- [ ] **FTP / SFTP Accounts**: Manage isolated file upload accounts.
- [ ] **DNS Zone Manager**: Host and manage local name servers (Bind/PowerDNS).
- [ ] **Email Advanced Features**: Forwarders, Auto-responders, and SpamAssassin integration.
- [ ] **Enterprise Monitoring**: Slack/Telegram alerts for server health and detailed traffic analytics.
- [ ] **White-Label & Reseller Support**: Reseller tiers and API key management.
