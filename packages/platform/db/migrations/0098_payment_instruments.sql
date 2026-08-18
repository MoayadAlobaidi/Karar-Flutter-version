-- 0098_payment_instruments
--
-- public.payment_instruments — WHAT SPENDS from a balance-bearing account
-- (modules/payment-instruments/MODULE.md; ADR-0028). SUBJECT_OWNED,
-- classified HIGHLY_SENSITIVE_FINANCIAL, erasure strategy CASCADE_DELETE.
--
-- THE WHOLE TABLE EXISTS TO SAY ONE THING: A CARD IS NOT A BALANCE.
--
-- ADR-0028 names the failure precisely — "two virtual cards on one wallet
-- look like two more balances, and the person's money appears to triple". The
-- fix is not a display rule and not a filter in a query. It is that the row
-- describing a card has nowhere to put a balance, so no reader, no export, no
-- projection and no later engineer can total one by accident.
--
-- So the central guarantee of this migration is an ABSENCE:
--
--   THERE IS NO BALANCE COLUMN, NO AMOUNT COLUMN, NO LIMIT COLUMN, NO
--   CURRENCY COLUMN AND NO NUMERIC COLUMN OF ANY KIND ON THIS TABLE. The only
--   integer is `version`, the optimistic-concurrency token, which counts
--   writes and not money.
--
-- A CHECK cannot assert the absence of a column, so the guarantee is asserted
-- the only way it can be, and the same way migration 0097's module asserts
-- that it stores no credential: __tests__/no-instrument-balance-columns.
-- integration.test.ts reads information_schema.columns for this table and
-- compares the column set against an EXHAUSTIVE expected list. Any column
-- added — money-shaped or not — fails that test until somebody edits the list
-- deliberately, and separate assertions refuse a money-shaped NAME and refuse
-- any numeric, money, or floating-point TYPE outright. A test that only
-- looked for the word `balance` would pass on `available_minor`, `head_room`,
-- or a jsonb column called `attributes`, and each of those is where a second
-- balance ends up.
--
-- Where an issuer genuinely funds a product separately, that product is its
-- own financial account (0088/0095) and the instrument points at THAT
-- account. There is no third position, and this schema cannot express one.
--
-- MANY INSTRUMENTS, ONE ACCOUNT — AND NO CONSTRAINT THAT WOULD FORBID IT.
--
-- Two virtual cards spending from one wallet are two rows against one
-- account_id, which is ordinary rather than exceptional. There is therefore
-- NO uniqueness over (account_id, instrument_type), over (account_id, mask),
-- or over any arrangement of the two: each of those forbids something a real
-- person actually has. The PRIMARY KEY is the only unique index on this
-- table, and the schema test asserts that exact set rather than asserting
-- that the constraints people reach for are merely absent.
--
-- The reverse direction is fixed and enforced: exactly ONE account per
-- instrument. account_id is NOT NULL, there is a single account column, and
-- payment_instruments_guard freezes it after insert — an instrument
-- re-pointed at another account would silently change what it spends from,
-- and every historical reading of "this card draws on that wallet" would
-- become retroactively false.
--
-- NO PAN, NO CVV, NO TOKENIZED PAYMENT CREDENTIAL, NO WALLET CREDENTIAL.
--
-- Three independent mechanisms, because each one alone is defeatable:
--
--   1. THE MASK IS CIPHERTEXT, BOUNDED AT EIGHT BYTES. AES-256-GCM preserves
--      length, so eight ciphertext bytes is eight plaintext characters, and
--      no 13-to-19-digit PAN, no IBAN and no MSISDN fits in eight characters.
--      This is the same argument migration 0088 makes for the account mask,
--      and it holds here for the same reason: the column is too small to
--      contain the thing it must never contain. Unlike 0097's opaque source
--      reference — where a legitimate value is legitimately as long as an
--      IBAN and the length argument was therefore NOT available — a mask has
--      no legitimate long form.
--
--   2. THE DOMAIN REFUSES PAN-SHAPED INPUT BEFORE ANYTHING IS ENCRYPTED.
--      domain/instrument-mask.ts applies the reasoning
--      modules/financial-connections/domain/external-account-reference.ts
--      established: a run of eight or more consecutive digits is refused
--      outright (eight is the shortest thing that must go — an E.164
--      subscriber number — and every card number, account number and IBAN
--      body is longer), a 12-to-19-digit card-number shape is refused by name
--      so the refusal can say what it recognised, and the value must match a
--      MASK shape rather than merely being short. A caller supplying a real
--      PAN is refused before a key is used, so no key ever touches one.
--
--   3. THERE IS NO COLUMN A CREDENTIAL COULD LIVE IN. No token column, no
--      device-binding column, no jsonb, no unbounded text, no array. The
--      column-set test refuses all of them, and the vocabulary scan refuses a
--      column NAMED for one. A tokenized card is modelled as an instrument
--      TYPE — the fact that a token exists somewhere in the world — and never
--      as a stored token: the type is a word from a closed list, and the
--      token itself is a payment credential this platform does not hold.
--
-- WHAT IS DELIBERATELY NOT A COLUMN, AND WHY EACH ABSENCE IS A DECISION.
--
--   expiry / expires_on   A card expiry date is one of the three fields that
--                         make a card usable card-not-present (number,
--                         expiry, CVV). Holding two of the three is not
--                         two-thirds of a breach, it is the part of one that
--                         is cheapest to complete. It is also not a fact this
--                         product needs: nothing here charges anything.
--   issuer / institution  The ACCOUNT carries the institution (0088). An
--                         issuer column here would be a second, unjoinable
--                         copy of the same fact, free to drift, and the first
--                         place a provider-specific branch would appear.
--   currency              An instrument does not hold money, so it cannot
--                         have a denomination. The account has one.
--   last_used_at          Would make this table a record of when a person
--                         spent, which is the transactions table's subject
--                         and not this one's — and would do it without any of
--                         the provenance that makes a transaction honest.
--
-- MASK AND LABEL ARE BOTH HIGHLY_SENSITIVE_FINANCIAL, and both are ciphertext
-- + nonce + auth tag with the algorithm and key version per row (ADR-0017),
-- with tenant, user, table, row id and field bound as AEAD associated data —
-- the same construction as 0088, 0090, 0096 and 0097, invented nowhere. A
-- ciphertext moved between rows, columns or subjects fails authentication
-- rather than decrypting into a plausible wrong record.
--
-- The display label is NOT optional and NOT derived. A person with two
-- virtual cards on one wallet needs to tell them apart, and the alternatives
-- are worse in kind: deriving a label from the mask would render a fragment
-- of a card number as a name, and deriving it from the instrument type would
-- give both cards the same one.
--
-- STATUS IS THE INSTRUMENT'S OWN LIFECYCLE AND NOTHING MORE. ACTIVE,
-- SUSPENDED, EXPIRED, CANCELLED. No value means connected, provisioned,
-- synced, tokenized-at-the-issuer or authorized, and none may be added: no
-- issuer named anywhere in this platform exposes an interface to Karar, and a
-- status column is exactly where that fiction would first be written down
-- (ADR-0028, and the same rule 0096 holds for connection status).
--
-- RLS decision — SUBJECT RECORDS: ENABLE and FORCE, one policy keyed on BOTH
-- app.tenant_id AND app.user_id, USING and WITH CHECK alike, GUCs bound
-- transaction-locally by the platform's withPrincipalContext from the
-- caller's own session and membership (tenancy.md §2). NULLIF makes an unset
-- GUC a NULL predicate — no principal context, no rows. The user arm is
-- load-bearing: two members of one household tenant must not see which cards
-- spend from each other's wallets. No allow-list entry.
--
-- Data lifecycle (ADR-0026; canonical in
-- modules/payment-instruments/MODULE.md):
--   public.payment_instruments
--     Subject relationship: SUBJECT_OWNED — the subject's own instruments on
--       the subject's own accounts; nothing here is shared with anyone.
--     Purpose: what spends from a balance-bearing account — the instrument's
--       kind, its own lifecycle, and a bounded encrypted mask that lets the
--       person recognise it. Never a balance, never a payment credential.
--     Classification: HIGHLY_SENSITIVE_FINANCIAL.
--     Retention: UNRESOLVED — the financial-data retention decision is a
--       legal one and has not been taken, so no period is written here.
--       Non-local durable creation fails closed until a PolicyPack decision
--       exists, enforced by PaymentInstrumentRetentionDecisionPort in
--       RecordPaymentInstrument and not merely declared; LOCAL and TEST run
--       on a clearly synthetic fixture with no legal effect.
--     Export treatment: included — the subject's export contains their own
--       instruments, mask included: it is a fragment the person already sees
--       embossed on their own card, and it is bounded so it cannot be more.
--     Erasure strategy: CASCADE_DELETE.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be DROP TRIGGER, DROP FUNCTION, DROP
-- POLICY, DROP TABLE public.payment_instruments — which destroys the record
-- of which cards spend from which accounts. Restore from backup.

