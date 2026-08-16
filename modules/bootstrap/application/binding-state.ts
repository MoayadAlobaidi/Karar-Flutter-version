/**
 * Binding-state vocabulary of the bootstrap surface, plus the two small
 * helpers both use cases share. The state reported to the client reflects
 * binding VALIDITY, not raw session state: a session bound to a tenant that
 * no longer resolves (disabled tenant, revoked membership) reports UNBOUND
 * or TENANT_SELECTION_REQUIRED — a stale binding is surfaced as the need to
 * (re)select, never presented as a working tenant.
 */

import type { TenantChoiceView, TenantResolutionView } from './ports/tenant-context.js';

export type BindingStateView =
  | { readonly kind: 'UNBOUND' }
  | { readonly kind: 'BOUND'; readonly tenant: TenantChoiceView }
  | {
      readonly kind: 'TENANT_SELECTION_REQUIRED';
      readonly choices: readonly TenantChoiceView[];
    };

/** Every usable choice a resolution carries, uniformly. */
export function choicesOf(resolution: TenantResolutionView): readonly TenantChoiceView[] {
  switch (resolution.kind) {
    case 'UNBOUND':
      return [];
    case 'AUTO_BIND':
      return [resolution.choice];
    case 'TENANT_SELECTION_REQUIRED':
      return resolution.choices;
  }
}

/** The usable choice for one tenant id, or null when it is not a valid target. */
export function choiceFor(
  resolution: TenantResolutionView,
  tenantId: string,
): TenantChoiceView | null {
  return choicesOf(resolution).find((choice) => choice.tenantId === tenantId) ?? null;
}

/** The unbound-side state: zero choices is UNBOUND, otherwise selection. */
export function stateForChoices(choices: readonly TenantChoiceView[]): BindingStateView {
  return choices.length === 0
    ? { kind: 'UNBOUND' }
    : { kind: 'TENANT_SELECTION_REQUIRED', choices };
}
