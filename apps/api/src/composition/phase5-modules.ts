/**
 * Phase 5 composition — the financial modules meet their infrastructure, once,
 * here.
 *
 * WHAT THIS FILE IS RESPONSIBLE FOR, and what it must never do:
 *
 * EVERY PORT IS BOUND TO A REAL IMPLEMENTATION OR THE BOOT FAILS. Nothing is
 * stubbed to succeed. Every encryption, retention, dedup and source-store port
 * on this surface is obtained through its OWN module's fail-closed resolver,
 * and every one of those resolvers THROWS outside `KARAR_ENV=local` unless a
 * deployment has wired an approved provider. That is the whole point: a
 * deployed environment with no key-management adapter and no approved
 * retention decision must refuse to compose this surface at boot, rather than
 * discover it at the first write. A synthetic retention period carries no
 * legal effect, and a process that substituted one would be fabricating the
 * answer to a question only counsel may answer.
 *
 * NO REFUSAL HERE DEPENDS ON LINE ORDER, and that is a deliberate repair. Two
 * of the transactions module's local providers — its AES field-encryption
 * adapter and its keyed dedup-fingerprint adapter — used to carry no guard of
 * their own and minted their own key material, so they were safe only because
 * OTHER constructors above them threw first. That is security by line
 * ordering: reordering this file, extracting a helper, deferring a
 * construction, or composing these modules from a second entry point would
 * have enabled in-process key material in a deployed environment with nothing
 * failing. Both now refuse in their own resolver, and neither class will
 * construct without key material handed to it, so the guarantee survives any
 * rearrangement of the lines below. The resolvers are still grouped first for
 * readability — but only for readability.
 *
 * EVERY LOCAL-ONLY PROVIDER ON THIS SURFACE IS NOW GUARDED BY ITS OWN
 * MODULE. Each is obtained through a resolver that takes the environment and
 * refuses outside local, so no reordering, extracted helper or lazy
 * construction here can produce a working local key holder by accident. The
 * source-file fingerprint port was the last one wired through a stopgap in
 * this file; it now resolves through `@karar/statement-imports` like the
 * rest, and its root key is a required argument rather than something the
 * adapter mints for itself when nobody supplies one.
 *
 * NO ROUTE ON THIS SURFACE EXECUTES BEFORE THE CAPABILITY IS RESOLVED. The
 * gate is bound here from the resolver the client bootstrap answers from, so
 * there is exactly one availability decision in the process. Client-side
 * navigation gating is a rendering choice, not a control: a deep link, a
 * replayed request or a script reaches a mounted route without ever reading a
 * bootstrap document, and the gate is what stands there instead.
 *
 * THE INGESTION BOUNDS COME FROM THE CENTRAL REGISTRY. The CSV path is handed
 * `INGESTION_LIMIT_POLICIES.csvStatementImport` and the manual paths
 * `INGESTION_LIMIT_POLICIES.manualTransaction`; both are validated at startup
 * rather than at the first upload. No bound is written in this file.
 *
 * ACCOUNT DELETION IS NOT COMPOSED. `DeleteOwnAccount` needs three
 * cross-module erasers as REQUIRED constructor arguments, and it is not
 * wired at all — not with no-ops, and not with a partial set. There is no
 * HTTP route for it (see apps/api/src/financial/use-cases.ts), and a no-op
 * eraser would report a successful deletion while the rows survive: cards
 * still spending from an account the subject was told is gone. The two
 * erasers that ARE constructed — `TransactionsTransferMatchEraser` and the
 * `EraseTransferMatches` use case behind it — are the real adapters, used by
 * the transaction delete path that IS mounted.
 *
 * TRANSFER-MATCHING'S RETENTION RESOLVER IS NOT CONSULTED, and that is
 * correct rather than an omission: the only transfer-match writes this
 * surface mounts are confirm and reject, which change the state of a row that
 * already exists. Creating a match is `SuggestTransferMatch`, which is not
 * mounted; the moment it is, its retention port becomes a required argument
 * and this file will refuse to compose without one.
 */

import type { DynamicModule } from '@nestjs/common';
import { readDefaultEventCatalogue } from '@karar/api-contracts';
import type { Clock } from '@karar/shared-kernel';
import type { PrismaHandle } from '@karar/platform/dist/db/prisma.js';
import {
  INGESTION_LIMIT_POLICIES,
  assertIngestionLimitPoliciesValid,
} from '@karar/platform/dist/ingestion/limits.js';

