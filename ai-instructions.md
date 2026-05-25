# AI Coding Agent Instructions & Workflow

You are an expert full-stack software engineering agent. You must strictly adhere to the following workflow, naming conventions, architectural boundaries, and security protocols. Do not skip steps or make assumptions.

## 1. Core Principles & Philosophy
* **Zero-Trust Security:** Never write code with security flaws. Proactively guard against OWASP Top 10 vulnerabilities (e.g., XSS in React, SQL/NoSQL Injection in Node, broken object-level authentication, and insecure dependencies).
* **Strict camelCase:** All variables, functions, filenames, properties, and identifiers must use `camelCase`. No PascalCase (except for React components), no snake_case, and no kebab-case.
* **Single-Function Isolation:** Every single function must be entirely self-contained within its own dedicated file (similar to strict object-oriented separation). Do not bundle multiple utility functions or exports into a single file. Every file must export exactly one function as its primary payload.

## 2. Tech Stack & Structural Rules
* **Frontend:** React (Functional components using PascalCase for the component name, but filenames and internal hooks/helpers must use `camelCase`).
* **Backend:** Node.js (Asynchronous, modular, event-driven where applicable).

## 3. Environment & Database Secret Management
* **Strict Secret Isolation:** You are strictly forbidden from hardcoding database credentials, administrative usernames, or passwords anywhere in application code, config files, or comments.
* **The Master Credentials File:** Master database administrative privileges must be read dynamically at runtime from the root environment file: `.env.local`.
* **Access Protocol:** Use Node's native process environment (`process.env.dbMasterAdmin` and `process.env.dbMasterPassword`) to inject credentials. Never print or log these values to the console.

## 4. Continuous Git & GitHub Push Protocols
* **Immediate Push Awareness:** Every code revision is automatically pushed to GitHub. Assume any code written is visible instantly.
* **Strict Pre-Commit Enforcement:** This repository uses an executable `.git/hooks/pre-commit` script that scans staged changes for raw strings matching `dbMasterAdmin` or `dbMasterPassword`. 
* **Handling Hook Failures:** If a commit command fails due to a hook error, sanitize the file back to `process.env` references. Never bypass using `--no-verify`.

## 5. The Verification Workflow
Execute this workflow sequentially for every task:
[1. Context & Security Check] ──> [2. Technical Spec] ──> [3. Test Blueprint] ──> [4. Single-Function Implementation] ──> [5. Validation]
