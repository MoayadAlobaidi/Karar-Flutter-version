# Control Owners

**Status:** ACTIVE register · **Owner:** Platform Owner · **Version:** 0.1 · **Date:** 2026-08-15 · **Review:** every phase gate

---

## Roles

Ownership throughout the compliance documentation is expressed in roles, not names. A role owns the controls, risks, and policies assigned to it: the owner keeps the artefact true, answers for it at phase gates, and signs its reviews.

| Role | Accountable for |
|---|---|
| **Platform Owner** | Overall direction, policy approval, ADR stewardship, accepted-risk sign-off, greenfield rule |
| **Engineering Owner** | Change management, CI enforcement, architecture tests, dependency hygiene, build tooling |
| **Security Owner** | Threat model, access control, secrets and cryptography, vulnerability management, incident response |
| **Privacy Owner** | Data lifecycle (ADR-0026), consent and re-consent (ADR-0024), export/erasure, DPA readiness |
| **Operations Owner** | Environments, infrastructure as code, backup/continuity, monitoring and on-call (when they exist) |
| **Compliance Owner** | This documentation set, control matrix, evidence and exceptions registers, vendor register, phase gates, assurance-claim linkage |

## Current assignment — stated plainly

**A single person currently holds all six roles.** That is the organizational reality of a solo-founder Phase 1, recorded here as a fact rather than disguised by role language. It is not separation of duties, and no document in this set claims otherwise. The consequences are carried openly:

- Risk **KAR-RSK-001** (key person) and **KAR-RSK-002** (no independent review) in the [risk register](risk-register.md)
- Exception **EXC-001** (single-person PR approval) in the [exceptions register](exceptions-register.md), with its compensating controls

The role structure still earns its place now: it forces every control to have exactly one accountable seat, it makes handover a reassignment rather than a rewrite, and it lets separation happen by moving a role, not by inventing one.

## Separation-of-duties triggers

Separation is event-driven, not aspirational:

| Trigger | Required change |
|---|---|
| Team reaches **2 engineers** | EXC-001 closes — a second-person review of every PR becomes mandatory |
| Team reaches **3 engineers** | Security Owner and Engineering Owner are held by different people (separation-of-duties trigger) |
| Team reaches **5 people** | Compliance Owner separates from both Security Owner and Engineering Owner |
| Production launch (Phase 20) | Production access approval (control plane) and change authorship may not be the same person for sealed-vault and key operations |

When a trigger fires, this file is updated in the same PR that records the reassignment, and the phase gate that follows verifies it happened.

## Rules of use

1. Other documents reference **roles only** — never a person's name, never "the founder".
2. A control with no owner role is a defect in the [control matrix](control-matrix.md), found at the phase gate.
3. Role reassignment is a PR to this file plus an access-rights review (KAR-CTL-014).
