# SuperHost — Project Plan

## Overview

SuperHost is a self-hosted web hosting control panel for homelab and small-scale
hosting operators. It provides a single pane of glass to manage domains, DNS,
SSL, virtual hosts, databases, email, and customer billing across one or more
servers. The control panel itself is designed to run in a highly available
configuration so it never becomes a single point of failure.

---

## Architecture

### High-Level Topology

```
  Browser
     │
     ▼
┌─────────────┐      Redis (session / queue)
│  Panel (HA) │ ────────────────────────────
│  Node A     │      PostgreSQL (panel DB, HA)
│  Node B     │ ────────────────────────────
└──────┬──────┘
       │ HTTPS + mTLS
   ┌───┴────────────────────────┐
   │                            │
┌──▼──────┐             ┌──▼──────┐
│ Agent   │             │ Agent   │
│ Server 1│             │ Server 2│
│  Nginx  │             │  Nginx  │
│  MySQL  │             │  MySQL  │
│  PHP    │             │  PHP    │
│ Postfix │             │ Postfix │
│ Dovecot │             │ Dovecot │
└─────────┘             └─────────┘
```

### Key Decisions

| Concern | Decision | Rationale |
|---|---|---|
| Server control | Agent daemon on each managed server | Avoids SSH credential sprawl; enables async jobs and push health data |
| Panel ↔ Agent transport | REST over HTTPS with mutual TLS | Simple, auditable, works through NAT with cert pinning |
| Panel HA | Multiple panel nodes + shared PostgreSQL + Redis | Stateless app nodes; Redis for sessions and job queues |
| Web server | Nginx | Config generation is well-understood; templating is straightforward |
| Database engine | MySQL / MariaDB | Common in homelab; good tooling |
| DNS server | PowerDNS | REST API built-in; supports multiple backends |
| Mail stack | Postfix (SMTP) + Dovecot (IMAP) + Rspamd (spam) | Battle-tested stack; agent manages it |
| SSL | Let's Encrypt via certbot or acme.sh | Free, automated renewal |
| Frontend | React + TypeScript + Vite | Fast dev cycle; rich ecosystem |
| API | Node.js + Fastify + TypeScript | Fast, typed, works well in monorepo |
| Monorepo tooling | pnpm workspaces + Turborepo | Fast installs, incremental builds |

---

## Repository Layout

```
superhost/
├── apps/
│   ├── panel/          # Fastify API server (the control panel backend)
│   └── ui/             # React frontend (Vite)
├── agent/              # Lightweight Node.js daemon that runs on managed servers
├── packages/
│   ├── shared/         # Shared TypeScript types, validation schemas (Zod)
│   ├── agent-client/   # mTLS HTTP client used by the panel to talk to agents
│   ├── db/             # Drizzle ORM schema + migrations for panel PostgreSQL DB
│   └── config/         # Shared ESLint, tsconfig, prettier configs
├── infra/              # Deployment configs (Docker Compose, example systemd units)
├── docs/               # Architecture decision records (ADRs), user docs
├── REQUIREMENTS.md     # Full feature requirements
├── PLAN.md             # This file
└── PHASES.md           # Incremental build phases
```

---

## Non-Goals (v1)

- Kubernetes / container orchestration — this is for VM/bare-metal homelab servers
- Multi-datacenter replication of managed data (only the panel itself is HA)
- Windows server management
- Reseller / WHMCS-style multi-tier billing
- Built-in monitoring / alerting (Prometheus exporters are fine, but a full
  observability stack is out of scope for v1)
