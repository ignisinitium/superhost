#!/usr/bin/env bash
# Safely rotate the PostgreSQL 'superhost' password and refresh EVERY service
# that holds it — API, worker, Postfix maps, and ALL Dovecot SQL configs — so a
# rotation can never silently break mail auth again.
#
# Run as root from anywhere:   sudo bash worker/scripts/rotate-db-password.sh
set -euo pipefail

APP="${APP_DIR:-/home/jonathan/superhost}"
DATE="$(date +%F)"
NEWPW="$(openssl rand -hex 24)"

echo "==> Backing up .env files (dated, 0600)"
cp -p "$APP/api/.env"    "$APP/api/.env.backup-$DATE"
cp -p "$APP/worker/.env" "$APP/worker/.env.backup-$DATE"
chmod 600 "$APP/api/.env.backup-$DATE" "$APP/worker/.env.backup-$DATE"

echo "==> Rotating PostgreSQL password for role 'superhost'"
sudo -u postgres psql -c "ALTER ROLE superhost WITH PASSWORD '$NEWPW';"

echo "==> Updating api/.env and worker/.env"
sed -i "s|^DB_PASSWORD=.*|DB_PASSWORD=$NEWPW|" "$APP/api/.env" "$APP/worker/.env"

echo "==> Restarting API + worker to load the new password"
systemctl restart superhost-worker superhost-api
sleep 3

echo "==> Regenerating mail config (Postfix pgsql maps + all Dovecot SQL configs)"
PGPASSWORD="$NEWPW" psql -U superhost -d superhost -h localhost \
  -c "INSERT INTO tasks (command, payload) VALUES ('CONFIGURE_MAIL_SERVER', '{}');"
sleep 12

echo "==> Verifying"
PGPASSWORD="$NEWPW" psql -U superhost -d superhost -h localhost -tAc "SELECT 'db-ok';"
MBOX="$(PGPASSWORD="$NEWPW" psql -U superhost -d superhost -h localhost -tAc 'SELECT email FROM mail_users LIMIT 1' || true)"
if [ -n "$MBOX" ]; then
  doveadm user "$MBOX" >/dev/null 2>&1 && echo "dovecot-auth-ok" || echo "WARN: dovecot lookup failed — check /var/log/mail.log"
fi
echo "==> Rotation complete. New password is in $APP/{api,worker}/.env"