CREATE TABLE public.payment_instruments (
  id                          uuid        PRIMARY KEY,
  -- Cross-module references (raw UUIDs, no FK across module boundaries —
  -- data-model.md §2). account_reference_type says what account_id points at
  -- without a reader opening another module's source, exactly as 0090 and
  -- 0097 do.
  tenant_id                   uuid        NOT NULL,
  user_id                     uuid        NOT NULL,

  -- EXACTLY ONE balance-bearing account, and the singular is the point. One
  -- column, NOT NULL, frozen after insert by payment_instruments_guard. The
  -- account is where the balance sits (0088/0095); this row is what spends
  -- from it.
  account_id                  uuid        NOT NULL,
  account_reference_type      text        NOT NULL
    CONSTRAINT payment_instruments_account_reference_type_check
    CHECK (account_reference_type IN ('FINANCIAL_ACCOUNT')),

  -- WHAT KIND of thing spends. TOKENIZED_CARD names the fact that a token
  -- exists in the world; it does not and may not mean a token is stored here.
  instrument_type             text        NOT NULL
    CONSTRAINT payment_instruments_instrument_type_check
    CHECK (instrument_type IN ('PHYSICAL_CARD', 'VIRTUAL_CARD', 'PREPAID_CARD',
                               'TOKENIZED_CARD', 'QR_PAYMENT_IDENTITY', 'OTHER')),

  -- The instrument's OWN lifecycle. No value means connected, provisioned,
  -- synced or authorized, and none may be added.
  status                      text        NOT NULL
    CONSTRAINT payment_instruments_status_check
    CHECK (status IN ('ACTIVE', 'SUSPENDED', 'EXPIRED', 'CANCELLED')),

  -- Encryption context for this row's HSF fields (ADR-0017 provenance). One
  -- pair per ROW rather than per field: both fields are written together by
  -- one adapter under one key version, and two pairs would invite a row whose
  -- halves were encrypted under different keys with nothing to say so.
  hsf_algorithm               text        NOT NULL
    CONSTRAINT payment_instruments_hsf_algorithm_check CHECK (hsf_algorithm <> ''),
  hsf_key_version             text        NOT NULL
    CONSTRAINT payment_instruments_hsf_key_version_check CHECK (hsf_key_version <> ''),

  -- THE MASK, ciphertext only. Eight bytes under a length-preserving cipher
  -- is eight plaintext characters — four masking characters and four digits
  -- at most (modules/payment-instruments/domain/instrument-mask.ts), which is
  -- the exact bound that shape implies. NO PAN FITS. No IBAN fits. No MSISDN
  -- fits. There is no plaintext column, and the shape rule runs in the domain
  -- before anything is encrypted so a real card number never reaches a key.
  instrument_mask_ciphertext  bytea       NOT NULL
    CONSTRAINT payment_instruments_mask_bound_check
    CHECK (octet_length(instrument_mask_ciphertext) <= 8),
  instrument_mask_nonce       bytea       NOT NULL
    CONSTRAINT payment_instruments_mask_nonce_check
    CHECK (octet_length(instrument_mask_nonce) = 12),
  instrument_mask_auth_tag    bytea       NOT NULL
    CONSTRAINT payment_instruments_mask_auth_tag_check
    CHECK (octet_length(instrument_mask_auth_tag) = 16),

  -- The name the SUBJECT gave this instrument, ciphertext only. Required:
  -- two virtual cards on one wallet are indistinguishable without it, and
  -- every way of deriving one is worse than asking (see the header). 360
  -- bytes matches 0088 and 0096 — 120 characters of UTF-8 in the worst case.
  display_label_ciphertext    bytea       NOT NULL
    CONSTRAINT payment_instruments_display_label_bound_check
    CHECK (octet_length(display_label_ciphertext) <= 360),
  display_label_nonce         bytea       NOT NULL
    CONSTRAINT payment_instruments_display_label_nonce_check
    CHECK (octet_length(display_label_nonce) = 12),
  display_label_auth_tag      bytea       NOT NULL
    CONSTRAINT payment_instruments_display_label_auth_tag_check
    CHECK (octet_length(display_label_auth_tag) = 16),

  -- The ONLY integer on this table. It counts writes, not money.
  version                     integer     NOT NULL DEFAULT 1
    CONSTRAINT payment_instruments_version_check CHECK (version >= 1),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL

  -- NO UNIQUE CONSTRAINT BEYOND THE PRIMARY KEY, deliberately. Two virtual
  -- cards on one wallet are two rows against one account, and every
  -- uniqueness anybody would reach for here — (account, type), (account,
  -- mask), (user, mask) — forbids something ordinary. The mask could not
  -- participate in one anyway: a fresh nonce per encryption makes the
  -- ciphertext non-deterministic, so a unique index over it would never fire.
  -- The schema test asserts the exact set of unique indexes rather than
  -- asserting that the tempting ones are absent.
);

