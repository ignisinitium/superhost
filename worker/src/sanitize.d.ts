/**
 * sanitize.ts — Input validation and shell-escaping utilities for the Worker
 *
 * ALL user-supplied values must pass through a validation function here before
 * being used in execPromise() calls. The worker runs as root; a single unsanitized
 * variable is a full system compromise.
 */
/**
 * Wraps a string in single quotes and escapes any embedded single quotes.
 * Use this when you MUST interpolate a value into a shell command string.
 * Prefer execFile() with argument arrays wherever possible.
 */
export declare function shellEscape(value: string): string;
export declare function validateDomainName(name: unknown): string;
export declare function validateUsername(name: unknown): string;
export declare function validateIpAddress(ip: unknown): string;
export declare function validatePort(port: unknown): number;
export declare function validateProtocol(proto: unknown): string;
export declare function validateRuleNumber(n: unknown): number;
export declare function validateServiceName(service: unknown): string;
export declare function validateServiceAction(action: unknown): string;
export declare function validatePm2Action(action: unknown): string;
export declare function validateBranchName(branch: unknown): string;
export declare function validateRepoUrl(url: unknown): string;
export declare function validateSignal(signal: unknown): string;
export declare function validatePid(pid: unknown): number;
/**
 * Validates that a path stays within the allowed base directory.
 * Uses fs.realpath to resolve symlinks, so symlink-based escapes are caught.
 * Returns the resolved absolute path on success.
 */
export declare function validatePath(inputPath: unknown, baseDir: string): Promise<string>;
/**
 * Synchronously validates a path string does not traverse above baseDir.
 * Does NOT follow symlinks — use validatePath (async) for read operations.
 */
export declare function validatePathSync(inputPath: unknown, baseDir: string): string;
export declare function validateEmailLocalPart(local: unknown): string;
export declare function validateMysqlIdentifier(name: unknown, label?: string): string;
export declare function validateInterfaceName(iface: unknown): string;
export declare function validateWebhookUrl(url: unknown): string;
/** Validates a single cron time field (minute, hour, day, month, weekday). Allows * and numeric ranges. */
export declare function validateCronField(field: unknown, label: string): string;
/**
 * Validates a cron command. Rejects shell metacharacters that would allow injection.
 * Allows absolute paths and common operators like redirects used in logging.
 */
export declare function validateCronCommand(command: unknown): string;
export declare function validateLineCount(lines: unknown, max?: number): number;
export declare function validatePhpVersion(version: unknown): string;
export declare function validateDnsType(type: unknown): string;
export declare const SENSITIVE_KEYS: Set<string>;
export declare function redactPayload(payload: unknown): unknown;
//# sourceMappingURL=sanitize.d.ts.map