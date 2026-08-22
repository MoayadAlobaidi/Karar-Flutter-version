/**
 * TRANSACTIONS is IMPLEMENTED and available NOWHERE.
 *
 * The registry's `implementation` field answers exactly one question — does the
 * capability's code exist in this repository — and for TRANSACTIONS the answer
 * is yes: seven bounded contexts behind migrations 0087-0101, 27 operations
 * mounted from the composition root, seven Flutter feature folders calling them.
 * It was recorded as NOT_IMPLEMENTED, which was not conservatism but a false
 * answer, and it invited a reader to trust that field for a question it does
 * not answer.
 *
 * This file is the proof that correcting it moved NOTHING. The three dimensions
 * that actually decide availability are separate fields and separate gates, and
 * each denies on its own:
 *
 *   deployment              empty  -> gate 1 denies NOT_DEPLOYED
 *   declaredJurisdictions   empty  -> the clearance intersection is empty
 *   qa/v1 clearedCapabilities []    -> no pack clears it
 *
 * If someone later equates IMPLEMENTED with DEPLOYED or AVAILABLE, these
 * assertions are what fails.
 */

import { describe, expect, it } from 'vitest';

import {
  CAPABILITY_IDS,
  CAPABILITY_REGISTRY,
  type KararEnvironment,
} from '@karar/capability-registry';

import { descriptorFactsFor, productionRegistryView } from '../application/registry-view.js';

const EVERY_ENVIRONMENT: readonly KararEnvironment[] = ['local', 'dev', 'staging', 'production'];

describe('TRANSACTIONS: built here, available nowhere', () => {
  it('is IMPLEMENTED, because the code exists', () => {
    expect(CAPABILITY_REGISTRY.TRANSACTIONS.implementation).toBe('IMPLEMENTED');
  });

  it('is NOT deployed in ANY real environment', () => {
    for (const environment of EVERY_ENVIRONMENT) {
      const facts = descriptorFactsFor(CAPABILITY_REGISTRY.TRANSACTIONS, environment);
      expect({ environment, deployed: facts.deployedInEnvironment }).toEqual({
        environment,
        deployed: false,
      });
      // Built in every environment — that is what the field means, and it is
      // the same answer everywhere because it is a fact about this repository
      // rather than about a deployment.
      expect({ environment, implemented: facts.implemented }).toEqual({
        environment,
        implemented: true,
      });
    }
  });

  it('declares NO jurisdiction, so the clearance intersection is empty', () => {
    expect(CAPABILITY_REGISTRY.TRANSACTIONS.declaredJurisdictions).toEqual([]);
    for (const environment of EVERY_ENVIRONMENT) {
      expect(descriptorFactsFor(CAPABILITY_REGISTRY.TRANSACTIONS, environment).declaredScopeRefs)
        .toEqual([]);
    }
  });

  it('the production registry view exposes the same three facts, unchanged', () => {
    const view = productionRegistryView();
    const descriptor = view.descriptors.TRANSACTIONS;
    expect(descriptor.implementation).toBe('IMPLEMENTED');
    expect(Object.keys(descriptor.deployment)).toEqual([]);
    expect(descriptor.declaredJurisdictions).toEqual([]);
  });

  it('NO capability is deployed anywhere — being built did not make one an exception', () => {
    // The whole-registry invariant. It is asserted over every id precisely so
    // that a future capability flipping to IMPLEMENTED cannot quietly bring a
    // deployment key with it.
    for (const id of CAPABILITY_IDS) {
      for (const environment of EVERY_ENVIRONMENT) {
        expect({ id, environment, deployed: CAPABILITY_REGISTRY[id].deployment[environment] })
          .toEqual({ id, environment, deployed: undefined });
      }
      expect({ id, declared: CAPABILITY_REGISTRY[id].declaredJurisdictions }).toEqual({
        id,
        declared: [],
      });
    }
  });
});
