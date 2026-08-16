/**
 * Transport-shape validation for the identity DTOs. Deliberately minimal:
 * presence, type, and length ceilings only — SEMANTIC validation (e-mail
 * shape, password policy, code correctness) belongs to the use cases, which
 * HTTP is only one caller of. Failures are VALIDATION_ERROR problems naming
 * the field, never echoing the value.
 */

import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';

const DEFAULT_MAX_LENGTH = 1024;

export function requireString(
  body: unknown,
  fieldName: string,
  options: { readonly maxLength?: number } = {},
): string {
  const value =
    typeof body === 'object' && body !== null
      ? (body as Record<string, unknown>)[fieldName]
      : undefined;
  const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new PlatformError({
      code: ErrorCode.VALIDATION_ERROR,
      message: `Field '${fieldName}' is required and must be a string of at most ${maxLength} characters.`,
      origin: 'application',
      details: { field: fieldName },
    });
  }
  return value;
}
