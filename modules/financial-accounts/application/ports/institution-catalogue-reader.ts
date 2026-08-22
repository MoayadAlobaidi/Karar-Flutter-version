/**
 * `InstitutionCatalogueReader` — the reviewed institution catalogue, read
 * only, declared INWARD.
 *
 * **Read is the entire port.** There is deliberately no `create`, `update`,
 * or `retire` method: the catalogue changes by reviewed migration, exactly
 * like the permissions catalogue (0050) and the country reference set (0070),
 * and `karar_app` holds SELECT and nothing else on the table (migration
 * 0087). A write method here would be the first step toward a runtime path
 * that lets one subject's typed bank name become global reference data — the
 * precise outcome the catalogue's shape exists to prevent.
 *
 * No method takes a principal, and that is correct rather than an oversight:
 * the catalogue is PUBLIC platform reference data with no tenant, user, or
 * subject column to scope on (see the allow-list entry for
 * `public.institutions`). Every principal, in every tenant, reads the same
 * rows.
 */

import type { Institution } from '../../domain/institution.js';
import type { InstitutionRef } from '../../domain/refs.js';

export interface InstitutionCatalogueReader {
  /** Every catalogue entry a NEW account may point at, by display order. */
  listSelectable(): Promise<readonly Institution[]>;

  /**
   * One entry by reference, whatever its status. Returns `RETIRED` entries
   * too: an existing account still has to render its institution's name, and
   * hiding it would make old records unreadable.
   */
  findByRef(ref: InstitutionRef): Promise<Institution | null>;
}
