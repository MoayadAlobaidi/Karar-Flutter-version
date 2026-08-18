/**
 * The two gates `CreateManualTransaction` refuses through, against in-memory
 * doubles: retention, and the account.
 *
 * The live-PostgreSQL half of this evidence is
 * `write-gates.integration.test.ts`, which proves that a refusal leaves no
 * transaction, revision or provenance row behind by counting as superuser.
 * What is proven HERE is the part a database cannot show: that the refusals
 * happen before anything is derived, that a refused call never reaches the
 * fingerprint port (and therefore never reaches the encryption that happens
 * behind the repository), and that four different invisible accounts produce
 * one indistinguishable answer.
 */

import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  CreateManualTransaction,
  type CreateManualTransactionError,
  type CreateManualTransactionInput,
} from '../application/use-cases/create-manual-transaction.js';
import type {
  DedupFingerprint,
  DedupFingerprintPort,
  FingerprintInput,
} from '../application/ports/dedup-fingerprint.js';
import type { TransactionsPrincipal } from '../application/ports/principal-context.js';
import type {
  TransactionRetentionDecision,
  TransactionRetentionDecisionPort,
} from '../application/ports/transaction-retention-decision.js';
import { LocalKeyedDedupFingerprintProvider } from '../infrastructure/providers/local-keyed-dedup-fingerprint-provider.js';
import {
  FIXTURE_ENVIRONMENT,
  LocalSyntheticRetentionDecisionProvider,
  SYNTHETIC_RETENTION_BASIS,
} from '../infrastructure/providers/local-synthetic-retention-decision-provider.js';
import {
  FixedAccountDirectory,
  FixedPrincipalContext,
  InMemoryTransactionRepository,
  SequentialIdSource,
  StubRetentionDecisionPort,
} from './fakes/in-memory-repositories.js';
import { BOOKED, NOW, fixedClock, kwd, principal, qar, syntheticMerchant } from './fakes/synthetic-fixtures.js';

const USE_CASE_SOURCE = readFileSync(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'application',
    'use-cases',
    'create-manual-transaction.ts',
  ),
  'utf8',
);

/**
 * Counts fingerprint calls. Fingerprinting is the first thing either gate can
 * still prevent, and it happens strictly before the repository — which is
 * where narrative is encrypted. So "the fingerprint port was never called"
 * is the strongest available proof that nothing was derived from the
 * subject's data and nothing was encrypted.
 */
class CountingFingerprintPort implements DedupFingerprintPort {
  #calls = 0;

  constructor(private readonly inner: DedupFingerprintPort) {}

  get version(): string {
    return this.inner.version;
  }

  get calls(): number {
    return this.#calls;
  }

  fingerprint(
    subject: TransactionsPrincipal,
    input: FingerprintInput,
  ): Promise<DedupFingerprint> {
    this.#calls += 1;
    return this.inner.fingerprint(subject, input);
  }
}

const DECIDED: TransactionRetentionDecision = {
  state: 'DECIDED',
  retentionPeriod: 'P7D',
  basis: 'test fixture — no legal effect',
  effect: 'SYNTHETIC_NO_LEGAL_EFFECT',
};

