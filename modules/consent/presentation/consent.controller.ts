/**
 * §49 consent endpoints — the subject-facing surface, contract-first in
 * packages/api-contracts/openapi/paths/consent.yaml:
 *
 *   GET  /consent/documents    list applicable documents (+ effective versions)
 *   POST /consent/acceptances  record OWN acceptance -> a pinned grant
 *   POST /consent/withdrawals  withdraw OWN consent (row preserved)
 *   GET  /consent/status       read OWN status per (purpose, jurisdiction?)
 *
 * Thin by design (architecture test 6): validate, resolve the principal,
 * call one use case, map the Result. No admin surface exists here — entity
 * administration is deferred to the control-plane phase (ADR-0021), and no
 * endpoint accepts consent on someone else's behalf, by design.
 */

import {
  BadRequestException,
  ConflictException,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Post,
  Query,
  Req,
  Body,
  HttpCode,
  ServiceUnavailableException,
} from '@nestjs/common';

import type {
  GetOwnConsentStatus,
  ListApplicableDocuments,
  OwnConsentStatus,
  RecordOwnAcceptance,
  WithdrawOwnConsent,
} from '../application/use-cases/consent.js';
import type { ConsentPolicyPinSource } from '../application/ports/policy-pin-source.js';
import { requirePrincipal, type RequestPrincipal } from './principal.js';

/** The wired use cases the composition root provides to ConsentApiModule. */
export interface ConsentEndpointUseCases {
  readonly listApplicableDocuments: ListApplicableDocuments;
  readonly recordOwnAcceptance: RecordOwnAcceptance;
  readonly withdrawOwnConsent: WithdrawOwnConsent;
  readonly getOwnConsentStatus: GetOwnConsentStatus;
  /** Optional only until the composition root binds it; while it is absent
   * the acceptance route refuses rather than recording an unpinned grant. */
  readonly policyPinSource?: ConsentPolicyPinSource;
}

export const CONSENT_ENDPOINT_USE_CASES = Symbol('CONSENT_ENDPOINT_USE_CASES');

interface RequestLike {
  principal?: RequestPrincipal | undefined;
  id?: string | undefined;
}

export interface RecordAcceptanceBody {
  readonly legalDocumentVersionId?: string;
  readonly purposeRef?: string;
}

export interface WithdrawConsentBody {
  readonly grantId?: string;
}

function requireField(name: string, value: string | undefined): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`'${name}' is required`);
  }
  return value;
}

/** Map an expected use-case failure to its transport meaning. */
function toHttpError(
  error: { readonly kind: string } & Partial<{
    readonly message: string;
    readonly resource: string;
    readonly id: string;
  }>,
): Error {
  const message =
    error.message ??
    (error.kind === 'NOT_FOUND'
      ? `${error.resource ?? 'resource'} '${error.id ?? ''}' not found`
      : error.kind);
  switch (error.kind) {
    case 'NOT_FOUND':
      return new NotFoundException(message);
    case 'VERSION_NOT_PUBLISHED':
    case 'PURPOSE_NOT_COVERED':
    case 'DOCUMENT_NOT_APPLICABLE':
    case 'AMBIGUOUS_JURISDICTION':
      return new BadRequestException(message);
    case 'GRANT_NOT_ACTIVE':
    case 'NO_EFFECTIVE_ENTITY':
      return new ConflictException(message);
    default:
      // STORE_FAILURE / AUDIT_APPEND_FAILED: internal, loudly.
      return new InternalServerErrorException(message);
  }
}

@Controller('consent')
export class ConsentController {
  constructor(
    @Inject(CONSENT_ENDPOINT_USE_CASES)
    private readonly useCases: ConsentEndpointUseCases,
  ) {}

