/**
 * `CanonicalNarrativeEncryptorPort`, satisfied over `@karar/transactions`'
 * own `HsfFieldEncryptionPort`.
 *
 * The commit writes `public.transactions`, so the narrative on those rows
 * must be encrypted by the seam THAT module owns — same key, same
 * domain-separation label, same key-version provenance. Using this module's
 * encryptor instead would produce ciphertext that the transactions module's
 * own read paths could not decrypt, and the failure would appear as a
 * person's imported transactions rendering as errors weeks later.
 *
 * ## Why a row cannot carry two key versions
 *
 * Every field of one row shares the encryption context columns
 * (`hsf_algorithm`, `hsf_key_version`). Two versions inside one row would
 * mean two calls resolved different versions mid-row, which is a provider
 * defect rather than a state to persist — so it throws instead of storing the
 * first and hoping.
 *
 * ## What is deliberately not here
 *
 * A note. `public.transactions` has one, and an imported line never does: a
 * note is a thing a person writes on a transaction, and an import that could
 * write one would be inventing it. The port's type makes the three note
 * columns `null` rather than optional, so it is unwriteable rather than
 * merely unwritten.
 */

import {
  HsfField,
  HsfFieldEncryptionError,
  type HsfFieldEncryptionPort as TransactionsHsfFieldEncryptionPort,
  type TransactionsPrincipal,
} from '@karar/transactions';

import type {
  CanonicalNarrativeEncryptorPort,
  CanonicalNarrativeTarget,
  EncryptedNarrativeColumns,
} from '../../application/ports/canonical-narrative-encryptor.js';
import type { ImportsPrincipal } from '../../application/principal.js';

export class TransactionsCanonicalNarrativeAdapter implements CanonicalNarrativeEncryptorPort {
  constructor(private readonly encryption: TransactionsHsfFieldEncryptionPort) {}

  async encrypt(
    actor: ImportsPrincipal,
    target: CanonicalNarrativeTarget,
    narrative: { readonly description: string; readonly merchant: string | null },
  ): Promise<EncryptedNarrativeColumns> {
    const { table, rowId } = target;
    // Restated field by field rather than cast, for the reason the account
    // adapter gives: a cast would keep compiling if either principal shape
    // gained a field.
    const principal: TransactionsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    // THE TABLE COMES FROM THE CALLER, and this is the correction of a defect
    // that made every CSV-imported transaction permanently unreadable.
    //
    // This line used to be `const table = 'transactions';`, applied to BOTH
    // the transaction row and the revision row, defended in a comment as "a
    // distinction with no security value and a real cost" on the grounds that
    // the AEAD context already binds the row id. The row id does distinguish
    // the two rows. It is not what the reader binds: `toTransaction` in the
    // transactions module opens under `transactions`, and `toRevision` opens
    // under `transaction_revisions`. So the revision narrative was sealed
    // under a context nothing would ever present, and `ReadOwnTransaction` —
    // which lists revisions unconditionally — turned every imported
    // transaction into a permanent, retryable 503 telling the person their
    // database was unavailable.
    //
    // Nothing caught it because no test in the repository read an imported
    // transaction back; the module's own commit fixture built the revision
    // narrative with the same wrong context, so it reproduced the defect
    // rather than exposing it. `reads-back.integration.test.ts` is that test.
    const description = await this.encryption.encryptField(
      principal,
      HsfField.of(narrative.description),
      { table, rowId, field: 'description' },
    );
    const merchant =
      narrative.merchant === null
        ? null
        : await this.encryption.encryptField(principal, HsfField.of(narrative.merchant), {
            table,
            rowId,
            field: 'merchant',
          });

    if (merchant !== null && merchant.keyVersion !== description.keyVersion) {
      throw new HsfFieldEncryptionError(
        'encryption_failed',
        'the encryption provider returned two key versions within one row; a row carries one ' +
          'encryption context by design',
      );
    }

    return {
      hsfAlgorithm: description.algorithm,
      hsfKeyVersion: description.keyVersion,
      descriptionCiphertext: description.ciphertext,
      descriptionNonce: description.nonce,
      descriptionAuthTag: description.authTag,
      merchantCiphertext: merchant?.ciphertext ?? null,
      merchantNonce: merchant?.nonce ?? null,
      merchantAuthTag: merchant?.authTag ?? null,
      noteCiphertext: null,
      noteNonce: null,
      noteAuthTag: null,
    };
  }
}
