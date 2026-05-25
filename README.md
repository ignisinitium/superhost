# Superhost: Modular Web Hosting & Billing Control Panel

Superhost is a modern, high-performance, and completely modular web hosting control panel designed for Linux servers. It provides a robust suite of tools for managing websites, databases, email, and security in a distributed, high-availability architecture.

## 🚀 Key Features

### 💻 System & Web Management
*   **Modular Architecture:** Entirely decoupled services (API, Worker, Dashboard).
*   **Nginx Engine:** Automated generation and management of virtual hosts with PHP-FPM integration (PHP 8.5+).
*   **1-Click App Installer:** Rapid deployment of WordPress with automated database and Nginx configuration.
*   **Resource Quotas:** Real-time tracking and enforcement of Disk and Bandwidth limits per user.
*   **Service Manager:** Web-based control for system daemons (Start/Stop/Restart/Autostart).

### 🔒 Advanced Security
*   **Identity Control:** Mandatory FIDO2 / WebAuthn passwordless authentication and TOTP 2FA.
*   **Brute-Force Protection:** Automated system-level IP blocking (UFW) for failed SSH and panel logins.
*   **Anti-Malware:** Integrated ClamAV scanning with a real-time quarantine dashboard.
*   **Email Security:** Automated generation of SPF, DKIM, and DMARC records for high deliverability.

### 📧 Email & Databases
*   **Mail Stack:** Full Postfix/Dovecot integration with virtual mailbox support.
*   **Webmail:** Roundcube integration for browser-based email access.
*   **Database Engine:** MariaDB management with isolated phpMyAdmin Single Sign-On (SSO).

### ☁️ Distributed Infrastructure
*   **HA Cluster:** Master-slave orchestration with automatic configuration synchronization across multiple edge nodes via secure SSH/rsync.
*   **Backup & Restore:** Full account snapshots (files + DB) with granular one-click restoration.
*   **Billing & Storefront:** Integrated Stripe payment gateway for hosting subscriptions and add-ons.

## 🛠 Technical Stack
*   **Frontend:** React (TypeScript), Tailwind CSS v4, Recharts.
*   **Backend:** Node.js (Express), PostgreSQL (Central Data), MariaDB (Client Data).
*   **Daemon:** Privileged Worker (Node.js) for system-level operations.

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
