// Client-side DNS record validation for the admin/client DNS editors.
// Goal: catch obvious mistakes before they reach the worker/BIND, without being
// stricter than BIND itself (the worker auto-appends trailing dots, chunks TXT,
// etc.), so validation stays permissive where BIND is forgiving.

export type DnsFieldErrors = {
  name?: string;
  content?: string;
  priority?: string;
};

export interface RecordDraft {
  name: string;
  type: string;
  content: string;
  priority?: string | number | null;
  ttl?: string | number | null;
}

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function isIPv4(value: string): boolean {
  const m = IPV4_RE.exec(value.trim());
  if (!m) return false;
  return m.slice(1).every((o) => {
    const n = Number(o);
    return n >= 0 && n <= 255 && String(n) === String(Number(o));
  });
}

// Pragmatic IPv6 check: accepts the common forms including :: compression and
// embedded IPv4. Not a full RFC grammar, but rejects clearly-bad input.
export function isIPv6(value: string): boolean {
  const v = value.trim();
  if (!v.includes(':')) return false;
  if ((v.match(/::/g) ?? []).length > 1) return false;
  const groups = v.split(':');
  if (groups.length > 8) return false;
  // Allow an embedded IPv4 in the final group (e.g. ::ffff:1.2.3.4)
  const last = groups[groups.length - 1] ?? '';
  const hasV4 = last.includes('.');
  if (hasV4 && !isIPv4(last)) return false;
  return groups.every((g, i) => {
    if (g === '') return true; // from :: compression or leading/trailing :
    if (i === groups.length - 1 && hasV4) return true;
    return /^[0-9a-fA-F]{1,4}$/.test(g);
  });
}

// Hostname / FQDN. Accepts an optional trailing dot and the '@' apex shorthand.
export function isHostname(value: string): boolean {
  let v = value.trim();
  if (v === '' || v === '@') return false;
  if (v.endsWith('.')) v = v.slice(0, -1);
  if (v.length > 253) return false;
  const labels = v.split('.');
  return labels.every((l) => /^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)$/.test(l));
}

// A record *name* (left-hand side): '@', a label, an underscore-prefixed label
// (_dmarc, _domainkey, SRV service labels), or a multi-label subdomain.
function isValidRecordName(value: string): boolean {
  const v = value.trim();
  if (v === '@' || v === '') return true;
  if (v === '*') return true;
  let host = v;
  if (host.startsWith('*.')) host = host.slice(2);
  if (host.endsWith('.')) host = host.slice(0, -1);
  return host.split('.').every((l) => /^(?!-)[A-Za-z0-9_-]{1,63}(?<!-)$/.test(l));
}

export function validateRecord(draft: RecordDraft): DnsFieldErrors {
  const errors: DnsFieldErrors = {};
  const type = (draft.type || '').toUpperCase();
  const content = (draft.content ?? '').trim();

  // Name
  if (!isValidRecordName(draft.name ?? '')) {
    errors.name = 'Use “@”, a hostname label, or a subdomain (letters, digits, “-”, “_”).';
  }

  // Content (per type)
  if (content === '') {
    errors.content = 'Value is required.';
  } else {
    switch (type) {
      case 'A':
        if (!isIPv4(content)) errors.content = 'Must be a valid IPv4 address, e.g. 203.0.113.10.';
        break;
      case 'AAAA':
        if (!isIPv6(content)) errors.content = 'Must be a valid IPv6 address, e.g. 2001:db8::1.';
        break;
      case 'CNAME':
      case 'NS':
      case 'MX':
        if (!isHostname(content)) errors.content = 'Must be a hostname, e.g. mail.example.com (a trailing dot is fine).';
        break;
      case 'TXT': {
        // BIND splits long strings into 255-byte chunks automatically, so a long
        // value is only a soft concern; flag truly excessive content.
        const bytes = new TextEncoder().encode(content).length;
        if (bytes > 4096) errors.content = `TXT value is very long (${bytes} bytes); most resolvers cap around 4096.`;
        break;
      }
      case 'SRV': {
        // SRV content here is "weight port target" (priority is a separate field).
        const parts = content.split(/\s+/);
        if (parts.length !== 3) {
          errors.content = 'SRV value must be “weight port target”, e.g. 5 5060 sip.example.com.';
        } else {
          const [weight, port, target] = parts;
          if (!/^\d+$/.test(weight!) || Number(weight) > 65535) errors.content = 'SRV weight must be 0–65535.';
          else if (!/^\d+$/.test(port!) || Number(port) < 1 || Number(port) > 65535) errors.content = 'SRV port must be 1–65535.';
          else if (!isHostname(target!)) errors.content = 'SRV target must be a hostname.';
        }
        break;
      }
      case 'CAA': {
        // "flags tag value", e.g. 0 issue "letsencrypt.org"
        const m = /^(\d+)\s+(issue|issuewild|iodef)\s+(.+)$/.exec(content);
        if (!m) errors.content = 'CAA value must be “flags tag value”, e.g. 0 issue "letsencrypt.org".';
        else if (Number(m[1]) > 255) errors.content = 'CAA flags must be 0–255.';
        break;
      }
      default:
        break;
    }
  }

  // Priority (MX / SRV)
  if (type === 'MX' || type === 'SRV') {
    const p = draft.priority;
    const n = typeof p === 'number' ? p : Number(String(p ?? '').trim());
    if (p === null || p === undefined || String(p).trim() === '' || !Number.isInteger(n) || n < 0 || n > 65535) {
      errors.priority = 'Priority must be an integer 0–65535.';
    }
  }

  return errors;
}

export function hasErrors(errors: DnsFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}
