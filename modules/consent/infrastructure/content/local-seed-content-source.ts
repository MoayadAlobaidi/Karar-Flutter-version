/**
 * WHERE the local seed's document content comes from — and, for every deployed
 * environment, the statement that it comes from nowhere.
 *
 * THIS FILE HOLDS NO FIXTURE. It used to. It carried the synthetic paragraph,
 * its locator, and an environment check, and all three were compiled into
 * `@karar/consent`'s `dist/` and shipped to every environment that installs the
 * module. The check refused at runtime, but the TEXT was still there — in the
 * emitted JavaScript, the declaration files and the source maps of a package
 * production installs. A runtime check inside a file that is already in the
 * production artifact is a decision, not a boundary: any future composition
 * that reaches past the selector re-opens it, and nothing stops the bytes being
 * read straight out of the shipped package.
 *
 * The bytes now live in `@karar/consent-local-fixtures`, a package that appears
 * in no package's `dependencies` — only as a devDependency — and is therefore
 * absent from the production dependency closure and from every production
 * `dist/`. A deployed environment cannot serve synthetic text because it does
 * not have synthetic text. `__tests__/production-closure.test.ts` asserts that
 * against the built output and the manifests, using the fixture's own constants
 * so the assertion cannot drift.
 *
 * WHAT IS LEFT HERE IS THE DECISION, IN ONE PLACE:
 *
 *   * a deployed environment — and an UNSTATED one — gets
 *     `NoContentSourceConfigured` and nothing else is even attempted. The
 *     fixture package is never named on this path, never resolved, never
 *     loaded. An unstated environment is refused rather than defaulted,
 *     exactly as `scripts/db/seed-local-consent.mjs` refuses an unset
 *     `KARAR_ENV`: a missing value must never widen what may be served.
 *
 *   * `local` and `test` get a `StaticLegalDocumentContentSource` over the
 *     fixture IF the fixture package is installed. On a developer machine and
 *     in CI it is (devDependency of this module); in a production install it is
 *     not, and the absence is reported as `NoContentSourceConfigured` rather
 *     than crashing the boot. The load is optional by design — this module
 *     declares WHERE local content may come from and holds none of it.
 *
 * TWO INDEPENDENT CONTROLS, NEITHER OF THEM SUFFICIENT ALONE. The physical one
 * is that a production closure has no copy of the fixture to load. The
 * behavioural one is `localSeedContentSpec`'s own environment gate, which lives
 * inside the fixture package next to the bytes, so a caller that reaches the
 * fixture without coming through this selector still meets a refusal. The
 * environment test below decides which branch runs; it is not what makes the
 * text unreachable in production.
 *
 * A real source arrives with the document store and a reviewed publication path
 * that records content alongside the version it belongs to. It replaces this
 * selection at composition, and the hash check the use case applies holds it to
 * the catalogue exactly as it holds the fixture.
 */

import { createRequire } from 'node:module';

import {
  LEGAL_DOCUMENT_CONTENT_FORMATS,
  type LegalDocumentContent,
  type LegalDocumentContentSource,
} from '../../application/ports/legal-document-content-source.js';
import { NoContentSourceConfigured } from './no-content-source-configured.js';
import { StaticLegalDocumentContentSource } from './static-legal-document-content-source.js';

/**
 * The only environments whose subjects may be shown synthetic text. `dev`,
 * `staging`, and `production` are deployed environments with real people
 * behind them, and they are absent on purpose. The fixture package declares
 * the same set independently — the two are asserted equal by the suite, so a
 * widening on one side cannot pass unnoticed.
 */
export const LOCAL_CONTENT_ENVIRONMENTS = ['local', 'test'] as const;

export function isLocalContentEnvironment(environment: string | undefined): boolean {
  return (
    environment !== undefined &&
    (LOCAL_CONTENT_ENVIRONMENTS as readonly string[]).includes(environment)
  );
}

/**
 * The ONE specifier this module will ever load content from, written as a
 * literal rather than read from configuration. A configurable module name is a
 * code-execution surface: anyone who could set it could have this process load
 * anything. One hard-coded name, reachable only from local/test, cannot be
 * pointed anywhere else.
 */
export const LOCAL_FIXTURE_PACKAGE = '@karar/consent-local-fixtures';

/** The fixture package's surface, as this module needs it. */
interface LocalFixtureModule {
  localSeedContentSpec(environment: string | undefined): unknown;
}

function hasSpecFactory(value: unknown): value is LocalFixtureModule {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { localSeedContentSpec?: unknown }).localSeedContentSpec === 'function'
  );
}

