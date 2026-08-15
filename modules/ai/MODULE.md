# Module: ai

## Purpose

AI orchestration: context assembly from verified facts, provider abstraction, prompt registry, validation, and usage governance.

## Ownership

- **Business owner:** _unassigned — solo team, Phase 0_
- **Technical owner:** _unassigned — solo team, Phase 0_
- **Status:** PLANNED
- **Phase:** 7
- **Capability:** AI_ADVISOR
- **Highest classification:** CONFIDENTIAL

## Data owned

| Table | Classification | Erasure strategy | Notes |
|---|---|---|---|
| `ai_conversations` | `CONFIDENTIAL` | `CASCADE_DELETE` | title encrypted |
| `ai_messages` | `CONFIDENTIAL` | `CASCADE_DELETE` | content encrypted — answers quote merchant narratives back |
| `ai_response_provenance` | `INTERNAL` | `CASCADE_DELETE` | prompt version, model, ruleset version, jurisdiction |
| `ai_usage` | `INTERNAL` | `ANONYMIZE_IRREVERSIBLY` | metering and cost |

## Events published

| Event | Classification | Allowed consumers | Payload rule |
|---|---|---|---|
| `AiResponseGenerated` | `CONFIDENTIAL` | projections, audit | identifier-only |

## Permissions

| Permission | Role(s) |
|---|---|
| `ai.conversation.read` | `USER` |
| `ai.killswitch.operate` | `OPERATOR` |

**Permissions deliberately absent:** **No role grants AI access to SEALED data.** `AiContext` input types structurally cannot hold it.

## Dependencies

Cross-module dependencies resolve through `public-api.ts` only. Cross-module references
carry a raw UUID plus a reference type declared **in this module**.

## Notes and known limitations

**The model never writes a number** (ADR-0019). It receives `VerifiedFinancialFacts` and returns prose with placeholders; Karar substitutes locale-formatted values. This is both the numeric safety mechanism and the Arabic/RTL/multi-currency rendering mechanism.

**One path, no bypasses.** Every AI call routes through the orchestrator. The legacy's categorisation path calls the provider directly, *bypassing usage logging, token metrics, provenance and per-user rate limiting* (AI-4) and sending narratives with no consent check (P6) — one shortcut disabling four controls.

**There is no `executeSql()` under any name.**

The consent gate **fails closed** (legacy AI-5 fails open). The kill switch is tested, not decorative. Every AI surface is entitlement-gated, including insights (legacy AI-6 gates chat only). Prompt-injection controls are **built and executed**, not merely written (AI-1, AI-9).

---

_Template: [`../../docs/MODULE_TEMPLATE.md`](../../docs/MODULE_TEMPLATE.md). This file is required — architecture test 16 fails without it._
