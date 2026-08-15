# GCP Provider Profile

**Reframed in Phase 0.5.** GCP is the **candidate provider for the Qatar deployment profile** — one implementation of the provider contracts, not an architectural dependency. The canonical portability rules live in [`infrastructure-portability.md`](infrastructure-portability.md); the decided state per jurisdiction lives in [`country-deployment-matrix.md`](country-deployment-matrix.md). **ADR:** 0023 · **Phase:** 17 (when an account exists)

---

## 1. The rule

> **No cloud-provider name appears in `domain/` or `application/` — GCP included.**

Every cloud dependency arrives through a port implemented in `infrastructure/providers/`. Architecture test 10 fails a build where a cloud SDK, provider client, or provider URI appears outside its adapter.

The point is not vendor-neutrality as an ideal. It is that the financial engine must be testable on a laptop with no cloud account, the domain must remain readable by someone who has never used GCP, and **a jurisdiction whose regulator or market requires a different provider must be a Terraform composition, not a rewrite.**

## 2. Port → GCP service mapping

What each provider-neutral port binds to **when a deployment profile selects GCP**. An AWS or other profile binds the same ports to that provider's equivalents; the ports and the application do not change.

| Port | LOCAL | GCP profile |
|---|---|---|
| `DatabaseProfile` (provisioning/connection — the **same** `PostgresPersistenceAdapter` everywhere) | PostgreSQL in Compose | Cloud SQL for PostgreSQL via `CloudSqlConnectionProfile` |
| `ObjectStorage` | MinIO | Cloud Storage |
| `KeyManagementProvider` / `EncryptionProvider` | Local key file | Cloud KMS |
| `SecretProvider` | `.env` | Secret Manager |
| `AiProvider` | Mock | Vertex AI / Gemini — **routed independently of the infrastructure provider** ([`ai.md`](ai.md)) |
| Runtime | Compose | Cloud Run |
| `JobQueue` / scheduling | Compose worker | Cloud Run jobs / Scheduler |
| `EventBus` transport | In-process + outbox | Pub/Sub + outbox |
| `ObservabilityProvider` | stdout, local | Cloud Operations — via OpenTelemetry, re-routable |
| `AnalyticsSink` | — | Deferred (BigQuery is a candidate, not a decision) |

**Local development has zero cloud dependency.** `make bootstrap` followed by `make dev` produces a working system with no account and no API key.

**Database note:** the schema and migrations target the **PostgreSQL contract, not Cloud SQL** — no Cloud SQL-specific feature without the three-condition exception in [`database-portability.md` §3](database-portability.md), and the same contract tests must pass on any approved PostgreSQL provider.

## 3. What is deferred

Each sits behind a port or a Terraform variable, and none blocks Phases 1–16:

- Region and project IDs — **and whether GCP is the Qatar production provider at all** (`UNVERIFIED` in the matrix)
- Vertex / Gemini production region and model availability — subject to the provider capability check
- Analytics platform · CDN and edge configuration · managed Postgres tier and pooling topology

**Region selection is a data-residency question before it is an engineering one.** See [`data-residency.md`](data-residency.md).

## 4. Terraform

GCP modules live under `infra/terraform/providers/gcp/`, implementing the provider-neutral contracts in `infra/terraform/modules/contracts/`; deployment compositions under `infra/terraform/deployments/` select them. Structure: [`infrastructure-portability.md` §12](infrastructure-portability.md). **Nothing is provisioned until Phase 17, and no account exists at Phase 0.5.**

## 5. Cost and operational posture

| Principle | |
|---|---|
| Scale to zero where possible | Cloud Run for a pre-launch product |
| No always-on infrastructure before customers | The legacy runs a single instance with a pool of 10 and no customers |
| Cost visible per environment | Tagged, reported in Super Admin |
| Budget alerts before spend, not after | |

## 6. What the GCP profile does not change

| | |
|---|---|
| The domain | Never names a cloud service |
| The financial engine | Pure package, identical everywhere |
| The API contract | |
| The Flutter client | API base is configuration |
| Tenant isolation | RLS is PostgreSQL, not a cloud feature |
| AI permissibility | The PolicyPack decides, not the hosting provider |

## 7. Why Cloud Run and Cloud SQL, within this profile

Recorded so the question is not re-opened without new information — and scoped to the GCP profile, not to Karar.

**Cloud Run rather than functions:** the application is a modular monolith with a shared module graph and a second entrypoint. Decomposing it into functions would fragment the graph and duplicate boot cost for no isolation benefit the module boundaries do not already provide.

**Cloud SQL rather than a serverless datastore:** RLS, `SET LOCAL` GUCs, forced row-level security, revoked grants, and migration-as-restricted-role are PostgreSQL mechanisms the isolation design depends on. Any profile's database choice must support them — that is the PostgreSQL commitment of [`database-portability.md`](database-portability.md), applied here.
