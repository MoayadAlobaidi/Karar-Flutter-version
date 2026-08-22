/**
 * The financial HTTP surface as a Nest module.
 *
 * Ordinary Nest composition (ADR-0016): `main.ts` builds the use cases over
 * their real ports and imports `FinancialApiModule.register(...)`. Nothing is
 * dynamically loaded and nothing is discovered by convention — a route
 * exists because a controller is listed here, and a use case is reachable
 * because the composition root put it in the bundle.
 *
 * TWO THINGS HAPPEN AT REGISTRATION, AND BOTH FAIL LOUDLY.
 *
 *   * `assertMountedIngestionLimits()` validates the declared bounds. A
 *     non-finite, zero or negative bound stops the process rather than being
 *     discovered by the first upload that exceeds it — a running process with
 *     an unbounded parser is the exact state the limits registry exists to
 *     make impossible.
 *   * `onModuleInit` registers the CSV content-type parser on the RUNNING
 *     adapter. It has to happen here rather than in `main.ts` because both
 *     entrypoints that build this application — `main.ts` and the
 *     runtime-conformance harness — must get the same parser; one registered
 *     in only one of them would make the conformance suite prove something
 *     about a server nobody runs.
 *
 * EVERY CONTROLLER LISTED HERE IS GATED, AND THE LIST IS THE PROOF. The
 * capability gate (capability.guard.ts) is declared on each controller class
 * rather than checked inside handlers, and `capability-mounting.test.ts`
 * reads the `controllers` array below and fails when any entry does not carry
 * it. Adding a controller to that array without the guard is therefore a
 * failing test, not a quiet hole — which matters because the surface's
 * defence in depth (principal, ownership, RLS) says nothing about whether the
 * capability may be used at all.
 */

import { Module, type DynamicModule, type OnModuleInit } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { FINANCIAL_CAPABILITY_GATE, type FinancialCapabilityGate } from './capability-gate.js';
import { FinancialCapabilityGuard } from './capability.guard.js';
import { FinancialRateLimitGuard } from './rate-limit.guard.js';
import { FINANCIAL_RATE_LIMITS, type FinancialRateLimitPort } from './rate-limit-port.js';
import { registerCsvContentTypeParser } from './csv-body.js';
import { FinancialAccountsController } from './financial-accounts.controller.js';
import { FinancialCatalogueController } from './financial-catalogue.controller.js';
import { FinancialTransactionDetailController } from './financial-transaction-detail.controller.js';
import { FinancialTransactionsController } from './financial-transactions.controller.js';
import { FinancialViewsController } from './financial-views.controller.js';
import {
  FINANCIAL_PRINCIPAL_SOURCE,
  requestPrincipalSource,
  type FinancialPrincipalSource,
} from './principal.js';
import { StatementImportSourceController } from './statement-import-source.controller.js';
import { StatementImportsController } from './statement-imports.controller.js';
import {
  RequestScopedTransactionsPrincipalContext,
  TRANSACTIONS_PRINCIPAL_CONTEXT,
  type TransactionsPrincipalScope,
} from './transactions-principal-context.js';
import { TransferMatchesController } from './transfer-matches.controller.js';
import {
  FINANCIAL_CLOCK,
  FINANCIAL_USE_CASES,
  assertMountedIngestionLimits,
  type FinancialUseCases,
} from './use-cases.js';

export interface FinancialApiModuleOptions {
  readonly useCases: FinancialUseCases;
  readonly clock: { now(): Date };
  /**
   * Whether the capability behind this surface is available for the caller.
   * REQUIRED and undefaulted, because either default is a decision somebody
   * should have to take deliberately: one that permits opens every route the
   * day a binding is forgotten, and one that refuses turns the same
   * forgetting into a surface that answers nobody while looking healthy.
   */
  readonly capabilityGate: FinancialCapabilityGate;
  /**
   * REQUIRED and undefaulted, for the same reason `capabilityGate` is: both
   * possible defaults are wrong. A permissive default leaves the whole
   * financial surface unlimited, and a refusing default refuses everyone. A
   * caller that has not thought about it must not get either by omission.
   */
  readonly rateLimits: FinancialRateLimitPort;
  /** Defaults to the session-backed source; tests may bind their own. */
  readonly principalSource?: FinancialPrincipalSource;
  /** Defaults to a fresh request-scoped context. */
  readonly transactionsPrincipalScope?: TransactionsPrincipalScope;
}

/** The parser registration needs the adapter, which exists only after boot. */
class CsvContentTypeRegistration implements OnModuleInit {
  constructor(private readonly adapters: HttpAdapterHost) {}

  onModuleInit(): void {
    const instance: unknown = this.adapters.httpAdapter?.getInstance();
    if (instance === undefined || instance === null) return;
    registerCsvContentTypeParser(instance as Parameters<typeof registerCsvContentTypeParser>[0]);
  }
}

@Module({})
export class FinancialApiModule {
  static register(options: FinancialApiModuleOptions): DynamicModule {
    assertMountedIngestionLimits();
    return {
      module: FinancialApiModule,
      controllers: [
        FinancialCatalogueController,
        FinancialAccountsController,
        FinancialViewsController,
        FinancialTransactionsController,
        FinancialTransactionDetailController,
        StatementImportsController,
        StatementImportSourceController,
        TransferMatchesController,
      ],
      providers: [
        { provide: FINANCIAL_USE_CASES, useValue: options.useCases },
        { provide: FINANCIAL_CAPABILITY_GATE, useValue: options.capabilityGate },
        { provide: FINANCIAL_RATE_LIMITS, useValue: options.rateLimits },
        // Declared here so every controller above can name them; each one names
        // BOTH, in this order, and capability-mounting.test.ts and
        // rate-limit-mounting.test.ts read this same list to prove it.
        FinancialCapabilityGuard,
        FinancialRateLimitGuard,
        { provide: FINANCIAL_CLOCK, useValue: options.clock },
        {
          provide: FINANCIAL_PRINCIPAL_SOURCE,
          useValue: options.principalSource ?? requestPrincipalSource,
        },
        {
          provide: TRANSACTIONS_PRINCIPAL_CONTEXT,
          useValue:
            options.transactionsPrincipalScope ?? new RequestScopedTransactionsPrincipalContext(),
        },
        {
          provide: CsvContentTypeRegistration,
          useFactory: (host: HttpAdapterHost) => new CsvContentTypeRegistration(host),
          inject: [HttpAdapterHost],
        },
      ],
    };
  }
}
