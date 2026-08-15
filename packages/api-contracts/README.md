# OpenAPI contract and event catalogue

The contract is **authored, not generated from code** (ADR-0009). SDKs are generated from it and committed; hand-editing a generated client is a CI failure.

`events/` is the domain event catalogue — every published event declares classification, allowed consumers, PII flag, and retention.

## Import rules

Build-time dependency for SDK generation and CI enforcement.

---

_Phase 1: empty contract (`openapi/openapi.yaml` info block, `events/catalogue.json` empty). SDK generation not wired yet._
