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
  EncryptedNarrativeColumns,
} from '../../application/ports/canonical-narrative-encryptor.js';
import type { ImportsPrincipal } from '../../application/principal.js';

export class TransactionsCanonicalNarrativeAdapter implements CanonicalNarrativeEncryptorPort {
  constructor(private readonly encryption: TransactionsHsfFieldEncryptionPort) {}

  async encrypt(
    actor: ImportsPrincipal,
    rowId: string,
    narrative: { readonly description: string; readonly merchant: string | null },
  ): Promise<EncryptedNarrativeColumns> {
    // Restated field by field rather than cast, for the reason the account
    // adapter gives: a cast would keep compiling if either principal shape
    // gained a field.
    const principal: TransactionsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    // The table is `transactions` for both a transaction row and a revision
    // row, because the AEAD context binds the ROW ID, and the two ids differ.
    // Binding two different table names for the same narrative would mean a
    // revision could not be decrypted by anything expecting a transaction's
    // context, which is a distinction with no security value and a real cost.
    const table = 'transactions';
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
