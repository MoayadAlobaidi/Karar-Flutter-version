/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); the factory therefore hangs
   off the universal via declaration merging. */
import type { Clock } from './clock';
import { KernelError } from './internal/kernel-error';

/**
 * The minimal fact-that-happened shape every module can speak without knowing
 * any other module. Deliberately thin: transport envelope richness —
 * correlation, causation, tenant routing, schema versions — belongs to the
 * platform event envelope, and which events may be published at all is
 * governed by the catalogue in `packages/api-contracts/events`. The kernel
 * stays framework- and serialization-free.
 */
export interface DomainEvent {
  /** Unique id of this occurrence. Supplied by the caller: the kernel has no randomness (architecture test 11). */
  readonly eventId: string;
  /** Catalogue name of the event, e.g. 'transactions.TransactionRecorded'. */
  readonly name: string;
  /** When it happened, stamped from an injected Clock. */
  readonly occurredAt: Date;
  /** Event-specific data; typed by the catalogue entry, opaque to the kernel. */
  readonly payload: unknown;
}

export namespace DomainEvent {
  /**
   * Assemble an event, stamping `occurredAt` from the injected clock. Both id
   * generation and time are the caller's dependencies, never ambient reads.
   */
  export function create(
    input: { eventId: string; name: string; payload: unknown },
    clock: Clock,
  ): DomainEvent {
    if (input.eventId.trim() === '') {
      throw new KernelError('DomainEvent.create requires a non-empty eventId');
    }
    if (input.name.trim() === '') {
      throw new KernelError('DomainEvent.create requires a non-empty event name');
    }
    return Object.freeze({
      eventId: input.eventId,
      name: input.name,
      occurredAt: clock.now(),
      payload: input.payload,
    });
  }
}