function harness(decision: TransactionRetentionDecision = DECIDED) {
  const alice = principal();
  // Same tenant, different user. The account gate has to refuse this one, and
  // a tenant-only check would not.
  const mallory: TransactionsPrincipal = { tenantId: alice.tenantId, userId: principal().userId };
  const bob = principal();

  const context = new FixedPrincipalContext(alice);
  const transactions = new InMemoryTransactionRepository();
  const fingerprints = new CountingFingerprintPort(
    new LocalKeyedDedupFingerprintProvider({ rootKey: Buffer.alloc(32, 21) }),
  );
  const retention = new StubRetentionDecisionPort(decision);

  const aliceAccount = randomUUID();
  const malloryAccount = randomUUID();
  const bobAccount = randomUUID();
  const archivedAccount = randomUUID();
  const closedAccount = randomUUID();
  const unmappedAccount = randomUUID();
  const providerAccount = randomUUID();
  const kwdAccount = randomUUID();

  // NON-EMPTY on every side. Each principal owns real accounts, so a refusal
  // is a refusal about a populated directory rather than about an empty one.
  const accounts = new FixedAccountDirectory([
    { accountId: aliceAccount, owner: alice, currencyCode: 'QAR' },
    { accountId: kwdAccount, owner: alice, currencyCode: 'KWD' },
    { accountId: archivedAccount, owner: alice, currencyCode: 'QAR', lifecycleState: 'ARCHIVED' },
    { accountId: closedAccount, owner: alice, currencyCode: 'QAR', lifecycleState: 'CLOSED' },
    {
      accountId: unmappedAccount,
      owner: alice,
      currencyCode: 'QAR',
      lifecycleState: 'UNRECOGNIZED',
    },
    { accountId: providerAccount, owner: alice, currencyCode: 'QAR', providerConnected: true },
    { accountId: malloryAccount, owner: mallory, currencyCode: 'QAR' },
    { accountId: bobAccount, owner: bob, currencyCode: 'QAR' },
  ]);

  const create = new CreateManualTransaction(
    context,
    transactions,
    fingerprints,
    new SequentialIdSource(),
    fixedClock(NOW),
    retention,
    accounts,
  );

  const entry = (accountId: string): CreateManualTransactionInput => ({
    accountId,
    magnitude: qar(45),
    direction: 'MONEY_OUT',
    bookingDate: BOOKED,
    description: syntheticMerchant('corner shop'),
  });

  return {
    alice,
    mallory,
    bob,
    context,
    transactions,
    fingerprints,
    retention,
    accounts,
    create,
    entry,
    ids: {
      aliceAccount,
      malloryAccount,
      bobAccount,
      archivedAccount,
      closedAccount,
      unmappedAccount,
      providerAccount,
      kwdAccount,
    },
  };
}

describe('the gates run before anything is derived', () => {
  it('consults retention and the account before the fingerprint and the commit', () => {
    // Mechanical, over the real source. "Before encryption" is not directly
    // observable from a use-case test — encryption lives behind the
    // repository — so the observable form of the claim is the call ORDER:
    // both gates precede the fingerprint, which itself precedes the commit
    // that encrypts.
    const retentionAt = USE_CASE_SOURCE.indexOf('this.retention.decide(');
    const accountAt = USE_CASE_SOURCE.indexOf('this.accounts.resolveOwnAccount(');
    const fingerprintAt = USE_CASE_SOURCE.indexOf('this.fingerprints.fingerprint(');
    const commitAt = USE_CASE_SOURCE.indexOf('this.transactions.commit(');
    for (const [label, index] of [
      ['retention', retentionAt],
      ['account', accountAt],
      ['fingerprint', fingerprintAt],
      ['commit', commitAt],
    ] as const) {
      expect(index, `${label} call site not found`).toBeGreaterThan(-1);
    }
    expect(retentionAt).toBeLessThan(accountAt);
    expect(accountAt).toBeLessThan(fingerprintAt);
    expect(fingerprintAt).toBeLessThan(commitAt);
  });

  it('asks retention first, so an undecided platform cannot be used to probe accounts', async () => {
    const h = harness({ state: 'UNAVAILABLE', reason: 'no pack is activated for this subject' });
    // A real account, another user's account, and one that never existed all
    // get the identical refusal while retention is unresolved.
    const outcomes = await Promise.all([
      h.create.execute(h.entry(h.ids.aliceAccount)),
      h.create.execute(h.entry(h.ids.malloryAccount)),
      h.create.execute(h.entry(randomUUID())),
    ]);
    const kinds = outcomes.map((outcome) => (outcome.ok ? 'ok' : outcome.error.kind));
    expect(kinds).toEqual(['RETENTION_UNDECIDED', 'RETENTION_UNDECIDED', 'RETENTION_UNDECIDED']);
    // Nothing about the account was learned, because nothing about the
    // account was asked.
    expect(h.fingerprints.calls).toBe(0);
    expect(h.transactions.size()).toBe(0);
  });
});

