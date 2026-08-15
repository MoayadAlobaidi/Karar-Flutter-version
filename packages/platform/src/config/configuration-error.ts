import type { FieldIssue } from './schema.js';

/**
 * Thrown by `loadConfig` when configuration is missing or malformed. Startup
 * MUST fail on it (environments.md §7 — a missing or malformed value fails
 * startup; a silent fallback is a configuration change nobody made).
 *
 * The message lists FIELD NAMES, their environment variables, and the violated
 * rule — never the offending values. It is safe to print to stderr and to
 * ship in logs.
 */
export class ConfigurationError extends Error {
  override readonly name = 'ConfigurationError';
  readonly issues: readonly FieldIssue[];

  constructor(issues: readonly FieldIssue[]) {
    const lines = issues.map((issue) => `  - ${issue.field} (${issue.envVar}): ${issue.reason}`);
    super(
      `Invalid configuration (${issues.length} field${issues.length === 1 ? '' : 's'}; values are never printed):\n${lines.join('\n')}`,
    );
    this.issues = issues;
  }
}
