/**
 * The validator's own evidence.
 *
 * A conformance suite that validates nothing is INDISTINGUISHABLE from one
 * that finds nothing wrong: both print green. So before any real response is
 * held against the contract, the thing doing the holding is shown to reject —
 * with the exact message it would print — an extra property, a wrong type, a
 * missing required property, and a keyword it does not implement.
 *
 * These run against schema literals rather than the document, deliberately:
 * this file is about the CHECKER, and a checker proven on the contract alone
 * would leave "does it enforce closure at all?" answered only where the
 * contract happens to ask for closure today.
 */

import { describe, expect, it } from 'vitest';

import {
  UnsupportedSchemaKeyword,
  validateAgainstSchema,
  type RefResolver,
  type SchemaNode,
} from '../schema-validator.js';

/** No fixture here uses `$ref`; a call to this resolver is itself a failure. */
const noRefs: RefResolver = (ref) => {
  throw new Error(`unexpected $ref '${ref}' in a fixture schema`);
};

function schema(node: unknown): SchemaNode {
  return { node, documentId: '<fixture>' };
}

function violations(node: unknown, value: unknown): string[] {
  return validateAgainstSchema(schema(node), value, noRefs).map(
    (violation) => `${violation.path === '' ? '<root>' : violation.path}: ${violation.message}`,
  );
}

/** The closed shape the consent listing declares for `effectiveVersion`. */
const CLOSED_VERSION = {
  type: ['object', 'null'],
  required: ['versionId', 'version', 'contentHash'],
  additionalProperties: false,
  properties: {
    versionId: { type: 'string', format: 'uuid' },
    version: { type: 'string' },
    contentHash: { type: 'string' },
  },
};

const CONFORMING = {
  versionId: '0f9d1b6c-3d43-4d0a-9c2f-2c8b8f0d1a11',
  version: '1.0.0',
  contentHash: 'a'.repeat(64),
};

