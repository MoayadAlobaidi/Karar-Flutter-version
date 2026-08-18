/**
 * The mask rule — the domain half of "no PAN, no CVV, no payment credential".
 *
 * The migration's eight-byte ciphertext bound is the other half and is proved
 * against the live schema in `no-instrument-balance-columns.integration.test.ts`.
 * What is proved HERE is that a value which is actually a card number is
 * refused BEFORE anything is normalised, hashed or encrypted — so a real PAN
 * never reaches a key, never reaches a ciphertext, and never reaches a
 * database round trip that could log it.
 *
 * Every candidate below is synthetic. The card-number-shaped strings are
 * repeated digits and obvious sequences, not values that could belong to
 * anyone, and no card scheme is named anywhere.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_INSTRUMENT_MASK_LENGTH,
  checkInstrumentMaskShape,
  instrumentMaskRefusalMessage,
  isInstrumentMask,
  normalizeInstrumentMask,
  type InstrumentMaskRefusal,
} from '../domain/instrument-mask.js';

/** Synthetic, obviously-fake digit runs. No real number is written here. */
const SYNTHETIC_SIXTEEN_DIGITS = '1111222233334444';
const SYNTHETIC_NINETEEN_DIGITS = '1111222233334444555';
const SYNTHETIC_TWELVE_DIGITS = '111122223333';
const SYNTHETIC_NINE_DIGITS = '111122223';

describe('an instrument mask is a mask, and nothing else', () => {
  it('accepts the shapes a person actually recognises their card by', () => {
    for (const candidate of ['1234', '00', '**00', 'xx11', 'XXXX1234', '####99', '••12']) {
      expect({ candidate, refusal: checkInstrumentMaskShape(candidate) }).toEqual({
        candidate,
        refusal: null,
      });
      expect(isInstrumentMask(candidate)).toBe(true);
    }
  });

  it('refuses a card number, and says that is what it is', () => {
    // The severity ordering matters: a sixteen-digit input is too long AND a
    // card number, and reporting it as 'too_long' would file a leaked PAN as
    // a formatting mistake nobody escalates.
    for (const candidate of [
      SYNTHETIC_TWELVE_DIGITS,
      SYNTHETIC_SIXTEEN_DIGITS,
      SYNTHETIC_NINETEEN_DIGITS,
      `**${SYNTHETIC_SIXTEEN_DIGITS}`,
      `${SYNTHETIC_SIXTEEN_DIGITS} `,
    ]) {
      expect({ candidate, refusal: checkInstrumentMaskShape(candidate) }).toEqual({
        candidate,
        refusal: 'looks_like_a_card_number' satisfies InstrumentMaskRefusal,
      });
    }
  });

  it('refuses an account or phone-length digit run below card length', () => {
    // Eight is the shortest thing that must go: an E.164 subscriber number.
    for (const candidate of ['11112222', SYNTHETIC_NINE_DIGITS, '1111222233']) {
      expect({ candidate, refusal: checkInstrumentMaskShape(candidate) }).toEqual({
        candidate,
        refusal: 'looks_like_an_account_or_phone_number' satisfies InstrumentMaskRefusal,
      });
    }
  });

  it('refuses anything that is not mask-shaped, including prose and a lone digit', () => {
    for (const candidate of ['the blue one', 'card 1234', '1', '12-34', '**', 'abcd']) {
      const refusal = checkInstrumentMaskShape(candidate);
      expect({ candidate, refused: refusal !== null }).toEqual({ candidate, refused: true });
    }
    expect(checkInstrumentMaskShape('1')).toBe('not_a_mask');
  });

  it('refuses blank input rather than treating absence as an empty mask', () => {
    for (const candidate of ['', '   ', '\t']) {
      expect(checkInstrumentMaskShape(candidate)).toBe('blank');
    }
  });

  it('refuses an over-long value that is not otherwise identifier-shaped', () => {
    expect(checkInstrumentMaskShape('****xxxx1234')).toBe('too_long');
  });

  it('the character bound and the migration byte bound are one number', () => {
    // Migration 0098 bounds instrument_mask_ciphertext at 8 bytes. AES-256-GCM
    // preserves length, so the two are the same statement said twice, and the
    // longest accepted mask must be exactly that long.
    expect(MAX_INSTRUMENT_MASK_LENGTH).toBe(8);
    const longestAccepted = '****1234';
    expect(longestAccepted.length).toBe(MAX_INSTRUMENT_MASK_LENGTH);
    expect(checkInstrumentMaskShape(longestAccepted)).toBeNull();
    // One character more is refused, so the column bound can never be the
    // thing that fires first.
    expect(checkInstrumentMaskShape(`*${longestAccepted}`)).not.toBeNull();
  });

  it('normalisation trims and does nothing else', () => {
    // No separator stripping and no substitution of one masking character for
    // another: the person supplied a shape they recognise, and rewriting it
    // would hand them back something they do not.
    expect(normalizeInstrumentMask('  **00  ')).toBe('**00');
    expect(normalizeInstrumentMask('xx11')).toBe('xx11');
    expect(normalizeInstrumentMask('XX11')).toBe('XX11');
  });

  it('no refusal message quotes the value it refused', () => {
    // A PAN that was rejected is still a PAN, and an error string that echoes
    // the input is the shortest path from a refusal to a plaintext log line.
    const refusals: InstrumentMaskRefusal[] = [
      'blank',
      'too_long',
      'looks_like_a_card_number',
      'looks_like_an_account_or_phone_number',
      'not_a_mask',
    ];
    for (const refusal of refusals) {
      const message = instrumentMaskRefusalMessage(refusal);
      expect(message.length).toBeGreaterThan(40);
      expect(message).not.toContain(SYNTHETIC_SIXTEEN_DIGITS);
      expect(message).not.toContain(SYNTHETIC_NINE_DIGITS);
      // And no digit run of its own that could be mistaken for one.
      expect(/[0-9]{5,}/.test(message)).toBe(false);
    }
  });

  it('every refusal kind has a message, so no arm can answer with undefined', () => {
    const seen = new Set<string>();
    for (const candidate of [
      '',
      '****xxxx1234',
      SYNTHETIC_SIXTEEN_DIGITS,
      SYNTHETIC_NINE_DIGITS,
      // Short enough that the length rule cannot fire first — otherwise this
      // case would silently be testing 'too_long' under another name.
      'abcd',
    ]) {
      const refusal = checkInstrumentMaskShape(candidate);
      expect(refusal).not.toBeNull();
      if (refusal !== null) {
        seen.add(refusal);
        expect(typeof instrumentMaskRefusalMessage(refusal)).toBe('string');
      }
    }
    expect([...seen].sort()).toEqual([
      'blank',
      'looks_like_a_card_number',
      'looks_like_an_account_or_phone_number',
      'not_a_mask',
      'too_long',
    ]);
  });
});
