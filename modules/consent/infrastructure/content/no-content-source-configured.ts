/**
 * The DEPLOYED LegalDocumentContentSource: this phase has no document store,
 * so no version's bytes are retrievable and every fetch answers null.
 *
 * It is what `legalDocumentContentSourceFor` hands every environment but
 * `local` and `test`, and what it hands those two as well when the local
 * fixture package is not installed. The other shipped implementation,
 * `StaticLegalDocumentContentSource`, holds no content of its own and serves
 * only what a caller constructed it with; the synthetic fixture that used to
 * live in this directory is in `@karar/consent-local-fixtures`, outside every
 * production dependency closure.
 *
 * WHY THIS AND NOT A FALLBACK. The catalogue's `storage_ref` names where bytes
 * would live; nothing in the platform can resolve one (the module that owns
 * object storage is PLANNED, not built), and no legal text has been drafted or
 * reviewed to place there. A source that returned SOMETHING would be
 * fabricating a legal document — the one failure mode the consent design
 * exists to prevent — so this one returns the honest absence and the endpoint
 * reports it as such. The client shows its own unavailable state and composes
 * no wording of its own.
 *
 * A real source arrives with the document store and a reviewed publication
 * path that records content alongside the version it belongs to; it replaces
 * this one at composition, and the use case's hash check holds it to the
 * version the catalogue pinned.
 */

import type {
  LegalDocumentContent,
  LegalDocumentContentSource,
} from '../../application/ports/legal-document-content-source.js';
import type { LegalDocumentVersion } from '../../domain/legal-document.js';

export class NoContentSourceConfigured implements LegalDocumentContentSource {
  fetch(version: LegalDocumentVersion): Promise<LegalDocumentContent | null> {
    void version;
    return Promise.resolve(null);
  }
}
