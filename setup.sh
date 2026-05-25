#!/bin/bash

echo "🚀 Starting Secure Development Environment Setup..."

# Step 1: Initialize Git and Node if not already present
if [ ! -d ".git" ]; then
    echo "📦 Initializing Git repository..."
    git init
else
    echo "✅ Git repository already exists."
fi

if [ ! -f "package.json" ]; then
    echo "📦 Initializing package.json..."
    npm init -y > /dev/null 2>&1
fi

# Step 2: Create .gitignore and .env.local
echo "🔒 Creating .gitignore and protecting environment files..."
cat << 'EOF' > .gitignore
.env
.env.local
node_modules/
.DS_Store
EOF

cat << 'EOF' > .env.local
dbMasterAdmin=""
dbMasterPassword=""
dbHost="localhost"
dbPort="5432"
dbName="my_secure_db"
EOF

# Step 3: Set up the Git pre-commit hook
echo "🪝 Setting up Git pre-commit hook for leak prevention..."
mkdir -p .git/hooks

cat << 'EOF' > .git/hooks/pre-commit
#!/bin/sh

# 1. Block tracking of sensitive files
if git diff --cached --name-only | grep -E '\.env(\.local)?$' > /dev/null; then
    echo "❌ ERROR: You are trying to stage or commit an environment file (.env or .env.local)!"
    echo "Please remove it from the staging area using: git restore --staged <file>"
    exit 1
fi

# 2. Scan staged code for hardcoded master database keys
STAGED_FILES=$(git diff --cached --name-only)

for FILE in $STAGED_FILES; do
    # Skip checking deleted files
    if [ ! -f "$FILE" ]; then
        continue
    fi

    # Look for raw strings assigned to sensitive variable names
    if grep -E "dbMaster(Admin|Password)[[:space:]]*[:=][[:space:]]*[\"'][^\"' ]+[\"']" "$FILE" > /dev/null; then
        echo "❌ ERROR: Hardcoded master database credential detected in: $FILE"
        echo "Line matched a raw assignment to dbMasterAdmin or dbMasterPassword."
        echo "You must replace raw values with 'process.env.dbMasterAdmin' or 'process.env.dbMasterPassword' before committing."
        exit 1
    fi
done

exit 0
EOF

chmod +x .git/hooks/pre-commit

# Step 4: Generate the AI instructions markdown file
echo "🤖 Generating ai-instructions.md..."
cat << 'EOF' > ai-instructions.md
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
EOF

# Step 5: Stage the safe baseline files
echo "💾 Staging baseline configuration files..."
git add .gitignore ai-instructions.md package.json setup-env.sh

echo ""
echo "✅ Setup Complete!"
echo "Your environment is now locked down. Run the following command to save your baseline:"
echo '  git commit -m "chore: initial secure repository setup"'
