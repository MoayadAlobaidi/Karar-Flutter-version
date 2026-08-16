/**
 * In-memory SubjectPolicySelectionRepository for unit tests. Simulates the
 * RLS boundary honestly: every method filters to the acting principal's own
 * rows, so a foreign id resolves to null exactly as the live policy makes
 * it. Supersession follows the port contract: mark prior ACTIVE rows for
 * the capability SUPERSEDED, insert the new row, preserve everything.
 */

import type { SubjectPolicySelection } from '../../domain/selection.js';
import type {
  SubjectPolicyPrincipal,
  SubjectPolicySelectionRepository,
} from '../../application/ports/selection-repository.js';

export class InMemorySelectionRepository implements SubjectPolicySelectionRepository {
  private rows: SubjectPolicySelection[] = [];

  private owns(principal: SubjectPolicyPrincipal, row: SubjectPolicySelection): boolean {
    return row.userId === principal.userId && row.tenantId === principal.tenantId;
  }

  async recordSelection(
    principal: SubjectPolicyPrincipal,
    selection: SubjectPolicySelection,
  ): Promise<{ readonly supersededIds: ReadonlyArray<string> }> {
    const supersededIds: string[] = [];
    this.rows = this.rows.map((row) => {
      if (
        this.owns(principal, row) &&
        row.capabilityId === selection.capabilityId &&
        row.status === 'ACTIVE'
      ) {
        supersededIds.push(row.id);
        return { ...row, status: 'SUPERSEDED' as const };
      }
      return row;
    });
    this.rows.push(selection);
    return { supersededIds };
  }

  async findById(
    principal: SubjectPolicyPrincipal,
    id: string,
  ): Promise<SubjectPolicySelection | null> {
    const row = this.rows.find((r) => r.id === id && this.owns(principal, r));
    return row ?? null;
  }

  async listSelections(
    principal: SubjectPolicyPrincipal,
    capabilityId: string,
  ): Promise<ReadonlyArray<SubjectPolicySelection>> {
    return this.rows.filter((r) => this.owns(principal, r) && r.capabilityId === capabilityId);
  }

  async withdraw(principal: SubjectPolicyPrincipal, id: string, at: Date): Promise<void> {
    this.rows = this.rows.map((row) =>
      row.id === id && this.owns(principal, row)
        ? { ...row, status: 'WITHDRAWN' as const, withdrawnAt: at }
        : row,
    );
  }

  /** Test inspection only. */
  allRows(): ReadonlyArray<SubjectPolicySelection> {
    return [...this.rows];
  }
}
