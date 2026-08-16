/**
 * The EntityMigration workflow (ADR-0024 §5) — the ONLY path an entity
 * binding may change, and never silently:
 *
 *   propose             -> PROPOSED
 *   record evaluation   -> RECONSENT_EVALUATED (links the consent module's
 *                          recorded reconsent_evaluation, immutably)
 *   advance             -> AWAITING_ACCEPTANCE | MIGRATED | BLOCKED
 *
 * Completing a migration (MIGRATED) rebinds the FORWARD assignment; history
 * — prior assignments, pinned entity columns on existing records — is never
 * touched. Terminal rows are immutable (domain rule here, trigger in the
 * schema). Approval is gated on `entity.migration.approve` (MODULE.md).
 */

import { Result } from '@karar/shared-kernel';

import type { OperatingEntityId } from '../../domain/operating-entity.js';
import type { AssignmentScope } from '../../domain/entity-assignment.js';
import {
  migrationTransitionAllowed,
  type EntityMigration,
  type EntityMigrationStatus,
} from '../../domain/entity-migration.js';
import {
  InvalidOperatingEntityInputError,
  requireNonEmpty,
  toStoreFailure,
  type AuditAppendFailed,
  type InvalidTransition,
  type NotFound,
  type StoreFailure,
} from '../errors.js';
import { EntityAuditTrail } from '../audit-trail.js';
import type { IdSource } from '../ports/id-source.js';
import type {
  EntityMigrationRepository,
  OperatingEntityRepository,
} from '../ports/repositories.js';
import {
  ENTITY_PERMISSIONS,
  type AuthorizationDenied,
  type PolicyPrincipal,
  type PolicyService,
} from '../ports/policy-service.js';

export type EntityMigrationError =
  | AuthorizationDenied
  | NotFound
  | InvalidTransition
  | StoreFailure
  | AuditAppendFailed;

export interface ProposeEntityMigrationInput {
  readonly principal: PolicyPrincipal;
  readonly scope: AssignmentScope;
  readonly subjectRef: string;
  readonly fromEntity: OperatingEntityId;
  readonly toEntity: OperatingEntityId;
  readonly reason: string;
  readonly now: Date;
}

export class ProposeEntityMigration {
  constructor(
    private readonly migrations: EntityMigrationRepository,
    private readonly entities: OperatingEntityRepository,
    private readonly policy: PolicyService,
    private readonly ids: IdSource,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: ProposeEntityMigrationInput,
  ): Promise<Result<EntityMigration, EntityMigrationError>> {
    if (input.fromEntity === input.toEntity) {
      throw new InvalidOperatingEntityInputError(
        'an entity migration requires two distinct entities',
      );
    }
    const authorized = await this.policy.authorize(
      input.principal,
      ENTITY_PERMISSIONS.approveMigration,
    );
    if (!authorized.ok) {
      return authorized;
    }
    try {
      for (const entityId of [input.fromEntity, input.toEntity]) {
        if ((await this.entities.findById(entityId)) === null) {
          return Result.err({ kind: 'NOT_FOUND', resource: 'operating_entity', id: entityId });
        }
      }
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const migration: EntityMigration = Object.freeze({
      id: this.ids.nextId(),
      scope: input.scope,
      subjectRef: requireNonEmpty('subjectRef', input.subjectRef),
      fromEntity: input.fromEntity,
      toEntity: input.toEntity,
      status: 'PROPOSED' as const,
      reason: requireNonEmpty('reason', input.reason),
      reconsentEvaluationId: null,
      proposedBy: input.principal.principalRef,
      proposedAt: input.now,
      completedAt: null,
    });
    try {
      await this.migrations.insert(migration);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.migration.proposed',
      resourceType: 'entity_migration',
      resourceId: migration.id,
      reason: migration.reason,
      afterMetadata: {
        scope: migration.scope,
        subjectRef: migration.subjectRef,
        fromEntity: migration.fromEntity,
        toEntity: migration.toEntity,
        status: migration.status,
      },
    });
    return audited.ok ? Result.ok(migration) : audited;
  }
}

