/**
 * UUID v7 identity for audit records (data-model.md §2: primary keys are
 * UUID v7 — time-ordered, so index locality is preserved without exposing a
 * sequence). Randomness and the clock live here, in infrastructure, behind
 * the AuditEventIdSource port; the application layer stays deterministic.
 *
 * Layout per RFC 9562 §5.7: 48-bit Unix millisecond timestamp, version
 * nibble 7, RFC variant bits, 74 random bits.
 */

import { randomBytes } from 'node:crypto';

import type { AuditEventId } from '../../domain/audit-event.js';
import type { AuditEventIdSource } from '../../application/ports/audit-event-id-source.js';

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

export class Uuidv7AuditEventIdSource implements AuditEventIdSource {
  nextId(): AuditEventId {
    return uuidv7(Date.now(), randomBytes(10)) as AuditEventId;
  }
}
