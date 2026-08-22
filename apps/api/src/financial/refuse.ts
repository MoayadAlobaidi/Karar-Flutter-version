/**
 * How this surface refuses a request.
 *
 * FAILURES ARE THROWN, NEVER WRITTEN TO THE REPLY. The HTTP entrypoint's
 * error boundary is the ONE writer of an RFC 7807 document and the only place
 * its media type is set (apps/api/src/errors/problem-response.ts); a problem
 * authored here travels there as the body of an `HttpException` and is
 * forwarded verbatim, code and all. No controller on this surface touches a
 * content type, so there is no second implementation to diverge from that
 * one — which is precisely how twenty-five operation/status pairs once ended
 * up serving problem bodies under `application/json`.
 *
 * The two helpers exist so a controller's happy path stays a straight line:
 * the refusal is one expression, and the type system knows execution does not
 * continue past it.
 */

import { HttpException } from '@nestjs/common';

import {
  authenticationRequiredProblem,
  tenantBindingRequiredProblem,
  type ProblemResponse,
} from './problems.js';
import {
  isPrincipalRefusal,
  type FinancialPrincipal,
  type FinancialPrincipalSource,
} from './principal.js';

/** Ends the request with an authored problem. Returns `never` by throwing. */
export function refuse(problem: ProblemResponse): never {
  throw new HttpException(problem.body, problem.status);
}

/**
 * The same refusal, carrying what actually went wrong for the SERVER's
 * benefit only.
 *
 * The wording is fixed and the body is the one the problem author wrote —
 * nothing from the thrown value is read, formatted or interpolated into it,
 * because a driver message names tables, constraints and sometimes values,
 * and a policy failure names the legal posture this surface refuses to
 * describe. The original travels as a NON-ENUMERABLE `cause`, so the error
 * boundary can log it with its stack while `JSON.stringify` of the exception
 * — and therefore anything that could reach a client — cannot see it.
 */
export function refuseWithCause(problem: ProblemResponse, cause: unknown): never {
  const failure = new HttpException(problem.body, problem.status);
  Object.defineProperty(failure, 'cause', { value: cause, enumerable: false, writable: false });
  throw failure;
}

/**
 * The principal, or a refusal.
 *
 * 401 and 403 are different remedies — sign in, versus choose a tenant — and
 * a surface that collapsed them would send a signed-in person back to the
 * sign-in screen for a problem the sign-in screen cannot fix.
 */
export function requirePrincipal(
  source: FinancialPrincipalSource,
  request: unknown,
): FinancialPrincipal {
  const resolved = source.fromRequest(request);
  if (!isPrincipalRefusal(resolved)) return resolved;
  return refuse(
    resolved === 'AUTHENTICATION_REQUIRED'
      ? authenticationRequiredProblem()
      : tenantBindingRequiredProblem(),
  );
}
