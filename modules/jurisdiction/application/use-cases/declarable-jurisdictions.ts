/**
 * ListDeclarableJurisdictions — the reference entries a caller may actually
 * declare, as a CLIENT-SAFE projection.
 *
 * WHY IT EXISTS. `DeclareOwnJurisdiction` validates the identifier against the
 * register and refuses anything else, but nothing let a client DISCOVER a
 * valid identifier: the declaration screen could only render a free-text field
 * (inviting an identifier the register does not hold) or an honest "selection
 * unavailable" state. This is the missing read, and only the read — it writes
 * nothing, activates nothing, and approves nothing.
 *
 * IT AGREES WITH THE WRITE PATH BY CONSTRUCTION. Both this listing and
 * `DeclareOwnJurisdiction` decide declarability through the SAME pure domain
 * predicate (`declarabilityRefusalAt`), so an entry offered here is an entry
 * the declaration accepts, and a retired or not-yet-effective entry is offered
 * by neither.
 *
 * WHAT IT DELIBERATELY DOES NOT EXPOSE. The register is the platform's own
 * governance record: `provenance` (who declared the entry and on what
 * footing), the raw lifecycle stage, the raw review status, and the reviewed
 * effective window are INTERNAL (migration 0071's lifecycle block) and none of
 * them crosses this boundary. What does cross is the identifier a caller posts
 * back, the country the entry belongs to, its structural type, and ONE derived
 * fact — whether the platform records a completed legal approval, which today
 * is false for every entry and says so rather than staying silent.
 *
 * FAIL CLOSED. An entry whose country does not resolve in the country register
 * — or resolves to a retired code — is AMBIGUOUS reference data, so it is
 * omitted rather than emitted with an unresolvable origin. A store failure is
 * a typed error, never an empty list: "nobody could look" must not read as
 * "there is nothing to declare".
 */

import { Result } from '@karar/shared-kernel';

import {
  approvalRecorded,
  declarabilityRefusalAt,
  type CountryRecord,
  type JurisdictionRecord,
} from '../../domain/reference.js';
import { toStoreFailure, type StoreFailure } from '../errors.js';
import type { JurisdictionDirectory } from '../ports/repositories.js';

/** The closed, client-safe field set. Picked by name — nothing an upstream
 * register change adds can reach a client by accident. */
export interface DeclarableJurisdiction {
  /** The identifier `POST /jurisdiction/self-declaration` accepts. */
  readonly jurisdictionId: string;
  /** The register's own reference token; the same value, mirroring the row. */
  readonly code: string;
  readonly countryCode: string;
  /**
   * Localisation key for the entry's country, from the country register.
   * Display NAMES live in locale bundles, never in the register, and a
   * jurisdiction entry carries no name of its own — so no name is invented
   * here; the client composes its label from this key, the type, and the code.
   */
  readonly countryDisplayNameKey: string;
  readonly type: JurisdictionRecord['type'];
  /**
   * Whether the platform's register records a completed legal approval for
   * this entry. Stated explicitly, and false for every entry today: a
   * selectable jurisdiction is a declarable one, which is not an approved one,
   * and a declaration made into it stays UNVERIFIED and clears nothing.
   */
  readonly approvalRecorded: boolean;
}

export interface ListDeclarableJurisdictionsInput {
  /** The evaluation instant; effective windows are decided against it. */
  readonly now: Date;
}

export type ListDeclarableJurisdictionsError = StoreFailure;

export class ListDeclarableJurisdictions {
  constructor(private readonly directory: JurisdictionDirectory) {}

  async execute(
    input: ListDeclarableJurisdictionsInput,
  ): Promise<Result<readonly DeclarableJurisdiction[], ListDeclarableJurisdictionsError>> {
    let entries: readonly JurisdictionRecord[];
    let origins: readonly CountryRecord[];
    try {
      entries = await this.directory.listJurisdictions();
      origins = await this.directory.listCountries();
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    // Keyed by the register's own token; membership lookup, never a branch on
    // a particular identifier (architecture test 12).
    const originsByCode = new Map<string, CountryRecord>();
    for (const origin of origins) {
      originsByCode.set(String(origin.code), origin);
    }

    const declarable: DeclarableJurisdiction[] = [];
    for (const entry of entries) {
      if (declarabilityRefusalAt(entry, input.now) !== null) continue;
      const origin = originsByCode.get(String(entry.countryCode));
      // Unresolvable or retired origin: omit rather than emit reference data
      // whose country the client cannot resolve.
      if (origin === undefined || origin.status !== 'ACTIVE') continue;
      declarable.push({
        jurisdictionId: String(entry.code),
        code: String(entry.code),
        countryCode: String(origin.code),
        countryDisplayNameKey: origin.displayNameKey,
        type: entry.type,
        approvalRecorded: approvalRecorded(entry),
      });
    }
    return Result.ok(declarable);
  }
}
