#!/usr/bin/env bash
# Re-apply the Quantum Creations branding to the shared Roundcube (Elastic skin).
# Idempotent — safe to run after a Roundcube package upgrade overwrites the skin.
#
#   sudo bash worker/scripts/brand-webmail.sh
#
# What it does:
#   1. Recolors the Elastic Less palette to brand violet (#7c3aed) and recompiles
#      styles.min.css (full recolor — no per-selector overrides).
#   2. Installs the Quantum Creations logo lockup (worker/assets/webmail-logo.svg).
#   3. Installs the qc.fyi favicon.
# The product_name ("Quantum Creations Webmail") lives in Roundcube's
# config/config.inc.php and is not touched here.
set -euo pipefail

RC=/var/www/roundcube
SKIN=$RC/skins/elastic
SRC="$(cd "$(dirname "$0")/.." && pwd)"   # worker/
VIOLET="#7c3aed"

[ -d "$SKIN/styles" ] || { echo "Elastic skin not found at $SKIN"; exit 1; }

echo "==> Backing up originals (once)"
for f in styles/styles.min.css styles/colors.less images/logo.svg images/favicon.ico; do
  [ -e "$SKIN/$f" ] && [ ! -e "$SKIN/$f.preqc.bak" ] && cp -a "$SKIN/$f" "$SKIN/$f.preqc.bak" || true
done

echo "==> Recoloring palette to $VIOLET"
perl -0777 -pi -e "
  s/\@color-main:\s*#[0-9a-fA-F]{3,6};/\@color-main:                $VIOLET;/;
  s/\@color-main-dark:\s*darken\(\@color-main,\s*\d+%\);/\@color-main-dark:           darken(\@color-main, 20%);/;
  s/\@color-link:\s*#[0-9a-fA-F]{3,6};/\@color-link:                $VIOLET;/;
  s/\@color-link-hover:\s*darken\(\@color-link,\s*\d+%\);/\@color-link-hover:          darken(\@color-link, 12%);/;
" "$SKIN/styles/colors.less"

echo "==> Recompiling styles.min.css"
command -v lessc >/dev/null 2>&1 || npm install -g less >/dev/null 2>&1
( cd "$SKIN/styles" && lessc --rewrite-urls=all --compress styles.less /tmp/qc-styles.min.css )
grep -q "37beff" /tmp/qc-styles.min.css && echo "WARNING: old cyan still present" || true
cp /tmp/qc-styles.min.css "$SKIN/styles/styles.min.css"

echo "==> Installing logo + favicon"
cp "$SRC/assets/webmail-logo.svg" "$SKIN/images/logo.svg"
[ -f "$SRC/../dashboard/public/favicon.ico" ] && cp "$SRC/../dashboard/public/favicon.ico" "$SKIN/images/favicon.ico"
[ -f "$SRC/../dashboard/public/favicon.svg" ] && cp "$SRC/../dashboard/public/favicon.svg" "$SKIN/images/favicon.svg"

chown -R www-data:www-data "$SKIN/styles/styles.min.css" "$SKIN/images/logo.svg" "$SKIN/images/favicon.ico" "$SKIN/images/favicon.svg" 2>/dev/null || true
echo "==> Done. Roundcube cache-busts CSS by mtime, so a reload picks it up."
