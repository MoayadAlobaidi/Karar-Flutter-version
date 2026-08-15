# Infrastructure as code

Terraform for all environments. `dev/`, `staging/`, and `production/` exist **from Phase 1**, even while unprovisioned, so adding staging later is not a structural change.

## Import rules

Referenced by deployment pipelines. Imported by nothing.

---

_Phase 1: committable structure only — no `.tf` files, nothing provisioned. Provider modules arrive at Phase 17._
