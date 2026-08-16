/**
 * TOTP via otplib v13 (TotpService port): SHA-1/6-digit/30-second RFC 6238
 * defaults (authenticator-app compatibility), verification tolerance of ±1
 * step (30 seconds each way), constant-time token comparison provided by the
 * library's crypto plugin.
 */

import { NobleCryptoPlugin, ScureBase32Plugin, TOTP, generateSecret } from 'otplib';

import type { TotpService } from '../../application/ports/crypto-ports.js';

const STEP_SECONDS = 30;

export class OtplibTotpService implements TotpService {
  private readonly crypto = new NobleCryptoPlugin();
  private readonly base32 = new ScureBase32Plugin();
  private readonly totp = new TOTP({
    crypto: this.crypto,
    base32: this.base32,
    issuer: 'karar',
    period: STEP_SECONDS,
  });

  generateSecret(): string {
    return generateSecret({ crypto: this.crypto, base32: this.base32 });
  }

  async verify(code: string, secret: string, now: Date): Promise<boolean> {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) return false;
    try {
      const result = await this.totp.verify(trimmed, {
        secret,
        epoch: Math.floor(now.getTime() / 1000),
        epochTolerance: [STEP_SECONDS, STEP_SECONDS], // ±1 step
      });
      return result.valid;
    } catch {
      // Malformed secrets or plugin failures verify as false — no oracle.
      return false;
    }
  }

  otpauthUrl(secret: string, accountLabel: string): string {
    return this.totp.toURI({ secret, label: accountLabel });
  }
}
