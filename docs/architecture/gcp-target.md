# GCP as Target Infrastructure

**ADR:** 0023 · **Phase:** 17 (when an account exists)

---

## 1. The rule

> **GCP is the deployment target. No GCP name appears in `domain/` or `application/`.**

Every cloud dependency arrives through a port implemented in `infrastructure/providers/`. Architecture test 10 fails a build where a vendor SDK is imported outside that directory.

The point is not vendor-neutrality as an ideal. It is that the financial engine must be testable on a laptop with no cloud account, and the domain must remain readable by someone who has never used GCP.

## 2. Port → service mapping

| Port | LOCAL | GCP |
|---|---|---|
| Datastore | PostgreSQL in Compose | Cloud SQL for PostgreSQL |
| `ObjectStorage` | MinIO | Cloud Storage |
| `EncryptionProvider` | Local key file | Cloud KMS |
| Secrets | `.env` | Secret Manager |
| `AiProvider` | Mock | Vertex AI / Gemini |
| Runtime | Compose | Cloud Run |
| Jobs | Compose worker | Cloud Run jobs / Scheduler |
| Queue | In-process + outbox | Pub/Sub + outbox |
| Logs, metrics, traces | stdout, local | Cloud Logging / Monitoring / Trace |
| Analytics warehouse | — | Deferred (BigQuery is a candidate, not a decision) |

**Local development has zero cloud dependency.** `make up` produces a working system with no GCP account and no API key.

## 3. What is deferred

Each sits behind a port or a Terraform variable, and none blocks Phases 1–16:

- Region and project IDs
- Vertex / Gemini production region and model availability
- Analytics platform
- CDN and edge configuration
- Managed Postgres tier and pooling topology

**Region selection is a data-residency question before it is an engineering one.** See [`data-residency.md`](data-residency.md).

## 4. Terraform

```
infra/terraform/
├── modules/
├── dev/
├── staging/        ← exists from Phase 1, provisioned at Phase 19
└── production/
```

All three environment directories exist from Phase 1 even while unprovisioned, so that adding staging later is not a structural change. See [`environments.md`](environments.md).

## 5. Cost and operational posture

| Principle | |
|---|---|
| Scale to zero where possible | Cloud Run for a pre-launch product |
| No always-on infrastructure before customers | The legacy runs a single instance with a pool of 10 and no customers |
| Cost visible per environment | Tagged, and reported in Super Admin |
| Budget alerts before spend, not after | |

## 6. What GCP does not change

| | |
|---|---|
| The domain | Never names a cloud service |
| The financial engine | Pure package, identical everywhere |
| The API contract | |
| The Flutter client | API base is configuration |
| Tenant isolation | RLS is PostgreSQL, not a cloud feature |

## 7. Why not serverless-first or managed-everything

Recorded so the question is not re-opened without new information.

**Cloud Run rather than functions:** the application is a modular monolith with a shared module graph and a second entrypoint. Decomposing it into functions would fragment the graph and duplicate boot cost for no isolation benefit that the module boundaries do not already provide.

**Cloud SQL rather than a managed serverless database:** RLS, `SET LOCAL` GUCs, forced row-level security, revoked grants, and migration-as-restricted-role are all PostgreSQL mechanisms the isolation design depends on. A datastore that does not support them would require replacing the boundary, not the vendor.