describe('retention gate', () => {
  it('refuses when the decision is PENDING_LEGAL_REVIEW, writing nothing', async () => {
    const h = harness({
      state: 'PENDING_LEGAL_REVIEW',
      openQuestion: 'how long may a transaction record be retained in this jurisdiction?',
    });
    const refused = await h.create.execute(h.entry(h.ids.aliceAccount));
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('RETENTION_UNDECIDED');
      if (refused.error.kind === 'RETENTION_UNDECIDED') {
        expect(refused.error.state).toBe('PENDING_LEGAL_REVIEW');
        // The open question travels, so the refusal names what is missing
        // rather than reading as a malfunction.
        expect(refused.error.message).toContain('how long may a transaction record be retained');
      }
    }
    expect(h.retention.calls).toBe(1);
    expect(h.fingerprints.calls).toBe(0);
    expect(h.transactions.size()).toBe(0);
  });

  it('refuses when the decision is UNAVAILABLE, and says which of the two it was', async () => {
    const h = harness({ state: 'UNAVAILABLE', reason: 'the policy source could not be reached' });
    const refused = await h.create.execute(h.entry(h.ids.aliceAccount));
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'RETENTION_UNDECIDED') {
      // Distinct from PENDING_LEGAL_REVIEW on purpose: "with legal review"
      // and "nothing could answer" have different owners and different fixes.
      expect(refused.error.state).toBe('UNAVAILABLE');
    }
    expect(h.transactions.size()).toBe(0);
  });

  it('commits when a decision exists', async () => {
    const h = harness();
    const created = await h.create.execute(h.entry(h.ids.aliceAccount));
    expect(created.ok ? null : created.error).toBeNull();
    expect(h.transactions.size()).toBe(1);
  });

  it('treats a thrown retention source as a refusal, never as permission', async () => {
    const h = harness();
    const exploding = new CreateManualTransaction(
      h.context,
      h.transactions,
      h.fingerprints,
      new SequentialIdSource(),
      fixedClock(NOW),
      {
        decide: () => Promise.reject(new Error('policy source unreachable')),
      },
      h.accounts,
    );
    const refused = await exploding.execute(h.entry(h.ids.aliceAccount));
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.kind).toBe('STORE_FAILURE');
    expect(h.transactions.size()).toBe(0);
  });
});

describe('the LOCAL/TEST retention fixture', () => {
  it('answers DECIDED and labels itself as having no legal effect', async () => {
    const fixture = new LocalSyntheticRetentionDecisionProvider({
      environment: FIXTURE_ENVIRONMENT,
    });
    // Called through the port type, so the test exercises the contract the
    // composition root binds rather than the concrete class's narrower shape.
    const port: TransactionRetentionDecisionPort = fixture;
    const decision = await port.decide(principal());
    expect(decision.state).toBe('DECIDED');
    if (decision.state === 'DECIDED') {
      expect(decision.effect).toBe('SYNTHETIC_NO_LEGAL_EFFECT');
      // The label survives a copy into a log line or a ticket, because it is
      // in the basis string as well as in the typed field.
      expect(decision.basis).toBe(SYNTHETIC_RETENTION_BASIS);
      expect(decision.basis).toContain('NO LEGAL EFFECT');
      // It disclaims the three things a reader might otherwise assume a
      // basis string carries, in the string itself.
      expect(decision.basis).toContain('not a legal determination');
      expect(decision.basis).toContain('not a PolicyPack decision');
      expect(decision.basis).toContain('not an approval reference');
    }
  });

  it('refuses to exist outside a local environment', () => {
    for (const environment of ['dev', 'staging', 'production', 'LOCAL', '']) {
      expect(
        () => new LocalSyntheticRetentionDecisionProvider({ environment }),
        `constructing the fixture in '${environment}' must throw`,
      ).toThrow(/may only be constructed in the 'local' environment/);
    }
  });

  it('is the only thing in this module that can answer DECIDED', () => {
    // A grep-shaped assertion over the WHOLE module, deliberately: the
    // property that matters is that no other adapter, use case, or helper
    // ever mints a retention decision, and a hand-listed set of files would
    // stop covering the module the moment somebody adds one.
    const moduleRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
    const fixture = path.join(
      moduleRoot,
      'infrastructure',
      'providers',
      'local-synthetic-retention-decision-provider.ts',
    );
    const walk = (dir: string): readonly string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return entry.name === 'dist' ? [] : walk(full);
        return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
      });

    const scanned = [
      ...walk(path.join(moduleRoot, 'application')),
      ...walk(path.join(moduleRoot, 'domain')),
      ...walk(path.join(moduleRoot, 'infrastructure')),
    ].filter((file) => file !== fixture);
    expect(scanned.length).toBeGreaterThan(10);

    for (const file of scanned) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      // The object-literal form, not the type declaration: the port has to
      // be able to DESCRIBE a decided state, and only the fixture may MINT
      // one.
      expect(source, `${file} must not construct a DECIDED retention answer`).not.toMatch(
        /state:\s*'DECIDED'\s*,/,
      );
    }

    // …and the fixture itself does, so the assertion above is not vacuous.
    expect(readFileSync(fixture, 'utf8')).toMatch(/state:\s*'DECIDED'\s*,/);
  });
});

