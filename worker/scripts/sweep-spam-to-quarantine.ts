/**
 * One-off: sweep already-delivered spam out of users' INBOXes into Quarantine.
 *
 * Background: a Pigeonhole 2.4 `sieve_extensions` syntax change meant every
 * per-mailbox sieve script failed to compile for a period, so spam SpamAssassin
 * had scored was delivered to the inbox instead of being filed into Quarantine.
 * The config is fixed going forward; this backfills the messages that slipped
 * through, using the same X-Spam-Level threshold each mailbox's sieve rule uses.
 *
 * Run as root from worker/:  sudo node_modules/.bin/tsx scripts/sweep-spam-to-quarantine.ts
 * Add --dry-run to only count, moving nothing.
 */
import { Client } from 'pg';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import 'dotenv/config';

const execp = promisify(exec);
const DRY = process.argv.includes('--dry-run');

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

async function main() {
  const c = new Client({
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
  });
  await c.connect();

  // Only mailboxes whose sieve would have quarantined on score.
  const { rows } = await c.query<{
    email: string;
    spam_score_threshold: number | null;
  }>(`
    SELECT email, spam_score_threshold
    FROM mail_users
    WHERE spam_filter_enabled = true
      AND COALESCE(spam_action, 'quarantine') = 'quarantine'
    ORDER BY email
  `);
  await c.end();

  console.log(`${DRY ? '[DRY RUN] ' : ''}Mailboxes to sweep: ${rows.length}\n`);

  let totalMoved = 0;
  let totalMatched = 0;
  const errors: string[] = [];

  for (const mb of rows) {
    // Same threshold→stars mapping as buildSieveScript(): N stars = score >= N.
    const stars = Math.max(1, Math.min(40, Math.round(Number(mb.spam_score_threshold) || 5)));
    const pattern = '*'.repeat(stars);
    // Scope to INBOX; match X-Spam-Level header containing >= N consecutive stars.
    const query = `mailbox INBOX HEADER X-Spam-Level ${shq(pattern)}`;
    const u = shq(mb.email);

    try {
      // Count first (one line per matching message: "<guid> <uid>").
      const { stdout: searchOut } = await execp(
        `doveadm search -u ${u} ${query}`,
      ).catch((e) => ({ stdout: '', _err: e } as any));
      const matched = searchOut.split('\n').filter((l: string) => l.trim()).length;
      totalMatched += matched;

      if (matched === 0) {
        continue;
      }

      if (!DRY) {
        await execp(`doveadm move -u ${u} Quarantine ${query}`);
        totalMoved += matched;
      }
      console.log(`${DRY ? 'would move' : 'moved'} ${matched.toString().padStart(4)}  ${mb.email}  (>=${stars} stars)`);
    } catch (e) {
      const msg = (e as Error).message.split('\n')[0];
      errors.push(`${mb.email}: ${msg}`);
      console.error(`  ERROR ${mb.email}: ${msg}`);
    }
  }

  console.log(`\n${DRY ? 'Matched' : 'Moved'} ${DRY ? totalMatched : totalMoved} message(s) across ${rows.length} mailboxes.`);
  if (errors.length) {
    console.log(`\n${errors.length} mailbox error(s):`);
    for (const e of errors) console.log(`  ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
