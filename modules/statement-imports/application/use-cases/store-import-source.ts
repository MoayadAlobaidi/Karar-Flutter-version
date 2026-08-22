/**
 * StoreImportSource — the first durable byte of a subject's statement, and
 * everything that has to be true before it exists.
 *
 * ## The ordering this use case IS
 *
 * ```
 * resolve retention -> DECIDED -> encrypt the source -> durable write
 * ```
 *
 * Retention was already resolved and recorded when the import was started; it
 * is asked AGAIN here, immediately before the store call, and that is not
 * belt-and-braces. An import can be started and its source uploaded minutes or
 * hours apart, and a provider that has moved to `PENDING_LEGAL_REVIEW` in
 * between is telling this platform something it must act on rather than
 * something it may ignore because it asked earlier.
 *
 * The database says the same thing from the other side:
 * `statement_import_sources_guard` (migration 0100) refuses to insert a source
 * row whose parent import has not recorded a decision, with SQLSTATE `KAR54`.
 * So the guarantee holds for a direct SQL `INSERT`, a fixture, a backfill, or
 * a path written later by somebody who never opened this file.
 *
 * ## The byte ceiling is checked while reading, not after
 *
 * `csvStatementImport.maxBytes` is enforced as the stream is consumed, so an
 * over-large upload is refused at the moment it crosses the line rather than
 * after the whole thing has been read into memory to be measured. A limit
 * that is checked after buffering is a limit the heap enforces first.
 *
 * ## Duplicate FILE detection happens here, and it is not a write refusal
 *
 * The keyed per-subject fingerprint is computed over the same bytes in the
 * same pass. If this principal has already COMMITTED an import of this exact
 * file, the import becomes `DUPLICATE` — a review outcome a person can see and
 * act on, not an error. Only a COMMITTED import counts: a rejected, failed or
 * erased one is a person retrying, and refusing them would make one bad
 * upload permanently unrepeatable.
 *
 * **The source is still stored for a duplicate.** The alternative is telling
 * somebody their file is a duplicate while holding nothing they could check
 * that against.
 */

import { Result } from '@karar/shared-kernel';
import type { Clock } from '@karar/shared-kernel';

import { SourceObjectRef, type StoredSourceDescriptor } from '../../domain/encrypted-source.js';
import { SUPPORTED_MEDIA_TYPE, transitionTo } from '../../domain/statement-import.js';
import type { StatementImport } from '../../domain/statement-import.js';
import { StatementImportId } from '../../domain/refs.js';
import {
  IMPORT_NOT_FOUND,
  notInExpectedState,
  retentionUnresolved,
  sourceStoreUnavailable,
  storeFailure,
  type ImportNotFound,
  type ImportNotInExpectedState,
  type RetentionUnresolved,
  type SourceRefused,
  type SourceStoreUnavailable,
  type StoreFailure,
} from '../errors.js';
import type {
  EncryptedSourceStorePort,
  SourceFileFingerprintPort,
} from '../ports/encrypted-source-store.js';
import type { IdSource } from '../ports/id-source.js';
import type { StatementImportRepository } from '../ports/statement-import-repository.js';
import {
  RETENTION_GOVERNED_DATASETS,
  permitsDurableWrite,
  type StatementRetentionDecisionPort,
} from '../ports/statement-retention-decision.js';
import { requirePrincipal, type ImportsPrincipal } from '../principal.js';
import type { MissingPrincipalContext } from '../principal.js';

export interface StoreImportSourceInput {
  readonly importId: string;
  /** The uploaded bytes, streamed. Never a buffer — see the header. */
  readonly content: AsyncIterable<Uint8Array>;
  /** Declared by the caller. `text/csv` and nothing else this phase. */
  readonly mediaType: string;
  /** Largest accepted size, from `csvStatementImport.maxBytes`. */
  readonly maxBytes: number;
}

export type StoreImportSourceError =
  | MissingPrincipalContext
  | ImportNotFound
  | ImportNotInExpectedState
  | RetentionUnresolved
  | SourceRefused
  | SourceStoreUnavailable
  | StoreFailure;

