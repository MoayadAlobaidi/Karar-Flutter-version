-- 0095_financial_account_wallets
--
-- Two columns on public.financial_accounts (0088): wallet_kind, and
-- account_nature (modules/financial-accounts/MODULE.md; ADR-0028). Both
-- describe what an account IS. Neither adds a table, a principal dimension,
-- or a computation, and the RLS policy, the guard trigger and the grants of
-- 0088 continue to cover this table unchanged — a column added to an
-- RLS-FORCEd table is inside the same predicate the moment it exists.
--
-- A WALLET IS AN ACCOUNT, WHICH IS WHY IT IS NOT A NEW TABLE. A mobile-money
-- or e-money wallet holds a balance, so it is a financial account whose
-- account_type is WALLET. Modelling wallets separately would duplicate every
-- rule this table already enforces — the encryption triple, the currency
-- closure, the RLS predicate, the version guard — and would then need a
-- second answer for every question that spans both. What a wallet needs that
-- a bank account does not is one more attribute: WHICH KIND of wallet.
--
-- THE INVARIANT IS A BICONDITIONAL, AND IT IS EXACT.
--
--   wallet_kind IS NOT NULL  if and only if  account_type = 'WALLET'
--
-- Both directions matter and each fails differently. A WALLET row with no
-- wallet kind is a wallet nobody can describe: a payroll wallet and a
-- prepaid card wallet behave differently and a reader would have to guess,
-- so the row is refused rather than admitted half-stated. A CURRENT or
-- CREDIT_CARD row carrying a wallet kind is worse — it is a contradiction
-- that reads as truth, and a caller that starts branching on "has a wallet
-- kind" rather than on the type will silently treat a bank account as a
-- wallet. A one-directional CHECK would have caught only the first, so the
-- constraint below is written as an equality between two booleans and is
-- asserted by test in both directions.
--
-- CRYPTO IS OUT OF SCOPE AND WALLET DOES NOT MODEL IT (ADR-0028). No value
-- in this vocabulary means a crypto or custodial-token wallet, and none may
-- be added here: a crypto holding is not a fiat balance in a closed currency
-- registry, it does not have an ISO 4217 minor-unit exponent, and admitting
-- one under this account type would make every amount on this row a lie about
-- what it measures. If it is ever in scope it arrives with its own reviewed
-- design, not by widening a CHECK.
--
-- NO VALUE NAMES A PROVIDER. MOBILE_MONEY, E_MONEY, PREPAID, PAYROLL,
-- SUPER_APP, OTHER are CATEGORIES of product. No telco, bank or fintech is
-- named here or anywhere in this module's schema, and no code path may branch
-- on which issuer a wallet belongs to (ADR-0028). OTHER exists so the list
-- never has to be complete before a person can record what they hold.
--
-- ACCOUNT NATURE: SO A CREDIT CARD IS NOT TREATED AS CASH. account_nature
-- says whether the balance on this account is something the person HAS
-- (ASSET) or something they OWE (LIABILITY). It exists because the same
-- signed number means opposite things on a savings account and a credit card,
-- and because every naive treatment of that number — adding it to a total,
-- calling it available, showing it in green — is wrong for one of the two.
--
-- WHAT THIS COLUMN DOES NOT DO, stated because a nature column is exactly
-- the ingredient a net-worth figure needs. NOTHING in this module sums
-- balances, nets assets against liabilities, or produces a total of any kind,
-- and this migration adds no view, no generated column, no aggregate and no
-- index that would make one cheap. A total is a different concept with its
-- own correctness problem (which accounts, at which as_of instants, in which
-- currency, at whose exchange rate) and it must arrive with its own name and
-- its own honest label rather than being assembled from this column by
-- whoever needs a number first.
--
-- UNKNOWN IS AN HONEST ANSWER, NOT A PLACEHOLDER, and it is the default. An
-- OTHER-type account, or one recorded before anyone asked the question, has
-- a nature nobody has established. Defaulting to ASSET would have been the
-- convenient choice and would mean every unstated account silently counts as
-- money the person has. A consumer that cannot handle UNKNOWN must refuse to
-- answer rather than assume, and the vocabulary is closed at three values so
-- that refusal is expressible.
--
-- Deliberately NOT derived from account_type. CREDIT_CARD is almost always a
-- liability and a rule could set it automatically — but "almost always" is
-- the shape of a defect: a prepaid card recorded as CREDIT_CARD, or a wallet
-- with an overdraft, would be misclassified by a rule nobody can see, and the
-- person could not correct it because the value would not be theirs to set.
-- The two columns stay independent and the person's answer wins.
--
-- Data lifecycle (ADR-0026): unchanged. Both columns belong to
-- public.financial_accounts, already declared SUBJECT_OWNED,
-- HIGHLY_SENSITIVE_FINANCIAL, retention UNRESOLVED, export included, erasure
-- CASCADE_DELETE (0088 header; modules/financial-accounts/MODULE.md;
-- DATA_LIFECYCLE.md). Neither column holds subject-authored narrative — both
-- are closed vocabularies — so neither needs encryption and neither widens
-- what a stolen dump of this table yields.
--
-- rollback: forward-only (README.md). A failed apply leaves nothing — one
-- transaction. Deliberate reversal would be ALTER TABLE ... DROP CONSTRAINT
-- financial_accounts_wallet_kind_iff_wallet, DROP COLUMN wallet_kind, DROP
-- COLUMN account_nature — which erases every person's statement about what
-- kind of wallet they hold and about what they owe, with no other copy.