import {
  CreateManualAccount,
  ListOwnAccounts,
  ListOwnBalanceSnapshots,
  PrismaBalanceSnapshotRepository,
  PrismaFinancialAccountRepository,
  PrismaInstitutionCatalogueReader,
  ReadOwnAccount,
  UpdateOwnAccount,
  Uuidv7IdSource as AccountsIdSource,
  resolveHsfFieldEncryptionPort as resolveAccountsEncryption,
  resolveRetentionDecisionPort as resolveAccountsRetention,
} from '@karar/financial-accounts';
import {
  ListOwnAccountSourceLinks,
  ListOwnConnections,
  PrismaAccountSourceLinkRepository,
  PrismaFinancialConnectionRepository,
  resolveHsfFieldEncryptionPort as resolveConnectionsEncryption,
} from '@karar/financial-connections';
import {
  ListOwnPaymentInstruments,
  PrismaPaymentInstrumentRepository,
  resolveHsfFieldEncryptionPort as resolveInstrumentsEncryption,
} from '@karar/payment-instruments';
import {
  AssignCategory,
  CreateManualTransaction,
  DeleteOwnTransaction,
  ListOwnTransactions,
  PrismaCategoryAssignmentRepository,
  PrismaFinancialCategoryCatalogue,
  PrismaFinancialRecordPresenceReader,
  PrismaMerchantRuleDirectory,
  PrismaStatementCommitWriter,
  PrismaTransactionRepository,
  ReadOwnTransaction,
  UpdateOwnTransaction,
  Uuidv7IdSource as TransactionsIdSource,
  resolveDedupFingerprintPort,
  resolveHsfFieldEncryptionPort as resolveTransactionsEncryption,
  resolveTransactionRetentionDecisionPort as resolveTransactionsRetention,
} from '@karar/transactions';
import {
  ConfirmTransferMatch,
  EraseTransferMatches,
  ListOwnTransferMatches,
  PrismaTransferMatchRepository,
  RejectTransferMatch,
  TransactionsTransferMatchEraser,
} from '@karar/transfer-matching';
import {
  CommitStatementImport,
  EraseStatementImport,
  FinancialAccountsCanonicalAccountAdapter,
  resolveSourceFileFingerprintPort,
  ParseStatementSource,
  PlatformOutboxStatementImportRecorder,
  PreviewStatementImport,
  PrismaCanonicalDedupLookupReader,
  PrismaStatementCommitUnitOfWork,
  PrismaStatementImportRepository,
  StartStatementImport,
  StoreImportSource,
  StreamingCsvParser,
  TransactionsCanonicalNarrativeAdapter,
  TransactionsDeterministicCategoryAdapter,
  Uuidv7IdSource as ImportsIdSource,
  resolveEncryptedSourceStorePort,
  resolveHsfFieldEncryptionPort as resolveImportsEncryption,
  resolveRetentionDecisionPort as resolveImportsRetention,
} from '@karar/statement-imports';

import { FinancialApiModule } from '../financial/financial.module.js';
import {
  resolveFinancialCapabilityGate,
  type FinancialCapabilityResolution,
} from './financial-capability-gate.js';
import { RequestScopedTransactionsPrincipalContext } from '../financial/transactions-principal-context.js';
import { FinancialAccountsAccessAdapter } from './financial-account-access.js';
import { FinancialConnectionsAccessAdapter } from './financial-connection-access.js';

export interface Phase5CompositionInput {
  /** The resolved deployment environment; every fail-closed resolver reads it. */
  readonly environment: string;
  readonly prisma: PrismaHandle;
  readonly clock: Clock;
  /** Names this process in the outbox envelope. Identifiers only travel there. */
  readonly producer: string;
  /**
   * The capability resolver the client bootstrap document is projected from
   * (composePhase35Modules). Required: this surface refuses to execute for a
   * principal the capability is not available to, and it must refuse from the
   * facts the client was told rather than from a lookup of its own.
   */
  readonly capabilityResolution: FinancialCapabilityResolution;
}

