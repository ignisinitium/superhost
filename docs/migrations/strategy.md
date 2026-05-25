# Superhost Migration Strategy

## cPanel (cpmove)
1. **Extraction:** Extract the `cpmove-USER.tar.gz` archive.
2. **Metadata:** Parse `cpbackup-metadata.json` or `userdata/` folder to find domains, subdomains, and DB names.
3. **User Creation:** Use Superhost API/Worker to create the Linux user.
4. **Data Sync:** Move `homedir/public_html` contents to the new user's home.
5. **Database:** Identify `.sql` dumps in the backup, create PostgreSQL/MySQL databases, and import data.
6. **Config:** Re-generate Nginx vhosts based on parsed domains.

## CWP (Control Web Panel)
1. **Extraction:** Extract CWP backup.
2. **Parsing:** Parse `/etc/httpd/conf.d/vhosts/USER.conf` (if available in backup) or CWP metadata files.
3. **Replication:** Similar to cPanel, recreate users and move web files.

## Automated Importer (Phase 5)
A Node.js script `api/src/scripts/migrate.ts` will take a path to a backup file, detect the format, and push tasks to the Superhost Worker to perform the migration steps.
