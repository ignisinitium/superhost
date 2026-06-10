#!/usr/bin/env python3
"""Postfix pipe content-filter for the mail-relay (spam filter) gateway.

Invoked by Postfix ONLY for relay domains (transport_maps → relayfilter:), so it
never touches hosted mail. For each message it:
  * reads the per-domain config from /etc/postfix/relay-dest/<domain>
    (format: "<dest_host> <dest_port> <spam_threshold>")
  * computes a spam score from the X-Spam-Status / X-Spam-Level headers that
    SpamAssassin already added upstream
  * spam (score >= threshold)  -> written to /var/mail/relay-quarantine/<domain>/new/
    (a worker scan indexes it; release re-delivers it later)
  * clean                      -> delivered onward to the customer's real server

Exit codes follow Postfix conventions: 0 = done, 75 (EX_TEMPFAIL) = retry later.
Stdlib only (no third-party deps), runs as the unprivileged 'vmail' user.
"""
import sys, os, re, time, email, smtplib, hashlib

EX_TEMPFAIL = 75
DEST_DIR = '/etc/postfix/relay-dest'
QUAR_BASE = '/var/mail/relay-quarantine'


def spam_score(msg):
    m = re.search(r'score=(-?\d+(?:\.\d+)?)', msg.get('X-Spam-Status', '') or '')
    if m:
        return float(m.group(1))
    return float((msg.get('X-Spam-Level', '') or '').count('*'))


def main():
    # argv: <sender> <recipient> [<recipient> ...]
    if len(sys.argv) < 3:
        sys.exit(EX_TEMPFAIL)
    sender = sys.argv[1]
    recipients = sys.argv[2:]
    raw = sys.stdin.buffer.read()
    msg = email.message_from_bytes(raw)
    score = spam_score(msg)

    # Group recipients by their relay domain's destination config.
    for rcpt in recipients:
        domain = rcpt.rsplit('@', 1)[-1].lower()
        try:
            with open(os.path.join(DEST_DIR, domain)) as f:
                dest_host, dest_port, threshold = f.read().split()
            dest_port = int(dest_port)
            threshold = float(threshold)
        except Exception:
            sys.exit(EX_TEMPFAIL)  # config not ready / unknown domain → retry

        if score >= threshold:
            qdir = os.path.join(QUAR_BASE, domain, 'new')
            os.makedirs(qdir, exist_ok=True)
            uniq = '%d.%s' % (int(time.time() * 1000),
                              hashlib.sha1(raw[:256] + rcpt.encode()).hexdigest()[:12])
            with open(os.path.join(qdir, uniq + '.eml'), 'wb') as f:
                f.write(raw)
            with open(os.path.join(qdir, uniq + '.meta'), 'w') as f:
                f.write('recipient=%s\nsender=%s\nscore=%.1f\n' % (rcpt, sender, score))
        else:
            try:
                s = smtplib.SMTP(dest_host, dest_port, timeout=30)
                try:
                    s.sendmail(sender, [rcpt], raw)
                finally:
                    s.quit()
            except Exception:
                sys.exit(EX_TEMPFAIL)  # destination unreachable → Postfix retries

    sys.exit(0)


if __name__ == '__main__':
    main()
