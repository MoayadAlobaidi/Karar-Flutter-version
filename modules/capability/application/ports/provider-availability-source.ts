/**
 * ProviderAvailabilitySource — the typed seam for gate 8. No provider
 * integration exists in this phase, so the ONLY shipped implementation is
 * `NoProvidersConfiguredSource` (infrastructure/providers), which answers
 * NOT_CONFIGURED for every kind — a required provider therefore resolves
 * PENDING_PROVIDER, never a fabricated connection.
 */

export type ProviderConnectionStatus = 'CONNECTED' | 'NOT_CONFIGURED' | 'UNAVAILABLE';

export interface ProviderAvailabilitySource {
  statusFor(providerKind: string, environment: string): Promise<ProviderConnectionStatus>;
}
