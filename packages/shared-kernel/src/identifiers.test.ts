import { describe, expect, it } from 'vitest';
import { Result, TenantId, UserId } from './index';

const VALID = '0198c2f2-7a34-7cc8-9c33-8a1f2b3c4d5e'; // v7-shaped
const VALID_V4 = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const VALID_UPPER = 'F47AC10B-58CC-4372-A567-0E02B2C3D479';

const INVALID = [
  '',
  'not-a-uuid',
  '0198c2f2-7a34-7cc8-9c33', // truncated
  '0198c2f27a347cc89c338a1f2b3c4d5e', // no hyphens
  '0198c2f2-7a34-7cc8-9c33-8a1f2b3c4d5g', // non-hex digit
  ' 0198c2f2-7a34-7cc8-9c33-8a1f2b3c4d5e', // leading space
  '0198c2f2-7a34-7cc8-9c33-8a1f2b3c4d5e-extra',
];

/** Shared behaviour of the two branded UUID identifiers, kept generic so each brand stays itself. */
function behavesLikeBrandedUuid<Id extends string, E extends Error>(module: {
  of(value: string): Id;
  parse(value: string): Result<Id, E>;
  toString(id: Id): string;
  invalidError: new (value: string) => E;
}): void {
  it('brands any UUID-shaped string, shape only — no version pinning', () => {
    for (const value of [VALID, VALID_V4, VALID_UPPER]) {
      const id = module.of(value);
      expect(module.toString(id)).toBe(value);
    }
  });

  it.each(INVALID)('of throws for %j', (value) => {
    expect(() => module.of(value)).toThrow(module.invalidError);
  });

  it('parse returns a Result instead of throwing — boundary validation is an expected condition', () => {
    const good = module.parse(VALID);
    expect(Result.isOk(good)).toBe(true);
    if (good.ok) {
      expect(module.toString(good.value)).toBe(VALID);
    }

    const bad = module.parse('nope');
    expect(Result.isErr(bad)).toBe(true);
    if (!bad.ok) {
      expect(bad.error).toBeInstanceOf(module.invalidError);
      expect(bad.error.message).toContain('nope');
    }
  });
}

describe('TenantId', () => {
  behavesLikeBrandedUuid<TenantId, TenantId.InvalidTenantIdError>({
    of: TenantId.of,
    parse: TenantId.parse,
    toString: TenantId.toString,
    invalidError: TenantId.InvalidTenantIdError,
  });
});

describe('UserId', () => {
  behavesLikeBrandedUuid<UserId, UserId.InvalidUserIdError>({
    of: UserId.of,
    parse: UserId.parse,
    toString: UserId.toString,
    invalidError: UserId.InvalidUserIdError,
  });
});

describe('brand separation', () => {
  it('keeps TenantId and UserId mutually unassignable at the type level', () => {
    const tenant = TenantId.of(VALID);

    // @ts-expect-error a bare string is not a TenantId
    const fromRaw: TenantId = VALID;
    expect(fromRaw).toBe(VALID); // runtime value is still the string

    // @ts-expect-error a UserId is not a TenantId — the brands differ
    const crossed: TenantId = UserId.of(VALID_V4);
    expect(typeof crossed).toBe('string');

    expect(typeof tenant).toBe('string');
  });
});