describe('the validator enforces what it claims to enforce', () => {
  it('accepts the conforming instance — so every rejection below is about the change, not the fixture', () => {
    expect(violations(CLOSED_VERSION, CONFORMING)).toEqual([]);
  });

  it('REJECTS an undeclared property (additionalProperties: false)', () => {
    // The exact leak class this phase already had once: a handler spreads its
    // internal record and the storage locator ships to every subject.
    const leaked = { ...CONFORMING, storageRef: 'store://karar-internal-bucket/notice/v1' };

    expect(violations(CLOSED_VERSION, leaked)).toEqual([
      'storageRef: undeclared property (the schema closes this object: additionalProperties false)',
    ]);
  });

  it('REJECTS a wrong type', () => {
    expect(violations(CLOSED_VERSION, { ...CONFORMING, version: 3 })).toEqual([
      'version: expected type string, received integer',
    ]);
  });

  it('REJECTS a missing required property', () => {
    const withoutHash: Record<string, unknown> = { ...CONFORMING };
    delete withoutHash['contentHash'];

    expect(violations(CLOSED_VERSION, withoutHash)).toEqual([
      'contentHash: required property is missing',
    ]);
  });

  it('distinguishes an explicit null from an absent property', () => {
    // The contract states several fields as `[string, 'null']` precisely so a
    // client can tell "resolved to nothing" from "the server forgot". A
    // validator that treated them alike would erase that distinction.
    expect(violations(CLOSED_VERSION, { ...CONFORMING, contentHash: null })).toEqual([
      'contentHash: expected type string, received null',
    ]);
    expect(violations({ type: ['string', 'null'] }, null)).toEqual([]);
  });

  it('enforces format rather than annotating it', () => {
    expect(violations(CLOSED_VERSION, { ...CONFORMING, versionId: 'not-a-uuid' })).toEqual([
      'versionId: is not a UUID (format: uuid)',
    ]);
    expect(violations({ type: 'string', format: 'date-time' }, '2026-08-18')).toEqual([
      '<root>: is not an RFC 3339 date-time with an explicit offset (format: date-time)',
    ]);
    // A timestamp with no offset is ambiguous to every client that reads it.
    expect(violations({ type: 'string', format: 'date-time' }, '2026-08-18T12:00:00')).toHaveLength(
      1,
    );
  });

  it('THROWS on a keyword it does not implement, rather than passing the instance', () => {
    // The failure mode that makes a suite quietly stop checking: a keyword
    // arrives, nobody teaches the validator, and everything still passes.
    expect(() => violations({ allOf: [{ type: 'string' }] }, 42)).toThrow(UnsupportedSchemaKeyword);
    expect(() => violations({ type: 'string', format: 'ipv4' }, '10.0.0.1')).toThrow(
      /format: ipv4/,
    );
    expect(() => violations({ type: 'string', uniqueItems: true }, 'x')).toThrow(
      /keyword 'uniqueItems'/,
    );
  });

  it('reports every violation in one pass, not just the first', () => {
    expect(violations(CLOSED_VERSION, { versionId: 7, version: '1', extra: true })).toEqual([
      'contentHash: required property is missing',
      'versionId: expected type string, received integer',
      'extra: undeclared property (the schema closes this object: additionalProperties false)',
    ]);
  });

  it('leaves an OPEN object open — closure is the contract’s choice, not the validator’s', () => {
    // Most response schemas here are deliberately open. A validator that
    // closed them all would fail conforming responses and, worse, would make
    // `additionalProperties: false` look enforced where it is not written.
    const open = { type: 'object', required: ['a'], properties: { a: { type: 'string' } } };

    expect(violations(open, { a: 'x', b: 'anything' })).toEqual([]);
  });

  it('descends into arrays and nested objects, naming the path that failed', () => {
    const listing = {
      type: 'object',
      required: ['documents'],
      properties: { documents: { type: 'array', items: CLOSED_VERSION } },
    };

    expect(
      violations(listing, { documents: [CONFORMING, { ...CONFORMING, storageRef: 'store://x' }] }),
    ).toEqual([
      'documents/1/storageRef: undeclared property (the schema closes this object: additionalProperties false)',
    ]);
  });

  it('enforces array cardinality (minItems / maxItems), not only element shape', () => {
    // The identity fragment declares the recovery-code set as EXACTLY ten.
    // Every per-element rule holds for a nine-element answer, so without this
    // the count would be documented and unchecked.
    const exactlyTen = { type: 'array', minItems: 10, maxItems: 10, items: { type: 'string' } };
    const ten = Array.from({ length: 10 }, (_, index) => `code-${String(index)}`);

    expect(violations(exactlyTen, ten)).toEqual([]);
    expect(violations(exactlyTen, ten.slice(1))).toEqual([
      '<root>: has fewer than the declared minItems 10',
    ]);
    expect(violations(exactlyTen, [...ten, 'code-10'])).toEqual([
      '<root>: has more than the declared maxItems 10',
    ]);
    // Cardinality and element shape are reported together, not one instead of
    // the other: a short array of wrong things is two facts, not one.
    expect(violations(exactlyTen, [1, 2])).toEqual([
      '<root>: has fewer than the declared minItems 10',
      '0: expected type string, received integer',
      '1: expected type string, received integer',
    ]);
  });

  it('requires exactly one oneOf branch to match', () => {
    const binding = {
      oneOf: [
        { type: 'object', required: ['kind'], properties: { kind: { enum: ['UNBOUND'] } } },
        {
          type: 'object',
          required: ['kind', 'tenant'],
          properties: { kind: { enum: ['BOUND'] }, tenant: { type: 'string' } },
        },
      ],
    };

    expect(violations(binding, { kind: 'BOUND', tenant: 't' })).toEqual([]);
    expect(violations(binding, { kind: 'BOUND' })).toHaveLength(1);
    expect(violations(binding, { kind: 'SOMETHING_NEW' })).toHaveLength(1);
  });
});