export class StoreImportSource {
  constructor(
    private readonly imports: StatementImportRepository,
    private readonly sources: EncryptedSourceStorePort,
    private readonly fingerprints: SourceFileFingerprintPort,
    private readonly retention: StatementRetentionDecisionPort,
    private readonly ids: IdSource,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: StoreImportSourceInput,
    actor: ImportsPrincipal,
  ): Promise<Result<StatementImport, StoreImportSourceError>> {
    const principal = requirePrincipal(actor);
    if (!principal.ok) return Result.err(principal.error);
    const acting = principal.value;

    if (input.mediaType !== SUPPORTED_MEDIA_TYPE) {
      return Result.err(
        sourceRefusal(
          'UNSUPPORTED_MEDIA_TYPE',
          `this path accepts ${SUPPORTED_MEDIA_TYPE} only. A media type is declared by the ` +
            'caller and is not sniffed from the bytes: sniffing would make what a file IS ' +
            'depend on what its first few bytes happen to look like',
        ),
      );
    }

    const importId = StatementImportId.of(input.importId);
    let imported: StatementImport | null;
    try {
      imported = await this.imports.findById(acting, importId);
    } catch (error) {
      return Result.err(storeFailure('read statement import', error));
    }
    if (imported === null) return Result.err(IMPORT_NOT_FOUND);
    if (imported.state !== 'DRAFT') {
      return Result.err(notInExpectedState(imported.state, ['DRAFT']));
    }

    // THE GATE, asked again immediately before the store call. See the header
    // for why "we asked when the import started" is not an answer.
    for (const dataset of RETENTION_GOVERNED_DATASETS) {
      let decision;
      try {
        decision = await this.retention.decideFor(acting, dataset);
      } catch (error) {
        return Result.err(storeFailure('resolve statement retention', error));
      }
      if (!permitsDurableWrite(decision)) {
        return Result.err(retentionUnresolved(dataset, decision));
      }
    }

    // The bytes are read ONCE and held only as long as the store needs them.
    // The ceiling is applied as they arrive: a limit checked after buffering
    // is a limit the heap enforces first.
    let buffered: Uint8Array;
    try {
      buffered = await collectBounded(input.content, input.maxBytes);
    } catch (error) {
      if (error instanceof SourceTooLargeError) {
        return Result.err(
          sourceRefusal(
            'SOURCE_TOO_LARGE',
            `this statement is larger than the declared ceiling of ${input.maxBytes} bytes and ` +
              'was refused rather than truncated. A shortened statement is a wrong financial ' +
              'record that looks like a right one',
          ),
        );
      }
      return Result.err(sourceStoreUnavailable(error));
    }
    if (buffered.byteLength === 0) {
      return Result.err(
        sourceRefusal(
          'EMPTY_SOURCE',
          'this file has no bytes. An empty statement is refused rather than imported as a ' +
            'statement with no lines, because those are different facts',
        ),
      );
    }

    let written;
    let fileFingerprint: string;
    try {
      fileFingerprint = await this.fingerprints.fingerprint(acting, once(buffered));
      written = await this.sources.store(
        acting,
        { importId, mediaType: input.mediaType },
        once(buffered),
      );
    } catch (error) {
      return Result.err(sourceStoreUnavailable(error));
    }

    const descriptor: StoredSourceDescriptor = {
      storeKind: written.storeKind,
      objectRef: SourceObjectRef.of(written.objectRef),
      // The media type the object was SEALED under, carried on the descriptor
      // so every later read rebuilds the same binding rather than trusting
      // what sits beside the ciphertext.
      mediaType: input.mediaType,
      byteLength: written.byteLength,
      algorithm: written.algorithm,
      keyVersion: written.keyVersion,
      nonce: written.nonce,
      authTag: written.authTag,
      integrityChecksumAlgorithm: written.integrityChecksumAlgorithm,
      integrityChecksum: written.integrityChecksum,
      fileFingerprint,
      fileFingerprintVersion: this.fingerprints.version,
    };

    let alreadyImported: StatementImportId | null;
    try {
      alreadyImported = await this.imports.findCommittedImportWithFile(
        acting,
        descriptor.fileFingerprintVersion,
        descriptor.fileFingerprint,
      );
    } catch (error) {
      return Result.err(storeFailure('check for a previously imported file', error));
    }

    // The source IS stored, so the import reaches SOURCE_STORED first — even
    // when this file turns out to be one the subject already imported. The
    // lifecycle has no DRAFT -> DUPLICATE edge and should not: DUPLICATE is a
    // statement about a file that exists here, and until the bytes are
    // attached there is no file to say it about. The second move follows in
    // its own write.
    const now = this.clock.now();
    const stored = transitionTo(imported, 'SOURCE_STORED', now);
    try {
      await this.imports.attachSource(
        acting,
        importId,
        this.ids.nextId(),
        descriptor,
        now,
        stored,
        imported.version,
      );
    } catch (error) {
      return Result.err(storeFailure('attach the stored statement to its import', error));
    }
    if (alreadyImported === null) return Result.ok(stored);

    const duplicate = transitionTo(stored, 'DUPLICATE', now, {
      refusalCode: 'SOURCE_ALREADY_IMPORTED',
    });
    try {
      await this.imports.update(acting, duplicate, stored.version);
    } catch (error) {
      return Result.err(storeFailure('mark the statement import a duplicate', error));
    }
    return Result.ok(duplicate);
  }
}

/** A whole-file refusal. Carries a code and no fragment of the file. */
function sourceRefusal(
  code: SourceRefused['code'],
  message: string,
): SourceRefused {
  return Object.freeze({
    kind: 'source_refused' as const,
    code,
    rowErrors: Object.freeze([]),
    reportedErrorCount: 0,
    totalErrorCount: 0,
    message,
  });
}

class SourceTooLargeError extends Error {
  override readonly name = 'SourceTooLargeError';
}

/**
 * Reads the stream, refusing the moment it crosses the ceiling.
 *
 * The bytes ARE held here, once, because AEAD needs the whole plaintext to
 * produce a tag and the fingerprint needs the whole content to be stable.
 * That is what `maxBytes` bounds — and it is bounded before the read rather
 * than measured after it, which is the difference between a refusal and an
 * out-of-memory error.
 */
async function collectBounded(
  source: AsyncIterable<Uint8Array>,
  maxBytes: number,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of source) {
    total += chunk.byteLength;
    if (total > maxBytes) throw new SourceTooLargeError('source exceeds the declared ceiling');
    chunks.push(chunk);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** One buffer as a single-chunk async iterable, so a port can be called twice. */
async function* once(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}