describe('account gate', () => {
  it('gives one indistinguishable answer for every account it may not see', async () => {
    const h = harness();
    const guessed = await h.create.execute(h.entry(h.ids.malloryAccount)); // same tenant, other user
    const otherTenant = await h.create.execute(h.entry(h.ids.bobAccount)); // other tenant
    const absent = await h.create.execute(h.entry(randomUUID())); // never minted

    for (const outcome of [guessed, otherTenant, absent]) {
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error.kind).toBe('NOT_FOUND');
    }
    if (!guessed.ok && !otherTenant.ok && !absent.ok) {
      // Identical in every field except the id the caller themselves supplied.
      // A distinguishable denial would enumerate another subject's accounts.
      const normalise = (error: CreateManualTransactionError) => ({ ...error, id: '' });
      expect(normalise(guessed.error)).toEqual(normalise(absent.error));
      expect(normalise(otherTenant.error)).toEqual(normalise(absent.error));
    }
    expect(h.fingerprints.calls).toBe(0);
    expect(h.transactions.size()).toBe(0);
  });

  it('refuses a currency the account does not hold, and does not convert', async () => {
    const h = harness();
    const refused = await h.create.execute({
      ...h.entry(h.ids.kwdAccount),
      magnitude: qar(45),
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok && refused.error.kind === 'ACCOUNT_CURRENCY_MISMATCH') {
      expect(refused.error.accountCurrency).toBe('KWD');
      expect(refused.error.transactionCurrency).toBe('QAR');
    } else {
      expect.unreachable('expected ACCOUNT_CURRENCY_MISMATCH');
    }
    expect(h.fingerprints.calls).toBe(0);
    expect(h.transactions.size()).toBe(0);

    // The same account accepts its OWN currency — so the refusal is about the
    // mismatch, not about the account being unusable.
    const accepted = await h.create.execute({
      ...h.entry(h.ids.kwdAccount),
      magnitude: kwd(45),
    });
    expect(accepted.ok ? null : accepted.error).toBeNull();
  });

  it('refuses an archived, closed, unmapped or provider-connected account', async () => {
    const h = harness();
    const cases: ReadonlyArray<[string, string]> = [
      [h.ids.archivedAccount, 'ARCHIVED'],
      [h.ids.closedAccount, 'CLOSED'],
      [h.ids.unmappedAccount, 'UNRECOGNIZED_STATE'],
      [h.ids.providerAccount, 'PROVIDER_CONNECTED'],
    ];
    for (const [accountId, reason] of cases) {
      const refused = await h.create.execute(h.entry(accountId));
      expect(refused.ok, reason).toBe(false);
      if (!refused.ok && refused.error.kind === 'ACCOUNT_NOT_WRITABLE') {
        expect(refused.error.reason).toBe(reason);
      } else {
        expect.unreachable(`expected ACCOUNT_NOT_WRITABLE/${reason}`);
      }
    }
    expect(h.fingerprints.calls).toBe(0);
    expect(h.transactions.size()).toBe(0);
  });

  it('accepts the principal’s own active account in its own currency', async () => {
    const h = harness();
    const created = await h.create.execute(h.entry(h.ids.aliceAccount));
    expect(created.ok ? null : created.error).toBeNull();
    if (created.ok) expect(created.value.accountRef.accountId).toBe(h.ids.aliceAccount);
    expect(h.transactions.size()).toBe(1);
  });

  it('does not let a use-case input name the account owner', () => {
    // The account is now verified, which is exactly when somebody would be
    // tempted to add "…on behalf of". The input must stay principal-free.
    const inputBlock =
      /export interface CreateManualTransactionInput \{[\s\S]*?\n\}/.exec(USE_CASE_SOURCE)?.[0] ?? '';
    expect(inputBlock).not.toBe('');
    expect(inputBlock).not.toMatch(/\breadonly\s+(userId|tenantId|ownerId|onBehalfOfUserId)\b/);
  });
});
