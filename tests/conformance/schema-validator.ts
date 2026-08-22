/**
 * A strict, dependency-free validator for the JSON Schema subset the Karar
 * OpenAPI 3.1 document actually uses.
 *
 * WHY NOT A LIBRARY. The single defect this suite exists to catch is an
 * undeclared field in a real response — `additionalProperties: false`
 * enforced against something rather than nobody. Every general-purpose
 * validator has a configuration under which that keyword is quietly inert
 * (draft selection, `strict` mode, OpenAPI-dialect vocabularies, an
 * `unknownFormats` policy that also relaxes neighbours). A conformance suite
 * whose central assertion depends on a configuration flag is one flag away
 * from validating nothing, and — this is the part that matters — it would
 * still look exactly like a passing suite. So the enforcement is written out
 * here, in the open, and asserted directly (__tests__/schema-validator.test.ts).
 *
 * WHY IT REFUSES RATHER THAN IGNORES. Every keyword this file does not
 * implement is a THROW, not a skip. That inverts the usual failure mode: the
 * day somebody adds `allOf`, `anyOf`, `const`, or `uniqueItems` to the
 * contract, this suite stops with a named error instead of silently ceasing
 * to check that part of the shape. An unimplemented keyword must never read
 * as a satisfied one.
 *
 * `format` is enforced, not annotated. OpenAPI leaves `format` advisory; here
 * it is checked, and an unrecognised format string throws — a contract that
 * starts promising `format: ipv4` must not pass by virtue of nobody having
 * taught this file what ipv4 means.
 *
 * The sibling of that rule: this file is deliberately about SHAPE only. It
 * never reads the meaning of a value, so its messages name paths, types, and
 * rules — never response values, which may carry subject data.
 */

/** Where a schema node lives, so `$ref` resolves against its OWN document. */
export interface SchemaNode {
  readonly node: unknown;
  /** Absolute path of the document holding `node`; `$ref` is relative to it. */
  readonly documentId: string;
}

/** Follows one `$ref` from the document that contains it. */
export type RefResolver = (ref: string, from: SchemaNode) => SchemaNode;

export interface Violation {
  /** JSON-Pointer-ish path into the instance, e.g. `documents/0/effectiveVersion`. */
  readonly path: string;
  readonly message: string;
}

/** A keyword the contract uses and this validator does not implement. */
export class UnsupportedSchemaKeyword extends Error {
  override readonly name = 'UnsupportedSchemaKeyword';
  constructor(keyword: string, at: string) {
    super(
      `The contract uses JSON Schema keyword '${keyword}' at ${at}, which the conformance ` +
        `validator does not implement. Implement it in tests/conformance/schema-validator.ts — ` +
        `an unimplemented keyword must never be mistaken for a satisfied one.`,
    );
  }
}

/**
 * Keywords carrying documentation or client-decoding hints only. Each is
 * listed with the reason it constrains no instance, so "ignored" is a
 * reviewed decision per keyword rather than a catch-all.
 */
const ANNOTATION_KEYWORDS: ReadonlyMap<string, string> = new Map([
  ['description', 'prose'],
  ['title', 'prose'],
  ['summary', 'prose'],
  ['example', 'illustration; constrains nothing'],
  ['examples', 'illustration; constrains nothing'],
  ['deprecated', 'lifecycle marker'],
  // A default is what a SERVER substitutes for an absent request field. It
  // says nothing about a response, and treating it as one would let a missing
  // field pass as present.
  ['default', 'request-side substitution; never a response guarantee'],
  // `oneOf` already demands exactly one matching branch, so the discriminator
  // adds no constraint — it tells a generated client which branch to decode.
  ['discriminator', 'decoding hint; oneOf already requires exactly one match'],
]);

/** The primitive type names OpenAPI 3.1 / JSON Schema 2020-12 uses. */
type JsonType = 'null' | 'boolean' | 'object' | 'array' | 'number' | 'integer' | 'string';

const KNOWN_TYPES: ReadonlySet<string> = new Set<JsonType>([
  'null',
  'boolean',
  'object',
  'array',
  'number',
  'integer',
  'string',
]);

/**
 * Formats the contract actually promises. Each is checked with the shape the
 * server genuinely emits — deliberately not a permissive superset, because a
 * format check that accepts everything is the same as no format check.
 */