COMMENT ON TABLE public.payment_instruments IS
  'HIGHLY_SENSITIVE_FINANCIAL, SUBJECT_OWNED. What SPENDS from a '
  'balance-bearing financial account (0088/0095): a physical, virtual, '
  'prepaid or tokenized card, or a QR payment identity. THERE IS NO BALANCE '
  'COLUMN AND THERE MUST NEVER BE ONE — two virtual cards on one wallet are '
  'two rows against ONE account, not two more balances (ADR-0028); the '
  'absence is asserted against information_schema by an EXHAUSTIVE column '
  'list, because a CHECK cannot assert that a column does not exist. No '
  'amount, no limit, no currency and no numeric column of any kind exists '
  'here; the only integer is the concurrency token. NO PAN, NO CVV, NO '
  'TOKENIZED PAYMENT CREDENTIAL AND NO WALLET CREDENTIAL is stored: the mask '
  'is ciphertext bounded at EIGHT bytes (no card number fits), the domain '
  'refuses PAN-shaped input before encryption, and no column exists a '
  'credential could occupy. Exactly one account per instrument, frozen after '
  'insert; many instruments per account, with no uniqueness that would '
  'forbid it. No status means connected, provisioned or synced. RLS ENABLEd '
  'and FORCEd on BOTH principal GUCs. Lifecycle: 0098 header + '
  'modules/payment-instruments/MODULE.md.';

