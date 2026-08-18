/**
 * GET /consent/documents/{documentId}/content — the legal text a subject must
 * read before accepting, and the language it is written in.
 *
 * WHY A SEPARATE ROUTE RATHER THAN A FIELD ON THE LISTING:
 *   * Language is a property of the CONTENT, not of the catalogue. The
 *     catalogue records no language at all, so a `language` field on the
 *     listing could only be invented; here it arrives with the text it
 *     describes and cannot disagree with it.
 *   * The listing is a control-flow surface — "is there anything to accept?" —
 *     consulted far more often than the text is read. Inlining unbounded legal
 *     prose into it would make every such check pay for every document.
 *   * The bytes are verified against the version's pinned content hash before
 *     they are served; that guarantee belongs where the bytes are handled.
 *   * It lets the internal `storage_ref` be REMOVED from the listing: a
 *     locator the client cannot fetch is replaced by a route it can.
 *
 * The caller names a DOCUMENT; the server chooses the version in force. No
 * version id, no draft, and no other entity's document is reachable from here.
 *
 * Thin by design (architecture test 6): resolve the principal, call one use
 * case, map the Result.
 *
 * FAILURES ARE THROWN, never written to the reply. The HTTP entrypoint's error
 * boundary is the ONE writer of an RFC 7807 document and the only place its
 * `application/problem+json` media type is set (apps/api/src/errors/
 * problem-response.ts); a problem this surface authored travels there as the
 * body of an HttpException and is forwarded verbatim, code and all. The reply
 * object below answers successes only.
 */

import {
  Controller,
  Get,
  HttpException,
  Inject,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';

import type {
  GetLegalDocumentContent,
  GetLegalDocumentContentError,
} from '../application/use-cases/legal-document-content.js';
import { requirePrincipal, type RequestPrincipal } from './principal.js';

/** The wired use case the composition root provides to the content module. */
export interface ConsentDocumentContentUseCases {
  readonly getLegalDocumentContent: GetLegalDocumentContent;
}

export const CONSENT_DOCUMENT_CONTENT_USE_CASES = Symbol('CONSENT_DOCUMENT_CONTENT_USE_CASES');

interface RequestLike {
  principal?: RequestPrincipal | undefined;
  id?: string | undefined;
}

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): unknown;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The RFC 7807 members this surface states; the error boundary writes them. */
interface ProblemBody {
  readonly type: 'about:blank';
  readonly title: string;
  readonly status: number;
  readonly code: string;
  readonly detail?: string;
  readonly reason?: string;
}

/**
 * The absence arms answer 409, not 404: the document EXISTS and applies to the
 * caller, the platform simply has no displayable text for it. A 404 would tell
 * the client the document is gone, and a client that believed that would stop
 * asking for consent it still owes.
 */
function problemFor(error: GetLegalDocumentContentError): { status: number; body: ProblemBody } {
  switch (error.kind) {
    case 'NOT_FOUND':
      return {
        status: 404,
        body: {
          type: 'about:blank',
          title: 'Document not found',
          status: 404,
          code: 'DOCUMENT_NOT_FOUND',
          detail: 'no legal document with that id applies to this caller',
        },
      };
    case 'NO_EFFECTIVE_ENTITY':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'No operating entity',
          status: 409,
          code: 'NO_EFFECTIVE_ENTITY',
          detail: error.message,
        },
      };
    case 'DOCUMENT_CONTENT_UNAVAILABLE':
      return {
        status: 409,
        body: {
          type: 'about:blank',
          title: 'Document content unavailable',
          status: 409,
          code: 'DOCUMENT_CONTENT_UNAVAILABLE',
          detail: error.message,
          reason: error.reason,
        },
      };
    case 'DOCUMENT_CONTENT_INTEGRITY_MISMATCH':
      // Loud on purpose: retrievable content that is not the published content
      // is a platform fault, not a client one.
      return {
        status: 503,
        body: {
          type: 'about:blank',
          title: 'Document content unverifiable',
          status: 503,
          code: 'DOCUMENT_CONTENT_UNVERIFIABLE',
          detail: 'the retrieved content did not match the published version; nothing was served',
        },
      };
    case 'STORE_FAILURE':
      return {
        status: 503,
        body: {
          type: 'about:blank',
          title: 'Consent catalogue unavailable',
          status: 503,
          code: 'STORE_UNAVAILABLE',
          // Static on purpose: store detail never crosses the edge.
        },
      };
  }
}

@Controller('consent')
export class ConsentDocumentContentController {
  constructor(
    @Inject(CONSENT_DOCUMENT_CONTENT_USE_CASES)
    private readonly useCases: ConsentDocumentContentUseCases,
  ) {}

  @Get('documents/:documentId/content')
  async readContent(
    @Req() request: RequestLike,
    @Param('documentId') documentId: string,
    @Res() reply: ReplyLike,
  ): Promise<void> {
    const principal = requirePrincipal(request);
    if (typeof documentId !== 'string' || !UUID_SHAPE.test(documentId)) {
      // Same answer a well-formed unknown id gets: the shape check is not an
      // oracle either.
      throw new NotFoundException('no legal document with that id applies to this caller');
    }
    const result = await this.useCases.getLegalDocumentContent.execute({
      principal,
      documentId,
      now: new Date(),
    });
    if (!result.ok) {
      const problem = problemFor(result.error);
      throw new HttpException(problem.body, problem.status);
    }
    const view = result.value;
    reply.status(200).send({
      documentId: view.documentId,
      versionId: view.versionId,
      version: view.version,
      contentHash: view.contentHash,
      effectiveAt: view.effectiveAt,
      language: view.language,
      format: view.format,
      content: view.content,
    });
  }
}
