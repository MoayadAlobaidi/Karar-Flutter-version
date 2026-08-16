/**
 * LocalMailSink — the LOCAL-ONLY NotificationPort implementation.
 *
 * A bounded in-memory ring buffer with a test accessor. It exists so local
 * development and integration tests can complete flows that need a delivered
 * code (verification, reset) and can ASSERT on what was sent — it is not a
 * provider, delivers nothing anywhere, and the constructor THROWS outside
 * `KARAR_ENV=local` so a deployment can never silently swallow real customer
 * notifications into a process buffer.
 *
 * Classification of the captured content: INTERNAL handling for the buffer
 * itself (local process memory, never persisted, never logged by this class)
 * — but note the captured verification/reset messages contain live one-time
 * codes, which is precisely why the environment gate is a throw and not a
 * warning.
 */

import type {
  NotificationPort,
  NotificationResult,
  PasswordResetMessage,
  SecurityNotice,
  VerificationMessage,
} from './port.js';

export type RecordedNotification =
  | { readonly type: 'verification_code'; readonly at: Date; readonly message: VerificationMessage }
  | { readonly type: 'password_reset'; readonly at: Date; readonly message: PasswordResetMessage }
  | { readonly type: 'security_notice'; readonly at: Date; readonly message: SecurityNotice };

const DEFAULT_CAPACITY = 200;

export class LocalMailSinkEnvironmentError extends Error {
  override readonly name = 'LocalMailSinkEnvironmentError';

  constructor(env: string) {
    super(
      `LocalMailSink is a local development capture buffer and refuses to exist in KARAR_ENV='${env}' — wire a real notification provider for this environment`,
    );
  }
}

export interface LocalMailSinkOptions {
  /** The asserted environment identity (config.env). Anything but 'local' throws. */
  readonly env: string;
  /** Ring-buffer capacity; oldest entries are evicted first. */
  readonly capacity?: number;
}

export class LocalMailSink implements NotificationPort {
  private readonly buffer: RecordedNotification[] = [];
  private readonly capacity: number;

  constructor(options: LocalMailSinkOptions) {
    if (options.env !== 'local') {
      throw new LocalMailSinkEnvironmentError(options.env);
    }
    this.capacity = options.capacity ?? DEFAULT_CAPACITY;
    if (!Number.isInteger(this.capacity) || this.capacity < 1) {
      throw new Error('LocalMailSink capacity must be a positive integer');
    }
  }

  sendVerificationCode(message: VerificationMessage): Promise<NotificationResult> {
    this.push({ type: 'verification_code', at: new Date(), message });
    return Promise.resolve({ ok: true });
  }

  sendPasswordReset(message: PasswordResetMessage): Promise<NotificationResult> {
    this.push({ type: 'password_reset', at: new Date(), message });
    return Promise.resolve({ ok: true });
  }

  sendSecurityNotice(message: SecurityNotice): Promise<NotificationResult> {
    this.push({ type: 'security_notice', at: new Date(), message });
    return Promise.resolve({ ok: true });
  }

  // --- test accessors -----------------------------------------------------

  /** Everything captured, oldest first. */
  captured(): readonly RecordedNotification[] {
    return [...this.buffer];
  }

  /** Captured entries addressed to `to` (exact match), oldest first. */
  capturedFor(to: string): readonly RecordedNotification[] {
    return this.buffer.filter((entry) => entry.message.to === to);
  }

  /** The most recent entry addressed to `to`, or undefined. */
  lastFor(to: string): RecordedNotification | undefined {
    return this.capturedFor(to).at(-1);
  }

  clear(): void {
    this.buffer.length = 0;
  }

  private push(entry: RecordedNotification): void {
    this.buffer.push(entry);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
  }
}
