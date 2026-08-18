/**
 * A store failure never carries the store's words to the caller.
 *
 * WHY THIS SUITE EXISTS. `storeFailure` was documented as wrapping a throw
 * "without leaking its internals to a client" and then interpolated
 * `error.message` straight into the caller-visible text, directly beneath that
 * promise. The account-erasure path did the same thing with the other module's
 * throw. A driver message is the worst possible thing to forward from this
 * module in particular: it can carry the connection string with credentials,
 * the SQL that failed, a table name, a host and port, a file path, and — worst
 * here — a fragment of the row that failed, which in a financial account is
 * exactly the data every other control in this module exists to protect.
 *
 * HOW IT IS PREVENTED, AND WHY THAT SHAPE. The original throw is still needed:
 * `packages/platform/src/observability/logger.ts` states the rule that an
 * error is logged ONCE, at the boundary that turns it into a response, and
 * interior code must not log. So the cause travels attached to the failure but
 * defined NON-ENUMERABLE. `JSON.stringify`, object spread, a structured log
 * line and an RFC 7807 body all drop it without anyone remembering to, while
 * the boundary can still reach it by name. A field that must not be serialized
 * is safer as a field that cannot be.
 *
 * The needles below are the adversarial set: a credentialed connection string,
 * SQL, a customer file path, and a card number.
 */

import { describe, expect, it } from 'vitest';

import { Currency, TenantId, UserId } from '@karar/shared-kernel';

import { storeFailure, recordPresenceUnavailable } from '../application/errors.js';

const CONNECTION_STRING = 'postgres://user:password@internal-host:5432/karar';
const SQL = 'SELECT * FROM transactions';
const FILE_PATH = '/customer/private/statement.csv';
const CARD = 'CARD 4111111111111111';

/** One throw carrying every kind of thing that must not travel outward. */
function poisonedError(): Error {
  const error = new Error(
    `connection to ${CONNECTION_STRING} failed while running ${SQL}; ` +
      `source ${FILE_PATH}; offending row contained ${CARD}`,
  );
  error.stack = `Error: ${error.message}\n    at Object.<anonymous> (${FILE_PATH}:1:1)`;
  return error;
}

const NEEDLES: ReadonlyArray<{ what: string; value: string }> = [
  { what: 'a credentialed connection string', value: CONNECTION_STRING },
  { what: 'the failing SQL', value: SQL },
  { what: 'a customer file path', value: FILE_PATH },
  { what: 'a card number', value: CARD },
  { what: 'the password on its own', value: 'password' },
  { what: 'the internal hostname on its own', value: 'internal-host' },
];

/** Every way this value could plausibly reach a client or a log line. */
function renderings(failure: unknown): Record<string, string> {
  return {
    'JSON.stringify': JSON.stringify(failure) ?? '',
    'object spread': JSON.stringify({ ...(failure as object) }),
    'Object.keys': Object.keys(failure as object).join(','),
    'String()': String((failure as { message?: unknown }).message ?? ''),
    // How a structured logger or an RFC 7807 writer would serialize it.
    'JSON.stringify(entries)': JSON.stringify(Object.entries(failure as object)),
  };
}

describe('a store failure never carries the store text outward', () => {
  it('storeFailure omits every needle from every rendering', () => {
    const failure = storeFailure('read own account', poisonedError());
    for (const [how, rendered] of Object.entries(renderings(failure))) {
      for (const { what, value } of NEEDLES) {
        expect(rendered, `${what} leaked through ${how}`).not.toContain(value);
      }
    }
  });

  it('recordPresenceUnavailable omits every needle from every rendering', () => {
    const failure = recordPresenceUnavailable('transactions', poisonedError());
    for (const [how, rendered] of Object.entries(renderings(failure))) {
      for (const { what, value } of NEEDLES) {
        expect(rendered, `${what} leaked through ${how}`).not.toContain(value);
      }
    }
  });

  it('the message is stable and says where the reason went', () => {
    // A client keying on driver prose would break on a driver upgrade, so the
    // text is ours and does not vary with the error.
    const first = storeFailure('read own account', poisonedError());
    const second = storeFailure('read own account', new Error('something else entirely'));
    expect(first.message).toBe(second.message);
    expect(first.message).toContain('logged once at the boundary');
    expect(first.operation).toBe('read own account');
  });

  it('the cause is still reachable by name, for the one boundary allowed to log it', () => {
    // The counterpart to the assertions above. If redaction also DISCARDED the
    // cause, the failure would be unloggable and an incident would have no
    // trail at all — the fix would have traded a leak for blindness.
    const original = poisonedError();
    const failure = storeFailure('read own account', original);
    expect((failure as { cause?: unknown }).cause).toBe(original);
  });

  it('the cause is non-enumerable, so serialization cannot reach it', () => {
    // This is the structural guarantee. Without it the property would rely on
    // every future serializer remembering to omit one field by name.
    const failure = storeFailure('read own account', poisonedError());
    const descriptor = Object.getOwnPropertyDescriptor(failure, 'cause');
    expect(descriptor?.enumerable).toBe(false);
    expect(Object.keys(failure)).not.toContain('cause');
  });

  it('the needles really are detectable — the scan is not vacuous', () => {
    // The positive control. Without it these assertions could pass because the
    // renderings are empty or the needles no longer appear anywhere.
    const rendered = renderings({ kind: 'x', message: poisonedError().message });
    for (const { value } of NEEDLES) {
      expect(rendered['JSON.stringify']).toContain(value);
    }
    // And the kernel types the module reports with are unaffected by any of it.
    expect(Currency.get('QAR').code).toBe('QAR');
    expect(typeof TenantId.toString(TenantId.of('11111111-1111-1111-1111-111111111111'))).toBe(
      'string',
    );
    expect(typeof UserId.toString(UserId.of('22222222-2222-2222-2222-222222222222'))).toBe(
      'string',
    );
  });
});
