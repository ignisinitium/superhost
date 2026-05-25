# Superhost Project Todo & Master Roadmap

This document tracks the implementation of the "Functional Specification: Modular Web Hosting & Billing Control Panel".

## Phase 1-3: Core, System & Migrations (Completed)
- [x] **API & Worker Architecture**: Headless API and privileged system daemon.
- [x] **Authentication**: JWT, Admin TOTP 2FA, and Client Login.
- [x] **Web Server & SSL**: NGINX server block generation, PHP version selector, Certbot Let's Encrypt integration.
- [x] **System Management**: Basic Firewall (UFW wrapper) and Process Monitoring.
- [x] **Importers**: cPanel and CWP migration parsers, automated file sync.
- [x] **Client Dashboard Data**: Routing and domain mapping for clients.

## Phase 4: Limits & Advanced System Management (Active)
- [x] **Resource Limits & Quotas**: Track and enforce maximum disk space, databases, email accounts, and domains per user. (Admin can now adjust these via Settings).
- [x] **Bandwidth & Throughput**: Real-time bandwidth monitoring and network throughput speed limits (cgroups/NGINX traffic shaping).
- [x] **Advanced Auth**: FIDO2 / WebAuthn passwordless/two-factor auth for administrative accounts.
- [x] **Advanced Process Manager**: API/Worker support to filter by user and safely issue `SIGTERM`/`SIGKILL` to user-owned processes.
- [x] **Log Viewer**: Live streaming and historical viewer for system, NGINX, PHP-FPM, mail, and security logs.
- [x] **Virtual Networking**: Dynamically add virtual ethernet adapters, configure subnets/routing, attach public IPs to virtual hosts.

## Phase 5: Database & Applications
- [x] **Database Engine**: Create, delete, and manage MySQL/MariaDB databases and users via API/Worker.
- [x] **phpMyAdmin Integration**: Secure SSO routing into isolated phpMyAdmin instances per user account.
- [x] **App Installer**: 1-Click WordPress installer (core download, db creation, `wp-config.php`, file permissions).

## Phase 6: Email & Security
- [x] **Mail Stack**: Modular configuration for Postfix (SMTP) and Dovecot (IMAP/POP3).
- [x] **Webmail**: Roundcube deployment and auto-mapping to user mailboxes.
- [x] **DNS & Email Security**: Automated generation of SPF, DKIM, and DMARC records.
- [x] **Anti-Malware**: ClamAV scheduled/on-demand scanning and real-time quarantine dashboard.

## Phase 7: Billing & Storefront
- [x] **Stripe Integration**: Payment gateway for setup fees and recurring subscriptions.
- [x] **Billing Interface**: Client front-end for historical invoices, PDFs, payment methods, and cancellations.
- [x] **Service Ordering Storefront**: Funnel to order standalone email, webspace slots, or public IPs.

## Phase 8: Backups, HA, & UI Theming
- [x] **Backup Engine**: Snapshot generation (files, configs, mailboxes, DB dumps).
- [x] **Restore Engine**: Granular restoration (individual files, full DB, full roll-back).
- [x] **Performance Dashboards**: Visual graphs for historical CPU, RAM, Disk I/O, and Network traffic.
- [x] **Theme Engine**: Decoupled UI layer for custom CSS or Vue/React layout installation.
- [x] **High Availability & Cluster**: Multi-server sync (edge nodes), HAProxy/NGINX load balancing, Galera/MySQL replication, GlusterFS/Lsyncd sync.
