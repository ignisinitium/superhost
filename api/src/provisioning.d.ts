/**
 * Provision a paid signup: create the hosting account and everything the
 * customer needs to start hosting + email. Idempotent — safe to call more than
 * once for the same signup (e.g. Stripe webhook retries).
 *
 * The API never runs shell commands; system work is delegated to the worker via
 * the tasks queue (CREATE_USER, CREATE_DOMAIN, GENERATE_EMAIL_DNS, ...).
 */
export declare function provisionSignupByToken(token: string): Promise<void>;
export declare function provisionSignupById(id: number): Promise<void>;
//# sourceMappingURL=provisioning.d.ts.map