const FORMAT_CHECKS: ReadonlyMap<string, { test: (value: string) => boolean; describe: string }> =
  new Map([
    [
      'uuid',
      {
        test: (value) =>
          /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
            value,
          ),
        describe: 'a UUID',
      },
    ],
    [
      // A CALENDAR DAY, and nothing else (ADR-0027). `2026-08-12` is what an
      // institution wrote on its books; it is not a moment, and a value
      // carrying a time or a zone is REFUSED here rather than truncated —
      // truncating would silently decide which timezone turns the instant
      // into a day, which is exactly the decision the type exists to force
      // somebody to make. The range check is real too: `2026-02-30` matches
      // the shape and is not a date.
      'date',
      {
        test: (value) => {
          const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
          if (match === null) return false;
          const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
          if (month < 1 || month > 12 || day < 1) return false;
          return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
        },
        describe: 'an ISO calendar date YYYY-MM-DD with no time and no zone',
      },
    ],
    [
      // ISO-8601 with an explicit offset. A timestamp without one is ambiguous
      // to every client that receives it, so it is not accepted here.
      'date-time',
      {
        test: (value) =>
          /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(\.\d+)?([Zz]|[+-]\d{2}:\d{2})$/.test(value) &&
          !Number.isNaN(Date.parse(value)),
        describe: 'an RFC 3339 date-time with an explicit offset',
      },
    ],
    [
      // Shape only: an address is deliverable or not, and this suite cannot
      // and must not decide that. What it rejects is the structurally absurd.
      'email',
      {
        test: (value) => /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value),
        describe: 'an email address',
      },
    ],
  ]);

function typeOf(value: unknown): JsonType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'boolean':
      return 'boolean';
    case 'string':
      return 'string';
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    default:
      return 'object';
  }
}

function matchesType(value: unknown, declared: JsonType): boolean {
  const actual = typeOf(value);
  // Every integer is a number; the converse is not true.
  if (declared === 'number') return actual === 'number' || actual === 'integer';
  return actual === declared;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function join(path: string, segment: string | number): string {
  return path === '' ? String(segment) : `${path}/${String(segment)}`;
}

/**
 * Validates `value` against the schema at `schema`, following `$ref` through
 * `resolve`. Returns every violation found; an empty array means the instance
 * conforms. Throws `UnsupportedSchemaKeyword` if the schema asks for something
 * this file cannot check.
 */
export function validateAgainstSchema(
  schema: SchemaNode,
  value: unknown,
  resolve: RefResolver,
): Violation[] {
  const violations: Violation[] = [];
  check(schema, value, '', resolve, violations);
  return violations;
}

function check(
  schema: SchemaNode,
  value: unknown,
  path: string,
  resolve: RefResolver,
  out: Violation[],
): void {
  const node = schema.node;
  // `true` and `false` are legal schemas in 2020-12 (accept all / reject all).
  if (node === true) return;
  if (node === false) {
    out.push({ path, message: 'schema is `false`: no value is valid here' });
    return;
  }
  if (!isPlainObject(node)) {
    throw new Error(`Schema at ${path === '' ? '<root>' : path} is not an object`);
  }

  // A `$ref` replaces the schema wholesale here: the contract never places
  // sibling constraints beside one, and silently dropping them if it did
  // would be exactly the quiet under-enforcement this file forbids.
  const ref = node['$ref'];
  if (typeof ref === 'string') {
    const siblings = Object.keys(node).filter((key) => key !== '$ref');
    if (siblings.length > 0) {
      throw new UnsupportedSchemaKeyword(
        `$ref with sibling keywords (${siblings.join(', ')})`,
        path === '' ? '<root>' : path,
      );
    }
    check(resolve(ref, schema), value, path, resolve, out);
    return;
  }

  for (const keyword of Object.keys(node)) {
    if (!SUPPORTED_KEYWORDS.has(keyword) && !ANNOTATION_KEYWORDS.has(keyword)) {
      throw new UnsupportedSchemaKeyword(keyword, path === '' ? '<root>' : path);
    }
  }

  checkType(node, value, path, out);
  checkEnum(node, value, path, out);
  checkOneOf(node, schema, value, path, resolve, out);
  if (typeof value === 'string') checkString(node, value, path, out);
  if (typeof value === 'number') checkNumber(node, value, path, out);
  if (Array.isArray(value)) checkArray(node, schema, value, path, resolve, out);
  if (isPlainObject(value)) checkObject(node, schema, value, path, resolve, out);
}

const SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  '$ref',
  'type',
  'enum',
  'format',
  'properties',
  'required',
  'additionalProperties',
  'minProperties',
  'items',
  'minItems',
  'maxItems',
  'oneOf',
  'pattern',
  'minLength',
  'maxLength',
  'minimum',
  'maximum',
]);