/** A missing OPTIONAL package, distinguished from a package that is broken. */
function isPackageNotInstalled(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  const notFound = code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND';
  // The specifier must be OURS. A fixture package that is installed but whose
  // own imports do not resolve is broken, not absent, and must fail loudly
  // instead of degrading to "no content configured".
  return notFound && typeof message === 'string' && message.includes(LOCAL_FIXTURE_PACKAGE);
}

/**
 * The fixture module, or null when this installation does not have it.
 *
 * Resolved rather than imported: a static import would put the specifier in
 * this module's own import graph, which is what a production install must not
 * contain. `createRequire` resolves from THIS file, so the lookup walks the
 * consent module's own `node_modules` — where the devDependency is linked in a
 * development install and where nothing is linked in a production one.
 */
function loadLocalFixtureModule(): LocalFixtureModule | null {
  const requireFrom = createRequire(import.meta.url);
  let loaded: unknown;
  try {
    loaded = requireFrom(LOCAL_FIXTURE_PACKAGE);
  } catch (error) {
    if (isPackageNotInstalled(error)) return null;
    throw error;
  }
  if (!hasSpecFactory(loaded)) {
    throw new Error(
      `${LOCAL_FIXTURE_PACKAGE} is installed but does not export localSeedContentSpec() — a ` +
        'fixture package that cannot be read is a defect, not an absence, and is refused rather ' +
        'than silently degraded to "no content configured".',
    );
  }
  return loaded;
}

function isLegalDocumentContent(value: unknown): value is LegalDocumentContent {
  if (typeof value !== 'object' || value === null) return false;
  const { language, format, content } = value as {
    language?: unknown;
    format?: unknown;
    content?: unknown;
  };
  return (
    typeof language === 'string' &&
    language !== '' &&
    typeof format === 'string' &&
    (LEGAL_DOCUMENT_CONTENT_FORMATS as readonly string[]).includes(format) &&
    typeof content === 'string' &&
    content !== ''
  );
}

/**
 * The fixture as this module's port describes it. Validated at the boundary
 * because the fixture package deliberately does not depend on this module —
 * it mirrors `LegalDocumentContent` structurally, so the two agreeing is a
 * fact to check, not one the compiler establishes.
 */
function contentSourceFrom(spec: unknown): LegalDocumentContentSource {
  if (typeof spec !== 'object' || spec === null) {
    throw new Error(`${LOCAL_FIXTURE_PACKAGE}: localSeedContentSpec() returned a non-object.`);
  }
  const { storageRef, content } = spec as { storageRef?: unknown; content?: unknown };
  if (typeof storageRef !== 'string' || storageRef === '') {
    throw new Error(
      `${LOCAL_FIXTURE_PACKAGE}: localSeedContentSpec() returned no storage reference — a source ` +
        'with nothing to match on would answer for versions it holds no bytes for.',
    );
  }
  if (!isLegalDocumentContent(content)) {
    throw new Error(
      `${LOCAL_FIXTURE_PACKAGE}: localSeedContentSpec() returned content that is not displayable ` +
        `(needs a non-empty language, a format among ${LEGAL_DOCUMENT_CONTENT_FORMATS.join(
          ', ',
        )}, and non-empty text). Content whose language a source cannot state has not been ` +
        'returned displayably, and the use case would refuse it anyway.',
    );
  }
  return new StaticLegalDocumentContentSource(storageRef, content);
}

/**
 * The composition decision, in one place: `local` and `test` get the seeded
 * fixture when this installation has one, and every other environment gets the
 * source that honestly has nothing. Written as a function so the choice is
 * testable and cannot be made twice in different ways.
 */
export function legalDocumentContentSourceFor(
  environment: string | undefined,
): LegalDocumentContentSource {
  // The deployed path never names the fixture package, never resolves it, and
  // never loads it. There is nothing here to reach past.
  if (!isLocalContentEnvironment(environment)) return new NoContentSourceConfigured();

  const fixtures = loadLocalFixtureModule();
  // Not installed: local development against a production-shaped install. The
  // endpoint reports the absence, which is the same honest answer a deployed
  // environment gets — not a boot failure, and not substituted prose.
  if (fixtures === null) return new NoContentSourceConfigured();

  // The environment is passed on rather than assumed: the fixture package
  // applies its own gate, so the refusal exists on both sides of the boundary.
  return contentSourceFrom(fixtures.localSeedContentSpec(environment));
}
