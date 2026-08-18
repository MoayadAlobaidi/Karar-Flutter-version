/**
 * UUID v7 identity for this module's rows (data-model.md §2; RFC 9562 §5.7).
 * The clock and the randomness live HERE, in infrastructure, which is what
 * keeps the domain and the use cases deterministic (architecture test 11).
 *
 * Reimplemented locally rather than imported: infrastructure implementations
 * are never shared across modules (clean-architecture.md §4), and the
 * alternative — a shared helper — would be a cross-module import of something
 * that is not a public API.
 *
 * v7 rather than v4 because these ids are primary keys: the time-ordered
 * prefix keeps index inserts local instead of scattering them across the
 * B-tree, and it does so without leaking anything a timestamp column does not
 * already say. Note what a v7 id does NOT leak here: it says when a row was
 * minted, which `created_at` says anyway, and nothing whatever about the
 * source account the row is about — that lives only in the ciphertext and the
 * keyed fingerprint.
 */

import { randomBytes } from 'node:crypto';

import type { IdSource } from '../../application/ports/id-source.js';

export function uuidv7(now: number, random: Uint8Array): string {
  if (random.length < 10) {
    throw new Error('uuidv7 requires at least 10 random bytes');
  }
  const bytes = new Uint8Array(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes.set(random.subarray(0, 10), 6);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class Uuidv7IdSource implements IdSource {
  nextId(): string {
    return uuidv7(Date.now(), randomBytes(10));
  }
}
