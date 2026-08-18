/**
 * The synthetic consent-document fixture — and the ONLY place its bytes,
 * its storage reference and its ids are written down.
 *
 * WHY IT IS A PACKAGE OF ITS OWN. The fixture used to live inside
 * `modules/consent/infrastructure/content/`, where it was compiled into
 * `@karar/consent`'s `dist/` and shipped to every environment that installs
 * the module. Nothing but a runtime environment check stood between a deployed
 * deployment and a synthetic notice, and a runtime check inside a file that is
 * already in the production artifact is a decision, not a boundary: it can be
 * bypassed by any future composition, and it leaves the text sitting in the
 * bundle, the source maps, and the declaration files of a shipped package.
 *
 * Moving it here makes the guarantee physical instead of behavioural. This
 * package is a devDependency of its consumers and appears in NO package's
 * `dependencies`, so it is absent from the production dependency closure and
 * from every production `dist/`. A deployed environment cannot serve this text
 * because it does not have this text — not because it declined to.
 * `modules/consent/__tests__/production-closure.test.ts` asserts exactly that,
 * against the built output and the manifests, using the constants below so the
 * assertion cannot drift away from what it is guarding.
 *
 * WHAT THIS IS NOT. It is not legal wording, not a draft of legal wording, and
 * not a step toward any. The paragraph is one declarative sentence group that
 * states on its own face that it is not a legal document, that neither counsel
 * nor any regulator has seen it, and that it has no legal effect — so no
 * reader, and no screenshot of a reader, can be mistaken for a reviewed
 * disclosure. Drafting real text is a legal activity that has not happened;
 * nothing here anticipates its outcome.
 *
 * ZERO DEPENDENCIES, ON PURPOSE. This package imports nothing — not even
 * `@karar/consent`, whose `LegalDocumentContent` shape it mirrors structurally.
 * A dependency edge back into the consent module would make the two packages
 * mutually dependent and would give this package a reason to appear in a
 * production graph. It has none: it is data plus one environment gate.
 */

/**
 * The permitted environments. `dev`, `staging` and `production` are deployed
 * environments with real people behind them, and they are absent on purpose.
 */
export const LOCAL_FIXTURE_ENVIRONMENTS = ['local', 'test'] as const;

export function isLocalFixtureEnvironment(environment: string | undefined): boolean {
  return (
    environment !== undefined &&
    (LOCAL_FIXTURE_ENVIRONMENTS as readonly string[]).includes(environment)
  );
}

/**
 * The fixture's own distinctive marker: the first sentence of its text, and
 * the shortest string that identifies it unambiguously.
 *
 * EVERY CONSTANT IN THIS FILE IS A PLAIN LITERAL, never assembled from other
 * constants, and that is load-bearing rather than a style choice. `tsc` emits
 * a template literal or a `+` chain exactly as written, so a value built out
 * of pieces never appears contiguously in the compiled output — and a scan of
 * production builds looking for the assembled value would find nothing and
 * pass while the pieces sat there in plain sight. The prefix relations these
 * literals imply (the text starts with this marker; the reference starts with
 * the scheme below) are asserted by the suites instead, so a value edited on
 * one line and not the other fails loudly.
 */
export const LOCAL_SEED_FIXTURE_MARKER = 'SYNTHETIC LOCAL FIXTURE';

/**
 * The storage reference the local seed writes, and the only one the local
 * content source resolves. The `local-seed://` scheme names a fixture rather
 * than a store, so a row carrying it can never be mistaken for one whose bytes
 * a real document store holds.
 */
export const LOCAL_SEED_STORAGE_SCHEME = 'local-seed://';
export const LOCAL_SEED_STORAGE_REF = 'local-seed://synthetic-notice';

/**
 * The ids the seed pins for the synthetic document and its one published
 * version. Fixed so the seed is idempotent, and recognizable in a dump: the
 * ASCII-hex tail spells SEED + D/V.
 */
export const LOCAL_SEED_DOCUMENT_ID = '00000000-0000-4000-8000-534545444431';
export const LOCAL_SEED_VERSION_ID = '00000000-0000-4000-8000-534545445631';
/** The version string the seed publishes under. */
export const LOCAL_SEED_VERSION = 'local-seed/v1';

/**
 * The shape `@karar/consent`'s `LegalDocumentContent` port declares, mirrored
 * structurally so this package needs no dependency on the module. The consent
 * module validates a loaded fixture against the port at the boundary, so the
 * two cannot silently disagree.
 */
export interface LocalSeedContent {
  /** BCP-47, stated rather than inferred: the paragraph below is English. */
  readonly language: string;
  readonly format: 'text/plain';
  readonly content: string;
}

/**
 * The bytes themselves. The seed hashes THIS constant into the published
 * version's immutable `content_hash`, and `GetLegalDocumentContent` hashes
 * whatever the source returns and compares — so the integrity check is
 * SATISFIED here, never skipped, and it fails the moment the two stop agreeing.
 */
export const LOCAL_SEED_CONTENT: LocalSeedContent = {
  language: 'en',
  format: 'text/plain',
  // One unbroken literal, over the line width on purpose: see the note on
  // LOCAL_SEED_FIXTURE_MARKER above. Split across a `+` chain, this text would
  // never appear whole in any build, and the scan that proves it absent from
  // production would be proving nothing.
  // prettier-ignore
  content: 'SYNTHETIC LOCAL FIXTURE. This is not a legal document, has not been reviewed by counsel or any regulator, and has no legal effect. It exists so the consent acceptance path can be exercised against a local database.',
};

/** What a content source needs to serve the fixture: one locator, one payload. */
export interface LocalSeedContentSpec {
  readonly storageRef: string;
  readonly content: LocalSeedContent;
}

/**
 * The fixture's OWN environment gate, and the second of the two independent
 * controls that keep synthetic text away from real subjects.
 *
 * The first control is physical: this package is in no production dependency
 * closure, so a deployed process has nothing to call. This one covers the
 * remaining case — a developer machine, a test harness, or some future
 * consumer that has the package installed and asks for the fixture while
 * claiming a deployed environment. An UNSTATED environment is refused rather
 * than defaulted, exactly as the seed refuses an unset `KARAR_ENV`: a missing
 * value must never widen what may be served.
 *
 * The gate lives HERE, next to the bytes, rather than only in the consent
 * module: a caller that reaches the fixture without going through the module's
 * selector still meets it.
 */
export function localSeedContentSpec(environment: string | undefined): LocalSeedContentSpec {
  if (!isLocalFixtureEnvironment(environment)) {
    throw new Error(
      'consent-local-fixtures: refusing to supply the synthetic fixture in environment ' +
        `${environment ?? '(unstated)'} — permitted values are ` +
        `${LOCAL_FIXTURE_ENVIRONMENTS.join(', ')}. This fixture is not a legal document and has ` +
        'never been reviewed; a deployed environment must get the honest absence ' +
        '(NoContentSourceConfigured) instead, and show no text at all.',
    );
  }
  return { storageRef: LOCAL_SEED_STORAGE_REF, content: LOCAL_SEED_CONTENT };
}
