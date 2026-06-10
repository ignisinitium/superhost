export declare const SENSITIVE_KEYS: Set<string>;
export declare function redactPayload(payload: unknown): unknown;
export declare function redactTask<T extends {
    payload?: unknown;
}>(row: T): T;
//# sourceMappingURL=redact.d.ts.map