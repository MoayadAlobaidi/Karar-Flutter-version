/* eslint-disable @typescript-eslint/no-namespace -- the kernel surface is capped
   at nine exported names (architecture test 20); supporting types and errors
   therefore hang off the universal via declaration merging. */
import { KernelError } from './internal/kernel-error';

/**
 * Time arrives as an argument. Domain code never reads the system clock
 * (architecture test 11); it receives a `Clock` and asks it.
 *
 * The production implementation reads the host clock and is therefore an
 * infrastructure adapter, not a kernel member — architecture test 11 bans
 * system-clock reads (`Date.now()`, zero-argument `new Date()`) in this
 * package, deliberately: a kernel that can read the wall clock would let
 * every pure calculator do so transitively. Composition roots provide it as a
 * one-line adapter over the host clock satisfying this interface. Tests use
 * `Clock.Fixed`.
 */
export interface Clock {
  /** The current instant. Each call returns a fresh `Date`. */
  now(): Date;
}

export namespace Clock {
  /**
   * A deterministic clock for tests and replays: reports exactly the instant
   * it was constructed at, until `advance` moves it. Returned `Date`s are
   * fresh copies, so callers mutating one cannot move the clock.
   */
  export class Fixed implements Clock {
    private millis: number;

    constructor(start: Date) {
      const millis = start.getTime();
      if (Number.isNaN(millis)) {
        throw new KernelError('Clock.Fixed requires a valid start Date');
      }
      this.millis = millis;
    }

    now(): Date {
      return new Date(this.millis);
    }

    /** Move the clock forward (or, with a negative value, backward) by whole milliseconds. */
    advance(byMilliseconds: number): void {
      if (!Number.isInteger(byMilliseconds)) {
        throw new KernelError(
          `Clock.Fixed.advance requires an integer millisecond count, got ${byMilliseconds}`,
        );
      }
      this.millis += byMilliseconds;
    }
  }
}
