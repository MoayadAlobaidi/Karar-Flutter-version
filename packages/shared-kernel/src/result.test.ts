import { describe, expect, it, vi } from 'vitest';
import { Result } from './index';

describe('Result construction and narrowing', () => {
  it('ok carries the value under the true discriminant', () => {
    const result: Result<number, string> = Result.ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('err carries the error under the false discriminant', () => {
    const result: Result<number, string> = Result.err('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('nope');
    }
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('isOk / isErr are exact guards', () => {
    expect(Result.isOk(Result.ok(1))).toBe(true);
    expect(Result.isOk(Result.err('e'))).toBe(false);
    expect(Result.isErr(Result.err('e'))).toBe(true);
    expect(Result.isErr(Result.ok(1))).toBe(false);
  });
});

describe('Result laws', () => {
  const double = (n: number): number => n * 2;
  const addOne = (n: number): number => n + 1;

  it('map: identity preserves the result', () => {
    const result: Result<number, string> = Result.ok(7);
    expect(Result.map(result, (x) => x)).toEqual(Result.ok(7));
  });

  it('map: composition — map(map(r, f), g) equals map(r, g∘f)', () => {
    const result: Result<number, string> = Result.ok(5);
    expect(Result.map(Result.map(result, double), addOne)).toEqual(
      Result.map(result, (x) => addOne(double(x))),
    );
  });

  it('map passes an error through untouched, without calling fn', () => {
    const fn = vi.fn(double);
    const failure: Result<number, string> = Result.err('broken');
    expect(Result.map(failure, fn)).toEqual(Result.err('broken'));
    expect(fn).not.toHaveBeenCalled();
  });

  it('mapErr transforms only the error arm', () => {
    expect(Result.mapErr(Result.err('e') as Result<number, string>, (e) => e.length)).toEqual(
      Result.err(1),
    );
    const fn = vi.fn((e: string) => e.length);
    expect(Result.mapErr(Result.ok(3) as Result<number, string>, fn)).toEqual(Result.ok(3));
    expect(fn).not.toHaveBeenCalled();
  });

  it('unwrapOr returns the value or the fallback', () => {
    expect(Result.unwrapOr(Result.ok(9) as Result<number, string>, 0)).toBe(9);
    expect(Result.unwrapOr(Result.err('e') as Result<number, string>, 0)).toBe(0);
  });

  it('andThen chains and short-circuits on the first error', () => {
    const parse = (text: string): Result<number, string> =>
      /^\d+$/.test(text) ? Result.ok(Number(text)) : Result.err(`not a number: ${text}`);
    const requirePositive = (n: number): Result<number, string> =>
      n > 0 ? Result.ok(n) : Result.err('not positive');

    expect(Result.andThen(parse('42'), requirePositive)).toEqual(Result.ok(42));
    expect(Result.andThen(parse('0'), requirePositive)).toEqual(Result.err('not positive'));

    const never = vi.fn(requirePositive);
    expect(Result.andThen(parse('x'), never)).toEqual(Result.err('not a number: x'));
    expect(never).not.toHaveBeenCalled();
  });

  it('andThen is associative over a pipeline', () => {
    const half = (n: number): Result<number, string> =>
      n % 2 === 0 ? Result.ok(n / 2) : Result.err('odd');
    const start: Result<number, string> = Result.ok(8);
    const left = Result.andThen(Result.andThen(start, half), half);
    const right = Result.andThen(start, (n) => Result.andThen(half(n), half));
    expect(left).toEqual(right);
    expect(left).toEqual(Result.ok(2));
  });
});
