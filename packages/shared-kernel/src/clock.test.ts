import { describe, expect, it } from 'vitest';
import { Clock } from './index';

describe('Clock.Fixed', () => {
  it('reports exactly its start instant until advanced', () => {
    const clock = new Clock.Fixed(new Date('2026-01-01T00:00:00Z'));
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('advances by whole milliseconds, forward and backward', () => {
    const clock = new Clock.Fixed(new Date('2026-01-01T00:00:00Z'));
    clock.advance(1500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.500Z');
    clock.advance(-500);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:01.000Z');
  });

  it('returns fresh Dates: mutating one cannot move the clock', () => {
    const clock = new Clock.Fixed(new Date('2026-01-01T00:00:00Z'));
    const first = clock.now();
    first.setFullYear(1999);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(clock.now()).not.toBe(first);
  });

  it('rejects an invalid start date and fractional advances', () => {
    expect(() => new Clock.Fixed(new Date('nonsense'))).toThrow(/valid start Date/);
    const clock = new Clock.Fixed(new Date('2026-01-01T00:00:00Z'));
    expect(() => clock.advance(0.5)).toThrow(/integer millisecond/);
  });

  it('satisfies the Clock interface for injection', () => {
    const stamp = (clock: Clock): Date => clock.now();
    expect(stamp(new Clock.Fixed(new Date('2026-06-01T12:00:00Z'))).toISOString()).toBe(
      '2026-06-01T12:00:00.000Z',
    );
  });
});
