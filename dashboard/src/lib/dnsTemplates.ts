// Record presets for the admin DNS editor. Each template collects a few inputs
// from the admin, then expands into a set of records that are applied in one
// batch via POST /admin/dns/zones/:id/records/bulk.

export interface TemplateRecord {
  name: string;
  type: string;
  content: string;
  priority: number | null;
  ttl: number | null;
}

export interface TemplateField {
  key: string;
  label: string;
  placeholder?: string;
  default?: string;
  hint?: string;
  optional?: boolean;
}

export interface DnsTemplate {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
  build: (vals: Record<string, string>, ctx: { domain: string }) => TemplateRecord[];
}

const DEFAULT_TTL = 3600;

export const DNS_TEMPLATES: DnsTemplate[] = [
  {
    id: 'basic-web',
    name: 'Basic website',
    description: 'Point the apex and www at a server IP (A records).',
    fields: [
      { key: 'ip', label: 'Server IPv4', placeholder: '203.0.113.10', hint: 'The IP this site should resolve to.' },
    ],
    build: (v) => [
      { name: '@', type: 'A', content: v.ip ?? '', priority: null, ttl: DEFAULT_TTL },
      { name: 'www', type: 'A', content: v.ip ?? '', priority: null, ttl: DEFAULT_TTL },
    ],
  },
  {
    id: 'google-workspace',
    name: 'Google Workspace email',
    description: 'Google MX records plus an SPF record authorizing Google to send mail.',
    fields: [],
    build: () => [
      { name: '@', type: 'MX', content: 'aspmx.l.google.com.', priority: 1, ttl: DEFAULT_TTL },
      { name: '@', type: 'MX', content: 'alt1.aspmx.l.google.com.', priority: 5, ttl: DEFAULT_TTL },
      { name: '@', type: 'MX', content: 'alt2.aspmx.l.google.com.', priority: 5, ttl: DEFAULT_TTL },
      { name: '@', type: 'MX', content: 'alt3.aspmx.l.google.com.', priority: 10, ttl: DEFAULT_TTL },
      { name: '@', type: 'MX', content: 'alt4.aspmx.l.google.com.', priority: 10, ttl: DEFAULT_TTL },
      { name: '@', type: 'TXT', content: 'v=spf1 include:_spf.google.com ~all', priority: null, ttl: DEFAULT_TTL },
    ],
  },
  {
    id: 'microsoft-365',
    name: 'Microsoft 365 email',
    description: 'Outlook/Exchange Online MX, autodiscover, SPF and DKIM selector records.',
    fields: [
      {
        key: 'tenant',
        label: 'Tenant domain (MX host prefix)',
        placeholder: 'example-com',
        hint: 'The part before “.mail.protection.outlook.com”. Usually your domain with dots as dashes.',
      },
    ],
    build: (v) => {
      const tenant = (v.tenant ?? '').replace(/\.mail\.protection\.outlook\.com\.?$/i, '');
      return [
        { name: '@', type: 'MX', content: `${tenant}.mail.protection.outlook.com.`, priority: 0, ttl: DEFAULT_TTL },
        { name: 'autodiscover', type: 'CNAME', content: 'autodiscover.outlook.com.', priority: null, ttl: DEFAULT_TTL },
        { name: '@', type: 'TXT', content: 'v=spf1 include:spf.protection.outlook.com -all', priority: null, ttl: DEFAULT_TTL },
        { name: 'selector1._domainkey', type: 'CNAME', content: `selector1-${tenant}._domainkey.outlook.com.`, priority: null, ttl: DEFAULT_TTL },
        { name: 'selector2._domainkey', type: 'CNAME', content: `selector2-${tenant}._domainkey.outlook.com.`, priority: null, ttl: DEFAULT_TTL },
      ];
    },
  },
  {
    id: 'spf',
    name: 'SPF record',
    description: 'A single SPF TXT record at the apex.',
    fields: [
      {
        key: 'value',
        label: 'SPF value',
        default: 'v=spf1 a mx ~all',
        placeholder: 'v=spf1 include:_spf.example.com ~all',
        hint: 'Use ~all (soft fail) or -all (hard fail).',
      },
    ],
    build: (v) => [
      { name: '@', type: 'TXT', content: v.value || 'v=spf1 a mx ~all', priority: null, ttl: DEFAULT_TTL },
    ],
  },
  {
    id: 'dmarc',
    name: 'DMARC policy',
    description: 'A _dmarc TXT record with a policy and aggregate-report address.',
    fields: [
      { key: 'policy', label: 'Policy (p=)', default: 'none', placeholder: 'none | quarantine | reject', hint: 'Start at none, then tighten.' },
      { key: 'rua', label: 'Aggregate report email', placeholder: 'dmarc@example.com', optional: true },
    ],
    build: (v, ctx) => {
      const policy = (v.policy || 'none').toLowerCase();
      const rua = (v.rua || '').trim();
      const ruaPart = rua ? `; rua=mailto:${rua}` : '';
      return [
        { name: '_dmarc', type: 'TXT', content: `v=DMARC1; p=${policy}${ruaPart}`, priority: null, ttl: DEFAULT_TTL },
      ].map((r) => ({ ...r, content: r.content.replace(/example\.com/g, ctx.domain) }));
    },
  },
  {
    id: 'verification',
    name: 'Domain verification (TXT)',
    description: 'A single TXT record for verifying domain ownership with a third party.',
    fields: [
      { key: 'name', label: 'Host', default: '@', placeholder: '@ or _acme-challenge' },
      { key: 'value', label: 'Verification value', placeholder: 'google-site-verification=…' },
    ],
    build: (v) => [
      { name: v.name || '@', type: 'TXT', content: v.value ?? '', priority: null, ttl: DEFAULT_TTL },
    ],
  },
];
