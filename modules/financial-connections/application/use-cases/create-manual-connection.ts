/**
 * CreateManualConnection — a person records a route by which their financial
 * data reaches Karar.
 *
 * **Only an implemented rail arrives here, and three separate things say so.**
 * The input type accepts `ImplementedConnectionRail`, the domain factory
 * re-checks at runtime because a type is not a control and HTTP is not the
 * only caller, and `financial_connections_rail_implemented_check` refuses the
 * row at the database besides. The database is the one that matters: it holds
 * for a direct SQL insert, a fixture, a backfill, and an ingestion path
 * written by someone who never read this file.
 *
 * **Nothing created here claims a bank connection.** A `MANUAL` connection
 * means the person types entries; a `USER_FILE_UPLOAD` connection means they
 * upload a file for reviewed import. No status value means connected, synced
 * or authorized, no credential is asked for, none is stored, and there is
 * nowhere in the row to put one.
 *
 * The input carries no `userId` and no `tenantId`. The owner is the
 * authenticated principal, and the RLS `WITH CHECK` arm on
 * `public.financial_connections` binds the inserted row to it at the database
 * layer, so even a defective repository cannot create a connection for
 * someone else.
 *
 * **The retention gate runs FIRST, and the ordering is the control.** It
 * happens before the label is validated, before anything is encrypted, and
 * before any statement reaches the database — so a refusal leaves nothing
 * behind at all: no row, no ciphertext, and no key usage recorded against a
 * subject whose data the platform had not established it may keep.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import {
  createFinancialConnection,
  type FinancialConnection,
} from '../../domain/financial-connection.js';
import type {
  ConstructibleConnectionStatus,
  ImplementedConnectionRail,
} from '../../domain/rails.js';
import type { FinancialConnectionId, InstitutionRef } from '../../domain/refs.js';
import {
  retentionUnresolved,
  storeFailure,
  type CreateManualConnectionError,
} from '../errors.js';
import {
  permitsDurableWrite,
  type FinancialConnectionRetentionDecisionPort,
} from '../ports/financial-connection-retention-decision.js';
import type { FinancialConnectionRepository } from '../ports/financial-connection-repository.js';
import type { IdSource } from '../ports/id-source.js';
import { requirePrincipal, type ConnectionsPrincipal } from '../principal.js';

/**
 * Deliberately carries no owner identifier. `rail` is restricted to the
 * implemented set at the type level as a convenience for callers; the refusal
 * that counts is a database CHECK.
 */
export interface CreateManualConnectionInput {
  readonly rail: ImplementedConnectionRail;
  /** The name the subject gave it. Required: several to one issuer is normal. */
  readonly displayLabel: string;
  /**
   * The reviewed catalogue entry this connection relates to, or null. Naming
   * one asserts nothing about that institution and never that it is
   * reachable — no issuer named anywhere in this platform exposes an
   * interface to Karar (ADR-0028).
   */
  readonly institutionRef: InstitutionRef | null;
  /** Absent means `ACTIVE`. `NOT_IMPLEMENTED` is not constructible. */
  readonly status?: ConstructibleConnectionStatus;
}

export class CreateManualConnection {
  constructor(
    private readonly connections: FinancialConnectionRepository,
    private readonly retention: FinancialConnectionRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: CreateManualConnectionInput,
    actor: ConnectionsPrincipal,
  ): Promise<Result<FinancialConnection, CreateManualConnectionError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return principal;

    // Before anything else — see the header. A port that cannot answer says
    // UNAVAILABLE rather than throwing, so a rejection here is a genuine
    // defect and is reported as a store failure rather than swallowed into
    // the same refusal as an honest "we have not decided".
    let decision;
    try {
      decision = await this.retention.decideFor(principal.value, 'financial_connections');
    } catch (error) {
      return Result.err(storeFailure('retention decision resolution', error));
    }
    if (!permitsDurableWrite(decision)) {
      return Result.err(retentionUnresolved('financial_connections', decision));
    }

    const built = createFinancialConnection({
      id: this.ids.nextId() as FinancialConnectionId,
      tenantId: principal.value.tenantId,
      userId: principal.value.userId,
      institutionRef: input.institutionRef,
      rail: input.rail,
      status: input.status ?? 'ACTIVE',
      displayLabel: input.displayLabel,
      createdAt: this.clock.now(),
    });
    if (!built.ok) {
      return Result.err({
        kind: 'rule_violated',
        violation: built.error,
        message: built.error.message,
      });
    }

    try {
      return Result.ok(await this.connections.create(principal.value, built.value));
    } catch (error) {
      return Result.err(storeFailure('financial connection creation', error));
    }
  }
}
