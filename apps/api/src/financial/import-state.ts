/**
 * Two facts about an import that a response states rather than a client
 * derives.
 *
 * `hasStoredSource` REPORTS EXISTENCE AND NEVER A LOCATOR. The stored
 * object's reference, store kind, byte length, algorithm, key version, nonce,
 * auth tag and integrity checksum have no field anywhere on this surface: a
 * handle is enough to ask a store for a subject's bank statement, so the only
 * thing a response says is whether one exists.
 *
 * WHERE THE ANSWER COMES FROM, and why there are two sources. The preview
 * route reads it from the store (`source !== null`), which is authoritative.
 * The write responses — create, upload, parse — carry a `StatementImport`
 * that has no such field, so the answer is derived from the LIFECYCLE, which
 * is what governs when the row exists: bytes are written on the way out of
 * DRAFT and removed on the way into ERASED. The two agree by construction,
 * and the derivation is written down here rather than repeated in three
 * serializers where it could drift.
 *
 * `awaitsDecision` is the module's own predicate: an import is waiting for a
 * person exactly while it is REVIEW_REQUIRED. Stating it saves every client
 * from re-deriving "may I offer a Commit button?" from a state vocabulary,
 * which two clients would eventually derive differently.
 */

import { awaitsSubjectDecision } from '@karar/statement-imports';
import type { StatementImport } from '@karar/statement-imports';

/** True while encrypted source bytes exist for this import. */
export function hasStoredSource(statementImport: StatementImport): boolean {
  return statementImport.state !== 'DRAFT' && statementImport.state !== 'ERASED';
}

/** True while this import is waiting for the subject to commit or erase it. */
export function importAwaitsDecision(statementImport: StatementImport): boolean {
  return awaitsSubjectDecision(statementImport);
}
