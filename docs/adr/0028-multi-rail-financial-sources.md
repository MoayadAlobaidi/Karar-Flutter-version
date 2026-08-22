# ADR-0028 — Multi-rail financial data sources, wallet issuers and account-source identity

**Status:** ACCEPTED · **Phase:** 5 · **Shapes the financial data model for every later phase**

## Context

The Phase 5 foundation models a financial account with a `sourceKind` and a `providerConnectionRef` on the account row. That is a one-source design, and it is wrong in a way that is cheap to fix now and expensive to fix once anyone's data exists.

A real person in this market does not have one bank and one account. They have current accounts at two banks, two of them at the same bank in the same currency, a savings account in dollars, several credit cards, one or more mobile-money wallets from a telco, an e-money wallet from a fintech, a payroll wallet their employer pays into, a couple of virtual cards spending from one of those wallets, and cash. Every one of those is a place money sits or a way money moves, and the current model can represent perhaps a third of it honestly.

Four distinct questions are currently collapsed into one column:

1. **Who issues this product?** A bank, a telco's financial arm, an e-money institution, a card issuer.
2. **How does Karar receive data about it?** The person typed it in, uploaded a CSV, or — one day — authorised an API.
3. **Which product is this?** The account or wallet that holds a balance.
4. **What spends from it?** A physical card, a virtual card, a QR identity.

Collapsing them produces specific, predictable failures. A CSV-created account that is later connected to an API becomes a second account, and the person's history splits in two. An account "created manually" cannot be described as also receiving imports, so the interface must either lie or stay silent. Two virtual cards on one wallet look like two more balances, and the person's money appears to triple. A wallet top-up from a bank account shows as an expense and an income, so a month in which someone moved their own money looks like a month in which they earned and spent it.

None of these is a display bug. Each is the data model asserting something untrue.

## Decision

**Seven concepts, separately identified.**

```
Institution / issuer          who offers the product
  └── Institution market      where, and under what status, in one country
        └── Financial connection    how Karar receives data, per user
              └── Account-source link    which connection feeds which account
                    └── Financial account / wallet    where a balance sits
                          └── Payment instrument      what spends from it
                                └── Transaction provenance   where one fact came from
```

Each arrow is many-to-many or one-to-many. None of them is an identity.

### The account is identified by its own id, and by nothing else

There is **no** uniqueness constraint over `institution + user`, `institution + type`, `institution + currency`, `institution + type + currency`, or `issuer + wallet type`. Every one of those forbids something a real person actually has: two current accounts at one bank in one currency is ordinary, and two credit cards from one issuer is ordinary. Institution, type, currency and wallet kind are **attributes**, not identity.

### Origin is not the current source

An account records an immutable **origin** — how it first came to exist — and that is all origin means. It does not describe where data comes from now. An account may be created manually, then receive CSV imports, then be linked to an API, then be corrected by hand, and remain one account throughout. Current and historical sources live in **account-source links**, many per account.

The corollary matters as much: a provider-sourced account still accepts user corrections. A correction is a fact with `USER_CORRECTED` provenance that sits **beside** the source fact rather than overwriting it, so both remain reconstructable and the display precedence is explicit rather than implied by write order.

### Wallets are accounts, and instruments are not

A mobile-money or e-money wallet holds a balance, so it is a financial account with `accountType = WALLET` and a required `walletKind` (`MOBILE_MONEY`, `E_MONEY`, `PREPAID`, `PAYROLL`, `SUPER_APP`, `OTHER`). The invariant is exact: **`walletKind` is present if and only if `accountType = WALLET`.**

A card is not a balance. Two virtual cards spending from one wallet are two **payment instruments** pointing at one account, and there is deliberately no balance column on an instrument — a schema that permits a second balance will eventually hold one. Where an issuer genuinely funds a product separately, that product is its own financial account and the instrument points at that.

Crypto wallets are **out of scope** and are not modelled by `WALLET`.

### Rails are declared, and almost all are unavailable