function checkType(
  node: Record<string, unknown>,
  value: unknown,
  path: string,
  out: Violation[],
): void {
  const declared = node['type'];
  if (declared === undefined) return;
  const accepted = Array.isArray(declared) ? declared : [declared];
  for (const candidate of accepted) {
    if (typeof candidate !== 'string' || !KNOWN_TYPES.has(candidate)) {
      throw new UnsupportedSchemaKeyword(`type: ${JSON.stringify(candidate)}`, path || '<root>');
    }
  }
  if (!accepted.some((candidate) => matchesType(value, candidate as JsonType))) {
    out.push({
      path,
      message: `expected type ${accepted.join(' | ')}, received ${typeOf(value)}`,
    });
  }
}

function checkEnum(
  node: Record<string, unknown>,
  value: unknown,
  path: string,
  out: Violation[],
): void {
  const allowed = node['enum'];
  if (allowed === undefined) return;
  if (!Array.isArray(allowed)) {
    throw new UnsupportedSchemaKeyword('enum (not an array)', path || '<root>');
  }
  // Scalar members only, compared by identity. The contract's enums are all
  // strings and nulls; a structural member would need deep equality, and
  // guessing at that silently is how a wrong value passes.
  for (const member of allowed) {
    if (member !== null && typeof member === 'object') {
      throw new UnsupportedSchemaKeyword('enum with a non-scalar member', path || '<root>');
    }
  }
  if (!allowed.includes(value)) {
    out.push({ path, message: `value is not one of the declared enum members` });
  }
}

function checkOneOf(
  node: Record<string, unknown>,
  schema: SchemaNode,
  value: unknown,
  path: string,
  resolve: RefResolver,
  out: Violation[],
): void {
  const branches = node['oneOf'];
  if (branches === undefined) return;
  if (!Array.isArray(branches)) {
    throw new UnsupportedSchemaKeyword('oneOf (not an array)', path || '<root>');
  }
  const failures: Violation[][] = [];
  let matched = 0;
  for (const branch of branches) {
    const branchViolations: Violation[] = [];
    check({ node: branch, documentId: schema.documentId }, value, path, resolve, branchViolations);
    if (branchViolations.length === 0) matched += 1;
    else failures.push(branchViolations);
  }
  if (matched === 1) return;
  if (matched === 0) {
    out.push({
      path,
      message:
        `matched none of the ${String(branches.length)} oneOf branches; ` +
        failures
          .map((branch, index) => `[${String(index)}] ${branch.map((v) => v.message).join(', ')}`)
          .join(' | '),
    });
    return;
  }
  // Ambiguity is a CONTRACT defect, not a response defect: two branches
  // accepting the same body means a client cannot decode it deterministically.
  out.push({
    path,
    message: `matched ${String(matched)} oneOf branches; exactly one must match`,
  });
}

function checkString(
  node: Record<string, unknown>,
  value: string,
  path: string,
  out: Violation[],
): void {
  const format = node['format'];
  if (format !== undefined) {
    if (typeof format !== 'string') {
      throw new UnsupportedSchemaKeyword('format (not a string)', path || '<root>');
    }
    const check_ = FORMAT_CHECKS.get(format);
    if (check_ === undefined) {
      throw new UnsupportedSchemaKeyword(`format: ${format}`, path || '<root>');
    }
    if (!check_.test(value)) {
      out.push({ path, message: `is not ${check_.describe} (format: ${format})` });
    }
  }
  const pattern = node['pattern'];
  if (pattern !== undefined) {
    if (typeof pattern !== 'string') {
      throw new UnsupportedSchemaKeyword('pattern (not a string)', path || '<root>');
    }
    if (!new RegExp(pattern, 'u').test(value)) {
      out.push({ path, message: `does not match the declared pattern` });
    }
  }
  const minLength = node['minLength'];
  if (typeof minLength === 'number' && value.length < minLength) {
    out.push({ path, message: `is shorter than the declared minLength ${String(minLength)}` });
  }
  const maxLength = node['maxLength'];
  if (typeof maxLength === 'number' && value.length > maxLength) {
    out.push({ path, message: `is longer than the declared maxLength ${String(maxLength)}` });
  }
}

