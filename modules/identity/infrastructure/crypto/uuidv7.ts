/**
 * UUID v7 (RFC 9562 §5.7) — time-ordered primary keys (data-model.md §2).
 * Same layout as the audit module's id source: 48-bit millisecond timestamp,
 * version nibble 7, RFC variant, 74 random bits.
 */

import { randomBytes } from 'node:crypto';

export function uuidv7(now: number = Date.now()): string {
  const bytes = new Uint8Array(16);
  const ms = BigInt(now);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ms >> BigInt(8 * (5 - i))) & 0xffn);
  }
  bytes.set(randomBytes(10), 6);
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x70; // version 7
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80; // RFC variant
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
