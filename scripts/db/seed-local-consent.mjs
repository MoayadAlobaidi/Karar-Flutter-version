#!/usr/bin/env node
// Local/test seed: the synthetic subject a consent acceptance can actually be
// recorded for.
//
// WHY THIS EXISTS. `POST /consent/acceptances` answers 503 for every caller on
// a fresh database, and the cause is missing DATA, not missing code: the
// acceptance pins its provenance through JurisdictionConsentPinSource, which
// needs (a) an effective jurisdiction assignment for the subject and (b) a
// PolicyPack activation for that jurisdiction in this environment. Neither has
// a runtime write path — `jurisdiction.assignment.manage` and
// `jurisdiction.pack.activate` are deliberately unseeded permissions, so the
// real PolicyService DENIES both use cases, and there is no operator surface
// until the control-plane phase. This seed supplies the rows so the pinned
// path can be exercised end to end locally. It does not add a write path, and
// it is NOT an HTTP endpoint: it is a CLI script, guarded to local/test.
//
// WHY DIRECT SQL AS THE BOOTSTRAP SUPERUSER (the same justification
// seed-local-first-party.mjs records, extended to the tables below): every
// write here belongs to an operator/control-plane use case whose permission is
// unseeded by design, and several target tables are RLS-FORCEd or
// migrator-owned reference registers. Going through the use cases would
// require seeding operator permissions locally — weakening a real control to
// make a fixture work. Writing the rows directly, guarded to local/test,
// weakens nothing: production still has no path at all.
//
// WHAT THIS SEED REFUSES TO DO, permanently:
//   * It does NOT mark qa/v1 legally approved. The activation records the
//     pack's ACTUAL lifecycle (DRAFT) and the register keeps QA at
//     DRAFT/PENDING_LEGAL_REVIEW. `canActivate` permits a DRAFT pack in
//     `local` ONLY, and that predicate is untouched.
//   * It creates NO regulator approval, NO counsel approval, and NO licence
//     evidence. The legal document it creates is a synthetic placeholder that
//     says so in its own text, storage reference, and review reason.
//   * It makes NO capability implemented, deployed, or available. qa/v1 clears
//     nothing; all seven capabilities stay NOT_IMPLEMENTED.
//   * It writes NO consent grant. It makes acceptance POSSIBLE; the subject
//     (or a test) performs the act, and the grant is pinned by the ordinary
//     use case to subject, tenant, jurisdiction, pack version, operating
//     entity, legal-document version, and purpose. No pin is bypassed here.
//   * It creates NO password credential and NO session, so the synthetic
//     account cannot authenticate. It is a subject reference, not a login.
//
// IDEMPOTENT: every step checks for its row first and leaves an existing one
// untouched. A row that exists in a CONFLICTING shape fails the run loudly
// rather than being repaired — a seed that rewrites state is a seed that can
// destroy it. The whole run is one transaction.
//
// Usage:
//   POSTGRES_PORT=5433 KARAR_ENV=local node scripts/db/seed-local-consent.mjs

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const platformDist = join(root, 'packages', 'platform', 'dist');
const policyDist = join(root, 'packages', 'jurisdiction-policy', 'dist');

// THE ENVIRONMENT GATE, first and unconditional. An unset KARAR_ENV is
// REFUSED, not defaulted: a missing value must never widen what a script may
// touch, and this one writes rows that no runtime path can write.
const env = process.env.KARAR_ENV;
const PERMITTED_ENVS = ['local', 'test'];
if (env === undefined || !PERMITTED_ENVS.includes(env)) {
  console.error(
    `seed-local-consent: refusing to run with KARAR_ENV=${env ?? '(unset)'} — ` +
      `permitted values are ${PERMITTED_ENVS.join(', ')}. This seed writes operator-owned ` +
      'rows (jurisdiction assignments, a PolicyPack activation, a legal document) that have ' +
      'no runtime write path by design; outside local/test those belong to the control plane ' +
      'under review, never to a script.',
  );
  process.exit(1);
}

