/**
 * `ConnectionAccessPort` — the composition root's implementation of the one
 * question `modules/statement-imports` is allowed to ask about a connection.
 *
 * WHY IT LIVES HERE. The port is declared INWARD by the statement-imports
 * module, and the module that can answer it is `@karar/financial-connections`.
 * The composition root is where the two meet, which is the seam an inward
 * port is declared to create — the same shape as
 * `financial-account-access.ts` next to it.
 *
 * ABSENT, SOMEBODY ELSE'S, AND NEVER-MINTED ARE ONE ANSWER: `null`.
 * `findOwnById` runs inside a principal-context transaction, so RLS makes
 * another subject's connection invisible rather than merely filtered, and
 * this adapter passes that through unchanged. Distinguishing the cases here,
 * in the return value or in a thrown error, would reintroduce exactly the
 * existence oracle the port's contract refuses — and "does this person hold a
 * connection to that institution" is a fact about their finances even when
 * nothing else travels with it.
 *
 * NOTHING BUT THE RAIL COMES BACK. Not the display label, which is
 * `HIGHLY_SENSITIVE_FINANCIAL` ciphertext the importing module has no reason
 * to decrypt; not the institution, which is the field a
 * match-on-institution-and-currency rule would be built from (ADR-0028); not
 * the status, the source links, or anything about the source account behind
 * them. The port cannot name those, and this adapter does not read them.
 *
 * THE RAIL IS TRANSLATED, NOT REINTERPRETED, and an unmapped value becomes
 * `UNRECOGNIZED` rather than passing through. A rail the connections module
 * implements later is a gap until somebody decides otherwise, and the
 * fail-closed reading of a gap is that a statement may not be attributed to
 * it. `UNRECOGNIZED` is not in the importable set, so it refuses.
 */

import { IMPLEMENTED_CONNECTION_RAILS } from '@karar/financial-connections';
import type {
  ConnectionsPrincipal,
  FinancialConnectionId,
  FinancialConnectionRepository,
} from '@karar/financial-connections';
import type {
  ConnectionAccessPort,
  ConnectionRef,
  ConnectionSummary,
  ImportsPrincipal,
} from '@karar/statement-imports';

/** The connections module's rail vocabulary, as this seam is willing to name it. */
function railOf(rail: string): string {
  return (IMPLEMENTED_CONNECTION_RAILS as readonly string[]).includes(rail) ? rail : 'UNRECOGNIZED';
}

export class FinancialConnectionsAccessAdapter implements ConnectionAccessPort {
  constructor(private readonly connections: FinancialConnectionRepository) {}

  async resolveOwnConnection(
    actor: ImportsPrincipal,
    connectionRef: ConnectionRef,
  ): Promise<ConnectionSummary | null> {
    // The two principals are structurally identical — both a kernel TenantId
    // plus a kernel UserId — and are still restated field by field rather
    // than cast. A cast would keep compiling if either shape gained a field,
    // and the field it would most likely gain is one this seam has no
    // business forwarding.
    const principal: ConnectionsPrincipal = {
      tenantId: actor.tenantId,
      userId: actor.userId,
      ...(actor.sessionId !== undefined ? { sessionId: actor.sessionId } : {}),
      ...(actor.requestId !== undefined ? { requestId: actor.requestId } : {}),
    };
    const connection = await this.connections.findOwnById(
      principal,
      connectionRef.connectionId as FinancialConnectionId,
    );
    if (connection === null) return null;
    return { connectionRef, rail: railOf(connection.rail) };
  }
}