COMMENT ON COLUMN public.payment_instruments.account_id IS
  'The ONE balance-bearing financial account this instrument spends from. '
  'Singular by schema (one column, NOT NULL) and immutable by trigger '
  '(SQLSTATE KAR30): re-pointing an instrument would silently change what it '
  'draws on, and every historical reading of "this card spends from that '
  'wallet" would become retroactively false. Where an issuer genuinely funds '
  'a product separately, that product is its own financial account and the '
  'instrument points at that (ADR-0028).';

COMMENT ON COLUMN public.payment_instruments.instrument_mask_ciphertext IS
  'The last few characters of the instrument, as the person would recognise '
  'it — ciphertext only, bounded at EIGHT bytes. AES-256-GCM preserves '
  'length, so eight bytes is eight characters: four masking characters and '
  'four digits at most, and NO PAN, IBAN OR MSISDN FITS. That bound is one '
  'half of the guarantee; the other half is a DOMAIN rule applied before '
  'encryption, which refuses any run of eight or more consecutive digits and '
  'any 12-to-19-digit card-number shape, so a real card number never reaches '
  'a key. There is no plaintext column and no CVV, expiry or token column '
  'anywhere on this table.';

COMMENT ON COLUMN public.payment_instruments.instrument_type IS
  'PHYSICAL_CARD | VIRTUAL_CARD | PREPAID_CARD | TOKENIZED_CARD | '
  'QR_PAYMENT_IDENTITY | OTHER. TOKENIZED_CARD names the fact that a token '
  'exists somewhere in the world; it does not mean a token is stored here, '
  'and no column on this table could hold one. The vocabulary names '
  'CATEGORIES and never an issuer, a scheme or a wallet provider: no '
  'provider-specific value exists anywhere in this platform (ADR-0028).';

