/**
 * The ONLY shipped ProviderAvailabilitySource: no provider integration
 * exists in this phase, so every kind answers NOT_CONFIGURED and a
 * pack-required provider resolves PENDING_PROVIDER. A connected provider is
 * never fabricated — a real source arrives with the first real integration
 * (Phase 5+), replacing this at composition.
 */

import type {
  ProviderAvailabilitySource,
  ProviderConnectionStatus,
} from '../../application/ports/provider-availability-source.js';

export class NoProvidersConfiguredSource implements ProviderAvailabilitySource {
  statusFor(providerKind: string, environment: string): Promise<ProviderConnectionStatus> {
    void providerKind;
    void environment;
    return Promise.resolve('NOT_CONFIGURED');
  }
}