ALTER TABLE public.financial_accounts
  -- Optional at the column level; REQUIRED for WALLET and FORBIDDEN
  -- otherwise, by the biconditional below. Categories only — no provider is
  -- named — and no crypto value exists.
  ADD COLUMN wallet_kind text NULL
    CONSTRAINT financial_accounts_wallet_kind_check
    CHECK (wallet_kind IN
      ('MOBILE_MONEY', 'E_MONEY', 'PREPAID', 'PAYROLL', 'SUPER_APP', 'OTHER')),

  -- Has, owes, or nobody has said. UNKNOWN is the honest default; see the
  -- header for why it is not derived from account_type and why nothing here
  -- adds these up.
  ADD COLUMN account_nature text NOT NULL DEFAULT 'UNKNOWN'
    CONSTRAINT financial_accounts_account_nature_check
    CHECK (account_nature IN ('ASSET', 'LIABILITY', 'UNKNOWN'));

-- The exact invariant, in both directions: a wallet kind exists IF AND ONLY
-- IF the account is a WALLET. An equality between two booleans, so neither
-- half can be satisfied by accident.
ALTER TABLE public.financial_accounts
  ADD CONSTRAINT financial_accounts_wallet_kind_iff_wallet
  CHECK ((wallet_kind IS NOT NULL) = (account_type = 'WALLET'));

COMMENT ON COLUMN public.financial_accounts.wallet_kind IS
  'Which kind of wallet, for WALLET accounts only: MOBILE_MONEY, E_MONEY, '
  'PREPAID, PAYROLL, SUPER_APP, OTHER. Present IF AND ONLY IF account_type = '
  '''WALLET'' (financial_accounts_wallet_kind_iff_wallet) — a wallet nobody '
  'can describe and a current account claiming to be a wallet are both '
  'unrepresentable. Categories only: no provider is named here, and no code '
  'path may branch on which issuer a wallet belongs to (ADR-0028). Crypto is '
  'out of scope and is NOT modelled by WALLET; no value here means one.';

COMMENT ON COLUMN public.financial_accounts.account_nature IS
  'Whether this account''s balance is something the subject HAS (ASSET) or '
  'OWES (LIABILITY), or UNKNOWN when nobody has established it — the honest '
  'default, deliberately not ASSET, so an unstated account is never silently '
  'counted as money the person has. NOT derived from account_type: an '
  '''almost always'' rule misclassifies the exceptions invisibly and the '
  'person cannot correct a value that is not theirs to set. Nothing in this '
  'module sums, nets, or totals balances using this column, and this '
  'migration adds no view, generated column, aggregate or index that would '
  'make doing so cheap — a net-worth figure is a different concept with its '
  'own correctness problem and its own honest label.';
