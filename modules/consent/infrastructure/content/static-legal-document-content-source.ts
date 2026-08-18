/**
 * A LegalDocumentContentSource over content supplied at CONSTRUCTION — the
 * generic behaviour, with no bytes of its own.
 *
 * This class is the half of the old `LocalSeedContentSource` that is safe to
 * ship: how a single-version source must behave. The other half — the actual
 * synthetic paragraph and the locator it answers for — moved out of this module
 * entirely, into `@karar/consent-local-fixtures`, which no production
 * dependency closure contains. Nothing in this file names a document, a
 * locator, or a word of text; grep it for the fixture and there is nothing to
 * find, which is the property `__tests__/production-closure.test.ts` asserts
 * against the built output rather than the source.
 *
 * ONE VERSION, BY EQUALITY. The source resolves exactly the storage reference
 * it was constructed with, and answers null for every other version —
 * including other versions of the same document. That matters: a source that
 * returned its content for ANY version would hand a subject one document's
 * text under another document's identity, which is the failure the content
 * path exists to prevent. Absence stays absence; the endpoint reports it, and
 * no client composes prose of its own.
 *
 * THE INTEGRITY CHECK IS NOT BYPASSED, IT IS SATISFIED. `GetLegalDocumentContent`
 * hashes whatever a source returns and compares it against the `content_hash`
 * the published version pinned; a mismatch is refused with nothing served.
 * This source has no way to influence that comparison — it returns the bytes it
 * was given, and whoever published the version pinned sha256 of the same bytes
 * independently. The check passes because the two genuinely agree, and it fails
 * the moment they stop agreeing.
 *
 * WHAT IT IS NOT. It is not a document store and not a step toward one: it
 * holds one entry, in memory, for the lifetime of the process. A real source
 * arrives with the document store and a reviewed publication path that records
 * content alongside the version it belongs to. It replaces this one at
 * composition; the hash check that holds this one to the catalogue holds that
 * one identically.
 */

import type {
  LegalDocumentContent,
  LegalDocumentContentSource,
} from '../../application/ports/legal-document-content-source.js';
import type { LegalDocumentVersion } from '../../domain/legal-document.js';

export class StaticLegalDocumentContentSource implements LegalDocumentContentSource {
  readonly #storageRef: string;
  readonly #content: LegalDocumentContent;

  constructor(storageRef: string, content: LegalDocumentContent) {
    if (storageRef === '') {
      // An empty locator would match a version whose storage_ref was never
      // set, so the one thing this source keys on has to be a real value.
      throw new Error(
        'StaticLegalDocumentContentSource: refusing an empty storage reference — the reference ' +
          'is the only thing this source matches on, and an empty one would answer for versions ' +
          'that name no location at all.',
      );
    }
    this.#storageRef = storageRef;
    this.#content = content;
  }

  fetch(version: LegalDocumentVersion): Promise<LegalDocumentContent | null> {
    // Equality on the whole reference, not a prefix and not a scheme test:
    // this source holds ONE version's bytes and must not answer for a second.
    return Promise.resolve(version.storageRef === this.#storageRef ? this.#content : null);
  }
}