export function composePhase5Modules(input: Phase5CompositionInput): DynamicModule[] {
  const { environment, prisma, clock } = input;

  // A malformed bound stops the process here rather than at the first upload.
  assertIngestionLimitPoliciesValid();

  // --- fail-closed ports ---------------------------------------------------
  // Each of these throws outside `local` unless an approved provider is wired,
  // and each throws from inside its own module's resolver. Grouping them here
  // is for a reader's benefit only: moving any one of these lines anywhere
  // else in this function changes nothing about what it refuses.
  const accountsEncryption = resolveAccountsEncryption({ env: environment });
  const accountsRetention = resolveAccountsRetention({ env: environment });
  const connectionsEncryption = resolveConnectionsEncryption({ env: environment });
  const instrumentsEncryption = resolveInstrumentsEncryption({ env: environment });
  const importsEncryption = resolveImportsEncryption({ env: environment });
  const importsRetention = resolveImportsRetention({ env: environment });
  const importsSourceStore = resolveEncryptedSourceStorePort({ env: environment });
  const transactionsRetention = resolveTransactionsRetention({ env: environment });
  const transactionsEncryption = resolveTransactionsEncryption({ env: environment });
  const dedupFingerprints = resolveDedupFingerprintPort({ env: environment });

  // --- the capability gate -------------------------------------------------
  // Not a port of any module: it is the question of whether this SURFACE may
  // run at all, asked of the shared resolver before any use case is reached.
  // Its own resolver follows the same shape as the ones above — `local` gets a
  // labelled fixture with no legal effect, every other environment gets the
  // resolved gate and nothing else (financial-capability-gate.ts).
  const capabilityGate = resolveFinancialCapabilityGate({
    env: environment,
    resolution: input.capabilityResolution,
    clock,
  });

  // --- accounts ------------------------------------------------------------
  const accounts = new PrismaFinancialAccountRepository(prisma, accountsEncryption);
  const snapshots = new PrismaBalanceSnapshotRepository(prisma);
  const institutions = new PrismaInstitutionCatalogueReader(prisma);
  const accountIds = new AccountsIdSource();

  // --- transactions --------------------------------------------------------
  const transactionRepository = new PrismaTransactionRepository(prisma, transactionsEncryption);
  const assignments = new PrismaCategoryAssignmentRepository(prisma);
  const categories = new PrismaFinancialCategoryCatalogue(prisma);
  const merchantRules = new PrismaMerchantRuleDirectory(prisma);
  const transactionIds = new TransactionsIdSource();
  const transactionsPrincipalScope = new RequestScopedTransactionsPrincipalContext();
  const accountAccess = new FinancialAccountsAccessAdapter(accounts);
  // The presence port the accounts module declares and this module fills: it
  // is what stops a currency change on an account that already has records.
  const recordPresence = new PrismaFinancialRecordPresenceReader(prisma);

  // --- transfer matching ---------------------------------------------------
  const matches = new PrismaTransferMatchRepository(prisma);
  const eraseTransferMatches = new EraseTransferMatches(matches);
  // The REAL eraser, never a no-op: deleting a transaction must take the
  // relationships that name it, and a no-op would report success over rows
  // that survive.
  const transferMatchEraser = new TransactionsTransferMatchEraser(eraseTransferMatches);

  // --- connections and instruments ----------------------------------------
  const connections = new PrismaFinancialConnectionRepository(prisma, connectionsEncryption);
  const sourceLinks = new PrismaAccountSourceLinkRepository(prisma, connectionsEncryption);
  const instruments = new PrismaPaymentInstrumentRepository(prisma, instrumentsEncryption);

  // --- statement imports ---------------------------------------------------
  const imports = new PrismaStatementImportRepository(prisma, importsEncryption);
  const importIds = new ImportsIdSource();
  const canonicalAccounts = new FinancialAccountsCanonicalAccountAdapter(accounts);
  // The connection an import may NAME as its provenance, resolved through the
  // module that owns connections. `StartStatementImport` takes this as a
  // required argument: the field is a claim about where a person's statement
  // came from, and an unchecked claim is indistinguishable from a checked one
  // everywhere downstream of the row.
  const importConnections = new FinancialConnectionsAccessAdapter(connections);
  const canonicalDedup = new PrismaCanonicalDedupLookupReader(prisma);
  // The TRANSACTIONS module's encryption seam for the canonical rows: a
  // ciphertext written for a staged row must not authenticate against
  // `public.transactions`, so the two labels stay apart.
  const canonicalNarrative = new TransactionsCanonicalNarrativeAdapter(transactionsEncryption);
  const deterministicCategory = new TransactionsDeterministicCategoryAdapter(merchantRules);
  const outbox = new PlatformOutboxStatementImportRecorder(
    readDefaultEventCatalogue(),
    clock,
    input.producer,
  );
  // The unit of work opens the ONE transaction and hands the open handle to
  // the transactions module's writer, so an import commit is one unit of work
  // across two bounded contexts.
  const statementCommits = new PrismaStatementCommitUnitOfWork(
    prisma,
    canonicalNarrative,
    new PrismaStatementCommitWriter(),
    outbox,
  );

  return [
    FinancialApiModule.register({
      clock,
      capabilityGate,
      transactionsPrincipalScope,
      useCases: {
        institutions,
        categories,

        listOwnAccounts: new ListOwnAccounts(accounts),
        readOwnAccount: new ReadOwnAccount(accounts),
        createManualAccount: new CreateManualAccount(
          accounts,
          institutions,
          accountsRetention,
          accountIds,
          clock,
        ),
        updateOwnAccount: new UpdateOwnAccount(
          accounts,
          snapshots,
          recordPresence,
          institutions,
          clock,
        ),
        listOwnBalanceSnapshots: new ListOwnBalanceSnapshots(accounts, snapshots),

        listOwnTransactions: new ListOwnTransactions(
          transactionsPrincipalScope,
          transactionRepository,
        ),
        createManualTransaction: new CreateManualTransaction(
          transactionsPrincipalScope,
          transactionRepository,
          dedupFingerprints,
          transactionIds,
          clock,
          transactionsRetention,
          accountAccess,
        ),
        readOwnTransaction: new ReadOwnTransaction(
          transactionsPrincipalScope,
          transactionRepository,
          assignments,
        ),
        updateOwnTransaction: new UpdateOwnTransaction(
          transactionsPrincipalScope,
          transactionRepository,
          transactionIds,
          clock,
        ),
        deleteOwnTransaction: new DeleteOwnTransaction(
          transactionsPrincipalScope,
          transactionRepository,
          transferMatchEraser,
        ),
        assignCategory: new AssignCategory(
          transactionsPrincipalScope,
          transactionRepository,
          assignments,
          categories,
          transactionIds,
          clock,
        ),

        listOwnConnections: new ListOwnConnections(connections),
        listOwnAccountSourceLinks: new ListOwnAccountSourceLinks(sourceLinks),
        listOwnPaymentInstruments: new ListOwnPaymentInstruments(instruments),

        startStatementImport: new StartStatementImport(
          imports,
          canonicalAccounts,
          importConnections,
          importsRetention,
          importIds,
          clock,
        ),
        storeImportSource: new StoreImportSource(
          imports,
          importsSourceStore,
          resolveSourceFileFingerprintPort({ env: environment }),
          importsRetention,
          importIds,
          clock,
        ),
        parseStatementSource: new ParseStatementSource(
          imports,
          importsSourceStore,
          new StreamingCsvParser(),
          canonicalAccounts,
          dedupFingerprints,
          canonicalDedup,
          importIds,
          clock,
        ),
        previewStatementImport: new PreviewStatementImport(imports),
        commitStatementImport: new CommitStatementImport(
          imports,
          statementCommits,
          canonicalAccounts,
          importsSourceStore,
          canonicalDedup,
          deterministicCategory,
          importsRetention,
          importIds,
          clock,
        ),
        eraseStatementImport: new EraseStatementImport(imports, importsSourceStore, clock),

        listOwnTransferMatches: new ListOwnTransferMatches(matches),
        confirmTransferMatch: new ConfirmTransferMatch(matches, clock),
        rejectTransferMatch: new RejectTransferMatch(matches, clock),
      },
    }),
  ];
}

/**
 * The two declared ingestion policies this surface mounts, named so a reader
 * — and the architecture suite's resource-limit inventory — can see which
 * central policies these routes are actually held to.
 *
 * `manualTransaction` bounds the hand-entered paths and supplies every page
 * bound on the surface; `csvStatementImport` bounds the statement upload, its
 * parse and its review. Neither number is written here.
 */
export const PHASE5_MOUNTED_POLICIES = Object.freeze([
  INGESTION_LIMIT_POLICIES.manualTransaction,
  INGESTION_LIMIT_POLICIES.csvStatementImport,
]);