const { LOCAL_FIRST_PARTY_TENANT_ID } = await import(join(platformDist, 'config', 'index.js'));
const { LocalPostgresConnectionProfile, PostgresPersistenceAdapter } = await import(
  join(platformDist, 'db', 'index.js')
);
const { QA_V1 } = await import(join(policyDist, 'index.js'));

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tenantId = process.env.KARAR_FIRST_PARTY_TENANT_ID ?? LOCAL_FIRST_PARTY_TENANT_ID;
if (!UUID_SHAPE.test(tenantId)) {
  console.error('seed-local-consent: KARAR_FIRST_PARTY_TENANT_ID must be a UUID.');
  process.exit(1);
}

// Fixed synthetic ids: idempotence needs stable keys, and a recognizable
// ASCII-hex tail ("SEED…") makes a seeded row obvious in any dump.
const SYNTHETIC = {
  user: '00000000-0000-4000-8000-534545445531',
  membership: '00000000-0000-4000-8000-534545444d31',
  entity: '00000000-0000-4000-8000-534545444531',
  entityAssignment: '00000000-0000-4000-8000-534545444131',
  userJurisdiction: '00000000-0000-4000-8000-534545444a31',
  tenantJurisdiction: '00000000-0000-4000-8000-534545445431',
  packActivation: '00000000-0000-4000-8000-534545445031',
  document: '00000000-0000-4000-8000-534545444431',
  documentVersion: '00000000-0000-4000-8000-534545445631',
};

// The pack's OWN jurisdiction and version — read from the code-resident pack
// so the activation can never drift from the pack it claims to activate.
const JURISDICTION_CODE = String(QA_V1.jurisdiction);
const PACK_VERSION = String(QA_V1.version);
const PACK_LIFECYCLE = String(QA_V1.lifecycle);

// The purpose the qa/v1 pack declares and the consent module already names.
const PURPOSE_REF = 'purpose:ai-processing';
const SUBJECT_EMAIL = 'local-seed-subject@karar.invalid';
const SEED_ACTOR = 'system:seed-local-consent';
const SYNTHETIC_NOTICE_TEXT =
  'SYNTHETIC LOCAL FIXTURE. This is not a legal document, has not been reviewed by counsel or ' +
  'any regulator, and has no legal effect. It exists so the consent acceptance path can be ' +
  'exercised against a local database.';
const CONTENT_HASH = createHash('sha256').update(SYNTHETIC_NOTICE_TEXT, 'utf8').digest('hex');
const EFFECTIVE_AT = '2026-01-01T00:00:00.000Z';

const adapter = new PostgresPersistenceAdapter(
  LocalPostgresConnectionProfile.fromEnv('superuser', {}),
);

/** Loud refusal: an existing row whose shape disagrees is never repaired. */
function conflict(what, detail) {
  throw new Error(
    `seed-local-consent: ${what} exists but ${detail} — refusing to touch it; resolve the conflict manually.`,
  );
}

const notes = [];