A financial connection carries a rail: `MANUAL`, `USER_FILE_UPLOAD`, `OPEN_FINANCE_API`, `DIRECT_BANK_OR_WALLET_API`, `LICENSED_AGGREGATOR_API`, `HOST_TO_HOST_SFTP`, `ISO_20022_FILE`, `SWIFT_MT_FILE`, `OFX_QFX_FILE`, `QIF_FILE`, `PDF_STATEMENT`, `SECURE_EMAIL_STATEMENT`, `DEVICE_SIGNAL`.

**Only `MANUAL` and `USER_FILE_UPLOAD` with CSV are implemented.** Every other rail is `NOT_IMPLEMENTED` and unavailable. They are named now because naming them costs nothing and shapes the model correctly, and because a vocabulary invented later would have to be retrofitted onto data already written.

**No credential of any kind is stored** — no bank or wallet username, password, mPIN, OTP, recovery code, cookie, session state or access token. There is no scraping, no browser automation and no bank-app reverse engineering. A device signal is supplemental and never authoritative. No interface may show "Connected" for an account whose data arrived manually or by file.

### Source-account identity is protected

An account-source link needs to recognise "the same account from this source next time" without holding anything that identifies the account outside Karar. So the external reference is **encrypted at rest** with AAD binding as elsewhere, and equality is decided by a **keyed, per-subject, versioned fingerprint** — per-subject so the same external account under two people cannot be correlated, versioned so the definition can change. The fingerprint is never exposed to a client and never logged. No full account number, IBAN, PAN or wallet phone number is stored or displayed.

Linking rules follow from that: an **exact** external reference match within one principal may link automatically; anything less is a **probable** match that requires the person to confirm. Linking never merges on `institution + type + currency`, because that is precisely the combination a real person legitimately duplicates.

### Movement between a person's own accounts is a relationship, not two facts

A wallet top-up from a bank account is one movement recorded twice, once on each side. Left alone it reads as an expense and an income. So equal-and-opposite same-currency movements within a bounded window may be **suggested** as a transfer, and a suggestion becomes authoritative only when the person confirms it. Cross-currency movements are not auto-matched without a source-stated FX relationship. Fees stay expenses; a remittance principal and its fee stay separable; a card event and the wallet ledger event behind it must not become two expenses.

Nothing here computes an insight, a score, a budget or a net worth. This ADR establishes relationships, not conclusions.

## Consequences

- New subject-owned tables — connections, account-source links, payment instruments, transfer matches — each with RLS `ENABLE` + `FORCE`, tenant and user predicates, a six-field lifecycle declaration and an erasure strategy. Each is `HIGHLY_SENSITIVE_FINANCIAL` unless validated otherwise.
- `sourceKind` and `providerConnectionRef` stop being the account's source of truth about its data source. Migrations `0087`–`0093` are unmerged and deployed nowhere, so they are corrected in place rather than compensated.
- Erasure widens: deleting an account must take its source links, instruments, transfer matches, staged source rows and artifacts with it, not only its transactions.
- The institution catalogue stops being a display list and gains issuer kinds (`BANK`, `E_MONEY_ISSUER`, `MOBILE_MONEY_OPERATOR`, `TELCO_FINANCIAL_SERVICES`, `PAYMENT_INSTITUTION`, `FINTECH_WALLET`, `CARD_ISSUER`, `EXCHANGE_HOUSE`, `OTHER`) and a separate market presence per country. **Country is not Jurisdiction.** A global issuer operating in four countries is one issuer with four market rows, not four issuers.
- No provider-specific type, column or branch exists anywhere in domain or application code. The model must express a mobile-money wallet from a telco without naming one, and it must do so **without implying that any such provider exposes an API to Karar** — none does, none is integrated, and no capability profile is `VERIFIED` without evidence. All fixtures use synthetic issuer names.
- The cost is real: more tables, more joins, and a linking flow that sometimes asks the person a question instead of guessing. That is the intended trade. A wrong guess here silently merges two people's accounts or splits one person's history, and neither is discoverable by the person it happens to.
