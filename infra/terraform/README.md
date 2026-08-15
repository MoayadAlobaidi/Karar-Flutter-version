# Terraform root

Multi-provider by structure, per [`docs/architecture/infrastructure-portability.md` §12](../../docs/architecture/infrastructure-portability.md).

```
modules/contracts/    — provider-neutral module interfaces: what a deployment needs
providers/gcp/        — GCP implementations of the contracts
providers/aws/        — AWS implementations (structure now; built when a deployment needs them)
deployments/qa/       — per-jurisdiction compositions: dev/ staging/ production/
```

A composition under `deployments/` binds the contracts to **one provider's implementations per environment**, driven by that deployment's `DeploymentProfile`. Adding a jurisdiction adds a composition; adding a provider adds an implementation directory. **Prefer reusable composition over duplicated stacks.**

Rules:

- **Production must not be introduced before a separate staging environment exists** — hard gate, Phase 20.
- Provider assignments are configuration, recorded in [`docs/architecture/country-deployment-matrix.md`](../../docs/architecture/country-deployment-matrix.md) — never assumptions.
- Application modules never read provider variables (`GCP_PROJECT_ID`, `AWS_REGION`); those belong here.
- `sa/`, `ae/`, `om/` compositions are created when those launches are real, not speculatively.

## Import rules

Referenced by deployment pipelines. Imported by nothing.

---

_Phase 0.5: structure only. **No cloud account exists and nothing is provisioned.** The active provider's modules are implemented when its deployment phase (17+) arrives._
