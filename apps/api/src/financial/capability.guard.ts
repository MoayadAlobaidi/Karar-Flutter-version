/**
 * The server-side capability gate: the first thing that runs on every
 * financial route, and the last word on whether the route runs at all.
 *
 * WHY A GUARD AND NOT A CHECK IN EACH HANDLER. Twenty-seven operations across
 * eight controllers execute against a person's financial records. A per-handler
 * call is a per-handler omission waiting to happen — the twenty-eighth handler
 * is written by somebody who did not read the first twenty-seven. A guard
 * declared on the controller CLASS covers every route the class declares, and
 * `capability-mounting.test.ts` reads the module's own controller list and
 * fails when one of them does not carry it, so a new controller cannot be
 * mounted ungated.
 *
 * WHY IT IS CONTROLLER-SCOPED RATHER THAN GLOBAL. Nest runs global guards
 * before controller-scoped ones, and the principal this gate needs is attached
 * by a global guard (`PrincipalEnrichmentGuard`). A second global guard would
 * have to win an ordering race decided by module instantiation order — it
 * would pass in review, pass in tests, and fail the day an import moves. A
 * controller-scoped guard runs after every global one by the framework's own
 * contract, which is not a race.
 *
 * WHAT IT READS. The session-resolved principal and nothing else. The gate
 * takes that principal and returns two values; there is no request object
 * beyond the one the principal source reads, and no capability parameter
 * anywhere in the signature. A `?capability=`, an `x-karar-capability` header,
 * a cookie or a body field names nothing on this path — not because a filter
 * strips it, but because no code here would consult it.
 *
 * FAIL CLOSED, INCLUDING WHEN THE GATE ITSELF FAILS. A resolution that threw
 * is not permission; it is the absence of an answer, and it refuses exactly
 * as a resolved denial does — same status, same code, same bytes. The thrown
 * value never reaches the caller: it travels as a non-enumerable cause for the
 * error boundary to log server-side (see refuse.ts).
 */

import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import {
  FINANCIAL_CAPABILITY_GATE,
  type FinancialCapabilityDecision,
  type FinancialCapabilityGate,
} from './capability-gate.js';
import { capabilityUnavailableProblem } from './problems.js';
import {
  FINANCIAL_PRINCIPAL_SOURCE,
  type FinancialPrincipal,
  type FinancialPrincipalSource,
} from './principal.js';
import { refuse, refuseWithCause, requirePrincipal } from './refuse.js';

@Injectable()
export class FinancialCapabilityGuard implements CanActivate {
  constructor(
    @Inject(FINANCIAL_PRINCIPAL_SOURCE) private readonly principals: FinancialPrincipalSource,
    @Inject(FINANCIAL_CAPABILITY_GATE) private readonly gate: FinancialCapabilityGate,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 401 and 403 for the principal itself are decided by the SAME helper the
    // controllers use, so an unauthenticated or unbound caller is answered
    // identically whether the gate is in front of the handler or not.
    const request = context.switchToHttp().getRequest<unknown>();
    const principal = requirePrincipal(this.principals, request);
    if ((await this.decide(principal)) !== 'AVAILABLE') {
      refuse(capabilityUnavailableProblem());
    }
    return true;
  }

  private async decide(principal: FinancialPrincipal): Promise<FinancialCapabilityDecision> {
    try {
      return await this.gate.decideFor(principal);
    } catch (error) {
      refuseWithCause(capabilityUnavailableProblem(), error);
    }
  }
}
