/**
 * The provider-neutral publisher port and the local in-memory bus.
 *
 * `EventPublisher` is the ONLY transport contract the outbox relay knows
 * (infrastructure-portability.md section 5: `EventBus` is a provider port).
 * There is deliberately no cloud transport here — a deployment phase that
 * introduces one implements this same interface in its own adapter and the
 * relay never changes.
 *
 * Consumer rules implemented by the in-memory bus (event-governance.md
 * section 6): subscription is refused unless the consumer is in the entry's
 * `allowedConsumers`; consumers are failure-isolated — one consumer throwing
 * neither stops the others nor fails the publish. `publish` resolving means
 * "delivered to every subscribed consumer's handler"; what each handler made
 * of it is that consumer's outcome, reported through `onConsumerError`.
 */
import { assertConsumerAllowed, getEventEntry, type EventCatalogue } from '@karar/api-contracts';

import type { EventEnvelope } from './envelope.js';

/** Transport port the outbox relay publishes through. */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

export type EventHandler = (envelope: EventEnvelope) => void | Promise<void>;

export interface ConsumerFailure {
  readonly consumerName: string;
  readonly eventId: string;
  readonly eventName: string;
  readonly error: unknown;
}

export interface InMemoryEventBusOptions {
  /**
   * Failure-isolation seam: called once per consumer that threw. The error
   * never propagates to `publish` — the boundary that owns consumer outcomes
   * (the worker) logs and measures here.
   */
  readonly onConsumerError?: (failure: ConsumerFailure) => void;
}

interface Subscription {
  readonly consumerName: string;
  readonly handler: EventHandler;
}

export class InMemoryEventBus implements EventPublisher {
  private readonly catalogue: EventCatalogue;
  private readonly onConsumerError: ((failure: ConsumerFailure) => void) | undefined;
  private readonly subscriptions = new Map<string, Subscription[]>();

  constructor(catalogue: EventCatalogue, options: InMemoryEventBusOptions = {}) {
    this.catalogue = catalogue;
    this.onConsumerError = options.onConsumerError;
  }

  /**
   * Registers `handler` for `eventName` under `consumerName`. Throws
   * `EventCatalogueError` when the event is unknown or the consumer is not in
   * its allow-list — the subscription never silently exists.
   */
  subscribe(consumerName: string, eventName: string, handler: EventHandler): void {
    assertConsumerAllowed(this.catalogue, eventName, consumerName);
    const existing = this.subscriptions.get(eventName) ?? [];
    existing.push({ consumerName, handler });
    this.subscriptions.set(eventName, existing);
  }

  /**
   * Delivers to every subscription for the envelope's event, awaiting each
   * handler (sync or async) with per-consumer isolation. Publishing an
   * uncatalogued envelope throws before any delivery.
   */
  async publish(envelope: EventEnvelope): Promise<void> {
    getEventEntry(this.catalogue, envelope.eventName);
    const subscriptions = this.subscriptions.get(envelope.eventName) ?? [];
    for (const subscription of subscriptions) {
      try {
        await subscription.handler(envelope);
      } catch (error) {
        this.onConsumerError?.({
          consumerName: subscription.consumerName,
          eventId: envelope.eventId,
          eventName: envelope.eventName,
          error,
        });
      }
    }
  }
}
