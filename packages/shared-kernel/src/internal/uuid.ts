/**
 * UUID shape validation shared by the branded identifier types.
 *
 * Shape only — 8-4-4-4-12 hexadecimal, case-insensitive — with no version or
 * variant pinning. New primary keys are UUID v7 by convention
 * (docs/architecture/data-model.md §2), but identifiers arriving from outside
 * may legitimately be any RFC 4122 version, and rejecting them on version
 * would turn a storage convention into a validation rule.
 *
 * Implemented as a regular expression because the kernel has zero runtime
 * dependencies (ADR-0003, architecture test 17).
 */
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_SHAPE.test(value);
}
