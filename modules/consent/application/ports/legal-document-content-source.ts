/**
 * LegalDocumentContentSource — where the BYTES of a published legal-document
 * version come from, declared inward (architecture test 5).
 *
 * The catalogue (0064) records what a version IS — its version string, the
 * sha256 of its canonical bytes, its re-consent classification, its effective
 * instant — and a `storage_ref` naming where the bytes live. It does not hold
 * the bytes, and it records no language: nothing in the schema states which
 * language a version is written in, so language belongs to the CONTENT and
 * arrives with it. A source that cannot state the language has not returned
 * displayable content, and the use case refuses it.
 *
 * A source returns null when THIS deployment holds no retrievable content for
 * the version. That is a real answer — "the platform has no text to show you
 * yet" — and it is the answer the only shipped implementation gives, because
 * no document store exists in this phase. It is never approximated, never
 * substituted, and never generated: the client must not be handed prose the
 * platform cannot attribute to a published, hash-pinned version.
 */

import type { LegalDocumentVersion } from '../../domain/legal-document.js';

/** The formats a client is expected to render. Closed on purpose: a format
 * the client cannot render honestly is not displayable content. */
export const LEGAL_DOCUMENT_CONTENT_FORMATS = ['text/plain', 'text/markdown'] as const;
export type LegalDocumentContentFormat = (typeof LEGAL_DOCUMENT_CONTENT_FORMATS)[number];

export interface LegalDocumentContent {
  /** BCP-47 tag of the text as the source recorded it — never inferred. */
  readonly language: string;
  readonly format: LegalDocumentContentFormat;
  /** The canonical bytes as text; verified against the version's content hash
   * before anything is served. */
  readonly content: string;
}

export interface LegalDocumentContentSource {
  /** The published content for a version, or null when none is retrievable. */
  fetch(version: LegalDocumentVersion): Promise<LegalDocumentContent | null>;
}