  @Get('documents')
  async listDocuments(
    @Req() request: RequestLike,
    // Neutral parameter name: the presence check below is a filter, not a
    // jurisdiction behaviour branch (architecture test 12).
    @Query('jurisdictionRef') scopeRef?: string,
  ): Promise<unknown> {
    const principal = requirePrincipal(request);
    const result = await this.useCases.listApplicableDocuments.execute({
      principal,
      ...(scopeRef === undefined ? {} : { jurisdictionRef: scopeRef }),
      now: new Date(),
    });
    if (!result.ok) {
      throw toHttpError(result.error);
    }
    return {
      documents: result.value.map((entry) => ({
        documentId: entry.document.id,
        entityId: entry.document.entityId,
        jurisdictionRef: entry.document.jurisdictionRef,
        purposeRefs: entry.document.purposeRefs,
        kind: entry.document.kind,
        effectiveVersion:
          entry.effectiveVersion === null
            ? null
            : {
                versionId: entry.effectiveVersion.id,
                version: entry.effectiveVersion.version,
                contentHash: entry.effectiveVersion.contentHash,
                storageRef: entry.effectiveVersion.storageRef,
                classification: entry.effectiveVersion.classification,
                effectiveAt: entry.effectiveVersion.effectiveAt?.toISOString() ?? null,
              },
      })),
    };
  }

  @Post('acceptances')
  @HttpCode(201)
  async recordAcceptance(
    @Req() request: RequestLike,
    @Body() body: RecordAcceptanceBody,
  ): Promise<unknown> {
    const principal = requirePrincipal(request);
    const purposeRef = requireField('purposeRef', body.purposeRef);
    const now = new Date();
    // Provenance comes from the resolver, never from the request body: a
    // client-supplied pack version would be a forged pin.
    const pin = await this.useCases.policyPinSource?.resolvePin({ principal, purposeRef, at: now });
    if (pin === undefined || pin === null) {
      throw new ServiceUnavailableException('policy provenance is unresolved; not recorded unpinned');
    }
    const result = await this.useCases.recordOwnAcceptance.execute({
      principal,
      legalDocumentVersionId: requireField('legalDocumentVersionId', body.legalDocumentVersionId),
      purposeRef,
      // Evidence of the acceptance act: the request identity, never client input.
      evidenceReference: `request:${request.id ?? 'unidentified'}`,
      policyPin: pin,
      now,
    });
    if (!result.ok) {
      throw toHttpError(result.error);
    }
    return {
      grantId: result.value.id,
      operatingEntityId: result.value.operatingEntityId,
      purposeRef: result.value.purposeRef,
      jurisdictionRef: result.value.jurisdictionRef,
      consentVersion: result.value.consentVersion,
      legalDocumentVersionId: result.value.legalDocumentVersionId,
      grantedAt: result.value.grantedAt.toISOString(),
      status: result.value.status,
    };
  }

  @Post('withdrawals')
  @HttpCode(200)
  async withdrawConsent(
    @Req() request: RequestLike,
    @Body() body: WithdrawConsentBody,
  ): Promise<unknown> {
    const principal = requirePrincipal(request);
    const result = await this.useCases.withdrawOwnConsent.execute({
      principal,
      grantId: requireField('grantId', body.grantId),
      now: new Date(),
    });
    if (!result.ok) {
      throw toHttpError(result.error);
    }
    return {
      grantId: result.value.id,
      status: result.value.status,
      withdrawnAt: result.value.withdrawnAt?.toISOString() ?? null,
    };
  }

  @Get('status')
  async readStatus(
    @Req() request: RequestLike,
    @Query('purposeRef') purposeRef?: string,
    @Query('jurisdictionRef') scopeRef?: string,
  ): Promise<unknown> {
    const principal = requirePrincipal(request);
    const result = await this.useCases.getOwnConsentStatus.execute({
      principal,
      purposeRef: requireField('purposeRef', purposeRef),
      ...(scopeRef === undefined ? {} : { jurisdictionRef: scopeRef }),
      now: new Date(),
    });
    if (!result.ok) {
      throw toHttpError(result.error);
    }
    return toStatusResponse(result.value);
  }
}

function toStatusResponse(status: OwnConsentStatus): unknown {
  return {
    state: status.state,
    noticeRequired: status.noticeRequired,
    purposeRef: status.purposeRef,
    jurisdictionRef: status.jurisdictionRef,
    operatingEntityId: status.operatingEntityId,
    documentId: status.documentId,
    grantId: status.grantId,
    grantedVersion: status.grantedVersion,
    effectiveVersionId: status.effectiveVersionId,
    effectiveVersion: status.effectiveVersion,
  };
}