COMMENT ON COLUMN public.payment_instruments.status IS
  'The instrument''s OWN lifecycle: ACTIVE | SUSPENDED | EXPIRED | '
  'CANCELLED. There is deliberately no CONNECTED, PROVISIONED, SYNCED, '
  'TOKENIZED or AUTHORIZED value and none may be added — no issuer named in '
  'this platform exposes an interface to Karar, and a status column is where '
  'that fiction would first be written down.';

-- The two questions this table answers: "what spends from this account?" and
-- "what instruments do I hold?". Two indexes because the leading columns
-- differ; neither is unique, because many instruments per account is the
-- ordinary case.
CREATE INDEX payment_instruments_account_idx
  ON public.payment_instruments (tenant_id, user_id, account_id, created_at);
CREATE INDEX payment_instruments_owner_idx
  ON public.payment_instruments (tenant_id, user_id, created_at);

ALTER TABLE public.payment_instruments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_instruments FORCE ROW LEVEL SECURITY;

CREATE POLICY payment_instruments_subject ON public.payment_instruments
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  )
  WITH CHECK (
    tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
    AND user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
  );

-- Guard: the instrument's identity — including WHICH ACCOUNT IT SPENDS FROM —
-- frozen after insert, and the concurrency token advanced by exactly one.
--
-- Custom SQLSTATEs so callers distinguish the arms structurally ('KAR' is
-- outside every class the standard and PostgreSQL assign — 0090). KAR01,
-- KAR02, KAR10, KAR11 and KAR20-KAR23 are taken by other modules; this
-- module owns KAR30 and KAR31:
--   KAR30  instrument identity rewritten (subject, account, kind, or the
--          creation instant).
--   KAR31  the optimistic-concurrency token did not advance by exactly one.
CREATE FUNCTION public.payment_instruments_guard() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- account_id is in this list and that is the point of the list. An
    -- instrument re-pointed at another account keeps its id, its label and
    -- its history while silently changing what it spends from — the same
    -- defect as deleting it and creating another, by a verb that leaves no
    -- trace. instrument_type is frozen for the adjacent reason: a physical
    -- card relabelled as a QR identity is not an edit, it is a different
    -- object wearing the first one's row.
    IF NEW.id          IS DISTINCT FROM OLD.id
      OR NEW.tenant_id   IS DISTINCT FROM OLD.tenant_id
      OR NEW.user_id     IS DISTINCT FROM OLD.user_id
      OR NEW.created_at  IS DISTINCT FROM OLD.created_at
      OR NEW.account_id  IS DISTINCT FROM OLD.account_id
      OR NEW.account_reference_type IS DISTINCT FROM OLD.account_reference_type
      OR NEW.instrument_type        IS DISTINCT FROM OLD.instrument_type
    THEN
      RAISE EXCEPTION 'payment_instrument % may not have its identity rewritten: the subject, the account it spends from, what kind of instrument it is, and when it was recorded are what say WHICH instrument this row is about (modules/payment-instruments/MODULE.md)',
        OLD.id USING ERRCODE = 'KAR30';
    END IF;

    IF NEW.version IS DISTINCT FROM OLD.version + 1 THEN
      RAISE EXCEPTION 'payment_instrument % updates must increment version by exactly one (got % after %) — the optimistic-concurrency token is not optional',
        OLD.id, NEW.version, OLD.version USING ERRCODE = 'KAR31';
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_instruments_guard
  BEFORE INSERT OR UPDATE ON public.payment_instruments
  FOR EACH ROW
  EXECUTE FUNCTION public.payment_instruments_guard();

-- DELETE is granted for the same reason as 0088, 0090, 0096 and 0097: the
-- declared erasure strategy is CASCADE_DELETE, and erasing an account must be
-- able to take the instruments that spend from it. The RLS policy applies to
-- DELETE, so the grant reaches only the principal's own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_instruments TO karar_app;
