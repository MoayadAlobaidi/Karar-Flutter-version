import { Clock } from '@karar/shared-kernel';
import { describe, expect, it } from 'vitest';
import { parseEventCatalogue } from '@karar/api-contracts';

import { InMemoryEventBus, type ConsumerFailure } from './bus.js';
import { makeEnvelope, recordEnvelope, type EventEnvelope } from './envelope.js';

const catalogue = parseEventCatalogue({
  events: [
    {
      name: 'platform.diagnostic.ping',
      schemaVersion: 1,
      ownerModule: 'platform',
      classification: 'INTERNAL',
      piiFlag: false,
      allowedConsumers: ['platform-tests', 'worker-diagnostics'],
      retention: 'P7D',
      payloadRule: 'payload-permitted',
      payloadExemption: null,
      payloadSchema: {
        type: 'object',
        properties: { pingId: { type: 'string' } },
        required: ['pingId'],
        additionalProperties: false,
      },
    },
  ],
});

const clock = new Clock.Fixed(new Date('2026-08-15T10:00:00.000Z'));

function envelope(pingId: string): EventEnvelope {
  return recordEnvelope(
    makeEnvelope(catalogue, {
      name: 'platform.diagnostic.ping',
      payload: { pingId },
      producer: 'platform-tests',
      clock,
    }),
    clock.now(),
  );
}

describe('InMemoryEventBus', () => {
  it('delivers to every allow-listed subscriber, sync and async', async () => {
    const bus = new InMemoryEventBus(catalogue);
    const seen: string[] = [];
    bus.subscribe('platform-tests', 'platform.diagnostic.ping', (received) => {
      seen.push(`sync:${received.payload['pingId'] as string}`);
    });
    bus.subscribe('worker-diagnostics', 'platform.diagnostic.ping', async (received) => {
      await Promise.resolve();
      seen.push(`async:${received.payload['pingId'] as string}`);
    });

    await bus.publish(envelope('p-1'));
    expect(seen).toEqual(['sync:p-1', 'async:p-1']);
  });

  it('refuses a subscription from a consumer outside the allow-list', () => {
    const bus = new InMemoryEventBus(catalogue);
    expect(() =>
      bus.subscribe('projections', 'platform.diagnostic.ping', () => undefined),
    ).toThrowError(
      expect.objectContaining({ name: 'EventCatalogueError', kind: 'consumer_not_allowed' }),
    );
  });

  it('refuses a subscription to an event that is not in the catalogue', () => {
    const bus = new InMemoryEventBus(catalogue);
    expect(() => bus.subscribe('platform-tests', 'no.such.event', () => undefined)).toThrowError(
      expect.objectContaining({ kind: 'unknown_event' }),
    );
  });

  it('refuses publishing an envelope whose event is not in the catalogue', async () => {
    const bus = new InMemoryEventBus(catalogue);
    const rogue = { ...envelope('p-2'), eventName: 'no.such.event' };
    await expect(bus.publish(rogue)).rejects.toMatchObject({ kind: 'unknown_event' });
  });

  it('isolates consumer failures: one thrower stops nobody and never fails publish', async () => {
    const failures: ConsumerFailure[] = [];
    const bus = new InMemoryEventBus(catalogue, { onConsumerError: (f) => failures.push(f) });
    const seen: string[] = [];
    bus.subscribe('platform-tests', 'platform.diagnostic.ping', () => {
      throw new Error('consumer exploded');
    });
    bus.subscribe('worker-diagnostics', 'platform.diagnostic.ping', () => {
      seen.push('survivor');
    });

    const published = envelope('p-3');
    await expect(bus.publish(published)).resolves.toBeUndefined();
    expect(seen).toEqual(['survivor']);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({
      consumerName: 'platform-tests',
      eventId: published.eventId,
      eventName: 'platform.diagnostic.ping',
    });
    expect((failures[0]?.error as Error).message).toBe('consumer exploded');
  });

  it('a rejecting async consumer is isolated identically', async () => {
    const failures: ConsumerFailure[] = [];
    const bus = new InMemoryEventBus(catalogue, { onConsumerError: (f) => failures.push(f) });
    const seen: string[] = [];
    bus.subscribe('platform-tests', 'platform.diagnostic.ping', async () => {
      await Promise.resolve();
      throw new Error('async consumer exploded');
    });
    bus.subscribe('worker-diagnostics', 'platform.diagnostic.ping', () => {
      seen.push('survivor');
    });

    await bus.publish(envelope('p-4'));
    expect(seen).toEqual(['survivor']);
    expect(failures.map((f) => f.consumerName)).toEqual(['platform-tests']);
  });

  it('publishing with no subscribers succeeds (delivery is the relay contract, consumption is not)', async () => {
    const bus = new InMemoryEventBus(catalogue);
    await expect(bus.publish(envelope('p-5'))).resolves.toBeUndefined();
  });
});
