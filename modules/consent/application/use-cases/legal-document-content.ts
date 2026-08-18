/**
 * GetLegalDocumentContent — the text a subject must READ before consenting,
 * with the language it is written in.
 *
 * WHY IT EXISTS. `GET /consent/documents` reported an internal `storage_ref`:
 * a locator naming where bytes live inside the platform, which no client can
 * fetch and no client should see. A consent gate that cannot show its document
 * fails closed into uselessness (migration 0064's own words), so the subject
 * needs a way to obtain the CONTENT itself. This is that way, and the locator
 * stops crossing the edge.
 *
 * SERVER-SUPPLIED, ALWAYS. The text comes from the platform's content source
 * and from nowhere else. This module never composes, summarizes, translates,
 * or substitutes legal prose, and neither may a client: when no content is
 * retrievable the answer is a typed absence, so the client shows its own
 * honest unavailable state instead of wording it invented.
 *
 * WHAT IS SERVED IS WHAT WAS PUBLISHED. The retrieved bytes are hashed and
 * compared against the version's pinned `content_hash` before anything is
 * returned. A mismatch is refused outright: a grant pins a version id, so
 * displaying text that is not that version's text would ask a subject to
 * accept one document while reading another. Content whose language the
 * source will not state is likewise refused — a subject cannot meaningfully
 * consent to text whose language the platform cannot name.
 *
 * OWN SCOPE ONLY. The document must be the one applicable to the caller: the
 * effective operating entity is resolved server-side (the same resolution
 * acceptance uses), and a document belonging to any other entity answers
 * NOT_FOUND — identical to a document that does not exist, so the route is not
 * an oracle for the catalogue of entities the caller has nothing to do with.
 * The VERSION is chosen server-side too: the caller names a document, never a
 * version, so no unpublished or superseded draft can be requested.
 */

import { Result } from '@karar/shared-kernel';

import type { LegalDocumentVersion } from '../../domain/legal-document.js';
import {
  toStoreFailure,
  type DocumentContentIntegrityMismatch,
  type DocumentContentUnavailable,
  type NoEffectiveEntity,
  type NotFound,
  type StoreFailure,
} from '../errors.js';
import type { ContentDigest } from '../ports/content-digest.js';
import type { ConsentPrincipal } from '../ports/consent-grant-repository.js';
import type { LegalDocumentContentFormat } from '../ports/legal-document-content-source.js';
import type { LegalDocumentContentSource } from '../ports/legal-document-content-source.js';
import type { LegalDocumentRepository } from '../ports/legal-document-repository.js';
import type { OperatingEntityDirectory } from '../ports/operating-entity-directory.js';

export interface GetLegalDocumentContentInput {
  readonly principal: ConsentPrincipal;
  readonly documentId: string;
  readonly now: Date;
}

/** The closed field set a client receives. No storage locator appears here,
 * and none can: this shape is built by name from the version and the content. */
export interface LegalDocumentContentView {
  readonly documentId: string;
  readonly versionId: string;
  readonly version: string;
  /** The sha256 the served bytes were verified against — the client may
   * re-check what it displayed against what it later accepts. */
  readonly contentHash: string;
  readonly effectiveAt: string | null;
  readonly language: string;
  readonly format: LegalDocumentContentFormat;
  readonly content: string;
}

export type GetLegalDocumentContentError =
  | NotFound
  | NoEffectiveEntity
  | DocumentContentUnavailable
  | DocumentContentIntegrityMismatch
  | StoreFailure;

function unavailable(
  documentId: string,
  reason: DocumentContentUnavailable['reason'],
  message: string,
): DocumentContentUnavailable {
  return { kind: 'DOCUMENT_CONTENT_UNAVAILABLE', documentId, reason, message };
}

export class GetLegalDocumentContent {
  constructor(
    private readonly documents: LegalDocumentRepository,
    private readonly directory: OperatingEntityDirectory,
    private readonly source: LegalDocumentContentSource,
    private readonly digest: ContentDigest,
  ) {}

  async execute(
    input: GetLegalDocumentContentInput,
  ): Promise<Result<LegalDocumentContentView, GetLegalDocumentContentError>> {
    const resolved = await this.directory.resolveEffectiveEntity(
      input.principal.tenantId,
      input.principal.userId,
      input.now,
    );
    if (!resolved.ok) {
      return resolved;
    }

    let document;
    let version: LegalDocumentVersion | null;
    try {
      document = await this.documents.findDocumentById(input.documentId);
      // Server-chosen: the caller names a document, never a version, so no
      // unpublished draft and no superseded version can be asked for.
      version =
        document === null
          ? null
          : await this.documents.currentEffectiveVersion(document.id, input.now);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }

    // Absent, or belonging to another entity: the SAME answer, deliberately.
    // A distinguishable denial would confirm which document ids exist outside
    // the caller's own scope.
    if (document === null || document.entityId !== resolved.value.entityId) {
      return Result.err({
        kind: 'NOT_FOUND',
        resource: 'legal_document',
        id: input.documentId,
      });
    }
    if (version === null) {
      return Result.err(
        unavailable(
          document.id,
          'NO_EFFECTIVE_VERSION',
          `document ${document.id} has no version in force; there is nothing published to display`,
        ),
      );
    }

    let content;
    try {
      content = await this.source.fetch(version);
    } catch (error) {
      return Result.err(toStoreFailure(error));
    }
    if (content === null) {
      return Result.err(
        unavailable(
          document.id,
          'NOT_RETRIEVABLE',
          `no content for version ${version.id} is retrievable in this deployment; nothing is substituted`,
        ),
      );
    }
    if (typeof content.language !== 'string' || content.language.trim() === '') {
      return Result.err(
        unavailable(
          document.id,
          'LANGUAGE_NOT_STATED',
          `content for version ${version.id} states no language; text whose language cannot be named is not displayed for consent`,
        ),
      );
    }
    if (this.digest.sha256Hex(content.content).toLowerCase() !== version.contentHash.toLowerCase()) {
      return Result.err({
        kind: 'DOCUMENT_CONTENT_INTEGRITY_MISMATCH',
        documentId: document.id,
        versionId: version.id,
        message: `retrieved content does not match the hash published version ${version.id} pinned; refused rather than displayed`,
      });
    }

    return Result.ok({
      documentId: document.id,
      versionId: version.id,
      version: version.version,
      contentHash: version.contentHash,
      effectiveAt: version.effectiveAt?.toISOString() ?? null,
      language: content.language,
      format: content.format,
      content: content.content,
    });
  }
}
