import { describe, expect, it } from 'vitest';
import { Clock, DomainEvent } from './index';

describe('DomainEvent.create', () => {
  const clock = new Clock.Fixed(new Date('2026-08-01T09:30:00Z'));

  it('stamps occurredAt from the injected clock — never from an ambient read', () => {
    const event = DomainEvent.create(
      { eventId: 'evt-1', name: 'transactions.TransactionRecorded', payload: { amount: '100' } },
      clock,
    );
    expect(event.eventId).toBe('evt-1');
    expect(event.name).toBe('transactions.TransactionRecorded');
    expect(event.occurredAt.toISOString()).toBe('2026-08-01T09:30:00.000Z');
    expect(event.payload).toEqual({ amount: '100' });
  });

  it('freezes the envelope', () => {
    const event = DomainEvent.create(
      { eventId: 'evt-2', name: 'kernel.Tested', payload: null },
      clock,
    );
    expect(Object.isFrozen(event)).toBe(true);
  });

  it('rejects empty identifiers and names', () => {
    expect(() => DomainEvent.create({ eventId: '', name: 'x.Y', payload: null }, clock)).toThrow(
      /eventId/,
    );
    expect(() => DomainEvent.create({ eventId: 'e', name: '  ', payload: null }, clock)).toThrow(
      /event name/,
    );
  });
});
