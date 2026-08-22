/**
 * `StatementImportOutboxPort` over the platform's transactional outbox.
 *
 * The envelope INSERT shares the commit's transaction (ADR-0012): a state
 * change and its event commit or roll back together, so there is no path that
 * publishes an event for a change that did not commit, and none that commits a
 * change whose event is lost.
 *
 * ## The catalogue is a CONSTRUCTOR argument, and it fails closed
 *
 * `makeEnvelope` refuses an uncatalogued name, so an environment whose
 * catalogue does not declare `statement_import.committed` cannot publish this
 * notice — the commit throws and rolls back rather than writing financial
 * records nothing downstream will ever hear about.
 *
 * That entry does NOT exist yet: `packages/api-contracts/events/catalogue.json`
 * belongs to the platform and this module cannot add to it. MODULE.md records
 * it as work the lead owns. Passing the catalogue in rather than reading the
 * default one is what lets the tests exercise this path against a synthetic
 * catalogue without any module fabricating a production entry.
 *
 * ## The payload is two identifiers, and not even a count
 *
 * The platform's `assertEventPayloadAllowed` is exact about what
 * `identifier-only` means for a `HIGHLY_SENSITIVE_FINANCIAL` event: an id
 * field or an occurred-at field, and anything else needs a catalogue
 * exemption naming an owner, a reason and a reviewer. A count is not an
 * identifier — "this import produced 312 transactions" is a fact about a
 * person's spending volume — and the honest response to that rule is to carry
 * less rather than to declare an exemption for convenience.
 *
 * So: the import id and the account id. No merchant, no amount, no currency,
 * no date range, no narrative, no account name, no filename, no count. A
 * consumer that needs the count reads it from the import the notice names.
 */

import type { EventCatalogue } from '@karar/api-contracts';
import { makeEnvelope, recordEnvelope } from '@karar/platform/dist/events/envelope.js';
import type { PrismaTransactionClient } from '@karar/platform/dist/db/principal-context.js';
import type { Clock } from '@karar/shared-kernel';

import type {
  CommitUnit,
  StatementImportOutboxPort,
} from '../../application/ports/statement-import-outbox.js';
import type { StatementImportCommittedNotice } from '../../application/ports/statement-commit.js';
import type { ImportsPrincipal } from '../../application/principal.js';

/** The catalogue name this module publishes under. */
export const STATEMENT_IMPORT_COMMITTED_EVENT = 'statement_import.committed';

export class PlatformOutboxStatementImportRecorder implements StatementImportOutboxPort {
  constructor(
    private readonly catalogue: EventCatalogue,
    private readonly clock: Clock,
    private readonly producer: string,
  ) {}

  async record(
    unit: CommitUnit,
    actor: ImportsPrincipal,
    notice: StatementImportCommittedNotice,
  ): Promise<void> {
    // The handle is opaque to the application layer and is cast back HERE —
    // by the layer that knows what it is. That is the whole point of the
    // opaque type: the ORM stays out of the port.
    const tx = unit.unit as PrismaTransactionClient;
    const envelope = recordEnvelope(
      makeEnvelope(this.catalogue, {
        name: STATEMENT_IMPORT_COMMITTED_EVENT,
        payload: {
          importId: notice.importId,
          accountId: notice.accountId,
        },
        tenantId: actor.tenantId,
        producer: this.producer,
        clock: this.clock,
      }),
      this.clock.now(),
    );
    await tx.$executeRaw`INSERT INTO platform.outbox_events (id, event_name, schema_version, envelope, classification) VALUES (${envelope.eventId}::uuid, ${envelope.eventName}, ${envelope.schemaVersion}, ${JSON.stringify(envelope)}::jsonb, ${envelope.classification})`;
  }
}
