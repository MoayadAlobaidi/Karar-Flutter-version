/**
 * Resolving the issuers a page of accounts points at, once per request.
 *
 * WHY NOT A LOOKUP PER ROW. A serializer that reached for the catalogue would
 * issue one query per account, and the page bound would stop bounding
 * anything that matters: a caller asking for two hundred accounts would cost
 * two hundred round trips. The selectable catalogue is small reviewed
 * reference data with no principal scope, so ONE read covers almost every
 * row.
 *
 * WHY THERE IS STILL A PER-REF FALLBACK. `listSelectable` deliberately omits
 * RETIRED entries — they may not be chosen for a NEW account — but an
 * EXISTING account still has to render its issuer's name, and hiding it would
 * make old records unreadable. The fallback resolves exactly those, and only
 * those.
 *
 * This holds NO principal and needs none: the catalogue has no tenant, user
 * or subject column, and every principal reads the same rows.
 */

import type {
  InstitutionCatalogueReader,
  Institution,
  InstitutionRef,
} from '@karar/financial-accounts';

export class InstitutionLookup {
  readonly #resolved = new Map<string, Institution | null>();

  constructor(private readonly institutions: InstitutionCatalogueReader) {}

  /** Every catalogue entry the given references name, resolved once. */
  async resolve(refs: readonly (InstitutionRef | null)[]): Promise<void> {
    const wanted = new Set(refs.filter((ref): ref is InstitutionRef => ref !== null));
    if (wanted.size === 0) return;
    for (const entry of await this.institutions.listSelectable()) {
      this.#resolved.set(entry.id, entry);
    }
    for (const ref of wanted) {
      if (this.#resolved.has(ref)) continue;
      // RETIRED, or absent. Absent is cached as null so a page of accounts
      // pointing at one missing entry costs one query rather than many.
      this.#resolved.set(ref, await this.institutions.findByRef(ref));
    }
  }

  /** The entry for a reference, or null when there is none to render. */
  get(ref: InstitutionRef | null): Institution | null {
    return ref === null ? null : (this.#resolved.get(ref) ?? null);
  }
}
