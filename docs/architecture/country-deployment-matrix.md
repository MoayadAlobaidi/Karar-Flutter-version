# Country Deployment Matrix

**Canonical for:** which provider, region, and database serve each jurisdiction and environment — **decisions tracked separately from code.**

---

## 1. How to read this document

**Unknown decisions are not filled from imagination.** Every cell carries either a decision with evidence or one of:

| Status | Meaning |
|---|---|
| `TBD` | No decision made |
| `UNVERIFIED` | A candidate exists; nothing about it has been verified |
| `PENDING_LEGAL` | Blocked on a legal or regulatory determination |
| `PENDING_PROVIDER` | Blocked on provider availability or capability verification (§3) |
| `planned` | Decided for a phase that has not run yet |
| `future` | No launch commitment exists |

Evidence labels (CODE / RUNTIME / INFRASTRUCTURE / ABSENT) apply here as everywhere: **an INFRASTRUCTURE claim is never read as verified.**

## 2. The matrix

| Jurisdiction | Environment | Cloud | Region | PostgreSQL | AI | Status |
|---|---|---|---|---|---|---|
| QA | LOCAL/DEV | Local | local | Docker | Mock | **planned** (Phase 1) |
| QA | STAGING | TBD / GCP candidate | TBD | Managed PostgreSQL | TBD | planned (Phase 19) |
| QA | PROD | **TBD / GCP candidate** | Qatar or nearest approved — **residency determination pending** | Managed PostgreSQL | Vertex candidate / **TBD** | **UNVERIFIED · PENDING_LEGAL** |
| SA | PROD | TBD | Saudi — availability unverified | Managed PostgreSQL | TBD | **future** |
| AE | PROD | TBD — a UAE-available approved provider | UAE-local | Managed PostgreSQL | TBD | **future** |
| OM | PROD | TBD | TBD | Managed PostgreSQL | TBD | **future** |

Notes:

- **No cloud account of any kind exists at Phase 0.5.** Every non-local row is a decision not yet made.
- The QA production region is downstream of the **data-residency legal opinion** ([`data-residency.md`](data-residency.md)), which has not been obtained.
- The AI column is deliberately separate from the cloud column — **AI routing is independent of the infrastructure provider** ([`infrastructure-portability.md` §8](infrastructure-portability.md)), and model-region availability lags infrastructure-region availability everywhere.
- A row reaching PROD requires the §3 capability check **and** the [`environments.md`](environments.md) Phase 19/20 gates.

## 3. Provider capability verification per row

Before any row's production deployment, verify each required component locally available or under an approved cross-region treatment — *"the provider operates in the country"* does not mean *"every Karar dependency is available locally"*:

```
database · objectStorage · KMS · secretManager · containerRuntime
messaging · AI · analytics · identity
```

Record the verified result here with an evidence label and date. The check itself is specified in [`infrastructure-portability.md` §7](infrastructure-portability.md).

## 4. New-country bootstrap

The workflow every launch follows — usable for QA, SA, AE, OM, and any future country **without cloning the Karar source repository**:

```
Add jurisdiction
      ↓
Add PolicyPack                    (code — reviewed, tested, staged)
      ↓
Legal / regulatory review         (per capability)
      ↓
Select OperatingEntity            (contract cross-border, or incorporate locally)
      ↓
Select DeploymentProfile
      ↓
Select cloud / provider           (verified per §3)
      ↓
Provision environment             (Terraform composition — deployments/<j>/…)
      ↓
Create PostgreSQL                 (managed instance per databaseProfile)
      ↓
Run canonical migrations          (from zero — database-portability.md §6)
      ↓
Configure provider adapters       (bank · SMS · identity · AI as cleared)
      ↓
Enable approved capabilities      (availability rows — deny-by-default stands)
      ↓
Staging                           (mandatory passage)
      ↓
Production
```

This composes the jurisdiction half ([`jurisdiction-policy.md` §9](jurisdiction-policy.md), Scenario A) with the deployment half (this document). **Neither half ever forks the repository.**

## 5. Maintenance

Update a cell **when its decision is actually made**, with the evidence label and date, in the same change that records the decision elsewhere (contract, legal memo, capability check). A matrix that is filled in ahead of decisions is fiction; one that lags them is stale — both defeat the document.
