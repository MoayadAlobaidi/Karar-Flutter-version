/**
 * ResolveClientCapabilityView — the CLIENT-SAFE face of the resolver, the
 * one the bootstrap endpoint consumes. It runs the full internal resolution
 * and then applies the domain's client projection: HIDDEN capabilities and
 * non-surfaceable denial reasons are OMITTED ENTIRELY (never returned as
 * `available: false`), actionable reasons surface, and PENDING_PROVIDER is
 * explainable only where the descriptor opts in.
 *
 * Hidden filtering lives in `domain/client-view.ts` and is applied HERE and
 * nowhere else — no other code path derives client visibility.
 */

import { Result } from '@karar/shared-kernel';
import type { KararEnvironment } from '@karar/capability-registry';

import { toClientView, type ClientCapabilityEntry } from '../../domain/client-view.js';
import { clientExposureFactsFor, type CapabilityRegistryView } from '../registry-view.js';
import type {
  ResolveCapabilityAvailability,
  ResolveCapabilityAvailabilityError,
  ResolutionSubject,
} from './resolve-capability-availability.js';

export interface ClientCapabilityViewInput {
  readonly subject: ResolutionSubject;
  readonly now: Date;
}

export interface ClientCapabilityView<Id extends string> {
  readonly environment: KararEnvironment;
  readonly resolvedAt: Date;
  readonly capabilities: ReadonlyArray<ClientCapabilityEntry<Id>>;
}

export class ResolveClientCapabilityView<Id extends string> {
  constructor(
    private readonly registry: CapabilityRegistryView<Id>,
    private readonly resolver: ResolveCapabilityAvailability<Id>,
  ) {}

  async execute(
    input: ClientCapabilityViewInput,
  ): Promise<Result<ClientCapabilityView<Id>, ResolveCapabilityAvailabilityError>> {
    const resolved = await this.resolver.execute({ subject: input.subject, now: input.now });
    if (!resolved.ok) return resolved;
    const capabilities = toClientView(resolved.value.resolutions, (capabilityId) => {
      const descriptor = this.registry.descriptors[capabilityId];
      // A resolution for an id outside the view cannot exist (the resolver
      // validates); fail closed to hidden if it ever did.
      return descriptor === undefined
        ? { hidden: true, providerPendingExplainable: false }
        : clientExposureFactsFor(descriptor);
    });
    return Result.ok({
      environment: resolved.value.environment,
      resolvedAt: resolved.value.resolvedAt,
      capabilities,
    });
  }
}
