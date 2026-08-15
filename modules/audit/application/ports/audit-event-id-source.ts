/**
 * Identity minting as a port: the use case asks for the next AuditEventId
 * and never touches randomness itself, keeping the application layer
 * deterministic under test. The infrastructure implementation supplies
 * UUID v7 (data-model.md §2 — time-ordered primary keys).
 */

import type { AuditEventId } from '../../domain/audit-event.js';

export interface AuditEventIdSource {
  nextId(): AuditEventId;
}
