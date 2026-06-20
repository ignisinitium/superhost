# Superhost: Modular Web Hosting & Billing Control Panel

Superhost is a modern, high-performance, and completely modular web hosting control panel designed for Linux servers. It provides a robust suite of tools for managing websites, DNS, SSL, databases, email, and security in a distributed, high-availability architecture.

The platform is built on a decoupled **task-queue architecture**: a user-facing API enqueues jobs, and a privileged root worker executes every system-level operation (shell, file writes, service restarts) — so the API never touches the filesystem directly.

## 🚀 Key Features

### 💻 System & Web Management
*   **Modular Architecture:** Entirely decoupled services — API, privileged Worker, and React dashboard — communicating through a PostgreSQL task queue.
*   **Nginx Engine:** Automated generation and management of virtual hosts with PHP-FPM integration across multiple PHP versions.
*   **1-Click App Installer:** Rapid WordPress deployment with automated database and Nginx configuration, plus managed app runtimes and custom-port reverse-proxy wiring.
*   **File Manager:** Browser-based file management for client accounts.
*   **Resource Quotas:** Real-time tracking and enforcement of disk and bandwidth limits per user, gated by hosting packages (with unlimited tiers).
*   **Service Manager:** Web-based control for system daemons (start/stop/restart/autostart), live process viewer, and log streaming.

### 🌐 DNS Management
*   **Authoritative + Recursive BIND:** Serves zones for every hosted domain while also acting as the server's local caching resolver.
*   **Full-Featured Zone Editor:** Create and manage zones and records (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA) for every account, grouped by type with copy-to-clipboard and per-type hints.
*   **Record Presets / Templates:** One-click setups for Google Workspace, Microsoft 365, SPF, DMARC, basic websites, and domain-verification TXT records — with a live preview before applying.
*   **Client-Side Validation:** Inline validation of IPv4/IPv6, hostnames, SRV/CAA structure, TXT length, and priority before records are saved.
*   **Sync Status & History:** Per-zone indication of whether the last BIND sync succeeded or failed, surfacing the exact `named-checkzone` error when it doesn't.
*   **Nameserver Management:** Configure the platform's authoritative nameservers and glue.

### 🔐 SSL / TLS Certificates
*   **Centralized Certificate Manager:** Inventory of every Let's Encrypt certificate across all accounts, read directly from disk — covered domains (SANs), issuer, owner, and expiry.
*   **Health at a Glance:** Each certificate is flagged Valid / Expiring (≤30 days) / Expired with day-level countdowns and at-a-glance summary counts.
*   **Issue & Reissue:** One-click issuance for any domain lacking a valid certificate, plus forced reissue (`--force-renewal`) of existing certificates.
*   **Automatic Renewal:** A daily `certbot renew` job and hourly inventory refresh keep certificates current and the dashboard accurate — no manual intervention required.

### 🔒 Advanced Security
*   **Identity Control:** FIDO2 / WebAuthn passwordless passkeys and TOTP 2FA for both admin and client accounts.
*   **Brute-Force Protection:** Automated system-level IP blocking (UFW) for failed SSH and panel logins, with a managed firewall interface.
*   **Anti-Malware:** Integrated ClamAV scanning with a real-time quarantine dashboard.
*   **Audit Log:** Tamper-evident record of privileged actions across the platform.
*   **Account Isolation:** Per-user resource scoping, prefixed database names, and home-directory ACLs that keep the panel operator's access intact without exposing tenants to each other.

### 📧 Email & Anti-Spam
*   **Mail Stack:** Full Postfix/Dovecot integration with virtual mailboxes, LMTP/LDA Sieve filtering, and SNI certificate selection.
*   **Deliverability:** Automated generation of SPF, DKIM, and DMARC records, plus autodiscover/autoconfig for mail clients.
*   **Spam Defense:** postscreen, Pyzor/Razor, RBLs, and a continuously self-training Bayesian classifier (learning spam from quarantine and ham from sent/released mail).
*   **Quarantine & Digests:** Browser-managed quarantine with retention enforcement, a daily spam digest, and a per-message mail activity feed (delivered / quarantined / blocked / virus).
*   **Relay Gateway:** Inbound spam filtering for external-mail customers with its own quarantine.
*   **Webmail:** Roundcube integration for browser-based email access.

### 🗄️ Databases
*   **Database Engine:** MariaDB management with per-user isolation and isolated phpMyAdmin Single Sign-On (SSO).
*   **Credential Management:** Create databases and users, rotate passwords, and enforce package limits.

### 🧰 Developer Tools
*   **Git Deploy:** Push-to-deploy workflows for client sites.
*   **Cron Jobs:** Managed scheduled tasks per account.
*   **FTP Manager:** FTP account provisioning scoped to user home directories.

### ☁️ Distributed Infrastructure
*   **HA Cluster:** Master-slave orchestration with automatic configuration synchronization across multiple edge nodes via secure SSH/rsync.
*   **Backup & Restore:** Full account snapshots (files + DB) with granular one-click restoration.
*   **Server Migration:** Import accounts from CWP and perform full-stack site migrations between servers, with discovery, transfer, and post-migration cleanup.
*   **Monitoring:** Real-time CPU, memory, disk, and traffic metrics with historical charts.

### 💳 Billing & Multi-Tenancy
*   **Billing & Storefront:** Integrated Stripe payment gateway for hosting subscriptions and add-ons.
*   **Hosting Packages:** Definable resource tiers with per-feature caps.
*   **Resellers:** Delegated administration with scoped capabilities.
*   **White-Label Branding:** Customizable panel branding and a theme engine.
*   **Account Lifecycle:** Soft-delete archive with full snapshot (domains, databases, DNS zones, mailboxes) and one-click restore or permanent purge.

## 🛠 Technical Stack
*   **Frontend:** React 19 (TypeScript), React Router 7, TanStack Query v5, Tailwind CSS v4, Recharts, Lucide.
*   **Backend:** Node.js (Express 5), PostgreSQL (central data), MariaDB (client data), JWT auth, Stripe.
*   **Daemon:** Privileged Worker (Node.js) executing all system-level operations via a polled task queue.
*   **System Integration:** Nginx, PHP-FPM, BIND9, Postfix/Dovecot, Certbot, ClamAV, UFW.

---

## 📄 License & Terms

**Superhost is Open Source but carries custom licensing terms:**

1.  **Non-Commercial Use:** The software is free for personal, educational, and non-commercial use.
2.  **Commercial Use:** Corporations, businesses, and individuals using Superhost for commercial purposes (including reselling hosting or internal business use) must purchase a subscription license.
3.  **Ownership:** All code and intellectual property remain the property of the author.

**For commercial licensing inquiries or support, please contact:**
📩 **ignisinitium@icloud.com**

---
© 2026 Superhost. Developed with passion for the modern web.
