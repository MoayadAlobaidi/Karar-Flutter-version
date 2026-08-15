/**
 * Minimal typed schema for environment configuration.
 *
 * Hand-rolled on purpose: the platform stays lean (no zod), and configuration
 * needs exactly four primitives (string, integer, boolean, enum) plus a secret
 * wrapper. Every failure reason is written to be safe in error messages and
 * logs — it names the field and the rule, and NEVER echoes the raw value
 * (docs/architecture/environments.md §7, docs/security/secrets.md).
 */

import { SecretValue } from './secret-value.js';

/** One problem with one field. `reason` never contains the offending value. */
export interface FieldIssue {
  /** Dotted config path, e.g. `database.port`. */
  readonly field: string;
  /** The environment variable that feeds the field. */
  readonly envVar: string;
  /** Rule that failed, value-free, e.g. `must be an integer`. */
  readonly reason: string;
}

export type ParseOutcome<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly reason: string };

/** A parser for a single raw environment string (`undefined` = unset). */
export interface FieldSpec<T> {
  parse(raw: string | undefined): ParseOutcome<T>;
}

function ok<T>(value: T): ParseOutcome<T> {
  return { ok: true, value };
}

function fail<T>(reason: string): ParseOutcome<T> {
  return { ok: false, reason };
}

/**
 * Unset handling shared by all primitives: a default wins, otherwise required
 * fields fail with a value-free reason. `required` defaults to true when no
 * default is given.
 */
function unset<T>(opts: { default?: T }): ParseOutcome<T> {
  if (opts.default !== undefined) return ok(opts.default);
  return fail('required but unset');
}

export function str(
  opts: { default?: string; pattern?: RegExp; patternHint?: string } = {},
): FieldSpec<string> {
  return {
    parse(raw) {
      if (raw === undefined || raw === '') return unset(opts);
      if (opts.pattern !== undefined && !opts.pattern.test(raw)) {
        return fail(opts.patternHint ?? 'does not match the required pattern');
      }
      return ok(raw);
    },
  };
}

export function int(
  opts: { default?: number; min?: number; max?: number } = {},
): FieldSpec<number> {
  return {
    parse(raw) {
      if (raw === undefined || raw === '') return unset(opts);
      // A silent fallback on a malformed number is a configuration change
      // nobody made (environments.md §7) — reject instead.
      if (!/^-?\d+$/.test(raw.trim())) return fail('must be an integer');
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) return fail('must be a safe integer');
      if (opts.min !== undefined && value < opts.min) return fail(`must be >= ${opts.min}`);
      if (opts.max !== undefined && value > opts.max) return fail(`must be <= ${opts.max}`);
      return ok(value);
    },
  };
}

export function bool(opts: { default?: boolean } = {}): FieldSpec<boolean> {
  return {
    parse(raw) {
      if (raw === undefined || raw === '') return unset(opts);
      const normalized = raw.trim().toLowerCase();
      if (normalized === 'true' || normalized === '1') return ok(true);
      if (normalized === 'false' || normalized === '0') return ok(false);
      return fail("must be 'true', 'false', '1' or '0'");
    },
  };
}

export function enumOf<const V extends readonly [string, ...string[]]>(
  values: V,
  opts: { default?: V[number] } = {},
): FieldSpec<V[number]> {
  return {
    parse(raw) {
      if (raw === undefined || raw === '') return unset(opts);
      if (!(values as readonly string[]).includes(raw)) {
        // Deliberately does not echo the raw value.
        return fail(`must be one of ${values.join('|')}`);
      }
      return ok(raw as V[number]);
    },
  };
}

export function secret(
  opts: { default?: string; minLength?: number } = {},
): FieldSpec<SecretValue> {
  return {
    parse(raw) {
      if (raw === undefined || raw === '') {
        const base = unset(opts);
        return base.ok ? ok(new SecretValue(base.value)) : fail(base.reason);
      }
      if (opts.minLength !== undefined && raw.length < opts.minLength) {
        return fail(`must be at least ${opts.minLength} characters`);
      }
      return ok(new SecretValue(raw));
    },
  };
}

/** Binds a config field to the environment variable that feeds it. */
export interface FieldDef<T> {
  readonly envVar: string;
  readonly spec: FieldSpec<T>;
}

export function field<T>(envVar: string, spec: FieldSpec<T>): FieldDef<T> {
  return { envVar, spec };
}

export type SchemaShape = Record<string, FieldDef<unknown>>;

export type SchemaValue<S extends SchemaShape> = {
  readonly [K in keyof S]: S[K] extends FieldDef<infer T> ? T : never;
};

export type SchemaOutcome<S extends SchemaShape> =
  | { readonly ok: true; readonly value: SchemaValue<S> }
  | { readonly ok: false; readonly issues: readonly FieldIssue[] };

/**
 * Parses every field of `schema` from `env`, collecting ALL issues rather than
 * stopping at the first, so one failed boot reports the complete correction.
 * `fieldPrefix` namespaces the reported field paths (e.g. `database.`).
 */
export function parseSchema<S extends SchemaShape>(
  schema: S,
  env: Readonly<Record<string, string | undefined>>,
  fieldPrefix = '',
): SchemaOutcome<S> {
  const issues: FieldIssue[] = [];
  const value: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(schema)) {
    const outcome = def.spec.parse(env[def.envVar]);
    if (outcome.ok) {
      value[key] = outcome.value;
    } else {
      issues.push({ field: `${fieldPrefix}${key}`, envVar: def.envVar, reason: outcome.reason });
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: value as SchemaValue<S> };
}