export interface RecordMigrationReconsentEvaluationInput {
  readonly principal: PolicyPrincipal;
  readonly migrationId: string;
  /** The consent module's recorded reconsent_evaluation id (cross-module ref). */
  readonly reconsentEvaluationId: string;
  readonly now: Date;
}

/** PROPOSED -> RECONSENT_EVALUATED, linking the recorded evaluation. */
export class RecordMigrationReconsentEvaluation {
  constructor(
    private readonly migrations: EntityMigrationRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(
    input: RecordMigrationReconsentEvaluationInput,
  ): Promise<Result<void, EntityMigrationError>> {
    requireNonEmpty('reconsentEvaluationId', input.reconsentEvaluationId);
    const authorized = await this.policy.authorize(
      input.principal,
      ENTITY_PERMISSIONS.approveMigration,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let migration;
    try {
      migration = await this.migrations.findById(input.migrationId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (migration === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'entity_migration', id: input.migrationId });
    }
    if (!migrationTransitionAllowed(migration.status, 'RECONSENT_EVALUATED')) {
      return Result.err({
        kind: 'INVALID_TRANSITION',
        from: migration.status,
        to: 'RECONSENT_EVALUATED',
        message: `entity migration ${migration.id} cannot record an evaluation from status ${migration.status}`,
      });
    }
    try {
      await this.migrations.advance(input.migrationId, 'RECONSENT_EVALUATED', {
        reconsentEvaluationId: input.reconsentEvaluationId,
      });
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action: 'entity.migration.reconsent_evaluated',
      resourceType: 'entity_migration',
      resourceId: input.migrationId,
      beforeMetadata: { status: migration.status },
      afterMetadata: {
        status: 'RECONSENT_EVALUATED',
        reconsentEvaluationId: input.reconsentEvaluationId,
      },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}

export interface AdvanceEntityMigrationInput {
  readonly principal: PolicyPrincipal;
  readonly migrationId: string;
  readonly to: Extract<EntityMigrationStatus, 'AWAITING_ACCEPTANCE' | 'MIGRATED' | 'BLOCKED'>;
  readonly reason: string;
  readonly now: Date;
}

/**
 * RECONSENT_EVALUATED -> AWAITING_ACCEPTANCE | MIGRATED, and
 * AWAITING_ACCEPTANCE -> MIGRATED | BLOCKED. Terminal transitions set
 * completedAt; the domain state machine (and the schema trigger) refuse
 * everything else.
 */
export class AdvanceEntityMigration {
  constructor(
    private readonly migrations: EntityMigrationRepository,
    private readonly policy: PolicyService,
    private readonly audit: EntityAuditTrail,
  ) {}

  async execute(input: AdvanceEntityMigrationInput): Promise<Result<void, EntityMigrationError>> {
    requireNonEmpty('reason', input.reason);
    const authorized = await this.policy.authorize(
      input.principal,
      ENTITY_PERMISSIONS.approveMigration,
    );
    if (!authorized.ok) {
      return authorized;
    }
    let migration;
    try {
      migration = await this.migrations.findById(input.migrationId);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (migration === null) {
      return Result.err({ kind: 'NOT_FOUND', resource: 'entity_migration', id: input.migrationId });
    }
    if (!migrationTransitionAllowed(migration.status, input.to)) {
      return Result.err({
        kind: 'INVALID_TRANSITION',
        from: migration.status,
        to: input.to,
        message: `entity migration ${migration.id} cannot move ${migration.status} -> ${input.to}`,
      });
    }
    const terminal = input.to === 'MIGRATED' || input.to === 'BLOCKED';
    try {
      await this.migrations.advance(
        input.migrationId,
        input.to,
        terminal ? { completedAt: input.now } : {},
      );
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    const audited = await this.audit.record({
      occurredAt: input.now,
      actorRef: input.principal.principalRef,
      action:
        input.to === 'MIGRATED'
          ? 'entity.migration.completed'
          : input.to === 'BLOCKED'
            ? 'entity.migration.blocked'
            : 'entity.migration.awaiting_acceptance',
      resourceType: 'entity_migration',
      resourceId: input.migrationId,
      reason: input.reason,
      beforeMetadata: { status: migration.status },
      afterMetadata: { status: input.to },
    });
    return audited.ok ? Result.ok(undefined) : audited;
  }
}
