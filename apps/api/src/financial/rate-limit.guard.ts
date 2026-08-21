/**
 * The abuse ceiling on every financial route, running AFTER the capability
 * gate and BEFORE anything reads the request.
 *
 * WHY ORDER IS THE CONTROL. `@UseGuards(FinancialCapabilityGuard,
 * FinancialRateLimitGuard)` is ONE decorator with two arguments, not two
 * decorators, because Nest awaits class guards in array order and short-circuits
 * on the first refusal. That gives: global principal enrichment -> capability
 * availability -> rate limit -> pipes -> handler body. Two separate decorators
 * would append in a metadata order that is easy to change by accident, and the
 * mounting test asserts the array with `toEqual` rather than `toContain`
 * precisely because the ORDER is what is being controlled.
 *
 * Two properties follow from that position, and both are asserted at the HTTP
 * boundary rather than argued here:
 *
 *   1. A refused request does no work. It never queries account existence,
 *      never creates an import draft, never writes a source byte, never parses
 *      a CSV, never opens a commit transaction and never mutates transfer
 *      state — because the handler body is where all of that lives and the
 *      handler body does not run.
 *   2. A 429 is not an oracle. The capability gate refuses FIRST, so an
 *      unavailable capability answers 403 whatever the budget says; and two
 *      requests that differ only in whether the named resource exists produce
 *      byte-identical 429s, because nothing has looked yet.
 *
 * WHAT IT READS. The session-resolved principal, and the handler being
 * dispatched. Never a body, a query or a header — a caller cannot name the
 * budget it is charged to, cannot name a tenant, and cannot name a subject.
 *
 * AN UNMAPPED OPERATION IS REFUSED, NOT ADMITTED. A mounted route with no
 * policy is a configuration error and answers 500. The structural test makes
 * that branch unreachable in a healthy tree; the branch is what keeps the tree
 * honest if the test is ever deleted. The opposite default — admit what is not
 * named — is how a surface silently grows an unlimited route.
 */

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { ErrorCode, PlatformError } from '@karar/platform/dist/errors/index.js';

import { policyForHandler } from './rate-limit-policies.js';
import { FINANCIAL_RATE_LIMITS, type FinancialRateLimitPort } from './rate-limit-port.js';
import { FINANCIAL_PRINCIPAL_SOURCE, type FinancialPrincipalSource } from './principal.js';
import { requirePrincipal } from './refuse.js';

@Injectable()
export class FinancialRateLimitGuard implements CanActivate {
  constructor(
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
    @Inject(FINANCIAL_RATE_LIMITS) private readonly limits: FinancialRateLimitPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // The same helper the capability guard and the controllers use, so an
    // unauthenticated caller is answered identically wherever it is refused.
    const request = context.switchToHttp().getRequest<unknown>();
    const principal = requirePrincipal(this.principals, request);

    const policy = policyForHandler(context.getClass().name, context.getHandler().name);
    if (policy === undefined) {
      throw new PlatformError({
        code: ErrorCode.CONFIGURATION_ERROR,
        message: 'This financial operation declares no rate-limit policy and was not processed.',
        origin: 'application',
        retryable: false,
        details: {
          operation: `${context.getClass().name}.${context.getHandler().name}`,
        },
      });
    }

    await this.limits.assertWithinLimit(policy, this.limits.subjectKeyFor(principal));
    return true;
  }
}
