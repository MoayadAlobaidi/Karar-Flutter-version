/**
 * The LOCAL/TEST LegalDocumentContentSource: the bytes of the one synthetic
 * document `scripts/db/seed-local-consent.mjs` publishes, and nothing else.
 *
 * WHY IT EXISTS. `NoContentSourceConfigured` is the honest answer for a
 * deployment with no document store, but it is a dead end for a developer:
 * with no retrievable text, `GET /consent/documents/{id}/content` answers 409
 * `NOT_RETRIEVABLE` for every document, so the read-then-accept sequence the
 * consent design is built around cannot be walked end to end on a local stack.
 * A path nobody can exercise is a path nobody can find defects in. This source
 * closes that gap for local/test WITHOUT inventing legal wording: it serves one
 * fixed synthetic string that states on its own face that it is not a legal
 * document, and it serves that string ONLY for the version the local seed
 * published.
 *
 * WHAT IT IS NOT. It is not a document store and not a step toward one. It
 * resolves exactly one storage reference — the local seed's — by equality, and
 * answers null for every other version, including other versions of the same
 * document. That matters: a source that returned its fixture for ANY version
 * would hand a subject one document's text under another document's identity,
 * which is the failure the content path exists to prevent. Absence stays
 * absence; the endpoint reports it, and no client composes prose of its own.
 *
 * THE INTEGRITY CHECK IS NOT BYPASSED, IT IS SATISFIED. `GetLegalDocumentContent`
 * hashes whatever a source returns and compares it against the `content_hash`
 * the published version pinned; a mismatch is refused with nothing served. This
 * source has no way to influence that comparison — it returns bytes, and the
 * seed independently pins sha256 of THE SAME constant into the database. The
 * check passes because the two genuinely agree, and it fails the moment they
 * stop agreeing (an edited constant against an already-seeded database, or a
 * version pinning some other text). Neither side can be adjusted to force a
 * pass: the seed refuses a conflicting row instead of repairing it, and
 * published versions are immutable by trigger (migration 0064).
 *
 * THE ENVIRONMENT GATE. Constructing this source outside local/test throws, and
 * `legalDocumentContentSourceFor` hands deployed environments
 * `NoContentSourceConfigured` unchanged. Both guards exist deliberately: the
 * selector expresses the composition decision, and the constructor makes the
 * decision unbypassable, so a future composition that reaches past the selector
 * still cannot serve a synthetic notice to a real subject. An UNSTATED
 * environment is refused rather than defaulted, exactly as the seed refuses an
 * unset `KARAR_ENV` — a missing value must never widen what may be served.
 *
 * A real source arrives with the document store and a reviewed publication path
 * that records content alongside the version it belongs to. It replaces this
 * one at composition; the hash check that holds this one to the catalogue holds
 * that one identically.
 */

import type {
  LegalDocumentContent,
  LegalDocumentContentSource,
} from '../../application/ports/legal-document-content-source.js';
import type { LegalDocumentVersion } from '../../domain/legal-document.js';
import { NoContentSourceConfigured } from './no-content-source-configured.js';

/**
 * The only environments whose subjects may be shown synthetic text. `dev`,
 * `staging`, and `production` are deployed environments with real people
 * behind them, and they are absent on purpose.
 */
export const LOCAL_CONTENT_ENVIRONMENTS = ['local', 'test'] as const;

export function isLocalContentEnvironment(environment: string | undefined): boolean {
  return (
    environment !== undefined &&
    (LOCAL_CONTENT_ENVIRONMENTS as readonly string[]).includes(environment)
  );
}

/**
 * The storage reference the local seed writes, and the ONLY one this source
 * resolves. The `local-seed://` scheme names a fixture rather than a store, so
 * a row carrying it can never be mistaken for one whose bytes a real document
 * store holds.
 */
export const LOCAL_SEED_STORAGE_REF = 'local-seed://synthetic-notice';

/**
 * The bytes themselves, and the single place they are written down. The seed
 * hashes THIS constant, so the pinned hash and the served bytes cannot drift
 * apart without the integrity check catching it.
 *
 * The wording is deliberately not legal wording. It is one declarative
 * paragraph that says what it is, states that no counsel and no regulator has
 * seen it, and disclaims legal effect — so no reader, and no screenshot of a
 * reader, can be mistaken for a reviewed disclosure. Drafting real text is a
 * legal activity that has not happened; nothing here anticipates its outcome.
 */
export const LOCAL_SEED_CONTENT: LegalDocumentContent = {
  /** BCP-47, stated rather than inferred: the paragraph below is English. */
  language: 'en',
  format: 'text/plain',
  content:
    'SYNTHETIC LOCAL FIXTURE. This is not a legal document, has not been reviewed by counsel or ' +
    'any regulator, and has no legal effect. It exists so the consent acceptance path can be ' +
    'exercised against a local database.',
};

export class LocalSeedContentSource implements LegalDocumentContentSource {
  constructor(environment: string | undefined) {
    if (!isLocalContentEnvironment(environment)) {
      throw new Error(
        'LocalSeedContentSource: refusing to construct in environment ' +
          `${environment ?? '(unstated)'} — permitted values are ` +
          `${LOCAL_CONTENT_ENVIRONMENTS.join(', ')}. This source serves a synthetic fixture that ` +
          'is not a legal document and has never been reviewed; a deployed environment must get ' +
          'the honest absence (NoContentSourceConfigured) instead, and show no text at all.',
      );
    }
  }

  fetch(version: LegalDocumentVersion): Promise<LegalDocumentContent | null> {
    // Equality on the seed's own reference, not a prefix or a scheme test: this
    // source holds ONE document's bytes and must not answer for a second.
    return Promise.resolve(
      version.storageRef === LOCAL_SEED_STORAGE_REF ? LOCAL_SEED_CONTENT : null,
    );
  }
}

/**
 * The composition decision, in one place: local and test get the seeded
 * fixture, every other environment gets the source that honestly has nothing.
 * Written as a function so the choice is testable and cannot be made twice in
 * different ways.
 */
export function legalDocumentContentSourceFor(
  environment: string | undefined,
): LegalDocumentContentSource {
  return isLocalContentEnvironment(environment)
    ? new LocalSeedContentSource(environment)
    : new NoContentSourceConfigured();
}