try {
  await adapter.withTransaction(async (tx) => {
    // 1. Reference registers. countries/jurisdictions are migration-owned and
    //    SELECT-only for the application; this seed VERIFIES rather than
    //    inserting, because a synthetic regime row would be a declaration
    //    about a legal system that engineering has no standing to make — and
    //    the register already carries QA at DRAFT/PENDING_LEGAL_REVIEW.
    const register = await tx.query(
      `SELECT j.code, j.country_code, j.status, c.code AS country
         FROM public.jurisdictions j
         JOIN public.countries c ON c.code = j.country_code
        WHERE j.code = $1`,
      [JURISDICTION_CODE],
    );
    const registerRow = register.rows[0];
    if (registerRow === undefined) {
      throw new Error(
        `seed-local-consent: jurisdiction ${JURISDICTION_CODE} (and its country) are not in the ` +
          'register — migrations 0070/0071 have not been applied to this database.',
      );
    }
    notes.push(
      `reference: jurisdiction ${registerRow.code} / country ${registerRow.country} present ` +
        `(status ${registerRow.status}, unchanged — this seed approves nothing)`,
    );

    // 2. First-party tenant.
    const tenant = await tx.query(`SELECT type, status FROM public.tenants WHERE id = $1`, [
      tenantId,
    ]);
    const tenantRow = tenant.rows[0];
    if (tenantRow === undefined) {
      await tx.query(
        `INSERT INTO public.tenants (id, type, name, status)
         VALUES ($1, 'FIRST_PARTY', 'Karar', 'ACTIVE')`,
        [tenantId],
      );
      notes.push(`created first-party tenant ${tenantId}`);
    } else if (tenantRow.type !== 'FIRST_PARTY' || tenantRow.status !== 'ACTIVE') {
      conflict(`tenant ${tenantId}`, `it is ${tenantRow.type}/${tenantRow.status}`);
    } else {
      notes.push(`first-party tenant ${tenantId} already present`);
    }

    // 3. Synthetic subject. No password credential and no session are created,
    //    so this account cannot authenticate — it is a subject reference the
    //    membership and the RLS principal context resolve against.
    const account = await tx.query(
      `SELECT email, status FROM public.identity_accounts WHERE id = $1`,
      [SYNTHETIC.user],
    );
    const accountRow = account.rows[0];
    if (accountRow === undefined) {
      await tx.query(
        `INSERT INTO public.identity_accounts (id, email, email_verified_at, status)
         VALUES ($1, $2, now(), 'active')`,
        [SYNTHETIC.user, SUBJECT_EMAIL],
      );
      notes.push(`created synthetic subject ${SYNTHETIC.user} (no credential — cannot sign in)`);
    } else if (accountRow.email !== SUBJECT_EMAIL || accountRow.status !== 'active') {
      conflict(`account ${SYNTHETIC.user}`, `it is ${accountRow.email}/${accountRow.status}`);
    } else {
      notes.push(`synthetic subject ${SYNTHETIC.user} already present`);
    }

    // 4. Active membership.
    const member = await tx.query(
      `SELECT id, state FROM public.tenant_members WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, SYNTHETIC.user],
    );
    const memberRow = member.rows[0];
    if (memberRow === undefined) {
      await tx.query(
        `INSERT INTO public.tenant_members (id, tenant_id, user_id, role_hint, state, effective_from)
         VALUES ($1, $2, $3, 'MEMBER', 'ACTIVE', now())`,
        [SYNTHETIC.membership, tenantId, SYNTHETIC.user],
      );
      notes.push('created active membership for the synthetic subject');
    } else if (memberRow.state !== 'ACTIVE') {
      conflict(`membership ${memberRow.id}`, `it is ${memberRow.state}`);
    } else {
      notes.push('active membership already present');
    }

    // 5. Operating entity. `contracting_capacity` is true because a consent
    //    document must belong to an entity that may hold consumer contracts;
    //    the row asserts nothing about any real legal person — its legal name
    //    and registration number say synthetic on their face.
    const entity = await tx.query(
      `SELECT legal_name, status FROM public.operating_entities WHERE id = $1`,
      [SYNTHETIC.entity],
    );
    const entityRow = entity.rows[0];
    const ENTITY_LEGAL_NAME = 'Karar Local Seed Entity (synthetic)';
    if (entityRow === undefined) {
      await tx.query(
        `INSERT INTO public.operating_entities
           (id, legal_name, registration_number, registered_jurisdiction_ref,
            contracting_capacity, data_protection_contact, status, updated_at)
         VALUES ($1, $2, 'LOCAL-SEED-0001', $3, true, 'mailbox:local-seed-privacy', 'ACTIVE', now())`,
        [SYNTHETIC.entity, ENTITY_LEGAL_NAME, JURISDICTION_CODE],
      );
      notes.push(`created synthetic operating entity ${SYNTHETIC.entity} (no licence recorded)`);
    } else if (entityRow.legal_name !== ENTITY_LEGAL_NAME || entityRow.status !== 'ACTIVE') {
      conflict(
        `operating entity ${SYNTHETIC.entity}`,
        `it is ${entityRow.legal_name}/${entityRow.status}`,
      );
    } else {
      notes.push(`synthetic operating entity ${SYNTHETIC.entity} already present`);
    }

    // 6. Tenant default entity binding — what ResolveEffectiveOperatingEntity
    //    reads, and therefore what the acceptance pins.
    const binding = await tx.query(
      `SELECT id, entity_id FROM public.operating_entity_assignments
        WHERE scope = 'TENANT_DEFAULT' AND tenant_id = $1 AND effective_to IS NULL`,
      [tenantId],
    );
    const bindingRow = binding.rows[0];
    if (bindingRow === undefined) {
      await tx.query(
        `INSERT INTO public.operating_entity_assignments
           (id, scope, tenant_id, user_id, entity_id, effective_from, effective_to, created_by)
         VALUES ($1, 'TENANT_DEFAULT', $2, NULL, $3, $4, NULL, $5)`,
        [SYNTHETIC.entityAssignment, tenantId, SYNTHETIC.entity, EFFECTIVE_AT, SEED_ACTOR],
      );
      notes.push('bound the synthetic entity as the tenant default');
    } else if (bindingRow.entity_id !== SYNTHETIC.entity) {
      conflict(
        `an open TENANT_DEFAULT binding for tenant ${tenantId}`,
        `it points at entity ${bindingRow.entity_id}`,
      );
    } else {
      notes.push('tenant default entity binding already present');
    }

    // 7. User jurisdiction assignment — the governing jurisdiction the pin
    //    source resolves. OPERATOR_ASSIGNED/UNVERIFIED: a seed is an operator
    //    action, and nothing here verifies anything. UNVERIFIED keeps every
    //    capability that requires a verified jurisdiction failing closed.
    const userAssignment = await tx.query(
      `SELECT id, jurisdiction_code, verification_status FROM public.user_jurisdiction_assignments
        WHERE user_id = $1 AND tenant_id = $2 AND effective_to IS NULL`,
      [SYNTHETIC.user, tenantId],
    );
    const userAssignmentRow = userAssignment.rows[0];
    if (userAssignmentRow === undefined) {
      await tx.query(
        `INSERT INTO public.user_jurisdiction_assignments
           (id, user_id, tenant_id, jurisdiction_code, source, verification_status,
            effective_from, effective_to, reason, assigned_by)
         VALUES ($1, $2, $3, $4, 'OPERATOR_ASSIGNED', 'UNVERIFIED', $5, NULL, $6, $7)`,
        [
          SYNTHETIC.userJurisdiction,
          SYNTHETIC.user,
          tenantId,
          JURISDICTION_CODE,
          EFFECTIVE_AT,
          'synthetic local fixture; nothing about this subject has been verified',
          SEED_ACTOR,
        ],
      );
      notes.push(`assigned the synthetic subject to ${JURISDICTION_CODE} (UNVERIFIED)`);
    } else if (
      userAssignmentRow.jurisdiction_code !== JURISDICTION_CODE ||
      userAssignmentRow.verification_status !== 'UNVERIFIED'
    ) {
      conflict(
        `an open user jurisdiction assignment for ${SYNTHETIC.user}`,
        `it is ${userAssignmentRow.jurisdiction_code}/${userAssignmentRow.verification_status}`,
      );
    } else {
      notes.push('user jurisdiction assignment already present');
    }

    // 8. Tenant jurisdiction assignment — the tenant's operating axis. It is
    //    NOT a fallback for the subject's: the effective-jurisdiction rule
    //    reads the subject's own assignment and nothing else.
    const tenantAssignment = await tx.query(
      `SELECT id, jurisdiction_code FROM public.tenant_jurisdiction_assignments
        WHERE tenant_id = $1 AND effective_to IS NULL`,
      [tenantId],
    );
    const tenantAssignmentRow = tenantAssignment.rows[0];
    if (tenantAssignmentRow === undefined) {
      await tx.query(
        `INSERT INTO public.tenant_jurisdiction_assignments
           (id, tenant_id, jurisdiction_code, source, verification_status,
            effective_from, effective_to, reason, assigned_by)
         VALUES ($1, $2, $3, 'OPERATOR_ASSIGNED', 'UNVERIFIED', $4, NULL, $5, $6)`,
        [
          SYNTHETIC.tenantJurisdiction,
          tenantId,
          JURISDICTION_CODE,
          EFFECTIVE_AT,
          'synthetic local fixture; no jurisdiction claim is verified',
          SEED_ACTOR,
        ],
      );
      notes.push(`assigned the first-party tenant to ${JURISDICTION_CODE} (UNVERIFIED)`);
    } else if (tenantAssignmentRow.jurisdiction_code !== JURISDICTION_CODE) {
      conflict(
        `an open tenant jurisdiction assignment for ${tenantId}`,
        `it is ${tenantAssignmentRow.jurisdiction_code}`,
      );
    } else {
      notes.push('tenant jurisdiction assignment already present');
    }

    // 9. LOCAL pack activation. `pack_lifecycle_at_activation` records the
    //    pack's ACTUAL lifecycle (DRAFT) — the ledger's job is to say what was
    //    true at activation, and claiming APPROVED here would be a fabricated
    //    legal fact. `environment` is pinned to 'local': this row can never
    //    make qa/v1 operative anywhere else, and the ledger is append-only by
    //    trigger, so it cannot be edited into one that does.
    if (PACK_LIFECYCLE === 'APPROVED') {
      throw new Error(
        `seed-local-consent: ${PACK_VERSION} reports lifecycle APPROVED — this seed activates ` +
          'draft packs for local use only and will not record an approved activation. Activation ' +
          'of an approved pack belongs to the control plane, with its approval reference.',
      );
    }
    const activation = await tx.query(
      `SELECT pack_version, action FROM public.policy_pack_activations
        WHERE jurisdiction_code = $1 AND environment = 'local'
        ORDER BY occurred_at DESC
        LIMIT 1`,
      [JURISDICTION_CODE],
    );
    const activationRow = activation.rows[0];
    if (activationRow === undefined) {
      await tx.query(
        `INSERT INTO public.policy_pack_activations
           (id, jurisdiction_code, pack_version, pack_lifecycle_at_activation, environment,
            action, occurred_at, actor, reason)
         VALUES ($1, $2, $3, $4, 'local', 'ACTIVATED', $5, $6, $7)`,
        [
          SYNTHETIC.packActivation,
          JURISDICTION_CODE,
          PACK_VERSION,
          PACK_LIFECYCLE,
          EFFECTIVE_AT,
          SEED_ACTOR,
          `local development fixture: activates the ${PACK_LIFECYCLE} pack ${PACK_VERSION} in the ` +
            'local environment only. No legal approval is asserted or implied.',
        ],
      );
      notes.push(
        `activated ${PACK_VERSION} (${PACK_LIFECYCLE}) for ${JURISDICTION_CODE} in LOCAL only`,
      );
    } else if (
      activationRow.pack_version !== PACK_VERSION ||
      activationRow.action !== 'ACTIVATED'
    ) {
      conflict(
        `the local activation ledger for ${JURISDICTION_CODE}`,
        `its latest event is ${activationRow.action} ${activationRow.pack_version}`,
      );
    } else {
      notes.push(`${PACK_VERSION} already active for ${JURISDICTION_CODE} in LOCAL`);
    }

    // 10. Legal document + one published version. The version is classified
    //     MATERIAL_REACCEPTANCE_REQUIRED — the fail-closed classification: it
    //     asks for re-acceptance rather than asserting that no user action is
    //     needed, which is a claim nobody has reviewed. The reviewer reference
    //     and reason state on their face that no legal review happened; this
    //     is editorial bookkeeping on a placeholder, not counsel approval.
    const document = await tx.query(
      `SELECT entity_id, jurisdiction_ref, purpose_refs FROM public.legal_documents WHERE id = $1`,
      [SYNTHETIC.document],
    );
    const documentRow = document.rows[0];
    if (documentRow === undefined) {
      await tx.query(
        `INSERT INTO public.legal_documents (id, entity_id, jurisdiction_ref, purpose_refs, kind)
         VALUES ($1, $2, $3, ARRAY[$4]::text[], 'LOCAL_SEED_SYNTHETIC_NOTICE')`,
        [SYNTHETIC.document, SYNTHETIC.entity, JURISDICTION_CODE, PURPOSE_REF],
      );
      notes.push('created the synthetic legal document (kind LOCAL_SEED_SYNTHETIC_NOTICE)');
    } else if (
      documentRow.entity_id !== SYNTHETIC.entity ||
      documentRow.jurisdiction_ref !== JURISDICTION_CODE
    ) {
      conflict(
        `legal document ${SYNTHETIC.document}`,
        `it belongs to ${documentRow.entity_id}/${documentRow.jurisdiction_ref}`,
      );
    } else {
      notes.push('synthetic legal document already present');
    }

    const version = await tx.query(
      `SELECT content_hash, published_at FROM public.legal_document_versions WHERE id = $1`,
      [SYNTHETIC.documentVersion],
    );
    const versionRow = version.rows[0];
    if (versionRow === undefined) {
      await tx.query(
        `INSERT INTO public.legal_document_versions
           (id, document_id, version, content_hash, storage_ref, classification,
            author, reviewer, reason, effective_at, published_at, prior_version_id)
         VALUES ($1, $2, 'local-seed/v1', $3, 'local-seed://synthetic-notice',
                 'MATERIAL_REACCEPTANCE_REQUIRED', $4, $5, $6, $7, $7, NULL)`,
        [
          SYNTHETIC.documentVersion,
          SYNTHETIC.document,
          CONTENT_HASH,
          SEED_ACTOR,
          SEED_ACTOR,
          'Synthetic local fixture. No legal review has taken place; the classification is the ' +
            'fail-closed value so this placeholder can never be mistaken for a reviewed ' +
            'no-action-required decision.',
          EFFECTIVE_AT,
        ],
      );
      notes.push(`published the synthetic version ${SYNTHETIC.documentVersion}`);
    } else if (versionRow.content_hash !== CONTENT_HASH || versionRow.published_at === null) {
      conflict(
        `legal document version ${SYNTHETIC.documentVersion}`,
        versionRow.published_at === null
          ? 'it is not published'
          : 'its content hash does not match this seed',
      );
    } else {
      notes.push('synthetic legal document version already published');
    }
  });

  for (const note of notes) {
    console.log(`seed-local-consent: ${note}`);
  }
  console.log('');
  console.log(`seed-local-consent: subject ${SYNTHETIC.user} in tenant ${tenantId} can now record`);
  console.log(`seed-local-consent: an acceptance of version ${SYNTHETIC.documentVersion}`);
  console.log(`seed-local-consent: for purpose ${PURPOSE_REF}. No grant was written by this seed.`);
  console.log(
    'seed-local-consent: nothing was approved — qa/v1 stays DRAFT, the QA register entry stays ' +
      'unapproved, no capability was made available, and the synthetic account has no credential.',
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await adapter.end();
}