function checkNumber(
  node: Record<string, unknown>,
  value: number,
  path: string,
  out: Violation[],
): void {
  const minimum = node['minimum'];
  if (typeof minimum === 'number' && value < minimum) {
    out.push({ path, message: `is below the declared minimum ${String(minimum)}` });
  }
  const maximum = node['maximum'];
  if (typeof maximum === 'number' && value > maximum) {
    out.push({ path, message: `is above the declared maximum ${String(maximum)}` });
  }
}

function checkArray(
  node: Record<string, unknown>,
  schema: SchemaNode,
  value: readonly unknown[],
  path: string,
  resolve: RefResolver,
  out: Violation[],
): void {
  // Cardinality, then shape. The contract uses these where the COUNT is the
  // promise rather than a limit — the MFA confirmation returns exactly ten
  // recovery codes, and a response that returned nine would still satisfy
  // every per-element rule below while breaking the client that stores them.
  const minItems = node['minItems'];
  if (typeof minItems === 'number' && value.length < minItems) {
    out.push({ path, message: `has fewer than the declared minItems ${String(minItems)}` });
  }
  const maxItems = node['maxItems'];
  if (typeof maxItems === 'number' && value.length > maxItems) {
    out.push({ path, message: `has more than the declared maxItems ${String(maxItems)}` });
  }

  const items = node['items'];
  if (items === undefined) return;
  value.forEach((element, index) => {
    check({ node: items, documentId: schema.documentId }, element, join(path, index), resolve, out);
  });
}

function checkObject(
  node: Record<string, unknown>,
  schema: SchemaNode,
  value: Record<string, unknown>,
  path: string,
  resolve: RefResolver,
  out: Violation[],
): void {
  const required = node['required'];
  if (required !== undefined) {
    if (!Array.isArray(required)) {
      throw new UnsupportedSchemaKeyword('required (not an array)', path || '<root>');
    }
    for (const name of required) {
      if (typeof name !== 'string') {
        throw new UnsupportedSchemaKeyword('required (non-string member)', path || '<root>');
      }
      // Presence, not truthiness: the contract says these keys are always
      // there, and an explicit null is a stated answer (absence is not).
      if (!Object.prototype.hasOwnProperty.call(value, name)) {
        out.push({ path: join(path, name), message: 'required property is missing' });
      }
    }
  }

  const minProperties = node['minProperties'];
  if (typeof minProperties === 'number' && Object.keys(value).length < minProperties) {
    out.push({
      path,
      message: `has fewer than the declared minProperties ${String(minProperties)}`,
    });
  }

  const properties = node['properties'];
  if (properties !== undefined && !isPlainObject(properties)) {
    throw new UnsupportedSchemaKeyword('properties (not an object)', path || '<root>');
  }
  const declared = isPlainObject(properties) ? properties : {};
  for (const [name, propertyValue] of Object.entries(value)) {
    const propertySchema = declared[name];
    if (propertySchema !== undefined) {
      check(
        { node: propertySchema, documentId: schema.documentId },
        propertyValue,
        join(path, name),
        resolve,
        out,
      );
      continue;
    }

    // THE CLOSED-SHAPE RULE. `additionalProperties: false` is the only thing
    // standing between a handler that adds a field and every subject
    // receiving it — the `storageRef` class of leak. It is enforced here
    // unconditionally; there is no mode of this file in which it is advisory.
    const additional = node['additionalProperties'];
    if (additional === false) {
      out.push({
        path: join(path, name),
        message: 'undeclared property (the schema closes this object: additionalProperties false)',
      });
      continue;
    }
    if (additional === undefined || additional === true) continue;
    check(
      { node: additional, documentId: schema.documentId },
      propertyValue,
      join(path, name),
      resolve,
      out,
    );
  }
}
