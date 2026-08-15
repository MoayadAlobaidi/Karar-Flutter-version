/**
 * Classification-aware LOG-SINK policy (docs/security/data-classification.md §2).
 *
 * The classification vocabulary and the value-level replacements are owned by
 * platform/src/classification; this module adds what is contextual to the log
 * sink: `CONFIDENTIAL` is redacted IN LOGS (a sink rule, not a property of
 * the value — see classification.ts `redactionFor`), and a `SEALED` value
 * reaching a logging call site is a programming error, so the first
 * occurrence additionally raises a warn-once signal while the value itself is
 * replaced before it can reach a sink.
 */
import {
  DATA_CLASSIFICATIONS,
  REDACTED_HSF,
  REDACTED_SEALED,
  redactionFor,
} from '../classification/index.js';
import type { DataClassification } from '../classification/index.js';

export { DATA_CLASSIFICATIONS, REDACTED_HSF };
export type { DataClassification };

/** Generic replacement used by the logger's key-based redaction and for CONFIDENTIAL values in logs. */
export const REDACTED = '[redacted]';
/** What a SEALED value becomes anywhere near a log line (canonical string from classification). */
export const SEALED_PLACEHOLDER: string = REDACTED_SEALED;

type WarnSink = (message: string) => void;

let warnSink: WarnSink | undefined;
let sealedWarned = false;

/**
 * Wires where the SEALED warn-once goes. `createLogger` registers the first
 * logger it builds; before any logger exists the warning falls back to stderr
 * so it is never silently dropped.
 */
export function setClassifiedWarnSink(sink: WarnSink): void {
  warnSink ??= sink;
}

/** Test seam: forget the warn-once state and the registered sink. */
export function resetClassifiedStateForTests(): void {
  warnSink = undefined;
  sealedWarned = false;
}

/**
 * Returns what a log line may carry for `value` under `classification`.
 * Usage: `logger.info({ iban: classified(iban, 'HIGHLY_SENSITIVE_FINANCIAL') })`.
 */
export function classified<T>(value: T, classification: DataClassification): T | string {
  switch (classification) {
    case 'PUBLIC':
    case 'INTERNAL':
      return value;
    case 'CONFIDENTIAL':
      // Sink-contextual: CONFIDENTIAL is redacted in logs (handling matrix).
      return REDACTED;
    case 'SECRET':
    case 'HIGHLY_SENSITIVE_FINANCIAL':
      // Canonical value-level replacements from the classification module.
      return redactionFor(classification) ?? REDACTED;
    case 'SEALED': {
      if (!sealedWarned) {
        sealedWarned = true;
        const message =
          'classified(): a SEALED value reached a logging call site; it was suppressed. SEALED data is never logged — remove the call site (docs/security/data-classification.md §2).';
        if (warnSink !== undefined) {
          warnSink(message);
        } else {
          process.stderr.write(`${message}\n`);
        }
      }
      return REDACTED_SEALED;
    }
  }
}
