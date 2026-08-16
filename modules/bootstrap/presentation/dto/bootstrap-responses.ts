/**
 * Response serialization for the bootstrap surface — the LEAK BOUNDARY.
 *
 * Every serializer here projects a CLOSED field set: fields are picked by
 * name, one by one, so anything extra an upstream port attaches (licence
 * details, PolicyPack content, raw consent evidence, internal audit or
 * configuration, register internals) is structurally DROPPED at this edge
 * rather than shipped. The regression suite (§48) drives fakes that TRY to
 * leak through every port and asserts the serialized output carries exactly
 * the declared fields.
 *
 * Capability output is passed through UNENRICHED from the client-safe
 * resolver (bootstrap never re-filters ids — that would duplicate the
 * capability workstream's logic); the field projection still applies.
 */

import type { BootstrapView } from '../../application/use-cases/get-bootstrap.js';
import type { SetTenantBindingResult } from '../../application/use-cases/set-tenant-binding.js';
import type { BindingStateView } from '../../application/binding-state.js';
import type {
  ClientCapabilityView,
  JurisdictionStateView,
  OperatingEntityReferenceView,
  PolicyPackStatusView,
} from '../../application/ports/context-enrichment.js';
import type { TenantChoiceView } from '../../application/ports/tenant-context.js';
import type { SwitchedSessionView } from '../../application/ports/tenant-context.js';

function toTenantChoice(choice: TenantChoiceView) {
  return {
    tenantId: String(choice.tenantId),
    name: String(choice.name),
    roleHint: String(choice.roleHint),
  };
}

export function toBindingState(binding: BindingStateView) {
  switch (binding.kind) {
    case 'UNBOUND':
      return { kind: 'UNBOUND' as const };
    case 'BOUND':
      return { kind: 'BOUND' as const, tenant: toTenantChoice(binding.tenant) };
    case 'TENANT_SELECTION_REQUIRED':
      return {
        kind: 'TENANT_SELECTION_REQUIRED' as const,
        choices: binding.choices.map(toTenantChoice),
      };
  }
}

/**
 * The typed state crosses the edge as the state NAME plus the identifier as
 * DATA. No comparison on the identifier happens here or anywhere else — the
 * client keys on `state` exactly as the server does (architecture test 12).
 */
function toJurisdiction(view: JurisdictionStateView) {
  return {
    state: String(view.kind),
    jurisdictionId: 'assignment' in view ? String(view.assignment.jurisdictionId) : null,
  };
}

function toOperatingEntity(view: OperatingEntityReferenceView | null) {
  return view === null ? null : { id: String(view.id), name: String(view.name) };
}

function toPolicyPack(view: PolicyPackStatusView | null) {
  return view === null ? null : { version: String(view.version), status: String(view.status) };
}

function toCapability(view: ClientCapabilityView) {
  return {
    id: String(view.id),
    status: String(view.status),
    requirements: view.requirements.map((requirement) => ({
      kind: String(requirement.kind),
      ...(requirement.detail !== undefined ? { detail: String(requirement.detail) } : {}),
    })),
  };
}

export function toBootstrapResponse(view: BootstrapView) {
  return {
    user: {
      userId: String(view.user.userId),
      emailVerified: view.user.emailVerified === true,
    },
    session: { sessionId: String(view.session.sessionId) },
    binding: toBindingState(view.binding),
    jurisdiction: toJurisdiction(view.jurisdiction),
    operatingEntity: toOperatingEntity(view.operatingEntity),
    policyPack: toPolicyPack(view.policyPack),
    capabilities: view.capabilities.map(toCapability),
  };
}

function toSwitchedTokens(session: SwitchedSessionView) {
  return {
    accessToken: String(session.accessToken),
    accessTokenExpiresAt: session.accessTokenExpiresAt.toISOString(),
    refreshToken: String(session.refreshToken),
    refreshTokenExpiresAt: session.refreshTokenExpiresAt.toISOString(),
    sessionId: String(session.sessionId),
  };
}

export function toTenantBindingResponse(result: SetTenantBindingResult) {
  if (result.kind === 'bound') {
    return { kind: 'BOUND' as const, binding: toBindingState(result.binding) };
  }
  return {
    kind: 'SWITCHED' as const,
    binding: toBindingState(result.binding),
    tokens: toSwitchedTokens(result.session),
  };
}
